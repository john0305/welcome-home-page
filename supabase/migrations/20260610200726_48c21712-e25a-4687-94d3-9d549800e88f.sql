CREATE OR REPLACE FUNCTION public.recalculate_store_health()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.store_id IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.stores
  SET store_health_score = sub.avg_score,
      updated_at = now()
  FROM (
    SELECT ROUND(AVG(score))::int AS avg_score
    FROM public.listings
    WHERE store_id = NEW.store_id
      AND state = 'active'
      AND score IS NOT NULL
  ) sub
  WHERE public.stores.id = NEW.store_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listing_score_changed ON public.listings;
CREATE TRIGGER listing_score_changed
AFTER UPDATE OF score ON public.listings
FOR EACH ROW
WHEN (OLD.score IS DISTINCT FROM NEW.score)
EXECUTE FUNCTION public.recalculate_store_health();

-- Ensure realtime captures full row for the stores table
ALTER TABLE public.stores REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;

-- One-time backfill
UPDATE public.stores s
SET store_health_score = sub.avg_score
FROM (
  SELECT store_id, ROUND(AVG(score))::int AS avg_score
  FROM public.listings
  WHERE store_id IS NOT NULL
    AND state = 'active'
    AND score IS NOT NULL
  GROUP BY store_id
) sub
WHERE s.id = sub.store_id;