
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_settings_admin_all ON public.system_settings
  FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- Public read for signups_enabled so the signup form can check it without auth
CREATE POLICY system_settings_public_read ON public.system_settings
  FOR SELECT TO anon, authenticated
  USING (key = 'signups_enabled');

GRANT SELECT ON public.system_settings TO anon;

INSERT INTO public.system_settings(key, value) VALUES ('signups_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.beta_signups
  ADD COLUMN IF NOT EXISTS contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DROP POLICY IF EXISTS "No updates on beta signups" ON public.beta_signups;
DROP POLICY IF EXISTS "No deletes on beta signups" ON public.beta_signups;

CREATE POLICY beta_signups_admin_update ON public.beta_signups
  FOR UPDATE TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY beta_signups_admin_delete ON public.beta_signups
  FOR DELETE TO authenticated
  USING (is_platform_admin());
