# Etsy API Data Utilization Audit (Section 8 deliverable)

Date: 2026-07-02. Compares what Etsy Open API v3 exposes against what RadarIQ
ingests (`sync-listings`, `snapshot-performance`, `competitor-market-scan`).

## Currently ingested (before this pass)

Per listing: title, description, tags, price, quantity, state, views,
num_favorers, ending_timestamp, images (count/urls/rank), videos (count),
shipping profile primary cost, materials. Per shop: vacation state, policies
(return/shipping presence), reviews (star ratings), banner/icon presence.

## Wired in NOW (this pass)

Ranked by value-per-effort; all come free on the same listing responses the
sync already fetches — no extra API calls, no new scopes:

1. **`listing_type`** ('physical' | 'download' | 'both') — single highest-value
   unused field. Deterministically identifies digital-download listings, which
   changes what photo/shipping/processing advice even makes sense (Section 9).
2. **`when_made`** ('made_to_order', vintage year-ranges, etc.) — deterministic
   made-to-order and vintage detection; branches photo guidance (Section 3).
3. **`is_supply`** — supplies/craft-materials sellers (different search intent).
4. **`who_made`** — handmade vs. reseller vs. collective; POD signal combined
   with `when_made=made_to_order` + `who_made=someone_else`.
5. **`processing_min`/`processing_max`** — production-batch patterns; feeds
   restock-timing advice and made-to-order confirmation.
6. **`taxonomy_id`** — Etsy's own category id; better benchmarking joins than
   inferred niches alone.
7. **`shop_section_id`** — shop organization signal; "unsectioned listings"
   is a plausible future fix-action.
8. **`has_variations`**, **`is_personalizable`** — merchandising depth signals
   for recommendations ("similar shops offer personalization").

Storage: new columns on `listings`
(migration `20260702000003_listing_type_fields.sql`), captured in
`sync-listings` upsert.

## Deferred (ranked, with reasoning)

1. **Review TEXT mining** (`getReviewsByShop` returns review text; only star
   ratings are used today). High value — recurring-theme extraction could feed
   recommendations directly ("3 recent reviews mention slow shipping").
   Deferred: needs an AI extraction pipeline + storage design; candidate for
   the next pass. No new scopes needed.
2. **Transactions/receipts** (actual order line-items) — would upgrade sales
   attribution from snapshot deltas to real order data. Deferred: requires the
   `transactions_r` OAuth scope (re-consent from every connected shop) and the
   Etsy app is mid-appeal — do not touch scopes right now.
3. **Inventory/offerings detail** (SKUs, per-variation price/quantity) — could
   power price-test suggestions per variation. Deferred: large schema surface,
   low current UI demand.
4. **Shop sections list** (`getShopSections` names) — pairs with
   `shop_section_id` for "organize your shop" advice. Cheap; do when a concrete
   fix-action needs the names.
5. **Production partners** — POD-detection corroboration. Marginal on its own.
6. **Translations** — non-English listing optimization. Out of scope until
   there's a non-English user base.
7. **Shop announcement / sale_message / digital_sale_message** — freshness
   signals ("announcement unchanged for 8 months"). Cheap, low impact; fold
   into a future shop-level factor batch.

## Notes

- Historical trending: `listing_snapshots` already retains daily history; the
  gap was breadth of fields, not retention.
- `views`/`num_favorers` reliability quirk (shop endpoint omits them; batch
  endpoint returns them) is already handled in `sync-listings` with
  max(prior, incoming) guards.
