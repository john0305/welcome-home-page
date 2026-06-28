-- RadarIQ — Competitor Intelligence Tables
-- Adds market_snapshots, competitor_alerts, and shop_intelligence.
-- Extends the existing schema without touching existing tables.

-- ─── 1. market_snapshots ─────────────────────────────────────────────────────

CREATE TABLE public.market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_term TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result_count INTEGER NOT NULL DEFAULT 0,
  listings JSONB NOT NULL DEFAULT '[]',
  -- listings is an array of objects, each containing:
  -- { etsy_listing_id, title, tags[], price, photo_count,
  --   review_count, listing_age_days, ships_fast,
  --   has_free_shipping, return_policy_present,
  --   materials_filled, rank_position }
  scan_source TEXT NOT NULL DEFAULT 'nightly',
  -- scan_source values: 'nightly' | 'onboarding' | 'manual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_market_snapshots_user_id
  ON public.market_snapshots(user_id);
CREATE INDEX idx_market_snapshots_search_term
  ON public.market_snapshots(user_id, search_term);
CREATE INDEX idx_market_snapshots_captured_at
  ON public.market_snapshots(captured_at DESC);

ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own market snapshots"
  ON public.market_snapshots FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to market_snapshots"
  ON public.market_snapshots FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 2. competitor_alerts ────────────────────────────────────────────────────

CREATE TABLE public.competitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_term TEXT NOT NULL,
  competitor_listing_id TEXT NOT NULL,
  competitor_title TEXT,
  change_type TEXT NOT NULL,
  -- change_type values:
  -- 'price_change' | 'tags_updated' | 'title_updated'
  -- 'photos_added' | 'new_competitor' | 'competitor_removed'
  -- 'policy_added' | 'rank_change'
  before_value JSONB,
  after_value JSONB,
  rank_before INTEGER,
  rank_after INTEGER,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  surfaced_to_user BOOLEAN NOT NULL DEFAULT FALSE,
  surfaced_at TIMESTAMPTZ,
  dismissed_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  severity TEXT NOT NULL DEFAULT 'info',
  -- severity values: 'info' | 'warning' | 'critical'
  -- critical = competitor jumped 5+ positions or major change
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_competitor_alerts_user_id
  ON public.competitor_alerts(user_id);
CREATE INDEX idx_competitor_alerts_unsurfaced
  ON public.competitor_alerts(user_id, surfaced_to_user)
  WHERE surfaced_to_user = FALSE;
CREATE INDEX idx_competitor_alerts_detected_at
  ON public.competitor_alerts(detected_at DESC);

ALTER TABLE public.competitor_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own competitor alerts"
  ON public.competitor_alerts FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can update own competitor alerts"
  ON public.competitor_alerts FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to competitor_alerts"
  ON public.competitor_alerts FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 3. shop_intelligence ────────────────────────────────────────────────────

CREATE TABLE public.shop_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Score state
  overall_market_score INTEGER,
  score_delta_7d INTEGER DEFAULT 0,
  score_delta_30d INTEGER DEFAULT 0,
  score_trend TEXT DEFAULT 'stable',
  -- score_trend: 'improving' | 'declining' | 'stable'

  -- Fix action summary
  open_fix_count INTEGER DEFAULT 0,
  applied_fix_count INTEGER DEFAULT 0,
  tracked_fix_count INTEGER DEFAULT 0,
  resolved_fix_count INTEGER DEFAULT 0,
  superseded_fix_count INTEGER DEFAULT 0,
  total_points_available INTEGER DEFAULT 0,
  total_points_gained INTEGER DEFAULT 0,

  -- Top opportunities (pre-ranked for Echo)
  top_opportunities JSONB DEFAULT '[]',
  -- Array of fix_action summaries ranked by impact_points:
  -- [{ fix_action_id, listing_id, listing_title,
  --    dimension, issue, impact_points, suggested_fix }]

  -- Competitor intelligence summary
  active_competitor_alerts INTEGER DEFAULT 0,
  critical_competitor_alerts INTEGER DEFAULT 0,
  competitor_summary JSONB DEFAULT '{}',
  -- { alerts_count, top_moving_competitors[], last_scan_at }

  -- Shop health summary
  total_listings INTEGER DEFAULT 0,
  analyzed_listings INTEGER DEFAULT 0,
  listings_needing_attention INTEGER DEFAULT 0,
  avg_listing_score NUMERIC(5,2),

  -- Best and worst performers
  best_performing_listings JSONB DEFAULT '[]',
  worst_performing_listings JSONB DEFAULT '[]',
  -- Array: [{ listing_id, title, score, top_issue }]

  -- Activity context
  last_fix_applied_at TIMESTAMPTZ,
  last_fix_category TEXT,
  active_strategy TEXT DEFAULT 'echo',
  listings_analyzed_this_month INTEGER DEFAULT 0,

  -- Temporal markers
  last_graded_at TIMESTAMPTZ,
  last_competitor_scan_at TIMESTAMPTZ,
  next_scheduled_scan TIMESTAMPTZ,
  rebuilt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per user
  CONSTRAINT shop_intelligence_user_id_unique UNIQUE (user_id)
);

CREATE INDEX idx_shop_intelligence_user_id
  ON public.shop_intelligence(user_id);
CREATE INDEX idx_shop_intelligence_rebuilt_at
  ON public.shop_intelligence(rebuilt_at DESC);

CREATE OR REPLACE FUNCTION update_shop_intelligence_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shop_intelligence_updated_at
  BEFORE UPDATE ON public.shop_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION update_shop_intelligence_updated_at();

ALTER TABLE public.shop_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own shop intelligence"
  ON public.shop_intelligence FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to shop_intelligence"
  ON public.shop_intelligence FOR ALL
  USING (auth.role() = 'service_role');
