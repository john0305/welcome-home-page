ALTER TABLE public.optimizations DROP CONSTRAINT IF EXISTS optimizations_type_check;
ALTER TABLE public.optimizations ADD CONSTRAINT optimizations_type_check
  CHECK (type = ANY (ARRAY['title'::text, 'tags'::text, 'description'::text, 'full'::text]));