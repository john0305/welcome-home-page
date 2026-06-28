-- Extend fix_actions for 7-day resolution tracking.
-- Adds: resolved_at, score_delta, resolution_note columns.
-- Expands status CHECK to include 'tracking' and 'needs_attention'.

ALTER TABLE public.fix_actions
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS score_delta INTEGER,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;

-- Drop the existing inline CHECK and replace with expanded set.
-- PostgreSQL auto-names inline column CHECKs as <table>_<column>_check.
ALTER TABLE public.fix_actions
  DROP CONSTRAINT IF EXISTS fix_actions_status_check;

ALTER TABLE public.fix_actions
  ADD CONSTRAINT fix_actions_status_check
  CHECK (status IN (
    'pending',
    'applied',
    'edited_applied',
    'dismissed',
    'failed',
    'superseded',
    'tracking',
    'needs_attention'
  ));
