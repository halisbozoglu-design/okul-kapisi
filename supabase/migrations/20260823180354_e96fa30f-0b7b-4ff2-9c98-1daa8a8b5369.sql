-- 1. Table
CREATE TABLE public.transport_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  guardian_user_id uuid NOT NULL,
  trip_id uuid REFERENCES public.transport_trips(id),
  transport_event_id uuid REFERENCES public.transport_events(id),
  type text NOT NULL CHECK (type IN ('BOARDING','NO_SHOW','DISEMBARK','APPROACHING')),
  title text NOT NULL,
  body text,
  idempotency_key text NOT NULL UNIQUE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transport_notifications_guardian
  ON public.transport_notifications (guardian_user_id, created_at DESC);
CREATE INDEX idx_transport_notifications_institution
  ON public.transport_notifications (institution_id, created_at DESC);

-- 2. Grants
GRANT SELECT, UPDATE ON public.transport_notifications TO authenticated;
GRANT ALL ON public.transport_notifications TO service_role;

-- 3. RLS
ALTER TABLE public.transport_notifications ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "Guardians read own transport notifications"
ON public.transport_notifications FOR SELECT TO authenticated
USING (
  guardian_user_id = auth.uid()
  AND public.is_guardian_of_student(auth.uid(), student_id)
);

CREATE POLICY "Guardians mark own notifications read"
ON public.transport_notifications FOR UPDATE TO authenticated
USING (guardian_user_id = auth.uid())
WITH CHECK (guardian_user_id = auth.uid());

CREATE POLICY "Managers read institution transport notifications"
ON public.transport_notifications FOR SELECT TO authenticated
USING (public.can_manage_institution(auth.uid(), institution_id));

-- 5. Attendance event -> notification outbox (idempotent)
CREATE OR REPLACE FUNCTION public.tg_transport_event_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student RECORD;
  v_title text;
  v_body text;
BEGIN
  IF NEW.student_id IS NULL
     OR NEW.event_type NOT IN ('BOARDING','NO_SHOW','DISEMBARK') THEN
    RETURN NEW;
  END IF;

  SELECT s.first_name, s.last_name INTO v_student
  FROM public.students s WHERE s.id = NEW.student_id;

  v_title := CASE NEW.event_type
    WHEN 'BOARDING' THEN 'Servise bindi'
    WHEN 'NO_SHOW' THEN 'Servise binmedi'
    ELSE 'Servisten indi' END;

  v_body := coalesce(v_student.first_name || ' ' || v_student.last_name, 'Öğrenci') || ' · ' ||
    to_char(NEW.occurred_at AT TIME ZONE 'Europe/Istanbul', 'HH24:MI');

  INSERT INTO public.transport_notifications
    (institution_id, student_id, guardian_user_id, trip_id, transport_event_id, type, title, body, idempotency_key)
  SELECT NEW.institution_id, NEW.student_id, g.user_id, NEW.trip_id, NEW.id,
         NEW.event_type::text, v_title, v_body,
         NEW.event_type::text || ':' || NEW.id::text || ':' || g.user_id::text
  FROM public.student_guardians g
  WHERE g.student_id = NEW.student_id
    AND g.is_active AND g.can_track AND g.deleted_at IS NULL
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_transport_event_notify() FROM anon, authenticated, public;

CREATE TRIGGER trg_transport_event_notify
AFTER INSERT ON public.transport_events
FOR EACH ROW EXECUTE FUNCTION public.tg_transport_event_notify();

-- 6. Approaching notification RPC (driver-side, server validated)
CREATE OR REPLACE FUNCTION public.notify_transport_approaching(_trip_id uuid, _student_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip RECORD;
  v_stop RECORD;
  v_dist double precision;
  v_inserted integer := 0;
  v_name text;
BEGIN
  IF NOT public.is_transport_staff_of_trip(auth.uid(), _trip_id) THEN
    RAISE EXCEPTION 'not authorized for this trip';
  END IF;

  SELECT * INTO v_trip FROM public.transport_trips
  WHERE id = _trip_id AND status = 'active' AND deleted_at IS NULL;
  IF NOT FOUND OR v_trip.last_lat IS NULL OR v_trip.last_lng IS NULL
     OR v_trip.last_location_at IS NULL
     OR v_trip.last_location_at < now() - interval '3 minutes' THEN
    RETURN 0;
  END IF;

  -- suppressed when the family already reported an absence for this direction/day
  IF EXISTS (
    SELECT 1 FROM public.transport_absences a
    WHERE a.student_id = _student_id
      AND a.absence_date = (now() AT TIME ZONE 'Europe/Istanbul')::date
      AND a.cancelled_at IS NULL AND a.deleted_at IS NULL
      AND (a.direction = 'both' OR v_trip.direction = 'both' OR a.direction = v_trip.direction)
  ) THEN
    RETURN 0;
  END IF;

  SELECT rs.name, rs.lat, rs.lng INTO v_stop
  FROM public.student_transport_assignments sa
  JOIN public.route_stops rs ON rs.id = sa.stop_id
  WHERE sa.student_id = _student_id AND sa.route_id = v_trip.route_id
    AND sa.is_active AND sa.deleted_at IS NULL
    AND rs.lat IS NOT NULL AND rs.lng IS NOT NULL
  LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(v_stop.lat - v_trip.last_lat) / 2), 2) +
      cos(radians(v_trip.last_lat)) * cos(radians(v_stop.lat)) *
      power(sin(radians(v_stop.lng - v_trip.last_lng) / 2), 2)
  )) * 1.35;

  IF v_dist > 1000 THEN RETURN 0; END IF;

  SELECT first_name || ' ' || last_name INTO v_name FROM public.students WHERE id = _student_id;

  INSERT INTO public.transport_notifications
    (institution_id, student_id, guardian_user_id, trip_id, transport_event_id, type, title, body, idempotency_key)
  SELECT v_trip.institution_id, _student_id, g.user_id, _trip_id, NULL,
         'APPROACHING', 'Servis yaklaşıyor',
         coalesce(v_name, 'Öğrenci') || ' · ' || v_stop.name || ' durağına yaklaşık ' ||
         greatest(1, round(v_dist / 1000.0 * 60 / 22.0))::text || ' dk',
         'APPROACHING:' || _trip_id::text || ':' || _student_id::text || ':' || g.user_id::text
  FROM public.student_guardians g
  WHERE g.student_id = _student_id
    AND g.is_active AND g.can_track AND g.deleted_at IS NULL
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_transport_approaching(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.notify_transport_approaching(uuid, uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.transport_notifications;