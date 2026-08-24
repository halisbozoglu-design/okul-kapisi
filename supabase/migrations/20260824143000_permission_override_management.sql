-- Secure tenant permission override administration.
-- Additive/compatible hardening: all permission changes must go through a guarded RPC.

CREATE OR REPLACE FUNCTION public.can_administer_access(
  _user_id uuid,
  _institution_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id = auth.uid()
    AND (
      public.has_role(_user_id, 'super_admin'::public.app_role)
      OR (
        public.has_permission(_user_id, _institution_id, 'users', 'manage')
        AND (
          public.has_institution_role(_user_id, _institution_id, 'kurum_yoneticisi'::public.app_role)
          OR public.has_institution_role(_user_id, _institution_id, 'okul_yoneticisi'::public.app_role)
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.set_user_permission_override(
  _institution_id uuid,
  _target_user_id uuid,
  _resource text,
  _action text,
  _allowed boolean,
  _reason text DEFAULT NULL,
  _expires_at timestamptz DEFAULT NULL
)
RETURNS public.user_permission_overrides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _row public.user_permission_overrides;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_institution_member(_actor_id, _institution_id, _target_user_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_MEMBER' USING ERRCODE = '42501';
  END IF;

  IF _resource IS NULL OR btrim(_resource) = '' OR _action IS NULL OR btrim(_action) = '' THEN
    RAISE EXCEPTION 'INVALID_PERMISSION';
  END IF;

  -- Only permissions that are part of the system's role permission catalogue
  -- can be delegated/denied. This prevents arbitrary future permission names
  -- from being smuggled into the override table.
  IF NOT EXISTS (
    SELECT 1
    FROM public.permissions p
    WHERE p.resource = btrim(_resource)
      AND p.action = btrim(_action)
  ) THEN
    RAISE EXCEPTION 'UNKNOWN_PERMISSION';
  END IF;

  -- A tenant admin cannot delegate a capability they do not themselves hold.
  -- Global super admin remains the only cross-tenant exception.
  IF NOT public.has_role(_actor_id, 'super_admin'::public.app_role)
     AND NOT public.has_permission(_actor_id, _institution_id, btrim(_resource), btrim(_action)) THEN
    RAISE EXCEPTION 'CANNOT_DELEGATE_PERMISSION' USING ERRCODE = '42501';
  END IF;

  IF _expires_at IS NOT NULL AND _expires_at <= now() THEN
    RAISE EXCEPTION 'PERMISSION_EXPIRY_MUST_BE_FUTURE';
  END IF;

  INSERT INTO public.user_permission_overrides (
    user_id,
    institution_id,
    resource,
    action,
    allowed,
    reason,
    granted_by,
    expires_at,
    updated_at
  )
  VALUES (
    _target_user_id,
    _institution_id,
    btrim(_resource),
    btrim(_action),
    _allowed,
    NULLIF(btrim(COALESCE(_reason, '')), ''),
    _actor_id,
    _expires_at,
    now()
  )
  ON CONFLICT (user_id, institution_id, resource, action)
  DO UPDATE SET
    allowed = EXCLUDED.allowed,
    reason = EXCLUDED.reason,
    granted_by = EXCLUDED.granted_by,
    expires_at = EXCLUDED.expires_at,
    updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_user_permission_override(
  _institution_id uuid,
  _target_user_id uuid,
  _resource text,
  _action text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _deleted integer;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_institution_member(_actor_id, _institution_id, _target_user_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_MEMBER' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_permission_overrides o
  WHERE o.user_id = _target_user_id
    AND o.institution_id = _institution_id
    AND o.resource = btrim(_resource)
    AND o.action = btrim(_action);

  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted > 0;
END;
$$;

-- Reads stay available to the target user and access administrators, but all
-- direct writes are disabled; SECURITY DEFINER RPCs above are the write API.
DROP POLICY IF EXISTS "Permission override admins manage" ON public.user_permission_overrides;

REVOKE INSERT, UPDATE, DELETE ON public.user_permission_overrides FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_user_permission_override(uuid, uuid, text, text, boolean, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_user_permission_override(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_permission_override(uuid, uuid, text, text, boolean, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_user_permission_override(uuid, uuid, text, text) TO authenticated;
