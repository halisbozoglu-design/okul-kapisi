-- MİMAROS core tenant RLS hardening
-- Removes legacy global-admin policies from tenant-owned core tables and replaces
-- them with institution-scoped permissions. Additive / non-destructive to data.

-- -----------------------------------------------------------------------------
-- Institutions
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage institutions" ON public.institutions;
DROP POLICY IF EXISTS "Institution access admins update institution" ON public.institutions;
CREATE POLICY "Institution access admins update institution"
ON public.institutions FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), id, 'access', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), id, 'access', 'manage'));

DROP POLICY IF EXISTS "Super admins create institutions" ON public.institutions;
CREATE POLICY "Super admins create institutions"
ON public.institutions FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Super admins delete institutions" ON public.institutions;
CREATE POLICY "Super admins delete institutions"
ON public.institutions FOR DELETE TO authenticated
USING (public.is_super_admin((SELECT auth.uid())));

-- -----------------------------------------------------------------------------
-- Direct institution-owned settings tables
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage campuses" ON public.campuses;
DROP POLICY IF EXISTS "Tenant settings manage campuses" ON public.campuses;
CREATE POLICY "Tenant settings manage campuses"
ON public.campuses FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'settings', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'settings', 'manage'));

DROP POLICY IF EXISTS "Admins can manage academic_years" ON public.academic_years;
DROP POLICY IF EXISTS "Tenant settings manage academic years" ON public.academic_years;
CREATE POLICY "Tenant settings manage academic years"
ON public.academic_years FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'settings', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'settings', 'manage'));

DROP POLICY IF EXISTS "Admins can manage grade_levels" ON public.grade_levels;
DROP POLICY IF EXISTS "Tenant settings manage grade levels" ON public.grade_levels;
CREATE POLICY "Tenant settings manage grade levels"
ON public.grade_levels FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'settings', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'settings', 'manage'));

DROP POLICY IF EXISTS "Admins can manage branches" ON public.branches;
DROP POLICY IF EXISTS "Tenant settings manage branches" ON public.branches;
CREATE POLICY "Tenant settings manage branches"
ON public.branches FOR ALL TO authenticated
USING (public.has_permission((SELECT auth.uid()), institution_id, 'settings', 'manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), institution_id, 'settings', 'manage'));

-- -----------------------------------------------------------------------------
-- Indirect tenant-owned settings tables
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view terms" ON public.terms;
DROP POLICY IF EXISTS "Admins can manage terms" ON public.terms;
DROP POLICY IF EXISTS "Tenant members view terms" ON public.terms;
CREATE POLICY "Tenant members view terms"
ON public.terms FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.academic_years ay
    WHERE ay.id = terms.academic_year_id
      AND public.is_institution_member((SELECT auth.uid()), ay.institution_id)
  )
);
DROP POLICY IF EXISTS "Tenant settings manage terms" ON public.terms;
CREATE POLICY "Tenant settings manage terms"
ON public.terms FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.academic_years ay
    WHERE ay.id = terms.academic_year_id
      AND public.has_permission((SELECT auth.uid()), ay.institution_id, 'settings', 'manage')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.academic_years ay
    WHERE ay.id = terms.academic_year_id
      AND public.has_permission((SELECT auth.uid()), ay.institution_id, 'settings', 'manage')
  )
);

DROP POLICY IF EXISTS "Authenticated can view sections" ON public.sections;
DROP POLICY IF EXISTS "Admins can manage sections" ON public.sections;
DROP POLICY IF EXISTS "Tenant members view sections" ON public.sections;
CREATE POLICY "Tenant members view sections"
ON public.sections FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.grade_levels gl
    WHERE gl.id = sections.grade_level_id
      AND public.is_institution_member((SELECT auth.uid()), gl.institution_id)
  )
);
DROP POLICY IF EXISTS "Tenant settings manage sections" ON public.sections;
CREATE POLICY "Tenant settings manage sections"
ON public.sections FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.grade_levels gl
    WHERE gl.id = sections.grade_level_id
      AND public.has_permission((SELECT auth.uid()), gl.institution_id, 'settings', 'manage')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.grade_levels gl
    WHERE gl.id = sections.grade_level_id
      AND public.has_permission((SELECT auth.uid()), gl.institution_id, 'settings', 'manage')
  )
);

DROP POLICY IF EXISTS "Authenticated can view classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Admins can manage classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Tenant members view classrooms" ON public.classrooms;
CREATE POLICY "Tenant members view classrooms"
ON public.classrooms FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campuses c
    WHERE c.id = classrooms.campus_id
      AND public.is_institution_member((SELECT auth.uid()), c.institution_id)
  )
);
DROP POLICY IF EXISTS "Tenant settings manage classrooms" ON public.classrooms;
CREATE POLICY "Tenant settings manage classrooms"
ON public.classrooms FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campuses c
    WHERE c.id = classrooms.campus_id
      AND public.has_permission((SELECT auth.uid()), c.institution_id, 'settings', 'manage')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.campuses c
    WHERE c.id = classrooms.campus_id
      AND public.has_permission((SELECT auth.uid()), c.institution_id, 'settings', 'manage')
  )
);

-- -----------------------------------------------------------------------------
-- Profiles: remove global-admin cross-tenant visibility. Access admins may see
-- profiles only for users actively linked to the same institution they administer.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Tenant access admins view member profiles" ON public.profiles;
CREATE POLICY "Tenant access admins view member profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_institutions target_ui
    WHERE target_ui.user_id = profiles.user_id
      AND target_ui.is_active
      AND public.has_permission(
        (SELECT auth.uid()), target_ui.institution_id, 'access', 'manage'
      )
  )
);

-- Do not allow a user to reactivate a centrally disabled profile through the
-- self-service UPDATE policy. Self edits are limited to an already active row and
-- must leave the account active/non-deleted.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users update own active profile"
ON public.profiles FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND is_active
  AND deleted_at IS NULL
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND is_active
  AND deleted_at IS NULL
);

-- -----------------------------------------------------------------------------
-- Global legacy role tables are compatibility-only. Prevent institution admins
-- from getting cross-tenant authority through legacy policies.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage user_institutions" ON public.user_institutions;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admin manages legacy roles" ON public.user_roles;
CREATE POLICY "Super admin manages legacy roles"
ON public.user_roles FOR ALL TO authenticated
USING (public.is_super_admin((SELECT auth.uid())))
WITH CHECK (public.is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Super admin can manage permissions" ON public.permissions;
DROP POLICY IF EXISTS "Super admin manages role permission defaults" ON public.permissions;
CREATE POLICY "Super admin manages role permission defaults"
ON public.permissions FOR ALL TO authenticated
USING (public.is_super_admin((SELECT auth.uid())))
WITH CHECK (public.is_super_admin((SELECT auth.uid())));

-- Permission definitions are not tenant data, but authenticated users only need
-- SELECT for authorization UX; mutations remain super-admin-only via RLS.
REVOKE INSERT, UPDATE, DELETE ON public.permissions FROM authenticated;
GRANT SELECT ON public.permissions TO authenticated;

-- -----------------------------------------------------------------------------
-- Audit membership / tenant-role / override changes using the append-only audit
-- trigger introduced by 20260824123000_transport_tenant_rls_audit.sql.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_user_institutions ON public.user_institutions;
CREATE TRIGGER trg_audit_user_institutions
AFTER INSERT OR UPDATE OR DELETE ON public.user_institutions
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_transport_change();

DROP TRIGGER IF EXISTS trg_audit_institution_user_roles ON public.institution_user_roles;
CREATE TRIGGER trg_audit_institution_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.institution_user_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_transport_change();

DROP TRIGGER IF EXISTS trg_audit_user_permission_overrides ON public.user_permission_overrides;
CREATE TRIGGER trg_audit_user_permission_overrides
AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_overrides
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_transport_change();

-- Explicit Data API grants; RLS remains authoritative.
GRANT SELECT, UPDATE ON public.institutions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campuses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_years TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.terms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grade_levels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classrooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
