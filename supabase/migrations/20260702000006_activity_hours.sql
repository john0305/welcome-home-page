-- Hour-of-day login histogram per user (UTC hours 0-23 → session-start counts).
-- Written once per session start by the client; read by predictive-refresh to
-- pre-warm insights shortly before each seller's usual login window
-- (Section 6). Prediction failure is harmless: the fixed nightly schedule is
-- always the safety net.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS activity_hours jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_profiles.activity_hours IS
  'UTC hour → session-start count histogram; feeds predictive insight refresh';
