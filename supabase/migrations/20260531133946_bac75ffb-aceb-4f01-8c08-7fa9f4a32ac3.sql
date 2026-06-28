-- 1. Model routing config table
CREATE TABLE public.ai_model_config (
  task_key text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('gateway','anthropic')),
  model text NOT NULL,
  batch_enabled boolean NOT NULL DEFAULT false,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, UPDATE ON public.ai_model_config TO authenticated;
GRANT ALL ON public.ai_model_config TO service_role;

ALTER TABLE public.ai_model_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_model_config_admin_select ON public.ai_model_config
  FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY ai_model_config_admin_update ON public.ai_model_config
  FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE TRIGGER trg_ai_model_config_updated
  BEFORE UPDATE ON public.ai_model_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed defaults
INSERT INTO public.ai_model_config (task_key, provider, model, batch_enabled, notes) VALUES
  ('listing_grading',  'gateway',   'google/gemini-2.5-flash', false, 'High volume, cost sensitive, structured output'),
  ('tag_generation',   'gateway',   'google/gemini-2.5-flash', false, 'Pattern task, speed matters'),
  ('bulk_grading',     'gateway',   'google/gemini-2.5-flash', false, 'Batches of 3-5, cost compounds'),
  ('listing_rewrite',  'anthropic', 'claude-sonnet-4-6',       false, 'Brand voice, nuance, instruction following'),
  ('echo_chat',        'anthropic', 'claude-sonnet-4-6',       false, 'Reasoning, conversation quality, context retention'),
  ('nightly_queue',    'anthropic', 'claude-haiku-4-5',        true,  'Light reasoning, cheaper, batch-eligible'),
  ('admin_echo',       'anthropic', 'claude-sonnet-4-6',       false, 'Complex platform reasoning');

-- 3. Batch tracking columns on optimizations
ALTER TABLE public.optimizations
  ADD COLUMN IF NOT EXISTS anthropic_batch_id text,
  ADD COLUMN IF NOT EXISTS anthropic_batch_status text;

CREATE INDEX IF NOT EXISTS idx_optimizations_batch_id
  ON public.optimizations(anthropic_batch_id)
  WHERE anthropic_batch_id IS NOT NULL;