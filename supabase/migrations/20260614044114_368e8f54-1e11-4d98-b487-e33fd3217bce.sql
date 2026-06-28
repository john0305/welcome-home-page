ALTER TABLE public.competitor_snapshots
  ADD COLUMN IF NOT EXISTS user_id uuid;

DROP POLICY IF EXISTS "competitor_snapshots_authenticated_read" ON public.competitor_snapshots;
DROP POLICY IF EXISTS "competitor_snapshots_admin_all" ON public.competitor_snapshots;

CREATE POLICY "Users can read own competitor snapshots"
  ON public.competitor_snapshots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_platform_admin());

CREATE POLICY "Admins can manage competitor snapshots"
  ON public.competitor_snapshots
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_user_cluster
  ON public.competitor_snapshots(user_id, keyword_cluster, captured_at DESC);