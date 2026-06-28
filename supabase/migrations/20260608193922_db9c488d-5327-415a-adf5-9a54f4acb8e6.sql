CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL UNIQUE,
  label text NOT NULL,
  enabled boolean DEFAULT false,
  tier_restriction text,
  paused boolean DEFAULT false,
  pause_reason text,
  last_changed_by text,
  last_changed_at timestamptz DEFAULT now(),
  notes text
);
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feature_flags_authenticated_read" ON public.feature_flags;
CREATE POLICY "feature_flags_authenticated_read" ON public.feature_flags FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "feature_flags_admin_all" ON public.feature_flags;
CREATE POLICY "feature_flags_admin_all" ON public.feature_flags FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

INSERT INTO public.feature_flags (flag_key, label, enabled, tier_restriction, paused, pause_reason) VALUES
  ('achievement_system','Achievement System',false,null,false,null),
  ('pinterest_spotlight','Pinterest Spotlight',false,null,true,'Paused pending Etsy API commercial approval'),
  ('echo_memory','Echo Memory',true,'pro',false,null),
  ('competitor_alerts','Competitor Alerts',true,'pro',false,null),
  ('market_informed_optimizer','Market Informed Optimizer',true,'pro',false,null),
  ('algorithm_weight_model','Algorithm Weight Model (Beta)',true,'admin',false,null),
  ('guided_fix_tags','Guided Fix — Tag Updates',true,null,false,null),
  ('guided_fix_title','Guided Fix — Title Updates',true,'pro',false,null),
  ('guided_fix_price','Guided Fix — Price Changes',false,null,false,null),
  ('guided_fix_description','Guided Fix — Description',true,'pro',false,null)
ON CONFLICT (flag_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  label text,
  last_changed_by text,
  last_changed_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_settings_authenticated_read" ON public.platform_settings;
CREATE POLICY "platform_settings_authenticated_read" ON public.platform_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "platform_settings_admin_all" ON public.platform_settings;
CREATE POLICY "platform_settings_admin_all" ON public.platform_settings FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

INSERT INTO public.platform_settings (key, value, label) VALUES
  ('daily_quota_ceiling','9000','Daily API quota ceiling'),
  ('hourly_burst_limit','800','Hourly API burst limit'),
  ('batch_stagger_seconds','30','Seconds between batch pipeline runs'),
  ('attribution_window_days','7','Days to track score after action'),
  ('free_listing_limit','1','Max listings for free tier'),
  ('starter_listing_limit','5','Max listings for starter tier'),
  ('score_history_free_days','7','Score history days for free tier'),
  ('score_history_starter_days','30','Score history days for starter tier'),
  ('anomaly_threshold_market_score','75','Min market score for anomaly flag'),
  ('anomaly_threshold_favorites','10','Max favorites for anomaly flag'),
  ('inactive_user_days','14','Days before user flagged inactive'),
  ('competitor_pull_limit','15','Competitor results per query'),
  ('score_refresh_rate','"daily"','Score refresh rate for active listings')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.api_quota_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  called_at timestamptz DEFAULT now(),
  endpoint text,
  call_type text CHECK (call_type IN ('read','write')),
  user_id uuid,
  priority integer,
  success boolean DEFAULT true
);
GRANT ALL ON public.api_quota_log TO service_role;
ALTER TABLE public.api_quota_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_quota_log_admin_all" ON public.api_quota_log;
CREATE POLICY "api_quota_log_admin_all" ON public.api_quota_log FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX IF NOT EXISTS idx_api_quota_log_called_at ON public.api_quota_log(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_quota_log_user ON public.api_quota_log(user_id, called_at DESC);

CREATE TABLE IF NOT EXISTS public.market_insight_cache (
  keyword_cluster text PRIMARY KEY,
  insights jsonb NOT NULL,
  competitor_listings jsonb,
  source text DEFAULT 'etsy_api',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);
GRANT SELECT ON public.market_insight_cache TO authenticated;
GRANT ALL ON public.market_insight_cache TO service_role;
ALTER TABLE public.market_insight_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "market_insight_cache_authenticated_read" ON public.market_insight_cache;
CREATE POLICY "market_insight_cache_authenticated_read" ON public.market_insight_cache FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "market_insight_cache_admin_all" ON public.market_insight_cache;
CREATE POLICY "market_insight_cache_admin_all" ON public.market_insight_cache FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX IF NOT EXISTS idx_market_insight_cache_expires ON public.market_insight_cache(expires_at);

CREATE TABLE IF NOT EXISTS public.competitor_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_cluster text NOT NULL,
  etsy_listing_id text NOT NULL,
  shop_id text,
  shop_name text,
  title text,
  tags text[],
  price decimal,
  num_favorers integer,
  quantity integer,
  photo_count integer,
  image_urls text[],
  description_length integer,
  rank_position integer,
  source text DEFAULT 'etsy_api' CHECK (source IN ('etsy_api','platform_user','seed')),
  captured_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.competitor_snapshots TO authenticated;
GRANT ALL ON public.competitor_snapshots TO service_role;
ALTER TABLE public.competitor_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "competitor_snapshots_authenticated_read" ON public.competitor_snapshots;
CREATE POLICY "competitor_snapshots_authenticated_read" ON public.competitor_snapshots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "competitor_snapshots_admin_all" ON public.competitor_snapshots;
CREATE POLICY "competitor_snapshots_admin_all" ON public.competitor_snapshots FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_cluster ON public.competitor_snapshots(keyword_cluster, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_listing ON public.competitor_snapshots(etsy_listing_id);
CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_cluster_listing ON public.competitor_snapshots(keyword_cluster, etsy_listing_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS public.listing_market_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  listing_id text NOT NULL,
  keyword_cluster text NOT NULL,
  quality_score integer,
  market_score integer,
  title_score integer,
  tag_score integer,
  price_score integer,
  photo_score integer,
  favorites_score integer,
  description_score integer,
  market_rank_estimate integer,
  missing_tags text[],
  missing_tag_count integer,
  favorites_count integer,
  photo_count integer,
  image_urls text[],
  primary_image_url text,
  scored_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.listing_market_scores TO authenticated;
GRANT ALL ON public.listing_market_scores TO service_role;
ALTER TABLE public.listing_market_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "listing_market_scores_owner_select" ON public.listing_market_scores;
CREATE POLICY "listing_market_scores_owner_select" ON public.listing_market_scores FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "listing_market_scores_admin_all" ON public.listing_market_scores;
CREATE POLICY "listing_market_scores_admin_all" ON public.listing_market_scores FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX IF NOT EXISTS idx_listing_market_scores_user ON public.listing_market_scores(user_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_market_scores_listing ON public.listing_market_scores(listing_id, scored_at DESC);

CREATE TABLE IF NOT EXISTS public.user_niche_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  primary_niche text,
  secondary_niches text[],
  keyword_clusters text[],
  niche_source text CHECK (niche_source IN ('personalization_form','tag_inference','admin_assigned','combined')),
  niche_confidence decimal,
  personalization_category text,
  tag_inference_niche text,
  niches_conflict boolean,
  target_customer text,
  price_range text,
  seller_goals text[],
  detected_at timestamptz DEFAULT now(),
  last_updated timestamptz DEFAULT now()
);
GRANT SELECT ON public.user_niche_profiles TO authenticated;
GRANT ALL ON public.user_niche_profiles TO service_role;
ALTER TABLE public.user_niche_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_niche_profiles_owner_select" ON public.user_niche_profiles;
CREATE POLICY "user_niche_profiles_owner_select" ON public.user_niche_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_niche_profiles_admin_all" ON public.user_niche_profiles;
CREATE POLICY "user_niche_profiles_admin_all" ON public.user_niche_profiles FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE TABLE IF NOT EXISTS public.seed_niches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche_label text NOT NULL,
  niche_key text NOT NULL UNIQUE,
  ai_generated_queries text[],
  custom_queries text[],
  active boolean DEFAULT true,
  last_refreshed timestamptz,
  competitor_listing_count integer DEFAULT 0,
  real_user_count integer DEFAULT 0,
  admin_assigned_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.seed_niches TO authenticated;
GRANT ALL ON public.seed_niches TO service_role;
ALTER TABLE public.seed_niches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seed_niches_authenticated_read" ON public.seed_niches;
CREATE POLICY "seed_niches_authenticated_read" ON public.seed_niches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "seed_niches_admin_all" ON public.seed_niches;
CREATE POLICY "seed_niches_admin_all" ON public.seed_niches FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE TABLE IF NOT EXISTS public.algorithm_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  weights jsonb NOT NULL,
  confidence decimal,
  sample_size integer,
  validation_correlation decimal,
  last_validated_at timestamptz,
  is_active boolean DEFAULT false,
  notes text,
  created_by text,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.algorithm_weights TO authenticated;
GRANT ALL ON public.algorithm_weights TO service_role;
ALTER TABLE public.algorithm_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "algorithm_weights_authenticated_read" ON public.algorithm_weights;
CREATE POLICY "algorithm_weights_authenticated_read" ON public.algorithm_weights FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "algorithm_weights_admin_all" ON public.algorithm_weights;
CREATE POLICY "algorithm_weights_admin_all" ON public.algorithm_weights FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE TABLE IF NOT EXISTS public.algorithm_weight_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weights jsonb NOT NULL,
  version text NOT NULL,
  changed_by text,
  change_reason text,
  confidence_before decimal,
  confidence_after decimal,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.algorithm_weight_history TO authenticated;
GRANT ALL ON public.algorithm_weight_history TO service_role;
ALTER TABLE public.algorithm_weight_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "algorithm_weight_history_admin_all" ON public.algorithm_weight_history;
CREATE POLICY "algorithm_weight_history_admin_all" ON public.algorithm_weight_history FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

INSERT INTO public.algorithm_weights (version, weights, confidence, sample_size, is_active, notes)
VALUES (
  '2026-Q2',
  '{"title_keyword_match":0.82,"tag_relevance":0.71,"photo_count":0.54,"recency":0.43,"price_competitiveness":0.31,"description_quality":0.24,"shop_age":0.79,"review_score":0.74,"sales_velocity":0.62,"review_count":0.58,"response_rate":0.41}'::jsonb,
  0.67, 847, true,
  'Initial hypothesis weights — admin-adjustable from /admin/algorithm'
) ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.action_effectiveness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  cohort_date date NOT NULL,
  sample_size integer,
  avg_delta_7d decimal,
  avg_delta_30d decimal,
  pct_improved decimal,
  pct_declined decimal,
  pct_reverted decimal,
  UNIQUE(action_type, cohort_date)
);
GRANT SELECT ON public.action_effectiveness TO authenticated;
GRANT ALL ON public.action_effectiveness TO service_role;
ALTER TABLE public.action_effectiveness ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "action_effectiveness_authenticated_read" ON public.action_effectiveness;
CREATE POLICY "action_effectiveness_authenticated_read" ON public.action_effectiveness FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "action_effectiveness_admin_all" ON public.action_effectiveness;
CREATE POLICY "action_effectiveness_admin_all" ON public.action_effectiveness FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE TABLE IF NOT EXISTS public.user_listing_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  listing_id text NOT NULL,
  action_type text NOT NULL,
  action_source text,
  before_value jsonb,
  after_value jsonb,
  attribution_window_ends timestamptz,
  reverted_at timestamptz,
  revert_reason text,
  performed_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.user_listing_actions TO authenticated;
GRANT ALL ON public.user_listing_actions TO service_role;
ALTER TABLE public.user_listing_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_listing_actions_owner_select" ON public.user_listing_actions;
CREATE POLICY "user_listing_actions_owner_select" ON public.user_listing_actions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_listing_actions_admin_all" ON public.user_listing_actions;
CREATE POLICY "user_listing_actions_admin_all" ON public.user_listing_actions FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX IF NOT EXISTS idx_user_listing_actions_user ON public.user_listing_actions(user_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_listing_actions_listing ON public.user_listing_actions(listing_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_listing_actions_attribution ON public.user_listing_actions(attribution_window_ends) WHERE reverted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.niche_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_cluster text NOT NULL,
  date date NOT NULL,
  avg_competition_score decimal,
  avg_competitor_favorers decimal,
  active_listing_count integer,
  saturation_level text,
  trend text,
  UNIQUE(keyword_cluster, date)
);
GRANT SELECT ON public.niche_health TO authenticated;
GRANT ALL ON public.niche_health TO service_role;
ALTER TABLE public.niche_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "niche_health_authenticated_read" ON public.niche_health;
CREATE POLICY "niche_health_authenticated_read" ON public.niche_health FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "niche_health_admin_all" ON public.niche_health;
CREATE POLICY "niche_health_admin_all" ON public.niche_health FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX IF NOT EXISTS idx_niche_health_cluster ON public.niche_health(keyword_cluster, date DESC);

CREATE TABLE IF NOT EXISTS public.platform_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date UNIQUE NOT NULL,
  active_users integer DEFAULT 0,
  listings_scored integer DEFAULT 0,
  actions_taken integer DEFAULT 0,
  actions_reverted integer DEFAULT 0,
  avg_market_score decimal,
  avg_quality_score decimal,
  api_calls_made integer DEFAULT 0,
  api_quota_remaining integer,
  cache_hit_rate decimal,
  job_success_rate decimal,
  high_score_no_traction_count integer DEFAULT 0,
  free_users integer DEFAULT 0,
  starter_users integer DEFAULT 0,
  pro_users integer DEFAULT 0
);
GRANT SELECT ON public.platform_daily_metrics TO authenticated;
GRANT ALL ON public.platform_daily_metrics TO service_role;
ALTER TABLE public.platform_daily_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_daily_metrics_admin_all" ON public.platform_daily_metrics;
CREATE POLICY "platform_daily_metrics_admin_all" ON public.platform_daily_metrics FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX IF NOT EXISTS idx_platform_daily_metrics_date ON public.platform_daily_metrics(date DESC);

CREATE TABLE IF NOT EXISTS public.pipeline_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users,
  run_type text NOT NULL,
  trigger_reason text,
  status text DEFAULT 'running' CHECK (status IN ('running','complete','failed','skipped')),
  listings_processed integer DEFAULT 0,
  api_calls_made integer DEFAULT 0,
  cache_hits integer DEFAULT 0,
  errors jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT ON public.pipeline_run_log TO authenticated;
GRANT ALL ON public.pipeline_run_log TO service_role;
ALTER TABLE public.pipeline_run_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pipeline_run_log_owner_select" ON public.pipeline_run_log;
CREATE POLICY "pipeline_run_log_owner_select" ON public.pipeline_run_log FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_platform_admin());
DROP POLICY IF EXISTS "pipeline_run_log_admin_all" ON public.pipeline_run_log;
CREATE POLICY "pipeline_run_log_admin_all" ON public.pipeline_run_log FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX IF NOT EXISTS idx_pipeline_run_log_user ON public.pipeline_run_log(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_run_log_status ON public.pipeline_run_log(status, started_at DESC);

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS market_intelligence_initialized boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_pipeline_run timestamptz,
  ADD COLUMN IF NOT EXISTS niche_detected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_contributes_to_platform boolean DEFAULT true;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS suppression_risk text,
  ADD COLUMN IF NOT EXISTS suppression_reasons text[],
  ADD COLUMN IF NOT EXISTS competitor_avg_health decimal,
  ADD COLUMN IF NOT EXISTS market_context_score integer;

ALTER TABLE public.listing_versions
  ADD COLUMN IF NOT EXISTS action_source text,
  ADD COLUMN IF NOT EXISTS attribution_window_ends timestamptz,
  ADD COLUMN IF NOT EXISTS reverted_at timestamptz,
  ADD COLUMN IF NOT EXISTS revert_reason text;