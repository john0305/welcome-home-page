
-- Allow 'materials' as a selective rewrite type
ALTER TABLE public.optimizations DROP CONSTRAINT IF EXISTS optimizations_type_check;
ALTER TABLE public.optimizations
  ADD CONSTRAINT optimizations_type_check
  CHECK (type = ANY (ARRAY['title'::text, 'tags'::text, 'description'::text, 'materials'::text, 'full'::text]));

-- Photo analyses table
CREATE TABLE public.photo_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  overall_score INTEGER,
  analysis_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_photo_analyses_listing_created
  ON public.photo_analyses (listing_id, created_at DESC);
CREATE INDEX idx_photo_analyses_user
  ON public.photo_analyses (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_analyses TO authenticated;
GRANT ALL ON public.photo_analyses TO service_role;

ALTER TABLE public.photo_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own photo analyses"
  ON public.photo_analyses
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all photo analyses"
  ON public.photo_analyses
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
