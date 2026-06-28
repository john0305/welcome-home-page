-- Niche resolution waterfall: per-listing cache + cross-user fingerprint cache

-- 1) Per-listing niche cache columns
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS niche text,
  ADD COLUMN IF NOT EXISTS niche_source text,
  ADD COLUMN IF NOT EXISTS niche_confidence numeric,
  ADD COLUMN IF NOT EXISTS niche_detected_at timestamptz,
  ADD COLUMN IF NOT EXISTS niche_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS niche_tag_fingerprint text;

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_niche_source_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_niche_source_check
  CHECK (niche_source IS NULL OR niche_source IN (
    'listing_cache', 'shared_cache', 'shop_niche', 'ai_scan', 'keyword_cluster_backfill', 'needs_input'
  ));

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_niche_status_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_niche_status_check
  CHECK (niche_status IN ('pending', 'resolved', 'needs_input', 'scanning'));

CREATE INDEX IF NOT EXISTS idx_listings_niche_fingerprint
  ON public.listings (niche_tag_fingerprint)
  WHERE niche_tag_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_niche_status
  ON public.listings (user_id, niche_status);

-- 2) Cross-user shared niche cache, keyed by normalized tag fingerprint
CREATE TABLE IF NOT EXISTS public.niche_cache (
  tag_fingerprint text PRIMARY KEY,
  niche text NOT NULL,
  confidence numeric,
  source text NOT NULL DEFAULT 'ai_scan',
  hit_count integer NOT NULL DEFAULT 1,
  sample_tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.niche_cache TO authenticated;
GRANT ALL ON public.niche_cache TO service_role;

ALTER TABLE public.niche_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "niche_cache_read_all_authenticated"
  ON public.niche_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "niche_cache_admin_all"
  ON public.niche_cache FOR ALL
  TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE TRIGGER niche_cache_set_updated_at
  BEFORE UPDATE ON public.niche_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
