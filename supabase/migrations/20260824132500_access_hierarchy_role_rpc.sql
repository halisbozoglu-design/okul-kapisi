-- MİMAROS tenant access hierarchy hardening.
-- Prevents a lower-level access administrator from modifying a protected higher-level member.

CREATE OR REPLACE FUNCTION public.can_manage_institution_member(
  _actor_id uuid,
  _institution_id uuid,
  _target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _actor_id = auth.uid()
    AND _target_user_id IS NOT NULL
    AND _target_user_id <> _actor_id
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles global_target
      WHERE global_target.user_id = _target_user_id
        AND global_target.role = 'super_admin'::public.app_role
    )
    AND (
      public.has_role(_actor_id, 'super_admin'::public.app_role)
      OR (
        public.has_permission(_actor_id, _institution_id, 'users', 'manage')
        AND (
          public.has_institution_role(_actor_id, _institution_id, 'kurum_yoneticisi'::public.app_role)
          OR (
            public.has_institution_role(_actor_id, _institution_id, 'okul_yoneticisi'::public.app_role)
            AND NOT EXISTS (
              SELECT 1
              FROM public.user_institution_roles protected
              WHERE protected.user_id = _target_user_id
                AND protected.institution_id = _institution_id
                AND protected.role = 'kurum_yoneticisi'::public.app_role
                AND protected.is_active
                AND (protected.expires_at IS NULL OR protected.expires_at > now())
            )
          )
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_institution_member(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_institution_member(uuid,uuid,uuid) TO authenticated;

-- Membership policies: keep self/admin SELECT, but mutations are target-aware.
DROP POLICY IF EXISTS "Authorized managers manage institution memberships" ON public.user_institutions;
DROP POLICY IF EXISTS "Access admins insert institution memberships" ON public.user_institutions;
DROP POLICY IF EXISTS "Access admins update institution memberships" ON public.user_institutions;
DROP POLICY IF EXISTS "Access admins delete institution memberships" ON public.user_institutions;

CREATE POLICY "Access admins insert institution memberships"
ON public.user_institutions FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_institution_member((SELECT auth.uid()), institution_id, user_id)
);

CREATE POLICY "Access admins update institution memberships"
ON public.user_institutions FOR UPDATE TO authenticated
USING (
  public.can_manage_institution_member((SELECT auth.uid()), institution_id, user_id)
)
WITH CHECK (
  public.can_manage_institution_member((SELECT auth.uid()), institution_id, user_id)
);

CREATE POLICY "Access admins delete institution memberships"
ON public.user_institutions FOR DELETE TO authenticated
USING (
  public.can_manage_institution_member((SELECT auth.uid()), institution_id, user_id)
);

-- Role deletion/update must respect the same role-assignment hierarchy.
DROP POLICY IF EXISTS "Authorized managers delete institution roles" ON public.user_institution_roles;
DROP POLICY IF EXISTS "Authorized managers update institution roles" ON public.user_institution_roles;
CREATE POLICY "Authorized managers delete institution roles"
ON public.user_institution_roles FOR DELETE TO authenticated
USING (
  public.can_manage_institution_member((SELECT auth.uid()), institution_id, user_id)
  AND public.can_assign_institution_role((SELECT auth.uid()), institution_id, role)
);
CREATE POLICY "Authorized managers update institution roles"
ON public.user_institution_roles FOR UPDATE TO authenticated
USING (
  public.can_manage_institution_member((SELECT auth.uid()), institution_id, user_id)
  AND public.can_assign_institution_role((SELECT auth.uid()), institution_id, role)
)
WITH CHECK (
  public.can_manage_institution_member((SELECT auth.uid()), institution_id, user_id)
  AND public.can_assign_institution_role((SELECT auth.uid()), institution_id, role)
);

-- Permission overrides cannot be used to alter a protected superior account.
DROP POLICY IF EXISTS "Permission override admins manage" ON public.user_permission_overrides;
CREATE POLICY "Permission override admins manage"
ON public.user_permission_overrides FOR ALL TO authenticated
USING (
  public.can_manage_institution_member((SELECT auth.uid()), institution_id, user_id)
)
WITH CHECK (
  public.can_manage_institution_member((SELECT auth.uid()), institution_id, user_id)
);

-- Single authoritative RPC used by the admin UI for tenant-role activation/deactivation.
CREATE OR REPLACE FUNCTION public.set_institution_user_role(
  _institution_id uuid,
  _target_user_id uuid,
  _role public.app_role,
  _active boolean,
  _expires_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '42501';
  END IF;
  IF _role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'SUPER_ADMIN_IS_GLOBAL_ONLY' USING errcode = '42501';
  END IF;
  IF NOT public.can_manage_institution_member(v_actor, _institution_id, _target_user_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_MEMBER' USING errcode = '42501';
  END IF;
  IF NOT public.can_assign_institution_role(v_actor, _institution_id, _role) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ROLE' USING errcode = '42501';
  END IF;
  IF _active AND NOT EXISTS (
    SELECT 1 FROM public.user_institutions ui
    WHERE ui.user_id = _target_user_id
      AND ui.institution_id = _institution_id
      AND ui.is_active
  ) THEN
    RAISE EXCEPTION 'TARGET_NOT_ACTIVE_MEMBER' USING errcode = '22023';
  END IF;
  IF _expires_at IS NOT NULL AND _expires_at <= now() THEN
    RAISE EXCEPTION 'ROLE_EXPIRY_MUST_BE_FUTURE' USING errcode = '22023';
  END IF;

  INSERT INTO public.user_institution_roles(
    user_id, institution_id, role, is_active, granted_by, granted_at, expires_at
  ) VALUES (
    _target_user_id, _institution_id, _role, _active, v_actor, now(),
    CASE WHEN _active THEN _expires_at ELSE NULL END
  )
  ON CONFLICT(user_id, institution_id, role) DO UPDATE
    SET is_active = EXCLUDED.is_active,
        granted_by = v_actor,
        granted_at = now(),
        expires_at = CASE WHEN EXCLUDED.is_active THEN EXCLUDED.expires_at ELSE NULL END,
        updated_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_institution_user_role(uuid,uuid,public.app_role,boolean,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_institution_user_role(uuid,uuid,public.app_role,boolean,timestamptz) TO authenticated;
