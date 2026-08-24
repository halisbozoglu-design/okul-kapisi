-- Guarded read API for the tenant permission catalogue.
-- Keeps frontend access-management UI independent from direct permissions-table RLS.

CREATE OR REPLACE FUNCTION public.get_manageable_permission_catalog(
  _institution_id uuid
)
RETURNS TABLE (
  role public.app_role,
  resource text,
  action text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor_id uuid := auth.uid();
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF _institution_id IS NULL
     OR NOT public.can_administer_access(_actor_id, _institution_id) THEN
    RAISE EXCEPTION 'ACCESS_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.role, p.resource, p.action
  FROM public.permissions p
  -- Global super admin may see the full catalogue. Tenant administrators only
  -- see capabilities that they themselves can delegate, preventing the UI from
  -- advertising permissions the RPC will correctly refuse to grant.
  WHERE public.has_role(_actor_id, 'super_admin'::public.app_role)
     OR public.has_permission(_actor_id, _institution_id, p.resource, p.action)
  ORDER BY p.resource, p.action, p.role::text;
END;
$$;

REVOKE ALL ON FUNCTION public.get_manageable_permission_catalog(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manageable_permission_catalog(uuid) TO authenticated;
