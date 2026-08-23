CREATE TABLE public.transport_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  absence_date date NOT NULL,
  direction public.transport_direction NOT NULL DEFAULT 'both',
  reason text,
  created_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.transport_absences TO authenticated;
GRANT ALL ON public.transport_absences TO service_role;

ALTER TABLE public.transport_absences ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX uniq_active_absence
  ON public.transport_absences (student_id, absence_date, direction)
  WHERE cancelled_at IS NULL AND deleted_at IS NULL;

CREATE INDEX idx_absence_student_date ON public.transport_absences (student_id, absence_date);

CREATE TRIGGER trg_absences_updated BEFORE UPDATE ON public.transport_absences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Staff helper: is this user driver/attendant on a route the student is actively assigned to?
CREATE OR REPLACE FUNCTION public.is_transport_staff_of_student(_user_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_transport_assignments a
    JOIN public.routes r ON r.id = a.route_id
    JOIN public.transport_staff s ON s.id IN (r.driver_staff_id, r.attendant_staff_id)
    WHERE a.student_id = _student_id AND a.is_active AND a.deleted_at IS NULL
      AND s.user_id = _user_id AND s.is_active AND s.deleted_at IS NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_transport_staff_of_student(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_transport_staff_of_student(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "Managers manage institution absences"
  ON public.transport_absences FOR ALL TO authenticated
  USING (public.can_manage_institution(auth.uid(), institution_id))
  WITH CHECK (public.can_manage_institution(auth.uid(), institution_id));

CREATE POLICY "Guardians read own child absences"
  ON public.transport_absences FOR SELECT TO authenticated
  USING (public.is_guardian_of_student(auth.uid(), student_id));

CREATE POLICY "Guardians create own child absences"
  ON public.transport_absences FOR INSERT TO authenticated
  WITH CHECK (public.is_guardian_of_student(auth.uid(), student_id) AND created_by = auth.uid());

CREATE POLICY "Guardians cancel own child absences"
  ON public.transport_absences FOR UPDATE TO authenticated
  USING (public.is_guardian_of_student(auth.uid(), student_id))
  WITH CHECK (public.is_guardian_of_student(auth.uid(), student_id));

CREATE POLICY "Transport staff read route student absences"
  ON public.transport_absences FOR SELECT TO authenticated
  USING (public.is_transport_staff_of_student(auth.uid(), student_id));