-- Performance attribution tables

CREATE TABLE public.performance_attribution (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  optimization_id uuid NOT NULL,
  listing_id uuid NOT NULL,
  user_id uuid NOT NULL,
  window_days int NOT NULL CHECK (window_days IN (7, 14, 30, 60, 90)),
  optimized_at timestamptz NOT NULL,
  pre_snapshot_date date,
  post_snapshot_date date,
  pre_views int, post_views int, views_delta int, views_pct numeric,
  pre_favorites int, post_favorites int, favorites_delta int, favorites_pct numeric,
  pre_sales int, post_sales int, sales_delta int, sales_pct numeric,
  pre_revenue numeric, post_revenue numeric, revenue_delta numeric, revenue_pct numeric,
  pre_score int, post_score int, score_delta int,
  is_sufficient_data boolean NOT NULL DEFAULT false,
  is_anomaly boolean NOT NULL DEFAULT false,
  anomaly_reason text,
  admin_review_status text NOT NULL DEFAULT 'pending' CHECK (admin_review_status IN ('pending','valid','invalid','investigating')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (optimization_id, window_days)
);

CREATE INDEX idx_attribution_user ON public.performance_attribution(user_id);
CREATE INDEX idx_attribution_listing ON public.performance_attribution(listing_id);
CREATE INDEX idx_attribution_anomaly ON public.performance_attribution(is_anomaly) WHERE is_anomaly = true;

GRANT SELECT ON public.performance_attribution TO authenticated;
GRANT ALL ON public.performance_attribution TO service_role;

ALTER TABLE public.performance_attribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_attribution" ON public.performance_attribution
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND admin_review_status <> 'invalid');

CREATE POLICY "admin_all_attribution" ON public.performance_attribution
  FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE TRIGGER trg_attribution_updated
  BEFORE UPDATE ON public.performance_attribution
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.platform_stats_cache (
  id int NOT NULL PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_optimizations int NOT NULL DEFAULT 0,
  median_score_improvement numeric,
  median_views_lift_30d numeric,
  median_sales_lift_30d numeric,
  pct_positive_delta numeric,
  computed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_stats_cache TO anon, authenticated;
GRANT ALL ON public.platform_stats_cache TO service_role;

ALTER TABLE public.platform_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_platform_stats" ON public.platform_stats_cache
  FOR SELECT TO anon, authenticated USING (true);


CREATE TABLE public.wins_feed (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  listing_id uuid NOT NULL,
  attribution_id uuid,
  kind text NOT NULL,
  headline text NOT NULL,
  metric_value numeric,
  window_days int,
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz
);

CREATE INDEX idx_wins_user ON public.wins_feed(user_id, created_at DESC);
CREATE UNIQUE INDEX idx_wins_unique ON public.wins_feed(attribution_id, kind) WHERE attribution_id IS NOT NULL;

GRANT SELECT, UPDATE ON public.wins_feed TO authenticated;
GRANT ALL ON public.wins_feed TO service_role;

ALTER TABLE public.wins_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_wins" ON public.wins_feed
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "owner_update_wins_seen" ON public.wins_feed
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin_all_wins" ON public.wins_feed
  FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());


CREATE TABLE public.snapshot_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  status text NOT NULL CHECK (status IN ('success','failed')),
  error text,
  listings_snapshotted int DEFAULT 0,
  triggered_by text DEFAULT 'cron',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshot_runs_recent ON public.snapshot_runs(created_at DESC);

GRANT SELECT ON public.snapshot_runs TO authenticated;
GRANT ALL ON public.snapshot_runs TO service_role;

ALTER TABLE public.snapshot_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_snapshot_runs" ON public.snapshot_runs
  FOR SELECT TO authenticated USING (is_platform_admin());

-- Seed the singleton stats cache row
INSERT INTO public.platform_stats_cache (id) VALUES (1) ON CONFLICT (id) DO NOTHING;