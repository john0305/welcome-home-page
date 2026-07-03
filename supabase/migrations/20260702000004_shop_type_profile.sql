-- Persist detected shop type as a first-class shop attribute (Section 9).
-- Detection is computed at the end of each sync (see _shared/shop-type.ts);
-- the seller can confirm or correct it, and corrections are logged as
-- training signal for improving detection globally.
ALTER TABLE public.user_niche_profiles
  ADD COLUMN IF NOT EXISTS shop_type text,
  ADD COLUMN IF NOT EXISTS shop_type_confidence numeric,
  ADD COLUMN IF NOT EXISTS shop_type_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS shop_type_override text,
  ADD COLUMN IF NOT EXISTS shop_type_confirmed_at timestamptz;

COMMENT ON COLUMN public.user_niche_profiles.shop_type IS
  'Detected seller model: digital | made_to_order | vintage | supplies | personalized | inventory | one_of_a_kind';
COMMENT ON COLUMN public.user_niche_profiles.shop_type_override IS
  'Seller-corrected type; when set, takes precedence over shop_type everywhere';

-- Correction log: every user confirm/correct event, kept as training signal.
CREATE TABLE IF NOT EXISTS public.shop_type_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  detected_type text NOT NULL,
  detected_confidence numeric,
  corrected_type text NOT NULL,          -- equals detected_type on a "confirm"
  detection_breakdown jsonb,             -- listing-kind counts at detection time
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_type_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own shop type corrections"
  ON public.shop_type_corrections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own shop type corrections"
  ON public.shop_type_corrections FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
