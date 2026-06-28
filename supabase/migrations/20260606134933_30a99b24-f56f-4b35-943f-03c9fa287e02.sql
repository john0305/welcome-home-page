ALTER TABLE public.optimizations DROP CONSTRAINT IF EXISTS optimizations_status_check;
ALTER TABLE public.optimizations ADD CONSTRAINT optimizations_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'superseded'::text]));