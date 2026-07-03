-- Third-party data integrations (Section 10) — provider-agnostic storage
-- following the etsy_tokens pattern: OAuth tokens live server-side only and
-- are read exclusively inside edge functions. The client may see connection
-- STATUS (column grants below) but never token columns.
CREATE TABLE IF NOT EXISTS public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,                    -- e.g. 'google_analytics'
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scopes text[],
  external_account_id text,                  -- e.g. GA4 property id
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'connected',  -- connected | error | disconnected
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;

-- RLS limits rows to the owner; column grants keep token columns server-only.
CREATE POLICY "Users read own integration status"
  ON public.integration_connections FOR SELECT
  USING (auth.uid() = user_id);

REVOKE ALL ON public.integration_connections FROM authenticated;
GRANT SELECT (id, user_id, provider, external_account_id, metadata, status, created_at, updated_at)
  ON public.integration_connections TO authenticated;

-- Normalized daily metrics pulled from integrations; consumed by the insight
-- pipeline (never a separate silo).
CREATE TABLE IF NOT EXISTS public.integration_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  metric_date date NOT NULL,
  metrics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, metric_date)
);

ALTER TABLE public.integration_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own integration metrics"
  ON public.integration_metrics FOR SELECT
  USING (auth.uid() = user_id);
