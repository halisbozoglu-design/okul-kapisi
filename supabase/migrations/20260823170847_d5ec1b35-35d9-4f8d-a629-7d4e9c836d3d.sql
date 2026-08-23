ALTER TABLE public.transport_absences REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transport_absences;