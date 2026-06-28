
-- Extend existing listing_snapshots (do not break current daily upsert flow)
ALTER TABLE public.listing_snapshots
  ADD COLUMN IF NOT EXISTS shop_id text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description_length integer,
  ADD COLUMN IF NOT EXISTS tag_count integer,
  ADD COLUMN IF NOT EXISTS tags text[],
  ADD COLUMN IF NOT EXISTS photo_count integer,
  ADD COLUMN IF NOT EXISTS title_char_count integer,
  ADD COLUMN IF NOT EXISTS first_tag text,
  ADD COLUMN IF NOT EXISTS first_title_keyword text,
  ADD COLUMN IF NOT EXISTS has_free_shipping boolean,
  ADD COLUMN IF NOT EXISTS shipping_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS processing_time_min integer,
  ADD COLUMN IF NOT EXISTS processing_time_max integer,
  ADD COLUMN IF NOT EXISTS last_modified_tsz timestamptz,
  ADD COLUMN IF NOT EXISTS original_creation_tsz timestamptz,
  ADD COLUMN IF NOT EXISTS changed_fields text[],
  ADD COLUMN IF NOT EXISTS is_first_snapshot boolean DEFAULT false;

-- Traction events log
CREATE TABLE IF NOT EXISTS public.listing_traction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id text NOT NULL,
  internal_listing_id uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  shop_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL,
  previous_value text,
  new_value text,
  delta numeric,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.listing_traction_events TO authenticated;
GRANT ALL ON public.listing_traction_events TO service_role;

ALTER TABLE public.listing_traction_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own traction events"
  ON public.listing_traction_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role writes traction events"
  ON public.listing_traction_events FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_traction_events_user_recorded
  ON public.listing_traction_events (user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_traction_events_listing
  ON public.listing_traction_events (internal_listing_id, recorded_at DESC);
