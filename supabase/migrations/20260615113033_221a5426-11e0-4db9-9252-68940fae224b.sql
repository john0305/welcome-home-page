
-- ─────────────────────────────────────────────────────────────────────────────
-- peer_rec_cache: 7-day cached peer-driven recommendations per listing
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.peer_rec_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  peer_count integer NOT NULL DEFAULT 0,
  top_peer_count integer NOT NULL DEFAULT 0,
  tag_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  material_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX peer_rec_cache_listing_uidx ON public.peer_rec_cache(listing_id);
CREATE INDEX peer_rec_cache_user_idx ON public.peer_rec_cache(user_id);
CREATE INDEX peer_rec_cache_expires_idx ON public.peer_rec_cache(expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.peer_rec_cache TO authenticated;
GRANT ALL ON public.peer_rec_cache TO service_role;

ALTER TABLE public.peer_rec_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own peer rec cache"
  ON public.peer_rec_cache FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own peer rec cache"
  ON public.peer_rec_cache FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own peer rec cache"
  ON public.peer_rec_cache FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own peer rec cache"
  ON public.peer_rec_cache FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_peer_rec_cache_updated_at
  BEFORE UPDATE ON public.peer_rec_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- peer_rec_applications: AI verdict on each peer rec used in an optimization
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.peer_rec_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  optimization_run_id uuid REFERENCES public.optimizations(id) ON DELETE SET NULL,
  peer_rec_category text,
  peer_rec_impact text CHECK (peer_rec_impact IN ('high','medium','low')),
  peer_rec_summary text NOT NULL,
  status text NOT NULL CHECK (status IN ('applied','rejected','partial')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX peer_rec_applications_listing_idx ON public.peer_rec_applications(listing_id);
CREATE INDEX peer_rec_applications_user_idx ON public.peer_rec_applications(user_id);
CREATE INDEX peer_rec_applications_run_idx ON public.peer_rec_applications(optimization_run_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.peer_rec_applications TO authenticated;
GRANT ALL ON public.peer_rec_applications TO service_role;

ALTER TABLE public.peer_rec_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own peer rec applications"
  ON public.peer_rec_applications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own peer rec applications"
  ON public.peer_rec_applications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own peer rec applications"
  ON public.peer_rec_applications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
