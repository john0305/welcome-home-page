CREATE TABLE public.listing_user_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_type text NOT NULL CHECK (flag_type IN ('optimized_monitoring','optimized_confirmed','snoozed','deferred')),
  applied_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  measurement_window_end timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, user_id, flag_type)
);

CREATE INDEX listing_user_flags_listing_user_idx ON public.listing_user_flags(listing_id, user_id);
CREATE INDEX listing_user_flags_user_type_idx ON public.listing_user_flags(user_id, flag_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_user_flags TO authenticated;
GRANT ALL ON public.listing_user_flags TO service_role;

ALTER TABLE public.listing_user_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own listing flags"
  ON public.listing_user_flags
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER listing_user_flags_updated_at
  BEFORE UPDATE ON public.listing_user_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();