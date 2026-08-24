-- Transport notification privilege hardening
-- Guardians may read their own notifications and may only update read_at.
-- Notification identity/content remains server-controlled.

BEGIN;

-- The notification surface must never be reachable anonymously.
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.transport_notifications
  FROM anon;

-- Authenticated clients do not create/delete notification rows directly.
-- Server-side notification functions/service role remain unaffected.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.transport_notifications
  FROM authenticated;

GRANT SELECT ON TABLE public.transport_notifications TO authenticated;
GRANT UPDATE (read_at) ON TABLE public.transport_notifications TO authenticated;

DROP POLICY IF EXISTS "Guardians mark own notifications read"
  ON public.transport_notifications;

CREATE POLICY "Guardians mark own notifications read"
  ON public.transport_notifications
  FOR UPDATE
  TO authenticated
  USING (
    guardian_user_id = (SELECT auth.uid())
    AND student_id IS NOT NULL
    AND public.is_guardian_of_student((SELECT auth.uid()), student_id)
    AND institution_id = (
      SELECT s.institution_id
      FROM public.students s
      WHERE s.id = transport_notifications.student_id
    )
  )
  WITH CHECK (
    guardian_user_id = (SELECT auth.uid())
    AND student_id IS NOT NULL
    AND public.is_guardian_of_student((SELECT auth.uid()), student_id)
    AND institution_id = (
      SELECT s.institution_id
      FROM public.students s
      WHERE s.id = transport_notifications.student_id
    )
  );

COMMIT;
