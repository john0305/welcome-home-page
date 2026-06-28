
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS clarifying_questions jsonb,
  ADD COLUMN IF NOT EXISTS clarifying_answers jsonb,
  ADD COLUMN IF NOT EXISTS optimization_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decay_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decay_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_attention boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_listings_needs_attention
  ON public.listings(user_id, needs_attention) WHERE needs_attention = true;
