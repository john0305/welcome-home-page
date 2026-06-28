-- Allow the platform admin (admin@radariq.app) to read all user_profiles for the admin dashboard.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) = 'admin@radariq.app'
  );
$$;

CREATE POLICY "Platform admin can view all profiles"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (public.is_platform_admin());