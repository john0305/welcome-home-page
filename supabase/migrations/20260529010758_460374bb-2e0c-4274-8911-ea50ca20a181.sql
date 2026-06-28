-- 1. listing_versions: original snapshot before AI changes
CREATE TABLE public.listing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  user_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'ai',
  reason text,
  title text,
  description text,
  tags text[] NOT NULL DEFAULT '{}',
  materials text[] NOT NULL DEFAULT '{}',
  price numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.listing_versions TO authenticated;
GRANT ALL ON public.listing_versions TO service_role;

ALTER TABLE public.listing_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY listing_versions_owner_select ON public.listing_versions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY listing_versions_owner_insert ON public.listing_versions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY listing_versions_owner_update ON public.listing_versions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY listing_versions_admin_all ON public.listing_versions
  FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE INDEX idx_listing_versions_listing ON public.listing_versions(listing_id, created_at DESC);

-- 2. Add materials column to listings if missing
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS materials text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

-- 3. Extend optimizations to support full multi-field optimization records
ALTER TABLE public.optimizations
  ADD COLUMN IF NOT EXISTS optimized_title text,
  ADD COLUMN IF NOT EXISTS optimized_description text,
  ADD COLUMN IF NOT EXISTS optimized_tags text[],
  ADD COLUMN IF NOT EXISTS optimized_materials text[],
  ADD COLUMN IF NOT EXISTS original_title text,
  ADD COLUMN IF NOT EXISTS original_description text,
  ADD COLUMN IF NOT EXISTS original_tags text[],
  ADD COLUMN IF NOT EXISTS original_materials text[],
  ADD COLUMN IF NOT EXISTS original_grade int,
  ADD COLUMN IF NOT EXISTS new_grade int,
  ADD COLUMN IF NOT EXISTS grade_improvement int,
  ADD COLUMN IF NOT EXISTS model_used text,
  ADD COLUMN IF NOT EXISTS version_id uuid REFERENCES public.listing_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS reject_reason text,
  ADD COLUMN IF NOT EXISTS validation_warnings jsonb;

-- Make legacy single-field columns nullable for new multi-field records
ALTER TABLE public.optimizations ALTER COLUMN type DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_optimizations_user_status ON public.optimizations(user_id, status, created_at DESC);