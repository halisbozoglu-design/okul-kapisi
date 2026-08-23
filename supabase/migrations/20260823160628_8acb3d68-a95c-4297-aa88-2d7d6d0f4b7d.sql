-- 1) Guardian link table
CREATE TABLE IF NOT EXISTS public.student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  relation text,
  can_track boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_guardians_unique UNIQUE (student_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_guardians TO authenticated;
GRANT ALL ON public.student_guardians TO service_role;

ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_student_guardians_user ON public.student_guardians(user_id);
CREATE INDEX IF NOT EXISTS idx_student_guardians_student ON public.student_guardians(student_id);

CREATE TRIGGER trg_student_guardians_updated
  BEFORE UPDATE ON public.student_guardians
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Security definer helpers
CREATE OR REPLACE FUNCTION public.is_guardian_of_student(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians g
    WHERE g.user_id = _user_id AND g.student_id = _student_id
      AND g.is_active AND g.can_track AND g.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_guardian_of_route(_user_id uuid, _route_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_guardians g
    JOIN public.student_transport_assignments a ON a.student_id = g.student_id
    WHERE g.user_id = _user_id AND g.is_active AND g.can_track AND g.deleted_at IS NULL
      AND a.route_id = _route_id AND a.is_active AND a.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_guardian_of_trip(_user_id uuid, _trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transport_trips t
    WHERE t.id = _trip_id
      AND t.deleted_at IS NULL
      AND t.started_at > now() - interval '24 hours'
      AND public.is_guardian_of_route(_user_id, t.route_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_guardian_of_student(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_guardian_of_route(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_guardian_of_trip(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_guardian_of_student(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_guardian_of_route(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_guardian_of_trip(uuid, uuid) TO authenticated;

-- 3) Policies on student_guardians
CREATE POLICY guardians_manage ON public.student_guardians
  FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));

CREATE POLICY guardians_self_read ON public.student_guardians
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4) Additive parent read policies
CREATE POLICY students_guardian_read ON public.students
  FOR SELECT TO authenticated
  USING (public.is_guardian_of_student(auth.uid(), id));

CREATE POLICY assignments_guardian_read ON public.student_transport_assignments
  FOR SELECT TO authenticated
  USING (public.is_guardian_of_student(auth.uid(), student_id));

CREATE POLICY routes_guardian_read ON public.routes
  FOR SELECT TO authenticated
  USING (public.is_guardian_of_route(auth.uid(), id));

CREATE POLICY stops_guardian_read ON public.route_stops
  FOR SELECT TO authenticated
  USING (public.is_guardian_of_route(auth.uid(), route_id));

CREATE POLICY vehicles_guardian_read ON public.vehicles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.vehicle_id = vehicles.id AND public.is_guardian_of_route(auth.uid(), r.id)
  ));

CREATE POLICY trips_guardian_read ON public.transport_trips
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND started_at > now() - interval '24 hours'
    AND public.is_guardian_of_route(auth.uid(), route_id)
  );

CREATE POLICY events_guardian_read ON public.transport_events
  FOR SELECT TO authenticated
  USING (
    student_id IS NOT NULL
    AND public.is_guardian_of_student(auth.uid(), student_id)
  );

-- 5) One active trip per driver
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_trip_per_driver
  ON public.transport_trips (driver_staff_id)
  WHERE status = 'active' AND deleted_at IS NULL AND driver_staff_id IS NOT NULL;