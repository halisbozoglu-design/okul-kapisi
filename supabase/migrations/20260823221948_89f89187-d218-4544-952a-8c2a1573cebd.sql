-- ============ helpers ============
CREATE OR REPLACE FUNCTION public.my_profile_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = _user_id AND deleted_at IS NULL LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_operate_security(_user_id uuid, _institution_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_institution(_user_id, _institution_id)
    OR EXISTS (
      SELECT 1 FROM public.user_institutions ui
      WHERE ui.user_id = _user_id AND ui.institution_id = _institution_id
        AND public.has_role(_user_id, 'personel')
    );
$$;

-- ============ A. security_locations ============
CREATE TABLE public.security_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  campus_id uuid REFERENCES public.campuses(id),
  name text NOT NULL,
  code text,
  kind text NOT NULL DEFAULT 'both' CHECK (kind IN ('entrance','exit','both','duty_area')),
  visitor_entry_enabled boolean NOT NULL DEFAULT true,
  student_duty_enabled boolean NOT NULL DEFAULT false,
  gender_rule text NOT NULL DEFAULT 'any' CHECK (gender_rule IN ('any','male','female')),
  capacity integer,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX security_locations_inst_name_active_uq
  ON public.security_locations (institution_id, lower(name)) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_locations TO authenticated;
GRANT ALL ON public.security_locations TO service_role;
ALTER TABLE public.security_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sec_loc_read" ON public.security_locations FOR SELECT TO authenticated
  USING (public.can_operate_security(auth.uid(), institution_id)
    OR EXISTS (SELECT 1 FROM public.user_institutions ui WHERE ui.user_id = auth.uid() AND ui.institution_id = security_locations.institution_id));
CREATE POLICY "sec_loc_manage" ON public.security_locations FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE TRIGGER trg_sec_loc_updated BEFORE UPDATE ON public.security_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ B. visitor_people ============
CREATE TABLE public.visitor_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  tc_hash text,
  tc_last4 text,
  full_name text NOT NULL,
  phone text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','guardian','existing')),
  guardian_id uuid REFERENCES public.student_guardians(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX visitor_people_inst_tchash_uq ON public.visitor_people (institution_id, tc_hash) WHERE tc_hash IS NOT NULL;
CREATE INDEX visitor_people_phone_idx ON public.visitor_people (institution_id, phone);
GRANT SELECT, INSERT, UPDATE ON public.visitor_people TO authenticated;
GRANT ALL ON public.visitor_people TO service_role;
ALTER TABLE public.visitor_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visitor_people_ops" ON public.visitor_people FOR ALL TO authenticated
  USING (public.can_operate_security(auth.uid(), institution_id))
  WITH CHECK (public.can_operate_security(auth.uid(), institution_id));
CREATE TRIGGER trg_visitor_people_updated BEFORE UPDATE ON public.visitor_people
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ C. visitor_visits ============
CREATE TABLE public.visitor_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  visitor_person_id uuid NOT NULL REFERENCES public.visitor_people(id),
  entry_location_id uuid REFERENCES public.security_locations(id),
  exit_location_id uuid REFERENCES public.security_locations(id),
  related_student_id uuid REFERENCES public.students(id),
  person_to_meet_profile_id uuid REFERENCES public.profiles(id),
  person_to_meet_text text,
  visit_reason text,
  visitor_card_no text,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','inside','exited','cancelled','rejected')),
  entry_at timestamptz NOT NULL DEFAULT now(),
  exit_at timestamptz,
  entered_by_profile_id uuid REFERENCES public.profiles(id),
  exited_by_profile_id uuid REFERENCES public.profiles(id),
  physical_id_seen boolean NOT NULL DEFAULT false,
  identity_method text CHECK (identity_method IN ('camera_live','nfc','manual')),
  identity_verified_at timestamptz,
  identity_verified_by_profile_id uuid REFERENCES public.profiles(id),
  phone_used text,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visitor_visits_inside_requires_id CHECK (
    status <> 'inside' OR (physical_id_seen = true AND entered_by_profile_id IS NOT NULL)
  )
);
CREATE INDEX visitor_visits_status_idx ON public.visitor_visits (institution_id, status, entry_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.visitor_visits TO authenticated;
GRANT ALL ON public.visitor_visits TO service_role;
ALTER TABLE public.visitor_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visitor_visits_ops" ON public.visitor_visits FOR ALL TO authenticated
  USING (public.can_operate_security(auth.uid(), institution_id))
  WITH CHECK (public.can_operate_security(auth.uid(), institution_id));
CREATE TRIGGER trg_visitor_visits_updated BEFORE UPDATE ON public.visitor_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.tg_visitor_visit_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'inside' AND (NEW.physical_id_seen IS NOT TRUE OR NEW.identity_verified_at IS NULL) THEN
    RAISE EXCEPTION 'Fiziksel kimlik kontrolu olmadan ziyaretci iceri alinamaz';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_visitor_visit_guard BEFORE INSERT OR UPDATE ON public.visitor_visits
  FOR EACH ROW EXECUTE FUNCTION public.tg_visitor_visit_guard();

-- ============ D. visitor_access_restrictions ============
CREATE TABLE public.visitor_access_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  visitor_person_id uuid REFERENCES public.visitor_people(id),
  related_student_id uuid REFERENCES public.students(id),
  restriction_type text NOT NULL CHECK (restriction_type IN ('school_entry','student_contact','student_pickup','manager_approval')),
  decision text NOT NULL CHECK (decision IN ('allow','deny','approval_required')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  legal_basis_type text,
  legal_basis_note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visitor_restrictions_lookup_idx ON public.visitor_access_restrictions (institution_id, visitor_person_id, related_student_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE ON public.visitor_access_restrictions TO authenticated;
GRANT ALL ON public.visitor_access_restrictions TO service_role;
ALTER TABLE public.visitor_access_restrictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visitor_restrictions_read" ON public.visitor_access_restrictions FOR SELECT TO authenticated
  USING (public.can_operate_security(auth.uid(), institution_id));
CREATE POLICY "visitor_restrictions_manage" ON public.visitor_access_restrictions FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE TRIGGER trg_visitor_restrictions_updated BEFORE UPDATE ON public.visitor_access_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ school_calendar_days ============
CREATE TABLE public.school_calendar_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  date date NOT NULL,
  type text NOT NULL DEFAULT 'holiday' CHECK (type IN ('school_day','holiday','special_no_duty')),
  title text,
  is_school_day boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_calendar_days TO authenticated;
GRANT ALL ON public.school_calendar_days TO service_role;
ALTER TABLE public.school_calendar_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calendar_read" ON public.school_calendar_days FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_institutions ui WHERE ui.user_id = auth.uid() AND ui.institution_id = school_calendar_days.institution_id)
    OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "calendar_manage" ON public.school_calendar_days FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE TRIGGER trg_calendar_updated BEFORE UPDATE ON public.school_calendar_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ E. student_duty_settings ============
CREATE TABLE public.student_duty_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  eligible_grade_level_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  eligible_section_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_students_per_location integer NOT NULL DEFAULT 1,
  generation_mode text NOT NULL DEFAULT 'weekly' CHECK (generation_mode IN ('weekly','monthly','term')),
  fairness_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, academic_year_id)
);
GRANT SELECT, INSERT, UPDATE ON public.student_duty_settings TO authenticated;
GRANT ALL ON public.student_duty_settings TO service_role;
ALTER TABLE public.student_duty_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duty_settings_read" ON public.student_duty_settings FOR SELECT TO authenticated
  USING (public.can_operate_security(auth.uid(), institution_id));
CREATE POLICY "duty_settings_manage" ON public.student_duty_settings FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE TRIGGER trg_duty_settings_updated BEFORE UPDATE ON public.student_duty_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ F. student_duty_exemptions ============
CREATE TABLE public.student_duty_exemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  start_date date NOT NULL,
  end_date date,
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX duty_exemptions_idx ON public.student_duty_exemptions (institution_id, student_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE ON public.student_duty_exemptions TO authenticated;
GRANT ALL ON public.student_duty_exemptions TO service_role;
ALTER TABLE public.student_duty_exemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duty_exempt_read" ON public.student_duty_exemptions FOR SELECT TO authenticated
  USING (public.can_operate_security(auth.uid(), institution_id));
CREATE POLICY "duty_exempt_manage" ON public.student_duty_exemptions FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE TRIGGER trg_duty_exempt_updated BEFORE UPDATE ON public.student_duty_exemptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ G. student_duty_assignments ============
CREATE TABLE public.student_duty_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  academic_year_id uuid REFERENCES public.academic_years(id),
  duty_date date NOT NULL,
  location_id uuid NOT NULL REFERENCES public.security_locations(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  responsible_teacher_profile_id uuid REFERENCES public.profiles(id),
  responsible_vp_profile_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','present','absent','replaced','completed')),
  checked_at timestamptz,
  checked_by_profile_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (duty_date, location_id, student_id)
);
CREATE INDEX duty_assign_date_idx ON public.student_duty_assignments (institution_id, duty_date);
CREATE UNIQUE INDEX duty_assign_one_place_per_day ON public.student_duty_assignments (duty_date, student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_duty_assignments TO authenticated;
GRANT ALL ON public.student_duty_assignments TO service_role;
ALTER TABLE public.student_duty_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duty_assign_ops_read" ON public.student_duty_assignments FOR SELECT TO authenticated
  USING (public.can_operate_security(auth.uid(), institution_id)
    OR responsible_teacher_profile_id = public.my_profile_id(auth.uid())
    OR responsible_vp_profile_id = public.my_profile_id(auth.uid()));
CREATE POLICY "duty_assign_teacher_check" ON public.student_duty_assignments FOR UPDATE TO authenticated
  USING (responsible_teacher_profile_id = public.my_profile_id(auth.uid())
    OR responsible_vp_profile_id = public.my_profile_id(auth.uid()))
  WITH CHECK (responsible_teacher_profile_id = public.my_profile_id(auth.uid())
    OR responsible_vp_profile_id = public.my_profile_id(auth.uid()));
CREATE POLICY "duty_assign_manage" ON public.student_duty_assignments FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE TRIGGER trg_duty_assign_updated BEFORE UPDATE ON public.student_duty_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ H. student_duty_generation_state ============
CREATE TABLE public.student_duty_generation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  last_generated_date date,
  cursor_student_id uuid REFERENCES public.students(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, academic_year_id)
);
GRANT SELECT, INSERT, UPDATE ON public.student_duty_generation_state TO authenticated;
GRANT ALL ON public.student_duty_generation_state TO service_role;
ALTER TABLE public.student_duty_generation_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duty_state_read" ON public.student_duty_generation_state FOR SELECT TO authenticated
  USING (public.can_operate_security(auth.uid(), institution_id));
CREATE POLICY "duty_state_manage" ON public.student_duty_generation_state FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));
CREATE TRIGGER trg_duty_state_updated BEFORE UPDATE ON public.student_duty_generation_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();