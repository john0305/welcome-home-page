
ALTER TABLE public.store_personalization
  ADD COLUMN IF NOT EXISTS etsy_shop_id text;

-- Backfill: attach each existing personalization row to the user's earliest connected shop.
UPDATE public.store_personalization sp
   SET etsy_shop_id = sub.etsy_shop_id
  FROM (
    SELECT DISTINCT ON (user_id) user_id, etsy_shop_id
      FROM public.stores
     ORDER BY user_id, connected_at ASC
  ) sub
 WHERE sp.user_id = sub.user_id
   AND sp.etsy_shop_id IS NULL;

-- For any leftover rows with no connected shop at all, drop the row — it can't be scoped.
DELETE FROM public.store_personalization WHERE etsy_shop_id IS NULL;

ALTER TABLE public.store_personalization
  ALTER COLUMN etsy_shop_id SET NOT NULL;

-- Swap primary key to (user_id, etsy_shop_id).
ALTER TABLE public.store_personalization
  DROP CONSTRAINT IF EXISTS store_personalization_pkey;

ALTER TABLE public.store_personalization
  ADD CONSTRAINT store_personalization_pkey PRIMARY KEY (user_id, etsy_shop_id);
