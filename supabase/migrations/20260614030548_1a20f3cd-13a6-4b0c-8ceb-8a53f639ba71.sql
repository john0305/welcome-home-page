CREATE TABLE IF NOT EXISTS public.order_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  etsy_shop_id text,
  etsy_receipt_id text NOT NULL,
  etsy_transaction_id text NOT NULL,
  etsy_listing_id text,
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  title text,
  thumbnail_url text,
  sold_on date NOT NULL,
  units integer NOT NULL DEFAULT 1,
  unit_price numeric,
  currency_code text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, etsy_transaction_id)
);

GRANT SELECT ON public.order_line_items TO authenticated;
GRANT ALL ON public.order_line_items TO service_role;

ALTER TABLE public.order_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_line_items_owner_select"
  ON public.order_line_items
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "order_line_items_service_all"
  ON public.order_line_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_oli_user_sold_on
  ON public.order_line_items(user_id, sold_on DESC);

CREATE INDEX IF NOT EXISTS idx_oli_listing
  ON public.order_line_items(listing_id)
  WHERE listing_id IS NOT NULL;

CREATE TRIGGER update_order_line_items_updated_at
  BEFORE UPDATE ON public.order_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();