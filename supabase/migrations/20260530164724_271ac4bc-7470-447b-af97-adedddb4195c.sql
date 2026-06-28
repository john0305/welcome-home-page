
CREATE TABLE public.sync_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL DEFAULT 'pending',
  etsy_updated_max timestamptz,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_rate_limits_user_time ON public.sync_rate_limits (user_id, started_at DESC);

GRANT SELECT ON public.sync_rate_limits TO authenticated;
GRANT ALL ON public.sync_rate_limits TO service_role;

ALTER TABLE public.sync_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_rate_limits_owner_select
ON public.sync_rate_limits FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY sync_rate_limits_admin_all
ON public.sync_rate_limits FOR ALL TO authenticated
USING (is_platform_admin()) WITH CHECK (is_platform_admin());
