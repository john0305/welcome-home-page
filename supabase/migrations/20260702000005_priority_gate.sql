-- Server-side priority/confidence gate (Section 5).
-- Every fix_action gets a computed priority_score; only the top few
-- high-confidence, high-impact findings per day are flagged notify_worthy —
-- those may surface as proactive notifications. Everything else stays quiet
-- in the dashboard queue. Computed by _shared/priority-gate.ts at the end of
-- every nightly scan; the score also feeds queue ordering.
ALTER TABLE public.fix_actions
  ADD COLUMN IF NOT EXISTS priority_score integer,
  ADD COLUMN IF NOT EXISTS notify_worthy boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_fix_actions_notify
  ON public.fix_actions (user_id, notify_worthy, created_at DESC)
  WHERE status = 'pending';

COMMENT ON COLUMN public.fix_actions.priority_score IS
  '0-100; severity + expected impact + per-factor outcome history (ignored factor types decay, adopted ones gain)';
COMMENT ON COLUMN public.fix_actions.notify_worthy IS
  'Passed the proactive-notification gate (top <=3/day, score >=70). Everything else surfaces quietly in-dashboard.';
