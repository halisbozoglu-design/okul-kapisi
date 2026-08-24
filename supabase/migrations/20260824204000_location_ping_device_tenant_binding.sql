-- Keep existing PWA compatibility (device_id may be null), but when a native/mobile
-- device registration is attached to a ping it must belong to the same user AND tenant.

DROP POLICY IF EXISTS pings_staff_insert ON public.location_pings;
CREATE POLICY pings_staff_insert
ON public.location_pings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.transport_trips t
    WHERE t.id = location_pings.trip_id
      AND t.institution_id = location_pings.institution_id
      AND t.status = 'active'::public.transport_trip_status
      AND t.deleted_at IS NULL
      AND public.is_transport_staff_of_trip((SELECT auth.uid()), t.id)
  )
  AND (
    location_pings.device_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.mobile_device_registrations d
      WHERE d.id = location_pings.device_id
        AND d.user_id = (SELECT auth.uid())
        AND d.institution_id = location_pings.institution_id
        AND d.revoked_at IS NULL
    )
  )
);

-- Fast ownership/tenant lookup for the insert policy and future device telemetry.
CREATE INDEX IF NOT EXISTS ix_mobile_devices_user_institution_active
  ON public.mobile_device_registrations (user_id, institution_id, id)
  WHERE revoked_at IS NULL;
