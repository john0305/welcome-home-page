-- Trend & seasonal lifecycle tracking (UX pass 2026-07-04, Section 5).
-- When a trend/seasonal fix is applied, we record it here with an expected
-- relevance window. When the window closes, nightly-action-scan creates a
-- "trend_expiry_review" fix_action asking the seller to revert / refresh /
-- keep — closing the suggest → apply → track → resurface loop.
CREATE TABLE public.trend_lifecycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_id uuid,
  -- the fix_action whose application started this lifecycle
  fix_action_id uuid,
  -- the resurfaced check-in fix_action (set when status -> awaiting_review)
  review_action_id uuid,
  -- pre-fix listing_versions snapshot so "Revert" is one tap
  version_id uuid,
  trend_key text NOT NULL,
  label text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  expected_end_at timestamptz NOT NULL,
  -- active | awaiting_review | reverted | kept | refreshed
  status text NOT NULL DEFAULT 'active',
  resurfaced_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trend_lifecycles_user_status_idx ON public.trend_lifecycles (user_id, status);
CREATE INDEX trend_lifecycles_due_idx ON public.trend_lifecycles (expected_end_at) WHERE status = 'active';

GRANT SELECT, UPDATE ON public.trend_lifecycles TO authenticated;
GRANT ALL ON public.trend_lifecycles TO service_role;

ALTER TABLE public.trend_lifecycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY trend_lifecycles_owner_select ON public.trend_lifecycles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Owner may resolve their own check-ins (kept / reverted / refreshed) from the UI.
CREATE POLICY trend_lifecycles_owner_update ON public.trend_lifecycles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
