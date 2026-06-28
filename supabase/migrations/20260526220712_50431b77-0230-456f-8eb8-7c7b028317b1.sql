
-- 1) Lock down monthly_usage writes from clients
CREATE POLICY "monthly_usage_no_client_insert"
ON public.monthly_usage
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "monthly_usage_no_client_update"
ON public.monthly_usage
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "monthly_usage_no_client_delete"
ON public.monthly_usage
FOR DELETE
TO authenticated, anon
USING (false);

-- 2) Defense-in-depth: prevent privileged column changes on user_profiles via RLS
CREATE OR REPLACE FUNCTION public.user_profile_privileged_unchanged(
  _id uuid,
  _tier text,
  _is_affiliate boolean,
  _invite_code text,
  _invite_code_redeemed_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = _id
        AND p.tier IS NOT DISTINCT FROM _tier
        AND p.is_affiliate IS NOT DISTINCT FROM _is_affiliate
        AND p.invite_code IS NOT DISTINCT FROM _invite_code
        AND p.invite_code_redeemed_at IS NOT DISTINCT FROM _invite_code_redeemed_at
    );
$$;

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

CREATE POLICY "Users can update own profile"
ON public.user_profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND public.user_profile_privileged_unchanged(
    id, tier, is_affiliate, invite_code, invite_code_redeemed_at
  )
);
