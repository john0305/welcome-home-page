ALTER TABLE public.beta_signups ADD COLUMN IF NOT EXISTS preferred_theme text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS preferred_theme text;