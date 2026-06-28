CREATE TABLE public.store_health_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  score_overall INTEGER NOT NULL,
  score_exact NUMERIC(6,2) NOT NULL,
  sub_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_store_health_history_user_recent
  ON public.store_health_history (user_id, recorded_at DESC);

GRANT SELECT ON public.store_health_history TO authenticated;
GRANT ALL ON public.store_health_history TO service_role;

ALTER TABLE public.store_health_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own score history"
  ON public.store_health_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages all rows"
  ON public.store_health_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);