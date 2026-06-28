# RadarIQ — Full System Audit

**Date:** 2026-06-06
**Auditor:** Claude Code (Sonnet 4.6)
**Scope:** Full codebase review — security, architecture, data layer, performance, code quality, and feature completeness

---

## Executive Summary

RadarIQ is a well-structured Etsy seller intelligence platform built on React 18 + Vite + Supabase (Lovable Cloud). The codebase is clean and intentional. The most critical issues are in security configuration: nearly every edge function has JWT verification disabled, `.env` is not gitignored (live anon key committed), and CORS in backend functions uses a wildcard fallback. Architecture has one significant inconsistency — TanStack Query is installed but mostly unused, leaving AppContext as a sprawling data layer mixing concerns. Several performance patterns also need attention for shops with 500+ listings.

**Risk levels used:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## 1. Security

### 🔴 `.env` is not gitignored — live credentials committed

**File:** `.gitignore`

The `.gitignore` only excludes `*.local` files, not `.env`. The committed `.env` file contains the live Supabase project URL and anon/publishable key. While the anon key is public-facing by design, committing it publicly leaks the Supabase project ref (`brqkcbdbsciwfmnipzbx`), Supabase URL, and Stripe publishable key (in `.env.development` and `.env.production`) to anyone with repo access.

**Fix:** Add `.env` (and `.env.development`, `.env.production`) to `.gitignore`. These files should only exist locally and in CI secrets. Use `.env.example` (already exists) as the committed template.

```gitignore
# Add to .gitignore
.env
.env.development
.env.production
```

---

### 🔴 13 of 14 edge functions have `verify_jwt = false`

**File:** `supabase/config.toml`

Nearly every Supabase Edge Function has JWT verification bypassed. Only `process-email-queue` and `scheduled-optimization` (partially) require a valid JWT. This means functions like `create-checkout`, `change-subscription`, `decay-grades`, `sync-all-stores`, `generate-fix-action`, `apply-fix-action`, and `nightly-action-scan` can be called by unauthenticated HTTP requests.

These functions must implement their own auth checks internally (e.g., validating a `x-cron-trigger` header or Stripe webhook signature) — but this creates a defense-in-depth failure: any function that lacks internal validation is fully exposed.

**Affected functions:**
- `auth-email-hook`, `snapshot-performance`, `change-subscription`, `create-checkout`, `create-portal-session`, `payments-webhook`, `sync-checkout-session`, `decay-grades`, `sync-all-stores`, `scheduled-optimization`, `join-feature-waitlist`, `etsy-oauth`

**Fix:** Re-enable `verify_jwt = true` on every function that processes authenticated user actions (`create-checkout`, `change-subscription`, `sync-all-stores`, `decay-grades`, etc.). Webhooks and cron jobs that truly can't carry a user JWT should use a strong shared secret header and validate it inside the function. `payments-webhook` is the one legitimate exception (Stripe webhooks require a signature, not a JWT).

---

### 🔴 `supabase/config.toml` has duplicate entries (TOML parse conflict)

**File:** `supabase/config.toml:5-7` and `supabase/config.toml:16-18`

`[functions.snapshot-performance]` has two `verify_jwt = false` lines immediately after each other, and `[functions.sync-checkout-session]` appears twice. In TOML, duplicate keys in the same table are illegal and behavior is parser-dependent. This may cause silent misconfiguration where one entry silently wins.

**Fix:** Deduplicate these entries. The file should have exactly one `[functions.<name>]` block per function.

---

### 🟠 CORS wildcard fallback in backend Cloud Functions

**File:** `functions/customer-portal/index.ts:19`

```ts
res.set('Access-Control-Allow-Origin', process.env.APP_URL ?? '*')
```

If `APP_URL` is not set in the deployment environment, CORS defaults to `*`, allowing any origin to call this endpoint and trigger Stripe Customer Portal session creation for any `user_id` in the POST body.

**Fix:** Remove the `?? '*'` fallback. Fail hard if `APP_URL` is missing, or enumerate allowed origins explicitly.

---

### 🟠 Etsy `access_token` and `refresh_token` returned to the browser

**File:** `src/contexts/AppContext.tsx:449-479`

The `loadConnectedStore` query selects `access_token` and `refresh_token` from the `etsy_tokens` table and stores them in React state (`connectedStore`). These OAuth tokens are then available anywhere via `useApp()`. OAuth tokens should never transit the browser — they should only be read by edge functions using the service role key.

**Fix:** Remove `access_token` and `refresh_token` from the Supabase client query. The front end only needs `shop_id`, `shop_name`, and `expires_at` for UI display. Edge functions already have service-role access and can look up the tokens directly.

---

### 🟡 Stale env var declarations in `vite-env.d.ts`

**File:** `src/vite-env.d.ts:10-14`

Five env vars are declared in the TypeScript env type definition but are never set in any `.env` file and never used in the actual codebase: `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_STRIPE_PRO_MONTHLY_PRICE_ID`, `VITE_STRIPE_PRO_YEARLY_PRICE_ID`, `VITE_STRIPE_ENTERPRISE_MONTHLY_PRICE_ID`, `VITE_STRIPE_ENTERPRISE_YEARLY_PRICE_ID`. The live payment config has migrated to `VITE_PAYMENTS_CLIENT_TOKEN` and lookup-key-based price IDs (`starter_monthly_v2`, etc.).

**Fix:** Remove the five stale declarations from `vite-env.d.ts`.

---

### 🟡 `etsy-refresh-token` vs `refresh-etsy-token` naming mismatch

**File:** `src/contexts/AuthContext.tsx:235`

The AuthContext calls `supabase.functions.invoke('etsy-refresh-token', ...)` but the deployed Cloud Function (and the config) uses `refresh-etsy-token`. This call silently fails on every login (caught with `.catch(console.debug)`), meaning Etsy tokens may never be proactively refreshed from the client side.

**Fix:** Align the names. Either rename the function or correct the call site.

---

## 2. Architecture

### 🟠 TanStack Query is installed but the app mostly uses direct Supabase calls

**Files:** `src/App.tsx:49-53`, `src/contexts/AppContext.tsx`

`@tanstack/react-query` is configured in `QueryClientProvider` with sensible defaults (`staleTime: 5min, retry: 1`), but only 12 call sites use `useQuery` / `useMutation`. The core data layer — listings, dashboard rows, sync stats, optimizations, store data — all lives in raw `useEffect` + `useState` in `AppContext.tsx`. This creates:
- No automatic deduplication of concurrent requests
- No automatic background refetch on stale data
- No cache invalidation between components
- No devtools visibility of data flow

**Fix:** Gradually migrate the most-fetched queries (dashboard rows, subscriptions, pending reviews) to `useQuery`. The `useSubscription` hook is already a good example of the target pattern.

---

### 🟠 `AppContext` is a 679-line data monolith

**File:** `src/contexts/AppContext.tsx`

`AppContext` combines store connection status, listings data, dashboard rows, sync orchestration, optimization queue, pending review IDs, shop snapshots, and setup status in a single context. Any state change (e.g., `isSyncing` flipping) re-renders all consumers. With the component tree wrapping `AppLayout`, this affects every mounted component during a sync.

**Fix:** Split into focused contexts or migrate to a query layer. Minimum viable split: `SyncContext` (isSyncing, syncProgress, syncListings) and `StoreContext` (connectedStore, storeStatus) can be separated immediately since they don't share state with each other.

---

### 🟠 `etsy-rate-limiter.ts` is unreachable in practice

**File:** `src/lib/etsy-rate-limiter.ts`

The `EtsyRateLimiter` singleton and `batchEtsyRequests` helper are implemented as a browser-side module. But all actual Etsy API calls happen in Supabase Edge Functions (server-side). There are no imports of this module in any component or hook — the client never makes direct Etsy API calls. This is dead code on the client and the actual rate limiting (if any) lives in the edge functions.

**Fix:** Either move this logic into a shared edge function utility, or delete the file if it serves no purpose. If the eBay connector (`src/lib/connectors/ebay-connector.ts`) does make client-side calls, document that explicitly.

---

### 🟡 `@google/generative-ai` SDK is installed but should not be used

**File:** `package.json:14`

`@google/generative-ai: "^0.3.1"` is in dependencies but `lovable.md` specifies the Lovable AI Gateway should be used for all AI features (no user API keys required). Direct SDK usage would bypass usage metering, cost controls, and model versioning managed by the gateway. There are zero imports of this package in the source — it appears to be an unused leftover.

**Fix:** Remove `@google/generative-ai` from `package.json` and `package-lock.json` / `bun.lock`.

---

### 🟡 No `ErrorBoundary` or global error handling

**File:** `src/App.tsx`, `src/main.tsx`

There are zero `ErrorBoundary` components in the entire app. An unhandled React render error in any component (e.g., a null dereference in a chart component) will crash the entire app to a blank white screen with no recovery path. There is also no `Suspense` wrapper around lazy-loaded routes.

**Fix:** Wrap the root with a minimal `ErrorBoundary` that shows a "Something went wrong — reload" message. As a second step, wrap route-level components in `Suspense` if lazy loading is introduced.

---

## 3. Performance

### 🟠 Background full-listings prefetch fires on every login

**File:** `src/contexts/AppContext.tsx:499`

The comment says "Prefetch the full listings payload in the background so navigating to the Listings page is instant", but `loadListings()` is called eagerly on every login via `loadConnectedStore().then(...)`. For a 500-listing shop, `SELECT *` returns ~200KB+ of data the user may never need in that session. The `listingsLoadedRef` guard prevents duplicate fetches within a session, but it still fires on every cold start.

**Fix:** Remove the prefetch call from the login effect. Let `loadListings` remain lazy — only call it when `Listings` page mounts. Use the existing `dashboardRows` (13-column slim payload) for everything that doesn't need full listing data.

---

### 🟠 `refreshSyncStats` fetches 5,000 rows every 2.5 seconds during sync

**File:** `src/contexts/AppContext.tsx:202-297`

During an active sync, `refreshSyncStats` polls the `listings` table with `.limit(5000)` every 2.5 seconds (via `setInterval`). For large shops this means ~200KB+ round-trips per poll. This calculates tag diversity, photo counts, age averages, etc. client-side on each poll.

**Fix:** Move the stats aggregation to a lightweight database view or a Supabase RPC function so only a single aggregate row is returned. The polling interval can also be reduced to once every 5 seconds without meaningful UX impact.

---

### 🟡 `limit(5000)` used as a soft pagination ceiling in 8 places

Multiple queries use `.limit(5000)` as a safety cap rather than true server-side pagination:
- `AppContext.tsx` — listings query, sync stats query, pending review IDs
- `useEchoChat.ts` — chat messages (`.limit(200)` is fine here)

A seller with >5,000 listings (uncommon but possible for agency tier) would silently see incomplete data. More importantly, this pattern means the first 5,000 rows are always transferred even when only a subset is displayed.

**Fix:** Implement cursor/keyset pagination for listings queries. The `Listings` page already has client-side pagination (pageSize 24/48/96) — extend that to server-side pagination to avoid loading all 5,000 rows upfront.

---

### 🟡 Profile refresh and heartbeat run on every focus/visibility change

**File:** `src/contexts/AuthContext.tsx:266-312`

Two separate `useEffect` hooks attach `focus` and `visibilitychange` listeners:
1. Background profile refresh (every 30s + focus + visibility)
2. Heartbeat `last_seen_at` update (every 60s + focus + visibility)

For a user tabbing frequently between windows, this can produce many Supabase queries per minute. The heartbeat writes to `user_profiles` on every focus event regardless of how recently it last ran.

**Fix:** Add a minimum interval guard to the heartbeat (e.g., only write if >2 minutes have passed since the last ping). Similarly, debounce the focus-triggered profile refresh.

---

### 🟢 `useRoadmapFilters` refetches every 30 seconds

**File:** `src/hooks/useRoadmapFilters.ts:32`

`refetchInterval: 30_000` polls the score roadmap data every 30 seconds. Roadmap data doesn't change in real-time — it only updates after a sync. This is unnecessary background load.

**Fix:** Remove `refetchInterval` and instead invalidate the roadmap query after `syncListings` completes.

---

## 4. Code Quality

### 🟡 57 unsafe type casts (`as never`, `as unknown as`, `as any`)

Many Supabase query results are cast through double-assertion (`as unknown as EtsyListing[]`) because the auto-generated types (`src/integrations/supabase/types.ts`) don't exactly match the application's domain types. This is a common Lovable/Supabase pattern but means TypeScript cannot catch mismatches at compile time.

**Fix:** Define Supabase row select types that match what the queries actually return, rather than casting through `unknown`. This is a low-urgency cleanup but increases safety.

---

### 🟡 `Insights` page is unreachable but still uses 100% mock data

**File:** `src/pages/Insights.tsx`, `src/App.tsx:125`

`/app/insights` is redirected to `/app/score-roadmap` in `App.tsx`, but `Insights.tsx` still exists and renders using `mockInsights`, `mockBenchmark`, `mockUserBenchmark`, `mockTagTrends`, and `mockPlatformLearning`. The page is essentially abandoned mid-migration. If the redirect is ever removed, users would see placeholder data.

**Fix:** Either delete `Insights.tsx` and its mock data dependencies, or fully wire it to real data. The route redirect confirms the page is no longer the intended destination.

---

### 🟡 Toast message inconsistency: "5 free optimizations" vs plan limit of 10

**File:** `src/hooks/useListingActions.tsx:206-213`

The error toast for `limit_reached` hardcodes "5 free optimizations" but `src/lib/payments.ts:55` defines the free tier limit as 10 optimizations per month. The toast message is stale.

**Fix:** Update the toast copy to say "10 free optimizations" or derive the limit dynamically from the `PLANS` constant.

---

### 🟢 `DEFAULT_USER_SETTINGS` in `AuthContext` references a deprecated model name

**File:** `src/contexts/AuthContext.tsx:29`

`gemini_model: 'gemini-1.5-flash'` is set in the default settings, but `lovable.md` documents that the Lovable AI Gateway uses newer model identifiers (e.g. `gemini-2.5-flash`). The `UserSettings` type (`src/types/index.ts:29`) also only allows `'gemini-1.5-flash' | 'gemini-1.5-pro'`. These model strings are only used on the client as a settings display — the actual model selection happens in edge functions via the AI Gateway — but the UI may show outdated model names to users.

**Fix:** Update the type union and default to reflect current model names, or remove user-visible model selection if it's not connected to actual routing logic.

---

### 🟢 Missing `<AppProvider>` on the `/checkout/return` public route

**File:** `src/App.tsx:71`

`CheckoutReturn` is a public route that handles post-payment callbacks. It currently has no access to `AppContext` (no `<AppProvider>` wrapper), which is intentional for a lightweight callback page. However, if that page ever needs to refresh user subscription state, it will need the provider. The current behavior is correct — but it's worth documenting explicitly.

---

## 5. Feature Completeness & Roadmap Gaps

| Feature | Status | Note |
|---|---|---|
| Action Engine Phase 3 UI | Not started | Plan in `.lovable/plan.md` — `ActionQueue.tsx` page exists but is a placeholder |
| A/B Testing Lab | "Coming soon" | Route exists, placeholder UI |
| Agency tier billing | Hidden | `VITE_SHOW_AGENCY_TIER=false` in all envs |
| API access | "Coming soon" | Listed in Agency plan features |
| White label | "Coming soon" | Listed in Agency plan features |
| Insights page | Abandoned | Redirected, fully mock data |
| `stores` table schema | Incomplete | `return_policy`, `review_avg`, `has_shop_icon` columns not yet synced (noted in plan.md) |
| eBay connector | Skeleton only | `src/lib/connectors/ebay-connector.ts` exists but Etsy is the only live platform |

---

## 6. Infrastructure & Build

### 🟡 No bundle splitting in Vite config

**File:** `vite.config.ts`

The Vite config is minimal — no `build.rollupOptions.output.manualChunks`, no dynamic imports, no lazy route loading. With 30 pages, 100+ components, Recharts, Stripe, Supabase, and Lucide icons, the single JS bundle is large. The production build outputs a single `index-CjO2PQCu.js`.

**Fix:** Introduce route-level code splitting using `React.lazy()` for heavy pages (Admin, Intelligence, Performance, PersonalWorkspace). Add `manualChunks` for large vendor libs (recharts, stripe, supabase).

---

### 🟡 No Content Security Policy

There is no CSP configured via meta tags or response headers. The Vite dev server and production build both serve without CSP. For a platform that renders AI-generated content (listing optimizations, Echo chat responses) and embeds Stripe, a CSP would significantly reduce XSS risk.

**Fix:** Add a CSP meta tag to `index.html` that allows Supabase, Stripe, and the CDN origin. Stricter policies can be layered in the hosting platform (Lovable).

---

### 🟢 No test suite

There are no test files, no `vitest` or Jest config, and no testing dependencies. This is common for Lovable-scaffolded projects but means regressions in the health score algorithm, grading logic, and payment flows can only be caught manually.

**Fix:** Add `vitest` and write unit tests for the pure functions that carry business logic: `computeStoreHealthScore`, `getGradeLabel`, `computeDashboardStatsFromListings`, and the `normalizeProfile` function in AuthContext.

---

## Priority Fix List

| # | Issue | Risk | Effort |
|---|---|---|---|
| 1 | Add `.env`/`.env.*` to `.gitignore` | 🔴 | XS |
| 2 | Re-enable `verify_jwt = true` on authenticated edge functions | 🔴 | S |
| 3 | Fix duplicate TOML entries in `config.toml` | 🔴 | XS |
| 4 | Remove CORS wildcard fallback in `customer-portal` | 🟠 | XS |
| 5 | Remove `access_token`/`refresh_token` from browser-side store query | 🟠 | S |
| 6 | Fix `etsy-refresh-token` vs `refresh-etsy-token` name mismatch | 🟡 | XS |
| 7 | Remove `@google/generative-ai` unused dependency | 🟡 | XS |
| 8 | Remove full-listings prefetch on login | 🟠 | XS |
| 9 | Add root `ErrorBoundary` | 🟡 | S |
| 10 | Fix hardcoded "5 free optimizations" toast copy | 🟡 | XS |
| 11 | Remove stale env var declarations in `vite-env.d.ts` | 🟢 | XS |
| 12 | Add bundle splitting to Vite config | 🟡 | S |
| 13 | Debounce heartbeat / profile refresh on focus | 🟡 | S |
| 14 | Delete or wire `Insights.tsx` | 🟢 | S |
