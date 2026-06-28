alter table public.listing_market_scores
  add column if not exists niche_avg_price numeric,
  add column if not exists missing_tags_detail jsonb;