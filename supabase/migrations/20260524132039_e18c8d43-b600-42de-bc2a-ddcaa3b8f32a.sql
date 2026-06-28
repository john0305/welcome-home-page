-- ============================================================
-- Etsy + Optimization backend tables
-- ============================================================

-- ---------- etsy_tokens ----------
CREATE TABLE IF NOT EXISTS public.etsy_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL,
  shop_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, shop_id)
);
ALTER TABLE public.etsy_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etsy_tokens_owner_select" ON public.etsy_tokens
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "etsy_tokens_owner_insert" ON public.etsy_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "etsy_tokens_owner_update" ON public.etsy_tokens
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "etsy_tokens_owner_delete" ON public.etsy_tokens
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "etsy_tokens_admin_all" ON public.etsy_tokens
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE TRIGGER etsy_tokens_set_updated_at BEFORE UPDATE ON public.etsy_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- stores ----------
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  etsy_shop_id TEXT NOT NULL,
  shop_name TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced TIMESTAMPTZ,
  listing_count INT NOT NULL DEFAULT 0,
  store_health_score INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, etsy_shop_id)
);
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores_owner_select" ON public.stores
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "stores_owner_insert" ON public.stores
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stores_owner_update" ON public.stores
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "stores_owner_delete" ON public.stores
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "stores_admin_all" ON public.stores
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE TRIGGER stores_set_updated_at BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- listings ----------
CREATE TABLE IF NOT EXISTS public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  etsy_listing_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  photo_count INT NOT NULL DEFAULT 0,
  price NUMERIC(10,2),
  state TEXT,
  url TEXT,
  score INT,
  grade TEXT,
  score_breakdown JSONB,
  last_graded TIMESTAMPTZ,
  last_synced TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, etsy_listing_id)
);
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings_owner_select" ON public.listings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "listings_owner_insert" ON public.listings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "listings_owner_update" ON public.listings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "listings_owner_delete" ON public.listings
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "listings_admin_all" ON public.listings
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE TRIGGER listings_set_updated_at BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS listings_user_idx ON public.listings(user_id);

-- ---------- optimizations ----------
CREATE TABLE IF NOT EXISTS public.optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('title','tags','description')),
  original_text TEXT,
  suggested_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pushed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.optimizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "optimizations_owner_select" ON public.optimizations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "optimizations_owner_insert" ON public.optimizations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "optimizations_owner_update" ON public.optimizations
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "optimizations_owner_delete" ON public.optimizations
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "optimizations_admin_all" ON public.optimizations
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE TRIGGER optimizations_set_updated_at BEFORE UPDATE ON public.optimizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS optimizations_user_idx ON public.optimizations(user_id);
CREATE INDEX IF NOT EXISTS optimizations_listing_idx ON public.optimizations(listing_id);

-- ---------- monthly_usage ----------
CREATE TABLE IF NOT EXISTS public.monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- 'YYYY-MM'
  optimizations_used INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);
ALTER TABLE public.monthly_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_usage_owner_select" ON public.monthly_usage
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "monthly_usage_owner_insert" ON public.monthly_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "monthly_usage_owner_update" ON public.monthly_usage
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "monthly_usage_admin_all" ON public.monthly_usage
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE TRIGGER monthly_usage_set_updated_at BEFORE UPDATE ON public.monthly_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();