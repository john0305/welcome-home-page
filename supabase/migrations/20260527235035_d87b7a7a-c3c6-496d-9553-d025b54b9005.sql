CREATE TABLE public.etsy_credentials (
  user_id uuid PRIMARY KEY,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.etsy_credentials TO authenticated;
GRANT ALL ON public.etsy_credentials TO service_role;

ALTER TABLE public.etsy_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etsy_credentials_owner_select" ON public.etsy_credentials
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "etsy_credentials_owner_insert" ON public.etsy_credentials
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "etsy_credentials_owner_update" ON public.etsy_credentials
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "etsy_credentials_owner_delete" ON public.etsy_credentials
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "etsy_credentials_admin_all" ON public.etsy_credentials
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE TRIGGER update_etsy_credentials_updated_at
BEFORE UPDATE ON public.etsy_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();