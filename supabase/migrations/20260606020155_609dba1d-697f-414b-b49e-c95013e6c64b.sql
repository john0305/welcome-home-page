ALTER TABLE public.grade_runs
  ADD COLUMN IF NOT EXISTS etsy_listing_id text,
  ADD COLUMN IF NOT EXISTS listing_views integer,
  ADD COLUMN IF NOT EXISTS listing_favorites integer,
  ADD COLUMN IF NOT EXISTS listing_price_string text,
  ADD COLUMN IF NOT EXISTS is_digital boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS raw_listing_data jsonb;