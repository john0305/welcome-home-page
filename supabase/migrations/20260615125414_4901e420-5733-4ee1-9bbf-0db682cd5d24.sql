
-- optimization_feedback: structured capture of approve/reject/edit signals
CREATE TABLE public.optimization_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  shop_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  optimization_run_id UUID REFERENCES public.optimizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('rejected', 'edited_after_approval', 'approved_as_is')),
  reason_category TEXT,
  reason_text TEXT,
  diff_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX optimization_feedback_user_idx ON public.optimization_feedback (user_id, created_at DESC);
CREATE INDEX optimization_feedback_shop_idx ON public.optimization_feedback (shop_id, created_at DESC);
CREATE INDEX optimization_feedback_listing_idx ON public.optimization_feedback (listing_id, created_at DESC);
CREATE INDEX optimization_feedback_run_idx ON public.optimization_feedback (optimization_run_id);

GRANT SELECT, INSERT ON public.optimization_feedback TO authenticated;
GRANT ALL ON public.optimization_feedback TO service_role;

ALTER TABLE public.optimization_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "optimization_feedback_owner_select"
  ON public.optimization_feedback FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "optimization_feedback_owner_insert"
  ON public.optimization_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "optimization_feedback_admin_all"
  ON public.optimization_feedback FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- shop_preferences: per-shop learned-preferences placeholder (Phase 2 populates)
CREATE TABLE public.shop_preferences (
  shop_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learned_preferences JSONB,
  last_synthesized_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX shop_preferences_user_idx ON public.shop_preferences (user_id);

GRANT SELECT ON public.shop_preferences TO authenticated;
GRANT ALL ON public.shop_preferences TO service_role;

ALTER TABLE public.shop_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_preferences_owner_select"
  ON public.shop_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "shop_preferences_admin_all"
  ON public.shop_preferences FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER shop_preferences_updated_at
  BEFORE UPDATE ON public.shop_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
