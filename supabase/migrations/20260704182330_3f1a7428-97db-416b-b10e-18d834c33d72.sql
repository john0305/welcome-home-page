ALTER TABLE public.ai_usage_events
  ADD COLUMN IF NOT EXISTS error_status integer,
  ADD COLUMN IF NOT EXISTS error_message text;

COMMENT ON COLUMN public.ai_usage_events.error_status IS
  'HTTP status returned by the AI provider when the call failed; NULL for successful calls.';

CREATE INDEX IF NOT EXISTS ai_usage_events_error_idx
  ON public.ai_usage_events (created_at DESC)
  WHERE error_status IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.trend_lifecycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_id uuid,
  fix_action_id uuid,
  review_action_id uuid,
  version_id uuid,
  trend_key text NOT NULL,
  label text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  expected_end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  resurfaced_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trend_lifecycles_user_status_idx ON public.trend_lifecycles (user_id, status);
CREATE INDEX IF NOT EXISTS trend_lifecycles_due_idx ON public.trend_lifecycles (expected_end_at) WHERE status = 'active';

GRANT SELECT, UPDATE ON public.trend_lifecycles TO authenticated;
GRANT ALL ON public.trend_lifecycles TO service_role;

ALTER TABLE public.trend_lifecycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trend_lifecycles_owner_select ON public.trend_lifecycles;
CREATE POLICY trend_lifecycles_owner_select ON public.trend_lifecycles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS trend_lifecycles_owner_update ON public.trend_lifecycles;
CREATE POLICY trend_lifecycles_owner_update ON public.trend_lifecycles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);