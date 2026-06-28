ALTER TABLE public.beta_signups
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS plan_interest text,
  ADD COLUMN IF NOT EXISTS shop_info text;