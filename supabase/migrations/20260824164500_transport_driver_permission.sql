-- MİMAROS Transport driver UX authorization.
-- Additive and backwards-compatible: DB trip/staff RLS remains authoritative.

INSERT INTO public.permissions(role, resource, action) VALUES
  ('kurum_yoneticisi', 'transport.driver', 'operate'),
  ('okul_yoneticisi', 'transport.driver', 'operate'),
  ('mudur_yardimcisi', 'transport.driver', 'operate'),
  ('personel', 'transport.driver', 'operate')
ON CONFLICT(role, resource, action) DO NOTHING;

-- Canonical server-side helper for operations that should require both the
-- tenant permission and an actual transport staff assignment. Transport
-- managers keep operational access for support/oversight.
CREATE OR REPLACE FUNCTION public.can_operate_transport_driver(
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
     AND public.has_permission(_user_id, _institution_id, 'transport.driver', 'operate')
     AND (
       public.has_permission(_user_id, _institution_id, 'transport', 'manage')
       OR EXISTS (
         SELECT 1
         FROM public.transport_staff ts
         WHERE ts.user_id = _user_id
           AND ts.institution_id = _institution_id
           AND ts.deleted_at IS NULL
           AND COALESCE(ts.is_active, true)
       )
     );
$$;

REVOKE ALL ON FUNCTION public.can_operate_transport_driver(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_operate_transport_driver(uuid, uuid) TO authenticated;
