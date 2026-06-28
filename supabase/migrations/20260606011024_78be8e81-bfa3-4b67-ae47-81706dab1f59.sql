
-- ============================================================================
-- Personal Workspace — schema additions
-- Mapping (for dev reference):
--   spec `seller_id`        -> `user_id` (auth.users)
--   spec `seller_daily_quotas` -> NEW table `personal_daily_quotas`
--   spec `grade_runs`            -> NEW table `grade_runs`
--   spec `grade_dimension_scores`-> NEW table `grade_dimension_scores`
--   spec `grade_feedback`        -> NEW table `grade_feedback`
--   spec `optimization_runs`     -> NEW table `personal_optimization_runs`
--                                   (existing `optimizations` is shop-only and untouched)
--   spec `category_benchmarks`   -> NEW table `category_benchmarks`
--   spec `feature_waitlist`      -> NEW table `feature_waitlist`
-- monthly_usage and optimizations are intentionally NOT modified.
-- ============================================================================

-- 1. personal_daily_quotas ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personal_daily_quotas (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  personal_grades_used integer NOT NULL DEFAULT 0,
  personal_optimizations_used integer NOT NULL DEFAULT 0,
  personal_tryons_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
GRANT SELECT ON public.personal_daily_quotas TO authenticated;
GRANT ALL ON public.personal_daily_quotas TO service_role;
ALTER TABLE public.personal_daily_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "personal_daily_quotas_owner_select" ON public.personal_daily_quotas
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "personal_daily_quotas_admin_all" ON public.personal_daily_quotas
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 2. grade_runs ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grade_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id text,
  listing_url text,
  usage_type text NOT NULL CHECK (usage_type IN ('shop','personal','competitor')),
  category text,
  subcategory text,
  plan_tier text NOT NULL,
  model_version text NOT NULL,
  overall_score integer,
  is_own_listing boolean NOT NULL DEFAULT false,
  listing_price_cents integer,
  input_title text,
  input_description text,
  input_tags text[],
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.grade_runs TO authenticated;
GRANT ALL ON public.grade_runs TO service_role;
ALTER TABLE public.grade_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grade_runs_owner_select" ON public.grade_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "grade_runs_owner_insert" ON public.grade_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "grade_runs_owner_update" ON public.grade_runs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "grade_runs_admin_all" ON public.grade_runs FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX IF NOT EXISTS idx_grade_runs_category ON public.grade_runs (category, subcategory, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grade_runs_user_usage ON public.grade_runs (user_id, usage_type, created_at DESC);

-- 3. grade_dimension_scores ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grade_dimension_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_run_id uuid NOT NULL REFERENCES public.grade_runs(id) ON DELETE CASCADE,
  dimension text NOT NULL CHECK (dimension IN ('title','tags','images','description','pricing')),
  score integer NOT NULL,
  flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggestions_shown jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.grade_dimension_scores TO authenticated;
GRANT ALL ON public.grade_dimension_scores TO service_role;
ALTER TABLE public.grade_dimension_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grade_dim_owner_select" ON public.grade_dimension_scores FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.grade_runs gr WHERE gr.id = grade_run_id AND gr.user_id = auth.uid()));
CREATE POLICY "grade_dim_owner_insert" ON public.grade_dimension_scores FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.grade_runs gr WHERE gr.id = grade_run_id AND gr.user_id = auth.uid()));
CREATE POLICY "grade_dim_admin_all" ON public.grade_dimension_scores FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX IF NOT EXISTS idx_grade_dim_run ON public.grade_dimension_scores (grade_run_id, dimension);

-- 4. grade_feedback -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grade_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_run_id uuid NOT NULL REFERENCES public.grade_runs(id) ON DELETE CASCADE,
  dimension text NOT NULL,
  suggestion_text text NOT NULL,
  action text NOT NULL CHECK (action IN ('applied','edited','ignored','dismissed')),
  applied_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.grade_feedback TO authenticated;
GRANT ALL ON public.grade_feedback TO service_role;
ALTER TABLE public.grade_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grade_feedback_owner_select" ON public.grade_feedback FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.grade_runs gr WHERE gr.id = grade_run_id AND gr.user_id = auth.uid()));
CREATE POLICY "grade_feedback_owner_insert" ON public.grade_feedback FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.grade_runs gr WHERE gr.id = grade_run_id AND gr.user_id = auth.uid()));
CREATE POLICY "grade_feedback_admin_all" ON public.grade_feedback FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 5. personal_optimization_runs ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.personal_optimization_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grade_run_id uuid REFERENCES public.grade_runs(id) ON DELETE SET NULL,
  optimization_type text NOT NULL CHECK (optimization_type IN ('title','tags','description','full')),
  usage_type text NOT NULL DEFAULT 'personal' CHECK (usage_type IN ('shop','personal')),
  input_text text NOT NULL,
  output_text text,
  action text CHECK (action IN ('applied','edited','ignored')),
  final_text text,
  category text,
  model_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.personal_optimization_runs TO authenticated;
GRANT ALL ON public.personal_optimization_runs TO service_role;
ALTER TABLE public.personal_optimization_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "personal_opt_owner_select" ON public.personal_optimization_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "personal_opt_owner_insert" ON public.personal_optimization_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "personal_opt_owner_update" ON public.personal_optimization_runs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "personal_opt_admin_all" ON public.personal_optimization_runs FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX IF NOT EXISTS idx_personal_opt_user ON public.personal_optimization_runs (user_id, usage_type, created_at DESC);
CREATE TRIGGER personal_opt_set_updated_at BEFORE UPDATE ON public.personal_optimization_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. category_benchmarks ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.category_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  subcategory text,
  snapshot_date date NOT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  avg_overall numeric,
  p25_overall integer,
  p50_overall integer,
  p75_overall integer,
  p90_overall integer,
  avg_by_dimension jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.category_benchmarks TO authenticated, anon;
GRANT ALL ON public.category_benchmarks TO service_role;
ALTER TABLE public.category_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "category_benchmarks_public_read" ON public.category_benchmarks FOR SELECT USING (true);
CREATE POLICY "category_benchmarks_admin_all" ON public.category_benchmarks FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX IF NOT EXISTS idx_category_benchmarks_cat ON public.category_benchmarks (category, subcategory, snapshot_date DESC);

-- 7. feature_waitlist ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature_key)
);
GRANT SELECT, INSERT ON public.feature_waitlist TO authenticated;
GRANT ALL ON public.feature_waitlist TO service_role;
ALTER TABLE public.feature_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_waitlist_owner_select" ON public.feature_waitlist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "feature_waitlist_owner_insert" ON public.feature_waitlist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "feature_waitlist_admin_all" ON public.feature_waitlist FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 8. RPC: consume_personal_quota ---------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_personal_quota(_user_id uuid, _kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier text;
  _today date := (now() AT TIME ZONE 'utc')::date;
  _used int;
  _limit int;
  _col text;
BEGIN
  IF _kind NOT IN ('grade','optimization','tryon') THEN
    RAISE EXCEPTION 'invalid kind: %', _kind;
  END IF;

  SELECT tier INTO _tier FROM public.user_profiles WHERE id = _user_id;
  _tier := COALESCE(_tier, 'free');

  -- Per-plan caps. tryon is locked for everyone for now (limit 0).
  IF _kind = 'grade' THEN
    _limit := CASE _tier
      WHEN 'starter' THEN 5
      WHEN 'pro' THEN 15
      WHEN 'agency' THEN 40
      WHEN 'admin' THEN 9999
      ELSE 0
    END;
    _col := 'personal_grades_used';
  ELSIF _kind = 'optimization' THEN
    _limit := CASE _tier
      WHEN 'starter' THEN 5
      WHEN 'pro' THEN 15
      WHEN 'agency' THEN 40
      WHEN 'admin' THEN 9999
      ELSE 0
    END;
    _col := 'personal_optimizations_used';
  ELSE
    _limit := 0; -- try-on locked for all tiers right now
    _col := 'personal_tryons_used';
  END IF;

  INSERT INTO public.personal_daily_quotas(user_id, date)
    VALUES (_user_id, _today)
    ON CONFLICT (user_id, date) DO NOTHING;

  EXECUTE format(
    'SELECT %I FROM public.personal_daily_quotas WHERE user_id = $1 AND date = $2 FOR UPDATE',
    _col
  ) INTO _used USING _user_id, _today;

  IF _used >= _limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', _used, 'limit', _limit, 'tier', _tier, 'kind', _kind);
  END IF;

  EXECUTE format(
    'UPDATE public.personal_daily_quotas SET %I = %I + 1, updated_at = now() WHERE user_id = $1 AND date = $2',
    _col, _col
  ) USING _user_id, _today;

  RETURN jsonb_build_object('allowed', true, 'used', _used + 1, 'limit', _limit, 'tier', _tier, 'kind', _kind);
END;
$$;
