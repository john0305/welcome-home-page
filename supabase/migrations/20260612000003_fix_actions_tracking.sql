-- Extend fix_actions for per-apply tracking baseline.
-- Adds: tracking_started_at, score_at_application columns.

ALTER TABLE public.fix_actions
  ADD COLUMN IF NOT EXISTS tracking_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS score_at_application INTEGER;
