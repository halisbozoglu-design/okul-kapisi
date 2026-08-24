-- MİMAROS access administration / operational permission separation.
-- Additive and backwards compatible. Does not delete production data.

-- Access administration is intentionally narrower than operational module management.
-- Only super admin / institution manager / school manager may change memberships,
-- tenant-scoped roles or per-user permission overrides.
CREATE OR REPLACE FUNCTION public.can_administer_access(_user_id uuid, _institution_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
    OR public.has_institution_role(_user_id, _institution_id, 'kurum_yoneticisi'::public.app_role)
    OR public.has_institution_role(_user_id, _institution_id, 'okul_yoneticisi'::public.app_role);
$$;
REVOKE ALL ON FUNCTION public.can_administer_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_administer_access(uuid, uuid) TO authenticated;

-- Seed the first module-level permission matrix. Permissions remain role defaults;
-- user_permission_overrides can explicitly allow/deny within the same tenant.
INSERT INTO public.permissions (role, resource, action)
VALUES
  ('kurum_yoneticisi', 'access', 'manage'),
  ('okul_yoneticisi', 'access', 'manage'),

  ('kurum_yoneticisi', 'settings', 'manage'),
  ('okul_yoneticisi', 'settings', 'manage'),

  ('kurum_yoneticisi', 'transport', 'view'),
  ('kurum_yoneticisi', 'transport', 'manage'),
  ('kurum_yoneticisi', 'transport', 'live_track'),
  ('okul_yoneticisi', 'transport', 'view'),
  ('okul_yoneticisi', 'transport', 'manage'),
  ('okul_yoneticisi', 'transport', 'live_track'),
  ('mudur_yardimcisi', 'transport', 'view'),
  ('mudur_yardimcisi', 'transport', 'manage'),
  ('mudur_yardimcisi', 'transport', 'live_track'),
  ('veli', 'transport.parent', 'view')
ON CONFLICT (role, resource, action) DO NOTHING;

-- Role and override administration now use the narrower access-admin predicate.
DROP POLICY IF EXISTS "Users read own institution roles" ON public.institution_user_roles;
CREATE POLICY "Users read own institution roles"
ON public.institution_user_roles FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.can_administer_access((SELECT auth.uid()), institution_id)
);

DROP POLICY IF EXISTS "Managers manage institution roles" ON public.institution_user_roles;
CREATE POLICY "Access admins manage institution roles"
ON public.institution_user_roles FOR ALL TO authenticated
USING (public.can_administer_access((SELECT auth.uid()), institution_id))
WITH CHECK (public.can_administer_access((SELECT auth.uid()), institution_id));

DROP POLICY IF EXISTS "Users read own permission overrides" ON public.user_permission_overrides;
CREATE POLICY "Users read own permission overrides"
ON public.user_permission_overrides FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.can_administer_access((SELECT auth.uid()), institution_id)
);

DROP POLICY IF EXISTS "Managers manage permission overrides" ON public.user_permission_overrides;
CREATE POLICY "Access admins manage permission overrides"
ON public.user_permission_overrides FOR ALL TO authenticated
USING (public.can_administer_access((SELECT auth.uid()), institution_id))
WITH CHECK (public.can_administer_access((SELECT auth.uid()), institution_id));

-- Membership records are tenant security boundaries. Users may see their own
-- memberships; only access administrators may change another user's membership.
DROP POLICY IF EXISTS "Users can view own institution links" ON public.user_institutions;
DROP POLICY IF EXISTS "Users view own institution memberships" ON public.user_institutions;
CREATE POLICY "Users view own institution memberships"
ON public.user_institutions FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.can_administer_access((SELECT auth.uid()), institution_id)
);

DROP POLICY IF EXISTS "Admins manage institution memberships" ON public.user_institutions;
DROP POLICY IF EXISTS "Access admins manage institution memberships" ON public.user_institutions;
CREATE POLICY "Access admins manage institution memberships"
ON public.user_institutions FOR ALL TO authenticated
USING (public.can_administer_access((SELECT auth.uid()), institution_id))
WITH CHECK (public.can_administer_access((SELECT auth.uid()), institution_id));

-- Explicit Data API grants; RLS remains the row-level authority.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.institution_user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_institutions TO authenticated;
