ALTER TABLE public.optimizations
  ADD COLUMN IF NOT EXISTS latest_grade integer,
  ADD COLUMN IF NOT EXISTS latest_grade_at timestamptz;