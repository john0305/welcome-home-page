ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_affiliate boolean NOT NULL DEFAULT false;

CREATE POLICY "Platform admin can update all profiles"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());