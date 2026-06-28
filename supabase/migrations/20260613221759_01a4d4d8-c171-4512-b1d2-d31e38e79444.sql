
-- Wire the existing recalculate_store_health() function as a trigger so
-- stores.store_health_score stays in sync after any listing-level change
-- (optimization apply, re-grade, activation/deactivation).
DROP TRIGGER IF EXISTS trg_recalc_store_health ON public.listings;

CREATE TRIGGER trg_recalc_store_health
AFTER INSERT OR UPDATE OF score, state ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_store_health();

-- Backfill: recompute current store health once for every store that has
-- active scored listings so the new value lands immediately rather than
-- waiting for the next listing edit.
UPDATE public.stores s
SET store_health_score = sub.avg_score,
    updated_at = now()
FROM (
  SELECT store_id, ROUND(AVG(score))::int AS avg_score
  FROM public.listings
  WHERE state = 'active' AND score IS NOT NULL AND store_id IS NOT NULL
  GROUP BY store_id
) sub
WHERE s.id = sub.store_id;
