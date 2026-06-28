ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS component_mapping jsonb,
  ADD COLUMN IF NOT EXISTS component_mapping_updated_at timestamp with time zone;

COMMENT ON COLUMN public.listings.component_mapping IS 'Persisted mapping of visible listing components to seller description terms for multi-component listings, used to prevent optimization rerun drift.';
COMMENT ON COLUMN public.listings.component_mapping_updated_at IS 'When component_mapping was last recorded or refreshed.';