
-- Per-call AI token usage log. One row per chatCompletion / batch result.
CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  task_key text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_input_tokens integer NOT NULL DEFAULT 0,
  cache_creation_input_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer GENERATED ALWAYS AS (
    coalesce(input_tokens,0) + coalesce(output_tokens,0)
    + coalesce(cache_read_input_tokens,0) + coalesce(cache_creation_input_tokens,0)
  ) STORED,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_events_user_created_idx ON public.ai_usage_events (user_id, created_at DESC);
CREATE INDEX ai_usage_events_created_idx ON public.ai_usage_events (created_at DESC);
CREATE INDEX ai_usage_events_model_idx ON public.ai_usage_events (model, created_at DESC);

GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_events_admin_all
  ON public.ai_usage_events FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY ai_usage_events_owner_select
  ON public.ai_usage_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
