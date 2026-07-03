-- Capture Etsy's own listing-classification fields (previously ignored by sync).
-- These make seller/listing-type detection largely deterministic:
--   listing_type: 'physical' | 'download' | 'both'  → digital-download shops
--   when_made:    'made_to_order' | vintage ranges   → made-to-order / vintage
--   who_made:     'i_did' | 'someone_else' | 'collective'
--   is_supply:    craft supplies vs finished goods
-- Plus signals for personalization/production patterns used by recommendations.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS listing_type text,
  ADD COLUMN IF NOT EXISTS who_made text,
  ADD COLUMN IF NOT EXISTS when_made text,
  ADD COLUMN IF NOT EXISTS is_supply boolean,
  ADD COLUMN IF NOT EXISTS taxonomy_id bigint,
  ADD COLUMN IF NOT EXISTS shop_section_id bigint,
  ADD COLUMN IF NOT EXISTS processing_min integer,
  ADD COLUMN IF NOT EXISTS processing_max integer,
  ADD COLUMN IF NOT EXISTS has_variations boolean,
  ADD COLUMN IF NOT EXISTS is_personalizable boolean;

COMMENT ON COLUMN public.listings.listing_type IS 'Etsy listing type: physical | download | both';
COMMENT ON COLUMN public.listings.when_made IS 'Etsy when_made value; made_to_order and vintage ranges drive shop-type branching';
