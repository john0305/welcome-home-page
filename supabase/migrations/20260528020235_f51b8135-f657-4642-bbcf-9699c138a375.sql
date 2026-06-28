ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS video_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS etsy_created_at timestamptz;