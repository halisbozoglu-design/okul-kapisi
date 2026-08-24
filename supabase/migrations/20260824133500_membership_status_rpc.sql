-- MİMAROS tenant membership status mutation RPC.
-- Keeps membership activation/deactivation behind the same target-aware hierarchy
-- used by role/permission administration. No production rows are deleted.

CREATE OR REPLACE FUNCTION public.set_institution_membership_active(
  _institution_id uuid,
  _target_user_id uuid,
  _active boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_make_default boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '42501';
  END IF;

  IF NOT public.can_manage_institution_member(v_actor, _institution_id, _target_user_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_MEMBER' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_institutions ui
    WHERE ui.user_id = _target_user_id
      AND ui.institution_id = _institution_id
  ) THEN
    RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND' USING errcode = 'P0002';
  END IF;

  IF _active THEN
    SELECT NOT EXISTS (
      SELECT 1
      FROM public.user_institutions other
      WHERE other.user_id = _target_user_id
        AND other.is_active
        AND other.is_default
        AND other.institution_id <> _institution_id
    ) INTO v_make_default;
  END IF;

  UPDATE public.user_institutions ui
  SET is_active = _active,
      is_default = CASE
        WHEN NOT _active THEN false
        WHEN v_make_default THEN true
        ELSE ui.is_default
      END,
      updated_at = now()
  WHERE ui.user_id = _target_user_id
    AND ui.institution_id = _institution_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_institution_membership_active(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_institution_membership_active(uuid,uuid,boolean) TO authenticated;
