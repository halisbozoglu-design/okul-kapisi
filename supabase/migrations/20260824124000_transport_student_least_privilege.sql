-- MİMAROS transport student least-privilege correction.
-- Transport managers need the student roster for assignment, but transport.manage
-- must never imply permission to modify identity / guardian data in students.

DROP POLICY IF EXISTS "students_transport_permission_manage" ON public.students;

DROP POLICY IF EXISTS "students_transport_permission_read" ON public.students;
CREATE POLICY "students_transport_permission_read"
ON public.students FOR SELECT TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), institution_id, 'transport', 'view')
);

-- Preserve table-level Data API compatibility while relying on RLS to authorize
-- rows. No transport-specific INSERT/UPDATE/DELETE policy exists after this patch.
GRANT SELECT ON public.students TO authenticated;
