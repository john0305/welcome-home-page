# Sanity Check — pre-implementation audit findings

## 1. `match_key` scoping — FIXED
Stored two distinct fields:
- `match_value text` — bare matched substring (placeholder pattern, profane word, price string, etc.); used only for `match_key` hashing.
- `flagged_text text` — display string that may include ~40 chars of surrounding context.

`match_key = sha256(flag_type + ':' + field + ':' + lower(trim(match_value)))`, persisted on insert. Unique `(internal_listing_id, match_key)` enforces idempotent re-scan upserts. Editing unrelated copy in the same description does not change the placeholder's `match_value` → same `match_key` → no duplicate flag.

## 2. Price outlier threshold — FIXED, with TODO
Worked example: shop prices $3–$729, mean ≈ $70. A single $729 item in a 30-listing shop produces `std ≈ $130–$160`. Then `mean - 3*std ≈ -$400`, so the rule `price < mean - 3*std AND price < 5` **never fires** — too strict, not too lenient. The AND-chain was wrong.

Replaced with OR-chain (primary catch-all + secondary statistical heuristic):
- Primary: `price < 1.00` (catches $0.01 / $0.99 placeholder drafts)
- Secondary: `price <= max(2, mean * 0.05)` AND `price < 5` AND shop has ≥10 listings (only fires when shop has enough data to define "cheap-vs-typical" and the price is both an absolute cheap and a relative cheap)

`// TODO: revisit threshold after first batch of real scan results` added in edge function.

## 3. `scope: 'listing_ids'` — kept with comment
Kept the input field with a comment: reserved for "edit listing in RadarIQ → immediate re-scan" trigger; not wired yet.

## 4. `listings.updated_at` semantics — needs `content_updated_at`
`sync-listings/index.ts` upserts every active listing every sync run (line 392-396) with views/favorites/quantity. Postgres bumps `updated_at` via its standard `update_updated_at_column()` trigger pattern on any change. Therefore `updated_at` reflects ANY change including stats-only syncs, NOT just content edits.

**Fix path taken:** added `content_updated_at timestamptz` to `listings` plus a `BEFORE INSERT OR UPDATE` trigger that sets it only when `title`, `description`, `tags`, or `price` differ from OLD (or on INSERT). Nightly `scope: 'changed'` query compares `content_updated_at > coalesce(last_sanity_scanned_at, '-infinity')`.
