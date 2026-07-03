-- Fix duplicate Wins entries (same headline shown twice on Performance page).
-- Root causes: (1) calculate-attribution upserts performance_attribution but
-- plain-INSERTs wins_feed, so every re-run re-emitted the same milestones;
-- (2) 'first_sale_wN' kinds produced identical window-less headlines for every
-- window. Dedupe existing rows, then enforce uniqueness going forward.

-- 1. Collapse window-suffixed first-sale kinds to a single 'first_sale' per listing,
--    keeping the earliest row.
DELETE FROM public.wins_feed a
USING public.wins_feed b
WHERE a.kind LIKE 'first_sale%'
  AND b.kind LIKE 'first_sale%'
  AND a.user_id = b.user_id
  AND a.listing_id IS NOT DISTINCT FROM b.listing_id
  AND (a.created_at > b.created_at OR (a.created_at = b.created_at AND a.id > b.id));

UPDATE public.wins_feed SET kind = 'first_sale' WHERE kind LIKE 'first_sale_w%';

-- 2. Remove re-run duplicates of the same milestone for the same attribution row,
--    keeping the earliest.
DELETE FROM public.wins_feed a
USING public.wins_feed b
WHERE a.attribution_id = b.attribution_id
  AND a.kind = b.kind
  AND (a.created_at > b.created_at OR (a.created_at = b.created_at AND a.id > b.id));

-- 3. Enforce idempotency: one milestone kind per attribution window.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wins_feed_attribution_kind
  ON public.wins_feed (attribution_id, kind);
