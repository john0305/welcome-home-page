
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS shipping_price_usd numeric,
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS listings_store_id_idx ON public.listings(store_id);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS review_count integer,
  ADD COLUMN IF NOT EXISTS review_avg numeric,
  ADD COLUMN IF NOT EXISTS has_shop_icon boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_banner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_policy text,
  ADD COLUMN IF NOT EXISTS shipping_policy text;

ALTER TABLE public.etsy_tokens
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Backfill store_id on existing listings by matching user_id to a unique store.
UPDATE public.listings l
  SET store_id = s.id
  FROM public.stores s
  WHERE l.store_id IS NULL
    AND l.user_id = s.user_id;
