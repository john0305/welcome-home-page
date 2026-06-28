ALTER TABLE public.listings REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.listings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;