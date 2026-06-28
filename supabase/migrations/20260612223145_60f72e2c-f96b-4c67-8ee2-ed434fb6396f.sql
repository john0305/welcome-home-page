
-- ─── 1. market_snapshots ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_term TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result_count INTEGER NOT NULL DEFAULT 0,
  listings JSONB NOT NULL DEFAULT '[]',
  scan_source TEXT NOT NULL DEFAULT 'nightly',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_user_id ON public.market_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_search_term ON public.market_snapshots(user_id, search_term);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_captured_at ON public.market_snapshots(captured_at DESC);

GRANT SELECT ON public.market_snapshots TO authenticated;
GRANT ALL ON public.market_snapshots TO service_role;

ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own market snapshots"
  ON public.market_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to market_snapshots"
  ON public.market_snapshots FOR ALL USING (auth.role() = 'service_role');

-- ─── 2. competitor_alerts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.competitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_term TEXT NOT NULL,
  competitor_listing_id TEXT NOT NULL,
  competitor_title TEXT,
  change_type TEXT NOT NULL,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_user_id ON public.competitor_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_unsurfaced ON public.competitor_alerts(user_id, surfaced_to_user) WHERE surfaced_to_user = FALSE;
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_detected_at ON public.competitor_alerts(detected_at DESC);

GRANT SELECT, UPDATE ON public.competitor_alerts TO authenticated;
GRANT ALL ON public.competitor_alerts TO service_role;

ALTER TABLE public.competitor_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own competitor alerts"
  ON public.competitor_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own competitor alerts"
  ON public.competitor_alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to competitor_alerts"
  ON public.competitor_alerts FOR ALL USING (auth.role() = 'service_role');

-- ─── 3. shop_intelligence ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shop_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  overall_market_score INTEGER,
  score_delta_7d INTEGER DEFAULT 0,
  score_delta_30d INTEGER DEFAULT 0,
  score_trend TEXT DEFAULT 'stable',
  open_fix_count INTEGER DEFAULT 0,
  applied_fix_count INTEGER DEFAULT 0,
  tracked_fix_count INTEGER DEFAULT 0,
  resolved_fix_count INTEGER DEFAULT 0,
  superseded_fix_count INTEGER DEFAULT 0,
  total_points_available INTEGER DEFAULT 0,
  total_points_gained INTEGER DEFAULT 0,
  top_opportunities JSONB DEFAULT '[]',
  active_competitor_alerts INTEGER DEFAULT 0,
  critical_competitor_alerts INTEGER DEFAULT 0,
  competitor_summary JSONB DEFAULT '{}',
  total_listings INTEGER DEFAULT 0,
  analyzed_listings INTEGER DEFAULT 0,
  listings_needing_attention INTEGER DEFAULT 0,
  avg_listing_score NUMERIC(5,2),
  best_performing_listings JSONB DEFAULT '[]',
  worst_performing_listings JSONB DEFAULT '[]',
  last_fix_applied_at TIMESTAMPTZ,
  last_fix_category TEXT,
  active_strategy TEXT DEFAULT 'echo',
  listings_analyzed_this_month INTEGER DEFAULT 0,
  last_graded_at TIMESTAMPTZ,
  last_competitor_scan_at TIMESTAMPTZ,
  next_scheduled_scan TIMESTAMPTZ,
  rebuilt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shop_intelligence_user_id_unique UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_shop_intelligence_user_id ON public.shop_intelligence(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_intelligence_rebuilt_at ON public.shop_intelligence(rebuilt_at DESC);

GRANT SELECT ON public.shop_intelligence TO authenticated;
GRANT ALL ON public.shop_intelligence TO service_role;

ALTER TABLE public.shop_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own shop intelligence"
  ON public.shop_intelligence FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to shop_intelligence"
  ON public.shop_intelligence FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER shop_intelligence_updated_at
  BEFORE UPDATE ON public.shop_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 4. fix_actions extensions ───────────────────────────────────────────────
ALTER TABLE public.fix_actions
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS score_delta INTEGER,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS tracking_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS score_at_application INTEGER;

ALTER TABLE public.fix_actions DROP CONSTRAINT IF EXISTS fix_actions_status_check;
ALTER TABLE public.fix_actions
  ADD CONSTRAINT fix_actions_status_check
  CHECK (status IN (
    'pending','applied','edited_applied','dismissed','failed',
    'superseded','tracking','needs_attention','resolved'
  ));
