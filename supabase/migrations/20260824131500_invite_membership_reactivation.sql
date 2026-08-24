-- Reactivate an existing inactive membership/role when a fresh invitation is accepted.
CREATE OR REPLACE FUNCTION public.accept_institution_invite(_invite_token text)
RETURNS TABLE(institution_id uuid, assigned_role public.app_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_user_email text;
  v_hash text;
  v_inv public.institution_invitations%rowtype;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '42501';
  END IF;
  IF _invite_token IS NULL OR length(_invite_token) < 32 THEN
    RAISE EXCEPTION 'INVALID_INVITE' USING errcode = '22023';
  END IF;

  SELECT lower(email) INTO v_user_email FROM auth.users WHERE id = v_user;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'VERIFIED_EMAIL_REQUIRED' USING errcode = '42501';
  END IF;

  v_hash := encode(extensions.digest(_invite_token, 'sha256'), 'hex');
  SELECT * INTO v_inv
  FROM public.institution_invitations
  WHERE token_hash = v_hash
  FOR UPDATE;

  IF v_inv.id IS NULL
     OR v_inv.accepted_at IS NOT NULL
     OR v_inv.cancelled_at IS NOT NULL
     OR v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'INVITE_NOT_ACTIVE' USING errcode = '22023';
  END IF;
  IF lower(v_inv.email) <> v_user_email THEN
    RAISE EXCEPTION 'INVITE_EMAIL_MISMATCH' USING errcode = '42501';
  END IF;

  INSERT INTO public.user_institutions(user_id, institution_id, is_active, joined_at, updated_at)
  VALUES(v_user, v_inv.institution_id, true, now(), now())
  ON CONFLICT(user_id, institution_id) DO UPDATE
    SET is_active = true, updated_at = now();

  INSERT INTO public.user_institution_roles(
    user_id, institution_id, role, is_active, granted_by, granted_at, expires_at
  ) VALUES(
    v_user, v_inv.institution_id, v_inv.role, true, v_inv.invited_by, now(), NULL
  )
  ON CONFLICT(user_id, institution_id, role) DO UPDATE
    SET is_active = true,
        granted_by = EXCLUDED.granted_by,
        granted_at = now(),
        expires_at = NULL,
        updated_at = now();

  UPDATE public.institution_invitations
  SET accepted_at = now(), accepted_by = v_user, updated_at = now()
  WHERE id = v_inv.id;

  RETURN QUERY SELECT v_inv.institution_id, v_inv.role;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_institution_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_institution_invite(text) TO authenticated;
