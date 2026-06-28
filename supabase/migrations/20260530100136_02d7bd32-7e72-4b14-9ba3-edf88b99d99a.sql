CREATE TABLE public.listing_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_id uuid NOT NULL,
  etsy_listing_id text NOT NULL,
  previous_ending_at timestamptz,
  new_ending_at timestamptz NOT NULL,
  renewal_cost numeric NOT NULL DEFAULT 0.20,
  detected_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.listing_renewals TO authenticated;
GRANT ALL ON public.listing_renewals TO service_role;

ALTER TABLE public.listing_renewals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "renewals_owner_select" ON public.listing_renewals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "renewals_admin_all" ON public.listing_renewals
  FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE INDEX idx_listing_renewals_user_listing ON public.listing_renewals(user_id, listing_id, detected_at DESC);
CREATE UNIQUE INDEX uniq_renewal_event ON public.listing_renewals(listing_id, new_ending_at);