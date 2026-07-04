-- UX/product pass (2026-07-04): make AI-service failures visible to admins.
-- ai-dispatch now logs failed provider calls (zero tokens) with these fields,
-- so degraded AI service (rate limits, credit exhaustion, bad model config)
-- shows up in admin usage views instead of only in user bug reports.
ALTER TABLE public.ai_usage_events
  ADD COLUMN IF NOT EXISTS error_status integer,
  ADD COLUMN IF NOT EXISTS error_message text;

COMMENT ON COLUMN public.ai_usage_events.error_status IS
  'HTTP status returned by the AI provider when the call failed; NULL for successful calls.';

CREATE INDEX IF NOT EXISTS ai_usage_events_error_idx
  ON public.ai_usage_events (created_at DESC)
  WHERE error_status IS NOT NULL;
