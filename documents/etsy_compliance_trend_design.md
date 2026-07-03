# Etsy API Compliance — Trend Detection Design (Section 4 checkpoint)

Date: 2026-07-02. Researched before designing trend detection, per the brief's
hard checkpoint. Sources: [Etsy API Terms of Use](https://www.etsy.com/legal/api/),
[Etsy developer docs](https://developers.etsy.com/documentation/),
[Marketplace Insights help](https://help.etsy.com/hc/en-us/articles/35122361353239-How-Do-I-Use-Etsy-s-Marketplace-Insights-Tool).

## What the current API Terms say (key constraints)

1. **Analytics prohibition (the big one)**: applications may not use the Etsy
   API to "collect, scan, or otherwise request Etsy content for purposes of
   analytics, machine learning, training artificial intelligence models,
   licensing, or content removal, **unless expressly authorized in writing by
   Etsy**."
2. **Freshness/caching**: displayed listing content must be no more than
   **6 hours** staler than Etsy itself; other Etsy content no more than 24
   hours. Stored content may be kept no "longer than is reasonably necessary
   to provide service to your application's users."
3. **No scraping / no sidestepping the API**; OAuth required for private data.

## What this means for RadarIQ

**Defensible core** (seller's own data, explicit OAuth consent, service
provided *to that seller about their own shop*): syncing the seller's own
listings/stats and generating recommendations on them is the
service-to-the-user purpose the terms contemplate. This is the ground the
whole platform should stand on — and what the appeal narrative should
emphasize.

**⚠️ HIGH-RISK surface: `competitor-market-scan`** collects *other sellers'*
listings via keyword search and stores them in `competitor_snapshots` /
`market_snapshots` for competitive analytics. Under the current terms this is
squarely "collecting Etsy content for purposes of analytics" without written
authorization. With API access already under appeal, this feature is the
single most likely thing to sink it.

**Decision required (business call, flagged for owner — not made unilaterally
in this pass):** either (a) obtain written authorization from Etsy for
aggregate market analytics, or (b) feature-flag the competitor scan OFF before
resubmitting the appeal and sunset `competitor_snapshots`-derived UI. New work
in this pass does NOT add any new competitor scanning; the new photo benchmark
degrades gracefully to null if competitor data stops flowing.

**Marketplace Insights**: confirmed to be a Shop Manager UI feature only — not
exposed through Open API v3. It cannot be pulled in as first-party trend data.

**Freshness rule**: nightly sync means displayed listing data can be ~24h
stale, above the 6-hour line if strictly applied to seller dashboards. Noted
for the appeal conversation; a mid-day refresh tier or on-open revalidation
(Section 6's event-driven refresh) narrows this. Not treated as blocking for a
seller-facing tool showing the seller their own shop, but documented honestly.

## Trend detection as built (compliant-by-construction)

Only the seller's own opted-in data:

- **`traction_decline`** (inform): for each active listing with enough
  history, compare the last 14 days of the seller's own `listing_snapshots`
  views/favorites against the prior 14 days. A sustained drop (≥30% with a
  meaningful traffic floor) surfaces as an early-warning action with the real
  numbers in the rationale — catching drift before it shows up in sales.
- **`renewal_timing`** (inform): for listings approaching their renewal window
  (`ending_at` within 30 days), advise based on the listing's own traction
  trend: rising → renew now to ride the momentum; falling → fix
  title/tags/photos first so the renewal fee isn't spent re-upping a listing
  shoppers are currently passing over.

Both are computed in `nightly-action-scan` from `listing_snapshots` (the
seller's own shop history) and inserted as `fix_actions`, so they flow through
the exact same queue/priority/outcome-tracking machinery as everything else.

What was deliberately NOT built: category-trend detection sourced from
scanning other sellers' listings, "top performer" comparisons requiring fresh
competitor pulls, and anything needing Marketplace Insights (not API-exposed).
If Etsy grants written authorization for aggregate analytics, the existing
`market_snapshots` pipeline is the place to rebuild from.
