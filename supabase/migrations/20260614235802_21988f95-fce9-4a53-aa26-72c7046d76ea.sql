
-- 1. listings.content_updated_at + trigger (content-only change tracker)
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS content_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_sanity_scanned_at timestamptz;

CREATE OR REPLACE FUNCTION public.listings_bump_content_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.content_updated_at := now();
    RETURN NEW;
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.tags IS DISTINCT FROM OLD.tags
     OR NEW.price IS DISTINCT FROM OLD.price THEN
    NEW.content_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_content_updated_at_trg ON public.listings;
CREATE TRIGGER listings_content_updated_at_trg
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.listings_bump_content_updated_at();

-- 2. user_profiles.sanity_check_disabled_types
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS sanity_check_disabled_types text[] NOT NULL DEFAULT '{}'::text[];

-- 3. listing_sanity_flags table
CREATE TABLE IF NOT EXISTS public.listing_sanity_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  internal_listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  flag_type text NOT NULL CHECK (flag_type IN ('placeholder','profanity','internal_note','price_outlier','text_mismatch')),
  field text NOT NULL CHECK (field IN ('title','description','tags','price')),
  match_value text NOT NULL,
  flagged_text text NOT NULL,
  detail text NOT NULL DEFAULT '',
  match_key text GENERATED ALWAYS AS (
    encode(digest(flag_type || ':' || field || ':' || lower(btrim(match_value)), 'sha256'), 'hex')
  ) STORED,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','dismissed','ignored_permanently','resolved')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (internal_listing_id, match_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_sanity_flags TO authenticated;
GRANT ALL ON public.listing_sanity_flags TO service_role;

ALTER TABLE public.listing_sanity_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their sanity flags"
  ON public.listing_sanity_flags
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners can update their sanity flags"
  ON public.listing_sanity_flags
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can delete their sanity flags"
  ON public.listing_sanity_flags
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Inserts come from the edge function (service role) only — no INSERT policy for authenticated.

CREATE INDEX IF NOT EXISTS listing_sanity_flags_listing_status_idx
  ON public.listing_sanity_flags (internal_listing_id, status);
CREATE INDEX IF NOT EXISTS listing_sanity_flags_user_status_detected_idx
  ON public.listing_sanity_flags (user_id, status, detected_at DESC);

CREATE TRIGGER update_listing_sanity_flags_updated_at
  BEFORE UPDATE ON public.listing_sanity_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
