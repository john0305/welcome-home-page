-- Add per-listing performance columns we need to snapshot
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorites integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ending_at timestamptz;

-- ============== listing_snapshots ==============
CREATE TABLE IF NOT EXISTS public.listing_snapshots (
  listing_id uuid NOT NULL,
  user_id uuid NOT NULL,
  recorded_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  views integer NOT NULL DEFAULT 0,
  favorites integer NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 0,
  state text,
  price numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, recorded_on)
);
CREATE INDEX IF NOT EXISTS idx_listing_snapshots_user_date ON public.listing_snapshots(user_id, recorded_on DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_snapshots TO authenticated;
GRANT ALL ON public.listing_snapshots TO service_role;

ALTER TABLE public.listing_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_snapshots_owner_select" ON public.listing_snapshots
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "listing_snapshots_owner_insert" ON public.listing_snapshots
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "listing_snapshots_admin_all" ON public.listing_snapshots
  FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- ============== shop_snapshots ==============
CREATE TABLE IF NOT EXISTS public.shop_snapshots (
  store_id uuid NOT NULL,
  user_id uuid NOT NULL,
  recorded_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  total_views integer NOT NULL DEFAULT 0,
  total_sales integer NOT NULL DEFAULT 0,
  active_count integer NOT NULL DEFAULT 0,
  sold_out_count integer NOT NULL DEFAULT 0,
  expiring_soon_count integer NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  avg_rating numeric,
  orders_30d integer NOT NULL DEFAULT 0,
  revenue_30d numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, recorded_on)
);
CREATE INDEX IF NOT EXISTS idx_shop_snapshots_user_date ON public.shop_snapshots(user_id, recorded_on DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_snapshots TO authenticated;
GRANT ALL ON public.shop_snapshots TO service_role;

ALTER TABLE public.shop_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_snapshots_owner_select" ON public.shop_snapshots
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "shop_snapshots_owner_insert" ON public.shop_snapshots
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shop_snapshots_admin_all" ON public.shop_snapshots
  FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- ============== shop_reviews ==============
CREATE TABLE IF NOT EXISTS public.shop_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL,
  user_id uuid NOT NULL,
  etsy_review_id text,
  rating integer NOT NULL,
  review_text text,
  listing_id uuid,
  buyer_country text,
  etsy_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, etsy_review_id)
);
CREATE INDEX IF NOT EXISTS idx_shop_reviews_user_date ON public.shop_reviews(user_id, etsy_created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_reviews TO authenticated;
GRANT ALL ON public.shop_reviews TO service_role;

ALTER TABLE public.shop_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_reviews_owner_select" ON public.shop_reviews
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "shop_reviews_owner_insert" ON public.shop_reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shop_reviews_admin_all" ON public.shop_reviews
  FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());