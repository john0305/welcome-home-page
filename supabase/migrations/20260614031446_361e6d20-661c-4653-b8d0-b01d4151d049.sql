ALTER TABLE public.listing_sales_events
  ADD CONSTRAINT listing_sales_events_user_id_etsy_transaction_id_key
  UNIQUE (user_id, etsy_transaction_id);