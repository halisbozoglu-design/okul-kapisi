-- Harden Data API table privileges. RLS does not protect TRUNCATE and browser
-- clients never need TRIGGER/REFERENCES privileges on application tables.
-- Keep ordinary SELECT/INSERT/UPDATE/DELETE grants intact so existing RLS-backed
-- CRUD flows remain backward compatible.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.%I FROM anon, authenticated',
      r.table_name
    );
  END LOOP;
END;
$$;
