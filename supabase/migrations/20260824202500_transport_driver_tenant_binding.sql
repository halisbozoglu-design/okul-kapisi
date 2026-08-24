-- Bind driver/staff identity resolution to the active institution.
-- Additive/backwards-compatible: keeps the legacy one-argument helper but makes
-- it fail closed when a user has more than one active transport_staff record.

CREATE OR REPLACE FUNCTION public.my_transport_staff_id(
  _user_id uuid,
  _institution_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ts.id
  FROM public.transport_staff ts
  WHERE _user_id = auth.uid()
    AND ts.user_id = _user_id
    AND ts.institution_id = _institution_id
    AND COALESCE(ts.is_active, true)
    AND ts.deleted_at IS NULL
  ORDER BY ts.created_at, ts.id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.my_transport_staff_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN count(*) = 1 THEN min(ts.id::text)::uuid ELSE NULL END
  FROM public.transport_staff ts
  WHERE _user_id = auth.uid()
    AND ts.user_id = _user_id
    AND COALESCE(ts.is_active, true)
    AND ts.deleted_at IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.my_transport_staff_id(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_transport_staff_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_transport_staff_id(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_transport_staff_id(uuid) TO authenticated, service_role;

-- A user may have one active transport identity per institution. This prevents
-- ambiguous staff resolution while still allowing the same account to work in
-- multiple institutions.
CREATE UNIQUE INDEX IF NOT EXISTS ux_transport_staff_active_user_institution
  ON public.transport_staff (institution_id, user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL AND COALESCE(is_active, true);

DROP POLICY IF EXISTS trips_staff_insert ON public.transport_trips;
CREATE POLICY trips_staff_insert
ON public.transport_trips
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_transport_staff_of_route((SELECT auth.uid()), route_id)
  AND driver_staff_id IS NOT DISTINCT FROM
      public.my_transport_staff_id((SELECT auth.uid()), institution_id)
  AND EXISTS (
    SELECT 1
    FROM public.routes r
    WHERE r.id = route_id
      AND r.institution_id = institution_id
      AND r.deleted_at IS NULL
      AND r.is_active
  )
);

-- Tighten the helper itself so a route cannot be satisfied through a staff row
-- from another tenant even if bad historical data existed.
CREATE OR REPLACE FUNCTION public.is_transport_staff_of_route(_user_id uuid, _route_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.routes r
      JOIN public.transport_staff s
        ON s.id IN (r.driver_staff_id, r.attendant_staff_id)
       AND s.institution_id = r.institution_id
      WHERE r.id = _route_id
        AND r.deleted_at IS NULL
        AND s.user_id = _user_id
        AND COALESCE(s.is_active, true)
        AND s.deleted_at IS NULL
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_transport_staff_of_trip(_user_id uuid, _trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.transport_trips t
      JOIN public.transport_staff s
        ON s.id IN (t.driver_staff_id, t.attendant_staff_id)
       AND s.institution_id = t.institution_id
      WHERE t.id = _trip_id
        AND t.deleted_at IS NULL
        AND s.user_id = _user_id
        AND COALESCE(s.is_active, true)
        AND s.deleted_at IS NULL
    );
$function$;

REVOKE ALL ON FUNCTION public.is_transport_staff_of_route(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_transport_staff_of_trip(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_transport_staff_of_route(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_transport_staff_of_trip(uuid, uuid) TO authenticated, service_role;
