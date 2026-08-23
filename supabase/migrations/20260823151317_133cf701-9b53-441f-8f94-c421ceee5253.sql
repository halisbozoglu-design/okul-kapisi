-- ENUMS
DO $$ BEGIN CREATE TYPE public.transport_staff_role AS ENUM ('driver','attendant'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.transport_direction AS ENUM ('to_school','to_home','both'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.transport_trip_status AS ENUM ('planned','active','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.transport_event_type AS ENUM ('START_TRIP','LOCATION','BOARDING','NO_SHOW','DISEMBARK','END_TRIP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Can the user manage transport data of an institution?
CREATE OR REPLACE FUNCTION public.can_manage_institution(_user_id uuid, _institution_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.user_institutions ui
      WHERE ui.user_id = _user_id AND ui.institution_id = _institution_id
        AND (public.has_role(_user_id, 'kurum_yoneticisi')
          OR public.has_role(_user_id, 'okul_yoneticisi')
          OR public.has_role(_user_id, 'mudur_yardimcisi'))
    );
$$;

-- TABLES ---------------------------------------------------------------
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  service_no text NOT NULL,
  plate text NOT NULL,
  brand text, model text, model_year integer, capacity integer, description text,
  is_demo boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transport_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  user_id uuid,
  staff_role public.transport_staff_role NOT NULL DEFAULT 'driver',
  full_name text NOT NULL,
  phone text, license_no text, notes text,
  is_demo boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_staff_id uuid REFERENCES public.transport_staff(id) ON DELETE SET NULL,
  attendant_staff_id uuid REFERENCES public.transport_staff(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text,
  direction public.transport_direction NOT NULL DEFAULT 'both',
  description text,
  is_demo boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index integer NOT NULL DEFAULT 1,
  lat double precision, lng double precision,
  planned_time time,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  student_no text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  national_id text,
  guardian_name text, guardian_phone text,
  is_demo boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.student_transport_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  stop_id uuid REFERENCES public.route_stops(id) ON DELETE SET NULL,
  direction public.transport_direction NOT NULL DEFAULT 'both',
  is_demo boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, route_id, direction)
);

CREATE TABLE public.transport_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_staff_id uuid REFERENCES public.transport_staff(id) ON DELETE SET NULL,
  attendant_staff_id uuid REFERENCES public.transport_staff(id) ON DELETE SET NULL,
  direction public.transport_direction NOT NULL DEFAULT 'to_school',
  status public.transport_trip_status NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  started_by uuid, ended_by uuid,
  last_lat double precision, last_lng double precision,
  last_accuracy double precision, last_speed double precision, last_heading double precision,
  last_location_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transport_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.transport_trips(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  stop_id uuid REFERENCES public.route_stops(id) ON DELETE SET NULL,
  event_type public.transport_event_type NOT NULL,
  actor_user_id uuid,
  lat double precision, lng double precision,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.transport_trips(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision, speed double precision, heading double precision,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transport_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL UNIQUE REFERENCES public.institutions(id) ON DELETE CASCADE,
  location_retention_days integer NOT NULL DEFAULT 30,
  ping_interval_seconds integer NOT NULL DEFAULT 8,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_routes_institution ON public.routes(institution_id);
CREATE INDEX idx_route_stops_route ON public.route_stops(route_id, order_index);
CREATE INDEX idx_assignments_route ON public.student_transport_assignments(route_id);
CREATE INDEX idx_trips_status ON public.transport_trips(institution_id, status);
CREATE INDEX idx_events_trip ON public.transport_events(trip_id, occurred_at);
CREATE INDEX idx_pings_trip ON public.location_pings(trip_id, recorded_at DESC);

-- GRANTS ---------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_staff TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_stops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_transport_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_trips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_pings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_settings TO authenticated;
GRANT ALL ON public.vehicles, public.transport_staff, public.routes, public.route_stops,
  public.students, public.student_transport_assignments, public.transport_trips,
  public.transport_events, public.location_pings, public.transport_settings TO service_role;

-- RLS ------------------------------------------------------------------
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_transport_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_settings ENABLE ROW LEVEL SECURITY;

-- staff helpers (created after tables exist)
CREATE OR REPLACE FUNCTION public.is_transport_staff_of_route(_user_id uuid, _route_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.routes r
    JOIN public.transport_staff s ON s.id IN (r.driver_staff_id, r.attendant_staff_id)
    WHERE r.id = _route_id AND s.user_id = _user_id AND s.is_active AND s.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_transport_staff_of_trip(_user_id uuid, _trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transport_trips t
    JOIN public.transport_staff s ON s.id IN (t.driver_staff_id, t.attendant_staff_id)
    WHERE t.id = _trip_id AND s.user_id = _user_id AND s.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.my_transport_staff_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.transport_staff
  WHERE user_id = _user_id AND is_active AND deleted_at IS NULL
  ORDER BY created_at LIMIT 1;
$$;

-- vehicles
CREATE POLICY "vehicles_manage" ON public.vehicles FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE POLICY "vehicles_staff_read" ON public.vehicles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.routes r WHERE r.vehicle_id = vehicles.id
                 AND public.is_transport_staff_of_route(auth.uid(), r.id)));

-- transport_staff
CREATE POLICY "staff_manage" ON public.transport_staff FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE POLICY "staff_read_self" ON public.transport_staff FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- routes
CREATE POLICY "routes_manage" ON public.routes FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE POLICY "routes_staff_read" ON public.routes FOR SELECT TO authenticated
  USING (public.is_transport_staff_of_route(auth.uid(), id));

-- route_stops
CREATE POLICY "stops_manage" ON public.route_stops FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE POLICY "stops_staff_read" ON public.route_stops FOR SELECT TO authenticated
  USING (public.is_transport_staff_of_route(auth.uid(), route_id));

-- students
CREATE POLICY "students_manage" ON public.students FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE POLICY "students_staff_read" ON public.students FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.student_transport_assignments a
    WHERE a.student_id = students.id AND a.deleted_at IS NULL
      AND public.is_transport_staff_of_route(auth.uid(), a.route_id)
  ));

-- assignments
CREATE POLICY "assignments_manage" ON public.student_transport_assignments FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE POLICY "assignments_staff_read" ON public.student_transport_assignments FOR SELECT TO authenticated
  USING (public.is_transport_staff_of_route(auth.uid(), route_id));

-- trips
CREATE POLICY "trips_manage" ON public.transport_trips FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE POLICY "trips_staff_read" ON public.transport_trips FOR SELECT TO authenticated
  USING (public.is_transport_staff_of_trip(auth.uid(), id));
CREATE POLICY "trips_staff_insert" ON public.transport_trips FOR INSERT TO authenticated
  WITH CHECK (public.is_transport_staff_of_route(auth.uid(), route_id)
    AND driver_staff_id IS NOT DISTINCT FROM public.my_transport_staff_id(auth.uid()));
CREATE POLICY "trips_staff_update" ON public.transport_trips FOR UPDATE TO authenticated
  USING (public.is_transport_staff_of_trip(auth.uid(), id))
  WITH CHECK (public.is_transport_staff_of_trip(auth.uid(), id));

-- events
CREATE POLICY "events_manage_read" ON public.transport_events FOR SELECT TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id)
    OR public.is_transport_staff_of_trip(auth.uid(), trip_id));
CREATE POLICY "events_staff_insert" ON public.transport_events FOR INSERT TO authenticated
  WITH CHECK (public.is_transport_staff_of_trip(auth.uid(), trip_id)
    OR public.can_manage_institution(auth.uid(), institution_id));

-- pings
CREATE POLICY "pings_read" ON public.location_pings FOR SELECT TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id)
    OR public.is_transport_staff_of_trip(auth.uid(), trip_id));
CREATE POLICY "pings_staff_insert" ON public.location_pings FOR INSERT TO authenticated
  WITH CHECK (public.is_transport_staff_of_trip(auth.uid(), trip_id));

-- settings
CREATE POLICY "settings_manage" ON public.transport_settings FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));

-- updated_at triggers
CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_staff_updated BEFORE UPDATE ON public.transport_staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_routes_updated BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_stops_updated BEFORE UPDATE ON public.route_stops FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_assign_updated BEFORE UPDATE ON public.student_transport_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_trips_updated BEFORE UPDATE ON public.transport_trips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tsettings_updated BEFORE UPDATE ON public.transport_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- realtime
ALTER TABLE public.transport_trips REPLICA IDENTITY FULL;
ALTER TABLE public.location_pings REPLICA IDENTITY FULL;
ALTER TABLE public.transport_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transport_trips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.location_pings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transport_events;