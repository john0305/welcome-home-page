
CREATE TABLE public.fix_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  etsy_shop_id TEXT,
  factor_key TEXT NOT NULL,
  dimension TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('auto','guided','inform')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','edited_applied','dismissed','failed','superseded')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  current_value JSONB,
  proposed_value JSONB,
  rationale TEXT,
  evidence JSONB,
  guided_payload JSONB,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('nightly_scan','echo','manual_grade','health_card','onboarding_scan','manual')),
  applied_at TIMESTAMPTZ,
  applied_value JSONB,
  etsy_response JSONB,
  failure_reason TEXT,
  superseded_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fix_actions TO authenticated;
GRANT ALL ON public.fix_actions TO service_role;

ALTER TABLE public.fix_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own fix actions"
  ON public.fix_actions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Dedup: one pending action per (user, listing-or-shop, factor). Listing-level
-- and shop-level (listing_id IS NULL) actions are de-duped independently.
CREATE UNIQUE INDEX fix_actions_pending_listing_dedup
  ON public.fix_actions (user_id, listing_id, factor_key)
  WHERE status = 'pending' AND listing_id IS NOT NULL;

CREATE UNIQUE INDEX fix_actions_pending_shop_dedup
  ON public.fix_actions (user_id, etsy_shop_id, factor_key)
  WHERE status = 'pending' AND listing_id IS NULL;

CREATE INDEX fix_actions_user_status_idx
  ON public.fix_actions (user_id, status, created_at DESC);

CREATE INDEX fix_actions_listing_idx
  ON public.fix_actions (listing_id) WHERE listing_id IS NOT NULL;

CREATE TRIGGER fix_actions_updated_at
  BEFORE UPDATE ON public.fix_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Daily summary rolled up by the nightly scanner, surfaced as the morning briefing.
CREATE TABLE public.daily_action_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_date DATE NOT NULL,
  scanned_listings INTEGER NOT NULL DEFAULT 0,
  actions_generated INTEGER NOT NULL DEFAULT 0,
  auto_applied INTEGER NOT NULL DEFAULT 0,
  awaiting_approval INTEGER NOT NULL DEFAULT 0,
  guided INTEGER NOT NULL DEFAULT 0,
  inform INTEGER NOT NULL DEFAULT 0,
  resolved_externally INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, scan_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_action_summaries TO authenticated;
GRANT ALL ON public.daily_action_summaries TO service_role;

ALTER TABLE public.daily_action_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own summaries"
  ON public.daily_action_summaries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER daily_action_summaries_updated_at
  BEFORE UPDATE ON public.daily_action_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-user opt-in allowlist for auto-apply. Default off for everything except
-- the safe set chosen during onboarding (tags + materials).
CREATE TABLE public.auto_apply_preferences (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  allowed_factors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_apply_preferences TO authenticated;
GRANT ALL ON public.auto_apply_preferences TO service_role;

ALTER TABLE public.auto_apply_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own auto-apply prefs"
  ON public.auto_apply_preferences FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER auto_apply_preferences_updated_at
  BEFORE UPDATE ON public.auto_apply_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
