
-- 1) oauth_states table for Etsy (and other) OAuth flows
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  code_verifier TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'etsy',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes')
);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- No client policies: only service role (used by edge functions) can read/write.
-- Authenticated users intentionally have no access.

CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON public.oauth_states (expires_at);

-- 2) Remove client-side UPDATE/INSERT on monthly_usage to prevent quota bypass.
-- The `consume_optimization` SECURITY DEFINER function performs increments
-- via service role, so users no longer need direct write access.
DROP POLICY IF EXISTS monthly_usage_owner_update ON public.monthly_usage;
DROP POLICY IF EXISTS monthly_usage_owner_insert ON public.monthly_usage;
