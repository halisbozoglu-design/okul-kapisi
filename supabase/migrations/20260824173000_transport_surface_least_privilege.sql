-- MİMAROS transport permission surface hardening.
-- Data-preserving: removes only overly broad role permissions and anonymous API grants.

-- Guardians and students use dedicated transport experiences, not the admin transport dashboard.
DELETE FROM public.permissions
WHERE role IN ('veli'::public.app_role, 'ogrenci'::public.app_role)
  AND resource = 'transport'
  AND action = 'view';

-- Transport data is authenticated-only. RLS remains authoritative after this grant hardening.
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.transport_settings,
  public.vehicles,
  public.transport_staff,
  public.routes,
  public.route_stops,
  public.student_transport_assignments,
  public.transport_trips,
  public.transport_events,
  public.location_pings,
  public.transport_absences
FROM anon;

-- Keep the authenticated Data API surface explicit for the October 2026 Supabase exposure change.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.transport_settings,
  public.vehicles,
  public.transport_staff,
  public.routes,
  public.route_stops,
  public.student_transport_assignments,
  public.transport_trips,
  public.transport_events,
  public.location_pings,
  public.transport_absences
TO authenticated;

-- SECURITY DEFINER authorization helpers must never be callable by PUBLIC/anon.
REVOKE ALL ON FUNCTION public.has_permission(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_transport(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_transport(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_operate_transport_driver(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_transport(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_transport(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_operate_transport_driver(uuid, uuid) TO authenticated, service_role;
