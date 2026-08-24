-- MİMAROS Security & Visitor module: move authorization from global roles to
-- tenant-scoped permissions while preserving teacher-specific duty assignment access.

-- Permission matrix ------------------------------------------------------------
INSERT INTO public.permissions(role, resource, action) VALUES
  ('kurum_yoneticisi', 'security', 'operate'),
  ('kurum_yoneticisi', 'security', 'manage'),
  ('kurum_yoneticisi', 'security.student_duty', 'view'),
  ('okul_yoneticisi', 'security', 'operate'),
  ('okul_yoneticisi', 'security', 'manage'),
  ('okul_yoneticisi', 'security.student_duty', 'view'),
  ('mudur_yardimcisi', 'security', 'operate'),
  ('mudur_yardimcisi', 'security', 'manage'),
  ('mudur_yardimcisi', 'security.student_duty', 'view'),
  ('personel', 'security', 'operate'),
  ('ogretmen', 'security.student_duty', 'view')
ON CONFLICT(role, resource, action) DO NOTHING;

-- Canonical helpers ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_operate_security(_user_id uuid, _institution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id = auth.uid()
     AND public.has_permission(_user_id, _institution_id, 'security', 'operate');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_security(_user_id uuid, _institution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id = auth.uid()
     AND public.has_permission(_user_id, _institution_id, 'security', 'manage');
$$;

CREATE OR REPLACE FUNCTION public.can_view_student_duty(_user_id uuid, _institution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id = auth.uid()
     AND public.has_permission(_user_id, _institution_id, 'security.student_duty', 'view');
$$;

REVOKE ALL ON FUNCTION public.can_operate_security(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_security(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_student_duty(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_operate_security(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_security(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_student_duty(uuid, uuid) TO authenticated;

-- Security locations -----------------------------------------------------------
DROP POLICY IF EXISTS "sec_loc_read" ON public.security_locations;
CREATE POLICY "sec_loc_read" ON public.security_locations
FOR SELECT TO authenticated USING (
  public.can_operate_security((SELECT auth.uid()), institution_id)
  OR public.can_manage_security((SELECT auth.uid()), institution_id)
  OR public.can_view_student_duty((SELECT auth.uid()), institution_id)
);

DROP POLICY IF EXISTS "sec_loc_manage" ON public.security_locations;
CREATE POLICY "sec_loc_manage" ON public.security_locations
FOR ALL TO authenticated
USING (public.can_manage_security((SELECT auth.uid()), institution_id))
WITH CHECK (public.can_manage_security((SELECT auth.uid()), institution_id));

-- Visitor restrictions ---------------------------------------------------------
DROP POLICY IF EXISTS "visitor_restrictions_read" ON public.visitor_access_restrictions;
CREATE POLICY "visitor_restrictions_read" ON public.visitor_access_restrictions
FOR SELECT TO authenticated
USING (public.can_operate_security((SELECT auth.uid()), institution_id)
       OR public.can_manage_security((SELECT auth.uid()), institution_id));

DROP POLICY IF EXISTS "visitor_restrictions_manage" ON public.visitor_access_restrictions;
CREATE POLICY "visitor_restrictions_manage" ON public.visitor_access_restrictions
FOR ALL TO authenticated
USING (public.can_manage_security((SELECT auth.uid()), institution_id))
WITH CHECK (public.can_manage_security((SELECT auth.uid()), institution_id));

-- Student duty configuration ---------------------------------------------------
DROP POLICY IF EXISTS "duty_settings_read" ON public.student_duty_settings;
CREATE POLICY "duty_settings_read" ON public.student_duty_settings
FOR SELECT TO authenticated
USING (public.can_view_student_duty((SELECT auth.uid()), institution_id)
       OR public.can_manage_security((SELECT auth.uid()), institution_id));

DROP POLICY IF EXISTS "duty_settings_manage" ON public.student_duty_settings;
CREATE POLICY "duty_settings_manage" ON public.student_duty_settings
FOR ALL TO authenticated
USING (public.can_manage_security((SELECT auth.uid()), institution_id))
WITH CHECK (public.can_manage_security((SELECT auth.uid()), institution_id));

DROP POLICY IF EXISTS "duty_exempt_read" ON public.student_duty_exemptions;
CREATE POLICY "duty_exempt_read" ON public.student_duty_exemptions
FOR SELECT TO authenticated
USING (public.can_view_student_duty((SELECT auth.uid()), institution_id)
       OR public.can_manage_security((SELECT auth.uid()), institution_id));

DROP POLICY IF EXISTS "duty_exempt_manage" ON public.student_duty_exemptions;
CREATE POLICY "duty_exempt_manage" ON public.student_duty_exemptions
FOR ALL TO authenticated
USING (public.can_manage_security((SELECT auth.uid()), institution_id))
WITH CHECK (public.can_manage_security((SELECT auth.uid()), institution_id));

DROP POLICY IF EXISTS "duty_state_read" ON public.student_duty_generation_state;
CREATE POLICY "duty_state_read" ON public.student_duty_generation_state
FOR SELECT TO authenticated
USING (public.can_view_student_duty((SELECT auth.uid()), institution_id)
       OR public.can_manage_security((SELECT auth.uid()), institution_id));

DROP POLICY IF EXISTS "duty_state_manage" ON public.student_duty_generation_state;
CREATE POLICY "duty_state_manage" ON public.student_duty_generation_state
FOR ALL TO authenticated
USING (public.can_manage_security((SELECT auth.uid()), institution_id))
WITH CHECK (public.can_manage_security((SELECT auth.uid()), institution_id));

-- Duty assignments: retain responsible teacher/VP row-level access. ------------
DROP POLICY IF EXISTS "duty_assign_ops_read" ON public.student_duty_assignments;
CREATE POLICY "duty_assign_ops_read" ON public.student_duty_assignments
FOR SELECT TO authenticated USING (
  public.can_operate_security((SELECT auth.uid()), institution_id)
  OR public.can_view_student_duty((SELECT auth.uid()), institution_id)
  OR responsible_teacher_profile_id = public.my_profile_id((SELECT auth.uid()))
  OR responsible_vp_profile_id = public.my_profile_id((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "duty_assign_manage" ON public.student_duty_assignments;
CREATE POLICY "duty_assign_manage" ON public.student_duty_assignments
FOR ALL TO authenticated
USING (public.can_manage_security((SELECT auth.uid()), institution_id))
WITH CHECK (public.can_manage_security((SELECT auth.uid()), institution_id));
