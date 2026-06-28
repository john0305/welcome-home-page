ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pending_price_id text,
  ADD COLUMN IF NOT EXISTS pending_tier text,
  ADD COLUMN IF NOT EXISTS pending_change_at timestamptz;