ALTER TABLE public.shop_snapshots
  ADD COLUMN IF NOT EXISTS total_favorites integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shop_followers integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.shop_snapshots.total_views IS 'Sum of views across active listings on recorded_on';
COMMENT ON COLUMN public.shop_snapshots.total_favorites IS 'Sum of num_favorers across active listings (item-level favorites)';
COMMENT ON COLUMN public.shop_snapshots.shop_followers IS 'Shop-level followers (num_favorers on the shop)';
COMMENT ON COLUMN public.shop_snapshots.total_sales IS 'Cumulative all-time sold count (best-effort from Etsy)';