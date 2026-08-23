ALTER TABLE public.route_stops
  ADD COLUMN IF NOT EXISTS planned_to_school time,
  ADD COLUMN IF NOT EXISTS planned_to_home time;

COMMENT ON COLUMN public.route_stops.planned_to_school IS 'Planned local (Europe/Istanbul) pass time for the to_school direction. Nullable.';
COMMENT ON COLUMN public.route_stops.planned_to_home IS 'Planned local (Europe/Istanbul) pass time for the to_home direction. Nullable.';
COMMENT ON COLUMN public.route_stops.planned_time IS 'Legacy direction-agnostic planned time. Kept for backwards compatibility; delay engine uses planned_to_school/planned_to_home only.';