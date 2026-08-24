-- MİMAROS transport action permissions + live tracking RLS hardening.
-- Additive/backward-compatible: existing transport:manage remains a super-permission,
-- while resource-specific manage permissions can now be granted independently.

-- Seed granular transport management permissions to every role that already has
-- the legacy transport:manage permission so existing production behavior is preserved.
INSERT INTO public.permissions (role, resource, action)
SELECT DISTINCT p.role, v.resource, 'manage'
FROM public.permissions p
CROSS JOIN (VALUES
  ('transport.vehicle'),
  ('transport.staff'),
  ('transport.route'),
  ('transport.assignment'),
  ('transport.trip'),
  ('transport.settings'),
  ('transport.absence')
) AS v(resource)
WHERE p.resource = 'transport'
  AND p.action = 'manage'
  AND NOT EXISTS (
    SELECT 1
    FROM public.permissions existing
    WHERE existing.role = p.role
      AND existing.resource = v.resource
      AND existing.action = 'manage'
  );

-- Settings CRUD.
DROP POLICY IF EXISTS settings_manage ON public.transport_settings;
CREATE POLICY settings_manage ON public.transport_settings
FOR ALL TO authenticated
USING (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.settings', 'manage')
)
WITH CHECK (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.settings', 'manage')
);

-- Vehicle CRUD.
DROP POLICY IF EXISTS vehicles_manage ON public.vehicles;
CREATE POLICY vehicles_manage ON public.vehicles
FOR ALL TO authenticated
USING (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.vehicle', 'manage')
)
WITH CHECK (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.vehicle', 'manage')
);

-- Staff CRUD.
DROP POLICY IF EXISTS staff_manage ON public.transport_staff;
CREATE POLICY staff_manage ON public.transport_staff
FOR ALL TO authenticated
USING (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.staff', 'manage')
)
WITH CHECK (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.staff', 'manage')
);

-- Route and stop CRUD share one route-management permission.
DROP POLICY IF EXISTS routes_manage ON public.routes;
CREATE POLICY routes_manage ON public.routes
FOR ALL TO authenticated
USING (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.route', 'manage')
)
WITH CHECK (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.route', 'manage')
);

DROP POLICY IF EXISTS stops_manage ON public.route_stops;
CREATE POLICY stops_manage ON public.route_stops
FOR ALL TO authenticated
USING (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.route', 'manage')
)
WITH CHECK (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.route', 'manage')
);

-- Student-to-service assignment CRUD.
DROP POLICY IF EXISTS assignments_manage ON public.student_transport_assignments;
CREATE POLICY assignments_manage ON public.student_transport_assignments
FOR ALL TO authenticated
USING (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.assignment', 'manage')
)
WITH CHECK (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.assignment', 'manage')
);

-- Trip CRUD. Driver-specific policies remain separate and authoritative.
DROP POLICY IF EXISTS trips_manage ON public.transport_trips;
CREATE POLICY trips_manage ON public.transport_trips
FOR ALL TO authenticated
USING (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.trip', 'manage')
)
WITH CHECK (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.trip', 'manage')
);

-- Manager absence CRUD. Guardian self-service policies remain unchanged.
DROP POLICY IF EXISTS "Managers manage institution absences" ON public.transport_absences;
CREATE POLICY "Managers manage institution absences" ON public.transport_absences
FOR ALL TO authenticated
USING (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.absence', 'manage')
)
WITH CHECK (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport.absence', 'manage')
);

-- A transport.trip manager may create operational events, without receiving every
-- other transport management permission. Transport staff access remains unchanged.
DROP POLICY IF EXISTS events_staff_insert ON public.transport_events;
CREATE POLICY events_staff_insert ON public.transport_events
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.transport_trips t
    WHERE t.id = transport_events.trip_id
      AND t.institution_id = transport_events.institution_id
      AND t.deleted_at IS NULL
      AND (
        public.is_transport_staff_of_trip((SELECT auth.uid()), t.id)
        OR public.can_manage_transport((SELECT auth.uid()), t.institution_id)
        OR public.has_permission((SELECT auth.uid()), t.institution_id, 'transport.trip', 'manage')
      )
  )
);

-- Precise GPS is sensitive. General transport:view is no longer sufficient.
-- Only live_track, full transport managers, or the actual trip staff may read pings.
DROP POLICY IF EXISTS pings_read ON public.location_pings;
CREATE POLICY pings_read ON public.location_pings
FOR SELECT TO authenticated
USING (
  public.can_manage_transport((SELECT auth.uid()), institution_id)
  OR public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'live_track')
  OR public.is_transport_staff_of_trip((SELECT auth.uid()), trip_id)
);

-- Make transport:live_track independently usable end-to-end at DB level.
DROP POLICY IF EXISTS trips_live_track_read ON public.transport_trips;
CREATE POLICY trips_live_track_read ON public.transport_trips
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'live_track')
);

DROP POLICY IF EXISTS routes_live_track_read ON public.routes;
CREATE POLICY routes_live_track_read ON public.routes
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'live_track')
);

DROP POLICY IF EXISTS stops_live_track_read ON public.route_stops;
CREATE POLICY stops_live_track_read ON public.route_stops
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'live_track')
);

DROP POLICY IF EXISTS vehicles_live_track_read ON public.vehicles;
CREATE POLICY vehicles_live_track_read ON public.vehicles
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'live_track')
);

DROP POLICY IF EXISTS events_live_track_read ON public.transport_events;
CREATE POLICY events_live_track_read ON public.transport_events
FOR SELECT TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'live_track')
);
