ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_seen_at ON public.user_profiles (last_seen_at DESC);