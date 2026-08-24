-- MİMAROS transport tenant isolation + audit hardening
-- Additive / non-destructive. Assumes tenant authorization core migrations run first.

-- -----------------------------------------------------------------------------
-- Permission defaults
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions (role, resource, action)
VALUES
  ('kurum_yoneticisi', 'audit', 'view'),
  ('okul_yoneticisi', 'audit', 'view'),
  ('kurum_yoneticisi', 'transport', 'audit'),
  ('okul_yoneticisi', 'transport', 'audit')
ON CONFLICT (role, resource, action) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Immutable audit log. Authenticated clients can only read rows they are allowed
-- to inspect; writes come from the trigger below.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  entity_table text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_logs_institution_created
  ON public.audit_logs(institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_logs_entity
  ON public.audit_logs(entity_table, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_logs_actor
  ON public.audit_logs(actor_user_id, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

DROP POLICY IF EXISTS "Tenant admins read audit logs" ON public.audit_logs;
CREATE POLICY "Tenant admins read audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (
  institution_id IS NOT NULL
  AND public.has_permission((SELECT auth.uid()), institution_id, 'audit', 'view')
);

-- -----------------------------------------------------------------------------
-- Generic tenant relationship guard for sensitive transport write paths.
-- Prevents a client from pairing an institution_id from tenant A with a trip,
-- route, student, stop, vehicle or staff record belonging to tenant B.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_transport_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
BEGIN
  IF TG_TABLE_NAME = 'location_pings' THEN
    SELECT institution_id INTO v_inst FROM public.transport_trips WHERE id = NEW.trip_id;
    IF v_inst IS NULL OR v_inst <> NEW.institution_id THEN
      RAISE EXCEPTION 'transport tenant mismatch: location_pings.trip_id';
    END IF;

  ELSIF TG_TABLE_NAME = 'transport_events' THEN
    SELECT institution_id INTO v_inst FROM public.transport_trips WHERE id = NEW.trip_id;
    IF v_inst IS NULL OR v_inst <> NEW.institution_id THEN
      RAISE EXCEPTION 'transport tenant mismatch: transport_events.trip_id';
    END IF;
    IF NEW.student_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = NEW.student_id AND s.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: transport_events.student_id';
    END IF;
    IF NEW.stop_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.route_stops rs
      WHERE rs.id = NEW.stop_id AND rs.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: transport_events.stop_id';
    END IF;

  ELSIF TG_TABLE_NAME = 'student_transport_assignments' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = NEW.student_id AND s.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: assignment.student_id';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.routes r
      WHERE r.id = NEW.route_id AND r.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: assignment.route_id';
    END IF;
    IF NEW.stop_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.route_stops rs
      WHERE rs.id = NEW.stop_id
        AND rs.route_id = NEW.route_id
        AND rs.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: assignment.stop_id';
    END IF;

  ELSIF TG_TABLE_NAME = 'route_stops' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.routes r
      WHERE r.id = NEW.route_id AND r.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: route_stops.route_id';
    END IF;

  ELSIF TG_TABLE_NAME = 'routes' THEN
    IF NEW.vehicle_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = NEW.vehicle_id AND v.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: routes.vehicle_id';
    END IF;
    IF NEW.driver_staff_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.transport_staff s
      WHERE s.id = NEW.driver_staff_id AND s.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: routes.driver_staff_id';
    END IF;
    IF NEW.attendant_staff_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.transport_staff s
      WHERE s.id = NEW.attendant_staff_id AND s.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: routes.attendant_staff_id';
    END IF;

  ELSIF TG_TABLE_NAME = 'transport_trips' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.routes r
      WHERE r.id = NEW.route_id AND r.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: trips.route_id';
    END IF;
    IF NEW.vehicle_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = NEW.vehicle_id AND v.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: trips.vehicle_id';
    END IF;
    IF NEW.driver_staff_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.transport_staff s
      WHERE s.id = NEW.driver_staff_id AND s.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: trips.driver_staff_id';
    END IF;
    IF NEW.attendant_staff_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.transport_staff s
      WHERE s.id = NEW.attendant_staff_id AND s.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'transport tenant mismatch: trips.attendant_staff_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_transport_tenant_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_transport_tenant_integrity_pings ON public.location_pings;
CREATE TRIGGER trg_transport_tenant_integrity_pings
BEFORE INSERT OR UPDATE ON public.location_pings
FOR EACH ROW EXECUTE FUNCTION public.tg_transport_tenant_integrity();

DROP TRIGGER IF EXISTS trg_transport_tenant_integrity_events ON public.transport_events;
CREATE TRIGGER trg_transport_tenant_integrity_events
BEFORE INSERT OR UPDATE ON public.transport_events
FOR EACH ROW EXECUTE FUNCTION public.tg_transport_tenant_integrity();

DROP TRIGGER IF EXISTS trg_transport_tenant_integrity_assignments ON public.student_transport_assignments;
CREATE TRIGGER trg_transport_tenant_integrity_assignments
BEFORE INSERT OR UPDATE ON public.student_transport_assignments
FOR EACH ROW EXECUTE FUNCTION public.tg_transport_tenant_integrity();

DROP TRIGGER IF EXISTS trg_transport_tenant_integrity_stops ON public.route_stops;
CREATE TRIGGER trg_transport_tenant_integrity_stops
BEFORE INSERT OR UPDATE ON public.route_stops
FOR EACH ROW EXECUTE FUNCTION public.tg_transport_tenant_integrity();

DROP TRIGGER IF EXISTS trg_transport_tenant_integrity_routes ON public.routes;
CREATE TRIGGER trg_transport_tenant_integrity_routes
BEFORE INSERT OR UPDATE ON public.routes
FOR EACH ROW EXECUTE FUNCTION public.tg_transport_tenant_integrity();

DROP TRIGGER IF EXISTS trg_transport_tenant_integrity_trips ON public.transport_trips;
CREATE TRIGGER trg_transport_tenant_integrity_trips
BEFORE INSERT OR UPDATE ON public.transport_trips
FOR EACH ROW EXECUTE FUNCTION public.tg_transport_tenant_integrity();

-- -----------------------------------------------------------------------------
-- Tight permission-aware transport RLS. Existing named policies are replaced so
-- the DB, not only the frontend, enforces the module permission matrix.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "vehicles_manage" ON public.vehicles;
CREATE POLICY "vehicles_permission_manage" ON public.vehicles FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'));

DROP POLICY IF EXISTS "staff_manage" ON public.transport_staff;
CREATE POLICY "transport_staff_permission_manage" ON public.transport_staff FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'));

DROP POLICY IF EXISTS "routes_manage" ON public.routes;
CREATE POLICY "routes_permission_manage" ON public.routes FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'));

DROP POLICY IF EXISTS "stops_manage" ON public.route_stops;
CREATE POLICY "stops_permission_manage" ON public.route_stops FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'));

DROP POLICY IF EXISTS "students_manage" ON public.students;
CREATE POLICY "students_transport_permission_manage" ON public.students FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'));

DROP POLICY IF EXISTS "assignments_manage" ON public.student_transport_assignments;
CREATE POLICY "assignments_permission_manage" ON public.student_transport_assignments FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'));

DROP POLICY IF EXISTS "trips_manage" ON public.transport_trips;
CREATE POLICY "trips_permission_manage" ON public.transport_trips FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'));

DROP POLICY IF EXISTS "events_manage_read" ON public.transport_events;
CREATE POLICY "events_permission_read" ON public.transport_events FOR SELECT TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'view')
  OR public.is_transport_staff_of_trip((SELECT auth.uid()), trip_id)
);

DROP POLICY IF EXISTS "events_staff_insert" ON public.transport_events;
CREATE POLICY "events_authorized_insert" ON public.transport_events FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transport_trips t
    WHERE t.id = trip_id
      AND t.institution_id = transport_events.institution_id
      AND t.deleted_at IS NULL
      AND (
        public.is_transport_staff_of_trip((SELECT auth.uid()), t.id)
        OR public.has_permission((SELECT auth.uid()), t.institution_id, 'transport', 'manage')
      )
  )
);

DROP POLICY IF EXISTS "pings_read" ON public.location_pings;
CREATE POLICY "pings_least_privilege_read" ON public.location_pings FOR SELECT TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'live_track')
  OR public.is_transport_staff_of_trip((SELECT auth.uid()), trip_id)
);

DROP POLICY IF EXISTS "pings_staff_insert" ON public.location_pings;
CREATE POLICY "pings_active_trip_staff_insert" ON public.location_pings FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transport_trips t
    WHERE t.id = trip_id
      AND t.institution_id = location_pings.institution_id
      AND t.status = 'active'
      AND t.deleted_at IS NULL
      AND public.is_transport_staff_of_trip((SELECT auth.uid()), t.id)
  )
);

DROP POLICY IF EXISTS "settings_manage" ON public.transport_settings;
CREATE POLICY "transport_settings_permission_manage" ON public.transport_settings FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'));

DROP POLICY IF EXISTS "Managers manage institution absences" ON public.transport_absences;
CREATE POLICY "Transport managers manage absences" ON public.transport_absences FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'manage'));

DROP POLICY IF EXISTS "Managers read institution transport notifications" ON public.transport_notifications;
CREATE POLICY "Transport viewers read institution notifications"
ON public.transport_notifications FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'view'));

-- Guardian policies remain student-scoped. Strengthen guardian absence mutation so
-- a guardian cannot change tenant/student/creator identity after insert.
DROP POLICY IF EXISTS "Guardians cancel own child absences" ON public.transport_absences;
CREATE POLICY "Guardians cancel own child absences"
ON public.transport_absences FOR UPDATE TO authenticated
USING (
  public.is_guardian_of_student((SELECT auth.uid()), student_id)
  AND created_by = (SELECT auth.uid())
)
WITH CHECK (
  public.is_guardian_of_student((SELECT auth.uid()), student_id)
  AND created_by = (SELECT auth.uid())
  AND institution_id = (SELECT s.institution_id FROM public.students s WHERE s.id = student_id)
);

-- -----------------------------------------------------------------------------
-- Revoke helper execution from PUBLIC. These are internal authorization helpers;
-- authenticated clients may call only the helpers intentionally exposed below.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_transport_staff_of_route(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_transport_staff_of_trip(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_transport_staff_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_transport_staff_of_student(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_guardian_of_student(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_guardian_of_route(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_guardian_of_trip(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_transport_staff_of_route(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_transport_staff_of_trip(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_transport_staff_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_transport_staff_of_student(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_guardian_of_student(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_guardian_of_route(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_guardian_of_trip(uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Audit trigger. SECURITY DEFINER is intentional only for inserting into the
-- append-only audit table; execution is trigger-only and revoked from clients.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_audit_transport_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_inst uuid;
  v_id uuid;
BEGIN
  v_inst := COALESCE(
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.institution_id ELSE NULL END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.institution_id ELSE NULL END
  );
  v_id := COALESCE(
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.id ELSE NULL END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.id ELSE NULL END
  );

  -- Exact GPS coordinates are high-sensitivity telemetry. Keep the operational
  -- location table protected by RLS, but do not duplicate coordinates into audit.
  IF TG_TABLE_NAME = 'location_pings' THEN
    IF v_old IS NOT NULL THEN v_old := v_old - 'lat' - 'lng' - 'accuracy' - 'speed' - 'heading'; END IF;
    IF v_new IS NOT NULL THEN v_new := v_new - 'lat' - 'lng' - 'accuracy' - 'speed' - 'heading'; END IF;
  END IF;

  -- Student identity fields are not needed for authorization auditing.
  IF TG_TABLE_NAME = 'students' THEN
    IF v_old IS NOT NULL THEN v_old := v_old - 'national_id' - 'guardian_phone'; END IF;
    IF v_new IS NOT NULL THEN v_new := v_new - 'national_id' - 'guardian_phone'; END IF;
  END IF;

  INSERT INTO public.audit_logs(
    institution_id, actor_user_id, action, entity_table, entity_id, old_data, new_data,
    metadata
  ) VALUES (
    v_inst, auth.uid(), TG_OP, TG_TABLE_NAME, v_id, v_old, v_new,
    jsonb_build_object('source', 'db_trigger')
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.tg_audit_transport_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'vehicles',
    'transport_staff',
    'routes',
    'route_stops',
    'students',
    'student_transport_assignments',
    'transport_trips',
    'transport_events',
    'location_pings',
    'transport_settings',
    'transport_absences',
    'student_guardians'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_audit_' || v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_audit_transport_change()',
      'trg_audit_' || v_table,
      v_table
    );
  END LOOP;
END $$;

-- Keep Data API exposure explicit for 2026 Supabase defaults. RLS remains the
-- row-level authority; authenticated receives only operations the app requires.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_staff TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_stops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_transport_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.transport_trips TO authenticated;
GRANT SELECT, INSERT ON public.transport_events TO authenticated;
GRANT SELECT, INSERT ON public.location_pings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.transport_absences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_guardians TO authenticated;
GRANT SELECT, UPDATE ON public.transport_notifications TO authenticated;
