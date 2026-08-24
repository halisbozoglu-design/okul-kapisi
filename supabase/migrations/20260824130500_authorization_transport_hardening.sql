-- MİMAROS authorization + transport hardening, aligned with the live schema.
-- Additive, data-preserving, tenant-scoped.

-- Membership lifecycle ---------------------------------------------------------
ALTER TABLE public.user_institutions
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.user_institution_roles
  ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS granted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_default_institution
  ON public.user_institutions(user_id) WHERE is_default AND is_active;
CREATE INDEX IF NOT EXISTS ix_user_institutions_active
  ON public.user_institutions(user_id, institution_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS ix_user_institution_roles_active
  ON public.user_institution_roles(user_id, institution_id, role)
  WHERE is_active;

-- Per-user permission exceptions ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  resource text NOT NULL,
  action text NOT NULL,
  allowed boolean NOT NULL,
  reason text,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, institution_id, resource, action)
);
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ix_permission_overrides_lookup
  ON public.user_permission_overrides(user_id, institution_id, resource, action);

-- Canonical authorization helpers ---------------------------------------------
CREATE OR REPLACE FUNCTION public.is_institution_member(_user_id uuid, _institution_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND (
    public.has_role(_user_id, 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_institutions ui
      WHERE ui.user_id = _user_id
        AND ui.institution_id = _institution_id
        AND ui.is_active
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_institution_role(
  _user_id uuid, _institution_id uuid, _role public.app_role
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND (
    public.has_role(_user_id, 'super_admin'::public.app_role)
    OR (
      EXISTS (
        SELECT 1 FROM public.user_institutions ui
        WHERE ui.user_id = _user_id AND ui.institution_id = _institution_id AND ui.is_active
      )
      AND EXISTS (
        SELECT 1 FROM public.user_institution_roles uir
        WHERE uir.user_id = _user_id
          AND uir.institution_id = _institution_id
          AND uir.role = _role
          AND uir.is_active
          AND (uir.expires_at IS NULL OR uir.expires_at > now())
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id uuid, _institution_id uuid, _resource text, _action text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND (
    public.has_role(_user_id, 'super_admin'::public.app_role)
    OR (
      EXISTS (
        SELECT 1 FROM public.user_institutions ui
        WHERE ui.user_id = _user_id AND ui.institution_id = _institution_id AND ui.is_active
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_permission_overrides o
        WHERE o.user_id = _user_id AND o.institution_id = _institution_id
          AND o.resource = _resource AND (o.action = _action OR o.action = '*')
          AND o.allowed = false AND (o.expires_at IS NULL OR o.expires_at > now())
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.user_permission_overrides o
          WHERE o.user_id = _user_id AND o.institution_id = _institution_id
            AND o.resource = _resource AND (o.action = _action OR o.action = '*')
            AND o.allowed = true AND (o.expires_at IS NULL OR o.expires_at > now())
        )
        OR EXISTS (
          SELECT 1
          FROM public.user_institution_roles uir
          JOIN public.permissions p ON p.role = uir.role
          WHERE uir.user_id = _user_id
            AND uir.institution_id = _institution_id
            AND uir.is_active
            AND (uir.expires_at IS NULL OR uir.expires_at > now())
            AND p.resource = _resource
            AND (p.action = _action OR p.action = '*')
        )
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_administer_access(_user_id uuid, _institution_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND (
    public.has_role(_user_id, 'super_admin'::public.app_role)
    OR public.has_permission(_user_id, _institution_id, 'users', 'manage')
  );
$$;

-- Frontend-focused, single-tenant context. Existing no-arg RPC is retained for
-- backwards compatibility; this overload is what the current web/mobile app uses.
CREATE OR REPLACE FUNCTION public.get_my_access_context(_institution_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inst uuid := _institution_id;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  IF v_inst IS NULL THEN
    SELECT ui.institution_id INTO v_inst
    FROM public.user_institutions ui
    WHERE ui.user_id = v_user AND ui.is_active
    ORDER BY ui.is_default DESC, ui.created_at
    LIMIT 1;
  END IF;

  IF v_inst IS NOT NULL AND NOT public.is_institution_member(v_user, v_inst) THEN
    RAISE EXCEPTION 'institution access denied';
  END IF;

  RETURN jsonb_build_object(
    'institution_id', v_inst,
    'is_super_admin', public.has_role(v_user, 'super_admin'::public.app_role),
    'roles', COALESCE((
      SELECT jsonb_agg(x.role ORDER BY x.role::text)
      FROM (
        SELECT DISTINCT uir.role
        FROM public.user_institution_roles uir
        WHERE uir.user_id = v_user AND uir.institution_id = v_inst
          AND uir.is_active AND (uir.expires_at IS NULL OR uir.expires_at > now())
      ) x
    ), '[]'::jsonb),
    'permissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('resource', q.resource, 'action', q.action)
                       ORDER BY q.resource, q.action)
      FROM (
        SELECT DISTINCT p.resource, p.action
        FROM public.user_institution_roles uir
        JOIN public.permissions p ON p.role = uir.role
        WHERE uir.user_id = v_user AND uir.institution_id = v_inst
          AND uir.is_active AND (uir.expires_at IS NULL OR uir.expires_at > now())
          AND NOT EXISTS (
            SELECT 1 FROM public.user_permission_overrides d
            WHERE d.user_id=v_user AND d.institution_id=v_inst
              AND d.resource=p.resource AND (d.action=p.action OR d.action='*')
              AND d.allowed=false AND (d.expires_at IS NULL OR d.expires_at > now())
          )
        UNION
        SELECT o.resource, o.action
        FROM public.user_permission_overrides o
        WHERE o.user_id=v_user AND o.institution_id=v_inst AND o.allowed=true
          AND (o.expires_at IS NULL OR o.expires_at > now())
      ) q
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_access_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_access_context(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.can_administer_access(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_administer_access(uuid,uuid) TO authenticated;

-- Permission matrix additions --------------------------------------------------
INSERT INTO public.permissions(role, resource, action) VALUES
  ('kurum_yoneticisi','transport','view'),
  ('kurum_yoneticisi','transport','live_track'),
  ('okul_yoneticisi','transport','view'),
  ('okul_yoneticisi','transport','live_track'),
  ('mudur_yardimcisi','transport','view'),
  ('mudur_yardimcisi','transport','live_track'),
  ('veli','transport.parent','view'),
  ('kurum_yoneticisi','audit','view'),
  ('okul_yoneticisi','audit','view')
ON CONFLICT(role,resource,action) DO NOTHING;

-- Access RLS -------------------------------------------------------------------
DROP POLICY IF EXISTS "Permission override self/admin read" ON public.user_permission_overrides;
CREATE POLICY "Permission override self/admin read" ON public.user_permission_overrides
FOR SELECT TO authenticated USING (
  user_id = (SELECT auth.uid())
  OR public.can_administer_access((SELECT auth.uid()), institution_id)
);
DROP POLICY IF EXISTS "Permission override admins manage" ON public.user_permission_overrides;
CREATE POLICY "Permission override admins manage" ON public.user_permission_overrides
FOR ALL TO authenticated USING (
  public.can_administer_access((SELECT auth.uid()), institution_id)
) WITH CHECK (
  public.can_administer_access((SELECT auth.uid()), institution_id)
  AND user_id <> (SELECT auth.uid())
);

-- Remove legacy cross-tenant profile visibility.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Tenant access admins view member profiles" ON public.profiles;
CREATE POLICY "Tenant access admins view member profiles" ON public.profiles
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.user_institutions ui
    WHERE ui.user_id = profiles.user_id AND ui.is_active
      AND public.can_administer_access((SELECT auth.uid()), ui.institution_id)
  )
);

-- Transport tenant integrity ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_transport_tenant_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_inst uuid;
BEGIN
  IF TG_TABLE_NAME = 'location_pings' THEN
    SELECT institution_id INTO v_inst FROM public.transport_trips WHERE id=NEW.trip_id;
    IF v_inst IS NULL OR v_inst <> NEW.institution_id THEN RAISE EXCEPTION 'tenant mismatch: location_pings.trip_id'; END IF;
  ELSIF TG_TABLE_NAME = 'transport_events' THEN
    SELECT institution_id INTO v_inst FROM public.transport_trips WHERE id=NEW.trip_id;
    IF v_inst IS NULL OR v_inst <> NEW.institution_id THEN RAISE EXCEPTION 'tenant mismatch: transport_events.trip_id'; END IF;
    IF NEW.student_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id=NEW.student_id AND s.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: transport_events.student_id'; END IF;
    IF NEW.stop_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.route_stops s WHERE s.id=NEW.stop_id AND s.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: transport_events.stop_id'; END IF;
  ELSIF TG_TABLE_NAME = 'student_transport_assignments' THEN
    IF NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id=NEW.student_id AND s.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: assignment.student_id'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.routes r WHERE r.id=NEW.route_id AND r.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: assignment.route_id'; END IF;
    IF NEW.stop_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.route_stops s WHERE s.id=NEW.stop_id AND s.route_id=NEW.route_id AND s.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: assignment.stop_id'; END IF;
  ELSIF TG_TABLE_NAME = 'route_stops' THEN
    IF NOT EXISTS (SELECT 1 FROM public.routes r WHERE r.id=NEW.route_id AND r.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: route_stop.route_id'; END IF;
  ELSIF TG_TABLE_NAME = 'routes' THEN
    IF NEW.vehicle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id=NEW.vehicle_id AND v.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: route.vehicle_id'; END IF;
    IF NEW.driver_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.transport_staff s WHERE s.id=NEW.driver_staff_id AND s.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: route.driver_staff_id'; END IF;
    IF NEW.attendant_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.transport_staff s WHERE s.id=NEW.attendant_staff_id AND s.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: route.attendant_staff_id'; END IF;
  ELSIF TG_TABLE_NAME = 'transport_trips' THEN
    IF NOT EXISTS (SELECT 1 FROM public.routes r WHERE r.id=NEW.route_id AND r.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: trip.route_id'; END IF;
    IF NEW.vehicle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id=NEW.vehicle_id AND v.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: trip.vehicle_id'; END IF;
    IF NEW.driver_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.transport_staff s WHERE s.id=NEW.driver_staff_id AND s.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: trip.driver_staff_id'; END IF;
    IF NEW.attendant_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.transport_staff s WHERE s.id=NEW.attendant_staff_id AND s.institution_id=NEW.institution_id) THEN RAISE EXCEPTION 'tenant mismatch: trip.attendant_staff_id'; END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.tg_transport_tenant_integrity() FROM PUBLIC,anon,authenticated;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['location_pings','transport_events','student_transport_assignments','route_stops','routes','transport_trips'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I','trg_tenant_integrity_'||t,t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_transport_tenant_integrity()','trg_tenant_integrity_'||t,t);
  END LOOP;
END $$;

-- Ping/event policies bind row institution to the referenced active trip.
DROP POLICY IF EXISTS pings_staff_insert ON public.location_pings;
CREATE POLICY pings_staff_insert ON public.location_pings FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.transport_trips t WHERE t.id=trip_id
    AND t.institution_id=location_pings.institution_id AND t.status='active' AND t.deleted_at IS NULL
    AND public.is_transport_staff_of_trip((SELECT auth.uid()),t.id))
  AND (device_id IS NULL OR EXISTS (SELECT 1 FROM public.mobile_device_registrations d
      WHERE d.id=device_id AND d.user_id=(SELECT auth.uid()) AND d.revoked_at IS NULL))
);

DROP POLICY IF EXISTS events_staff_insert ON public.transport_events;
CREATE POLICY events_staff_insert ON public.transport_events FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.transport_trips t WHERE t.id=trip_id
    AND t.institution_id=transport_events.institution_id AND t.deleted_at IS NULL
    AND (public.is_transport_staff_of_trip((SELECT auth.uid()),t.id)
      OR public.can_manage_transport((SELECT auth.uid()),t.institution_id)))
);

-- Guardian may only cancel an absence they created for their own child and tenant.
DROP POLICY IF EXISTS "Guardians cancel own child absences" ON public.transport_absences;
CREATE POLICY "Guardians cancel own child absences" ON public.transport_absences
FOR UPDATE TO authenticated
USING (created_by=(SELECT auth.uid()) AND public.is_guardian_of_student((SELECT auth.uid()),student_id))
WITH CHECK (
  created_by=(SELECT auth.uid())
  AND public.is_guardian_of_student((SELECT auth.uid()),student_id)
  AND institution_id=(SELECT s.institution_id FROM public.students s WHERE s.id=student_id)
);

-- Transport audit reuses the live audit_logs(table_name, record_id) contract.
CREATE OR REPLACE FUNCTION public.audit_transport_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n jsonb; o jsonb; inst uuid; rec uuid;
BEGIN
  n := CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  o := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  inst := nullif(coalesce(n->>'institution_id',o->>'institution_id'),'')::uuid;
  rec := nullif(coalesce(n->>'id',o->>'id'),'')::uuid;
  IF TG_TABLE_NAME='location_pings' THEN
    n := n - 'lat' - 'lng' - 'accuracy' - 'speed' - 'heading';
    o := o - 'lat' - 'lng' - 'accuracy' - 'speed' - 'heading';
  ELSIF TG_TABLE_NAME='students' THEN
    n := n - 'national_id' - 'guardian_phone';
    o := o - 'national_id' - 'guardian_phone';
  END IF;
  INSERT INTO public.audit_logs(institution_id,actor_user_id,table_name,record_id,action,old_data,new_data)
  VALUES(inst,auth.uid(),TG_TABLE_NAME,rec,TG_OP,o,n);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.audit_transport_change() FROM PUBLIC,anon,authenticated;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['vehicles','transport_staff','routes','route_stops','students','student_transport_assignments','transport_trips','transport_events','location_pings','transport_settings','transport_absences','student_guardians','user_permission_overrides'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I','trg_audit_transport_'||t,t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_transport_change()','trg_audit_transport_'||t,t);
  END LOOP;
END $$;

-- Audit visibility becomes explicit rather than piggybacking institution.manage.
DROP POLICY IF EXISTS "Audit logs readable by authorized managers" ON public.audit_logs;
CREATE POLICY "Audit logs readable by authorized managers" ON public.audit_logs
FOR SELECT TO authenticated USING (
  public.has_role((SELECT auth.uid()),'super_admin'::public.app_role)
  OR (institution_id IS NOT NULL AND public.has_permission((SELECT auth.uid()),institution_id,'audit','view'))
);

-- 2026 Data API explicit grants. RLS remains authoritative.
GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_permission_overrides TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
