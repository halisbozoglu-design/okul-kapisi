-- MİMAROS tenant authorization core (additive, backwards compatible)
-- Keeps legacy public.user_roles for compatibility while making institution-scoped
-- assignments the authoritative source for tenant access.

ALTER TABLE public.user_institutions
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_institutions_one_default
  ON public.user_institutions(user_id)
  WHERE is_default AND is_active;
CREATE INDEX IF NOT EXISTS ix_user_institutions_institution_user
  ON public.user_institutions(institution_id, user_id)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.institution_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS ix_institution_user_roles_lookup
  ON public.institution_user_roles(institution_id, user_id, role)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource text NOT NULL CHECK (length(trim(resource)) > 0),
  action text NOT NULL CHECK (length(trim(action)) > 0),
  allowed boolean NOT NULL,
  reason text,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, user_id, resource, action)
);

CREATE INDEX IF NOT EXISTS ix_user_permission_overrides_lookup
  ON public.user_permission_overrides(institution_id, user_id, resource, action);

ALTER TABLE public.institution_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- Explicit Data API grants (required for new Supabase projects/defaults from 2026).
GRANT SELECT ON public.institution_user_roles TO authenticated;
GRANT SELECT ON public.user_permission_overrides TO authenticated;
GRANT SELECT ON public.user_institutions TO authenticated;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = 'super_admin'::public.app_role
  );
$$;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_institution_member(_user_id uuid, _institution_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_institutions ui
    WHERE ui.user_id = _user_id
      AND ui.institution_id = _institution_id
      AND ui.is_active
  );
$$;
REVOKE ALL ON FUNCTION public.is_institution_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_institution_member(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_institution_role(_user_id uuid, _institution_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.institution_user_roles iur
    WHERE iur.user_id = _user_id
      AND iur.institution_id = _institution_id
      AND iur.role = _role
      AND iur.is_active
      AND (iur.expires_at IS NULL OR iur.expires_at > now())
  );
$$;
REVOKE ALL ON FUNCTION public.has_institution_role(uuid, uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_institution_role(uuid, uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_institution(_user_id uuid, _institution_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
    OR public.has_institution_role(_user_id, _institution_id, 'kurum_yoneticisi'::public.app_role)
    OR public.has_institution_role(_user_id, _institution_id, 'okul_yoneticisi'::public.app_role);
$$;
REVOKE ALL ON FUNCTION public.can_manage_institution(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_institution(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id uuid,
  _institution_id uuid,
  _resource text,
  _action text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_super_admin(_user_id) THEN true
    WHEN NOT public.is_institution_member(_user_id, _institution_id) THEN false
    WHEN EXISTS (
      SELECT 1 FROM public.user_permission_overrides o
      WHERE o.user_id = _user_id AND o.institution_id = _institution_id
        AND o.resource = _resource AND o.action = _action AND o.allowed = false
    ) THEN false
    WHEN EXISTS (
      SELECT 1 FROM public.user_permission_overrides o
      WHERE o.user_id = _user_id AND o.institution_id = _institution_id
        AND o.resource = _resource AND o.action = _action AND o.allowed = true
    ) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.institution_user_roles iur
      JOIN public.permissions p ON p.role = iur.role
      WHERE iur.user_id = _user_id
        AND iur.institution_id = _institution_id
        AND iur.is_active
        AND (iur.expires_at IS NULL OR iur.expires_at > now())
        AND p.resource = _resource
        AND p.action = _action
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.has_permission(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_access_context(_institution_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_institution_id uuid := _institution_id;
  v_roles jsonb;
  v_permissions jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  IF v_institution_id IS NULL THEN
    SELECT ui.institution_id INTO v_institution_id
    FROM public.user_institutions ui
    WHERE ui.user_id = v_uid AND ui.is_active
    ORDER BY ui.is_default DESC, ui.created_at ASC
    LIMIT 1;
  END IF;

  IF v_institution_id IS NOT NULL AND NOT public.is_institution_member(v_uid, v_institution_id) THEN
    RAISE EXCEPTION 'institution access denied';
  END IF;

  SELECT coalesce(jsonb_agg(DISTINCT iur.role::text), '[]'::jsonb)
    INTO v_roles
  FROM public.institution_user_roles iur
  WHERE iur.user_id = v_uid
    AND iur.institution_id = v_institution_id
    AND iur.is_active
    AND (iur.expires_at IS NULL OR iur.expires_at > now());

  IF public.is_super_admin(v_uid) THEN
    v_roles := coalesce(v_roles, '[]'::jsonb) || '["super_admin"]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('resource', x.resource, 'action', x.action)), '[]'::jsonb)
    INTO v_permissions
  FROM (
    SELECT DISTINCT p.resource, p.action
    FROM public.permissions p
    JOIN public.institution_user_roles iur ON iur.role = p.role
    WHERE iur.user_id = v_uid AND iur.institution_id = v_institution_id
      AND iur.is_active AND (iur.expires_at IS NULL OR iur.expires_at > now())
      AND NOT EXISTS (
        SELECT 1 FROM public.user_permission_overrides o
        WHERE o.user_id = v_uid AND o.institution_id = v_institution_id
          AND o.resource = p.resource AND o.action = p.action AND o.allowed = false
      )
    UNION
    SELECT o.resource, o.action
    FROM public.user_permission_overrides o
    WHERE o.user_id = v_uid AND o.institution_id = v_institution_id AND o.allowed
  ) x;

  RETURN jsonb_build_object(
    'institution_id', v_institution_id,
    'is_super_admin', public.is_super_admin(v_uid),
    'roles', coalesce(v_roles, '[]'::jsonb),
    'permissions', coalesce(v_permissions, '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_access_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_access_context(uuid) TO authenticated;

-- RLS for new authorization tables.
DROP POLICY IF EXISTS "Users read own institution roles" ON public.institution_user_roles;
CREATE POLICY "Users read own institution roles"
ON public.institution_user_roles FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR public.can_manage_institution((SELECT auth.uid()), institution_id));

DROP POLICY IF EXISTS "Managers manage institution roles" ON public.institution_user_roles;
CREATE POLICY "Managers manage institution roles"
ON public.institution_user_roles FOR ALL TO authenticated
USING (public.can_manage_institution((SELECT auth.uid()), institution_id))
WITH CHECK (public.can_manage_institution((SELECT auth.uid()), institution_id));

DROP POLICY IF EXISTS "Users read own permission overrides" ON public.user_permission_overrides;
CREATE POLICY "Users read own permission overrides"
ON public.user_permission_overrides FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR public.can_manage_institution((SELECT auth.uid()), institution_id));

DROP POLICY IF EXISTS "Managers manage permission overrides" ON public.user_permission_overrides;
CREATE POLICY "Managers manage permission overrides"
ON public.user_permission_overrides FOR ALL TO authenticated
USING (public.can_manage_institution((SELECT auth.uid()), institution_id))
WITH CHECK (public.can_manage_institution((SELECT auth.uid()), institution_id));

-- Tighten tenant visibility from the original permissive policies.
DROP POLICY IF EXISTS "Authenticated users can view institutions" ON public.institutions;
DROP POLICY IF EXISTS "Authenticated can view campuses" ON public.campuses;
DROP POLICY IF EXISTS "Authenticated can view academic_years" ON public.academic_years;
DROP POLICY IF EXISTS "Authenticated can view grade_levels" ON public.grade_levels;
DROP POLICY IF EXISTS "Authenticated can view branches" ON public.branches;

CREATE POLICY "Members view institutions"
ON public.institutions FOR SELECT TO authenticated
USING (public.is_institution_member((SELECT auth.uid()), id));
CREATE POLICY "Members view campuses"
ON public.campuses FOR SELECT TO authenticated
USING (public.is_institution_member((SELECT auth.uid()), institution_id));
CREATE POLICY "Members view academic_years"
ON public.academic_years FOR SELECT TO authenticated
USING (public.is_institution_member((SELECT auth.uid()), institution_id));
CREATE POLICY "Members view grade_levels"
ON public.grade_levels FOR SELECT TO authenticated
USING (public.is_institution_member((SELECT auth.uid()), institution_id));
CREATE POLICY "Members view branches"
ON public.branches FOR SELECT TO authenticated
USING (public.is_institution_member((SELECT auth.uid()), institution_id));

-- Backfill institution-scoped roles from legacy global roles only for users with exactly one active institution.
INSERT INTO public.institution_user_roles (institution_id, user_id, role, granted_by)
SELECT ui.institution_id, ur.user_id, ur.role, NULL
FROM public.user_roles ur
JOIN public.user_institutions ui ON ui.user_id = ur.user_id AND ui.is_active
WHERE ur.role <> 'super_admin'::public.app_role
  AND 1 = (SELECT count(*) FROM public.user_institutions ux WHERE ux.user_id = ur.user_id AND ux.is_active)
ON CONFLICT (institution_id, user_id, role) DO NOTHING;

DROP TRIGGER IF EXISTS update_institution_user_roles_updated_at ON public.institution_user_roles;
CREATE TRIGGER update_institution_user_roles_updated_at
BEFORE UPDATE ON public.institution_user_roles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_user_permission_overrides_updated_at ON public.user_permission_overrides;
CREATE TRIGGER update_user_permission_overrides_updated_at
BEFORE UPDATE ON public.user_permission_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_user_institutions_updated_at ON public.user_institutions;
CREATE TRIGGER update_user_institutions_updated_at
BEFORE UPDATE ON public.user_institutions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
