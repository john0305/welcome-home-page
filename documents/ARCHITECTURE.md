# RadarIQ — Architecture

> Living document. Reflects the current Supabase (Lovable Cloud) implementation, not the stale
> Google Cloud Functions / Neo4j description in the root `README.md` (see [Known Issues](#6-known-issuestodosparked-work)).

## 1. Directory / Module Map

```
src/                    React 18 + Vite + TypeScript frontend
supabase/                Supabase (Lovable Cloud) backend
  functions/              Deno edge functions (the actual backend logic)
  migrations/              96 SQL migrations — schema of record
  config.toml               per-function verify_jwt + cron schedule config
functions/               LEGACY — Google Cloud Functions, superseded by supabase/functions/. See §6.
documents/                Planning/audit docs (audit_results.md, fix.md, prompt logs)
updates/                  Product/build specs
lovable.md                Reference doc for the Lovable platform (accurate, current)
README.md                 STALE — describes an earlier, abandoned architecture
```

### `src/`

| Folder | Purpose |
|---|---|
| `pages/` | Route-level screens: `Dashboard`, `Listings`, `ListingDetail`, `ActionQueue`, `OptimizationQueue`, `Intelligence`, `Performance`, `PersonalWorkspace`, `Achievements`, `ScoreRoadmap`, `ConnectEtsy`, `Settings`, `StoreProfile`, `Admin` (+`admin/`), auth pages (`Login`, `Register`, `AuthCallback`, `CompleteProfile`), `Landing`. |
| `components/` | UI organized by domain: `dashboard/`, `listings/`, `actions/`, `optimization/`, `market/`, `performance/`, `personal/`, `achievements/`, `payments/`, `admin/`, `auth/`, `onboarding/`, `notifications/`, `echo/` (AI chat widget), `ui/` (shadcn/Radix primitives), `landing/`. |
| `contexts/` | `AuthContext.tsx` (session/auth — see §4), `AppContext.tsx` (large shared data-layer context; flagged in the audit as doing too much and underusing React Query), `NotificationContext.tsx`. |
| `hooks/` | Feature-specific data hooks: `useFixActions.ts`, `useFixProgress.ts`, `useMarketScore.ts`, `useShopIntelligence.ts`, `useStoreVelocity.ts`, `useOptimizationUsage.tsx`, `useSubscription.tsx`, `useEchoChat.ts`, `usePersonalQuota.ts`, `useResolveNiche.ts`. |
| `lib/` | Business logic: `etsyRankingFactors.ts`, `fixLifecycle.ts`, `healthScore.ts`, `intelligence.ts`, `marketScoreGaps.ts`, `personalization.ts`, `tier-access.ts`, `attribution.ts`, `payments.ts`, `supabase.ts` (client wrapper + mock-auth fallback), `echo/`, `connectors/`. |
| `integrations/supabase/` | `client.ts` (auto-generated Supabase client — do not edit), `types.ts` (generated DB types). |
| `integrations/lovable/` | `index.ts` — wraps `@lovable.dev/cloud-auth-js` for social OAuth, handing off into the same Supabase session. |
| `stores/` | `achievementQueue.ts` — zustand store for achievement toast queueing. |
| `data/` | `mockData.ts`, `mockAffiliate.ts` — used when Supabase env vars are absent (demo/mock-auth mode). |
| `types/` | Shared TS types (`UserProfile`, `UserSettings`, etc.). |

### `supabase/functions/` (grouped by pipeline stage — see §2 for call order)

- **Sync**: `sync-listings`, `sync-all-stores`, `etsy-oauth`, `etsy-refresh-token`
- **Grading**: `grade-listing`, `decay-grades`, `analyze-photos`
- **Action engine**: `_shared/etsy-ranking-factors.ts`, `_shared/action-engine.ts`, `_shared/fix-lifecycle.ts`, `nightly-action-scan`, `generate-fix-action`, `apply-fix-action`, `revert-listing`
- **Intelligence/market**: `competitor-market-scan`, `rebuild-shop-intelligence`, `market-title-suggest`, `resolve-niche`, `compute-velocity`
- **Optimization**: `recommend-improvements`, `rewrite-listing`, `optimize-listing`, `create-optimized-listing`, `bulk-optimize-listings`, `push-to-etsy`, `scheduled-optimization`
- **Achievements/attribution**: `check-and-award-achievements`, `backfill-achievements`, `calculate-attribution`
- **Payments**: `create-checkout`, `create-portal-session`, `payments-webhook`, `sync-checkout-session`, `change-subscription`, `_shared/stripe.ts`
- **Admin**: `admin-*` functions (server-side role checks against `user_roles`)

## 2. Data Flow — Sync → Grading → Action Engine → UI

**Sync (Etsy → DB)**
1. `sync-all-stores/index.ts` (cron, `0 2 * * *` via `supabase/config.toml`) iterates all connected users and calls `sync-listings` with `X-Sync-Source: cron` + a service-role bearer token (bypasses per-user rate limiting).
2. `sync-listings/index.ts` pulls active listings from the Etsy Open API v3, upserts `listings` and `listing_snapshots`/`listing_renewal_snapshots`, detects vacation mode (`shop_vacation_periods`) and auto-renewals (`listing_renewals`), then fire-and-forgets `snapshot-performance`, `sync-renewal-detector`, `embed-listing` (via `EdgeRuntime.waitUntil`) and awaits `check-and-award-achievements`.
3. `etsy-oauth/index.ts` / `etsy-refresh-token/index.ts` handle the OAuth handshake and token refresh, writing `etsy_tokens`.

**Grading**
4. `grade-listing/index.ts` — hybrid grader: deterministic `ruleScores()` (title length, tag count, photo count, description length, materials, video) worth 60 pts + a Gemini 2.5 Flash multimodal call via the Lovable AI Gateway scoring 7 AI dimensions worth 40 pts, combined by `letterGrade()`. Writes `listings.score` / `.grade` / `.score_breakdown`. A `mode: 'personal'` branch (`handlePersonalGrade`) powers the Personal Workspace feature, writing to `grade_runs`/`grade_dimension_scores` instead of `listings`.
5. `decay-grades/index.ts` (cron) decays scores for stale listings over time. `analyze-photos/index.ts` does photo-specific analysis into `photo_analyses`.

**Action Engine**
6. `nightly-action-scan/index.ts` (cron, `0 2 * * *`) is the orchestrator. Per connected user, it:
   - re-checks pending `fix_actions`, marking externally-resolved ones `superseded`;
   - runs every registered factor's `check()` from `_shared/etsy-ranking-factors.ts` (`ETSY_RANKING_FACTORS`: `tags_complete`, `materials_present`, `title_length`, `return_policy_present`, `review_health`, `market_tag_gap`, `market_title_length`), and on failure calls `generateAndInsert()` → new row in `fix_actions`;
   - auto-applies `mode:"auto"` + `safe_auto_apply` actions the user opted into (`auto_apply_preferences`), via `factor.applyFix()` → `etsyApiFor()` (in `_shared/action-engine.ts`) → PATCH to Etsy;
   - rolls up `daily_action_summaries`;
   - calls `resolveMaturedActions()` to re-check 7+ day old applied actions → `resolved` / `needs_attention`;
   - fire-and-forgets `competitor-market-scan` and awaits `rebuild-shop-intelligence`.
7. `generate-fix-action` / `apply-fix-action` / `revert-listing` are the same steps triggered manually from the UI ("fix this now").

**Downstream pipelines** (fed by sync or nightly scan): `embed-listing` → `listing_embeddings`; `snapshot-performance` → `shop_snapshots`; `sync-renewal-detector` → `listing_renewal_events`/`_summary`; `competitor-market-scan` → `competitor_snapshots`/`competitor_alerts`; `rebuild-shop-intelligence` → `shop_intelligence` (consumed by the Echo AI assistant); `calculate-attribution` → `performance_attribution`; `compute-velocity` → `store_velocity_stats`; the optimization pipeline (`optimize-listing`, `rewrite-listing`, `bulk-optimize-listings`) writes `optimizations`/`listing_versions` and `push-to-etsy` pushes accepted rewrites back to Etsy.

**UI consumption**: `AppContext.tsx` and feature hooks (`useFixActions.ts`, `useMarketScore.ts`, `useShopIntelligence.ts`, etc.) read the resulting tables directly from Supabase, RLS-scoped to `auth.uid()`, rendered in `ActionQueue.tsx`, `Dashboard.tsx`, `ListingDetail.tsx`, `Intelligence.tsx`, `Performance.tsx`.

**Cron mechanism note**: only `nightly-action-scan` has an explicit `schedule` in `supabase/config.toml` (native Supabase Functions cron). A `pg_cron` job for `process-email-queue` is scheduled directly in SQL (`supabase/migrations/20260530030213_email_infra.sql`). Other functions with `verify_jwt = false` (`sync-all-stores`, `decay-grades`, `scheduled-optimization`) appear intended for scheduled/external invocation but their trigger mechanism isn't captured in migrations — flagged as unverified in `documents/audit_results.md`.

## 3. Schema Summary (`supabase/migrations/`)

| Table | Purpose |
|---|---|
| `user_profiles` | App-level user profile (tier, settings), 1:1 with `auth.users`. |
| `user_roles` | Authoritative role table (e.g. admin flag), separate from profiles. |
| `etsy_tokens`, `etsy_credentials`, `oauth_states` | Etsy OAuth tokens and PKCE state. |
| `stores`, `connected_stores` | Connected Etsy shop metadata (vacation status, policies, reviews). |
| `listings` | Synced Etsy listings — title, tags, price, images, score, grade, decay state. |
| `listing_snapshots` | Daily per-listing performance snapshot (views/favorites/price/state). |
| `listing_versions` | Historical copy versions for optimization/revert. |
| `listing_renewals`, `listing_renewal_snapshots`, `listing_renewal_events`, `listing_renewal_summary` | Etsy auto-renewal detection and tracking. |
| `listing_embeddings` | Vector embeddings for market matching/search. |
| `listing_traction_events`, `listing_sales_events` | Sales/traction event log. |
| `listing_user_flags` | User-set flags on listings. |
| `optimizations` | AI-generated listing rewrite proposals + approval status. |
| `monthly_usage`, `personal_daily_quotas` | Tier-based usage/quota counters. |
| `fix_actions` | Action engine's queue of proposed/applied fixes per listing or shop. |
| `daily_action_summaries` | Nightly scan rollup per user/day. |
| `auto_apply_preferences` | User opt-in for which factors can auto-apply. |
| `fix_lifecycle` | Action engine lifecycle metadata. |
| `shop_snapshots` | Shop-level daily rollups (orders/revenue). |
| `shop_reviews` | Etsy shop review data. |
| `shop_vacation_periods` | Vacation-mode date ranges. |
| `shop_intelligence` | AI-assembled shop context used by Echo. |
| `store_personalization` | Seller-provided brand voice/context steering AI prompts. |
| `store_velocity_stats` | Computed velocity metrics. |
| `market_snapshots`, `competitor_snapshots`, `competitor_alerts` | Competitor market intelligence. |
| `market_insight_cache`, `listing_market_scores`, `category_benchmarks`, `niche_health`, `niche_cache` | Market/niche scoring. |
| `user_niche_profiles`, `seed_niches` | Niche classification. |
| `algorithm_weights`, `algorithm_weight_history` | Tunable scoring weights. |
| `action_effectiveness`, `user_listing_actions` | Action outcome tracking. |
| `platform_stats_cache`, `platform_daily_metrics`, `pipeline_run_log` | Platform-wide admin metrics. |
| `sync_rate_limits` | Per-user sync throttling/outcome log. |
| `snapshot_runs` | Snapshot job run log. |
| `performance_attribution` | Attributes score/action changes to performance deltas. |
| `wins_feed` | User-facing "wins" highlight feed. |
| `chat_sessions`, `chat_messages`, `chat_feedback`, `unanswered_questions` | Echo AI chat history. |
| `ai_model_config`, `ai_usage_events`, `api_quota_log` | AI usage governance. |
| `grade_runs`, `grade_dimension_scores`, `grade_feedback` | Personal Workspace ad-hoc grading. |
| `personal_optimization_runs` | Personal Workspace optimization runs. |
| `feature_waitlist`, `beta_signups` | Pre-launch signup lists. |
| `feature_flags`, `platform_settings`, `system_settings` | Feature gating/config. |
| `achievements`, `user_achievements`, `achievement_audit_log` | Gamification. |
| `user_event_counters`, `user_activity_days` | Activity tracking. |
| `pinterest_posts` | Pinterest integration. |
| `dismissed_alerts` | User-dismissed UI alerts. |
| `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens` | Transactional email infra. |

## 4. Auth / Session Handling

RadarIQ uses **Supabase Auth**, wrapped by Lovable Cloud — this is the system any new OAuth integration (e.g. Section 10) must slot into rather than duplicate.

- `src/integrations/supabase/client.ts` — auto-generated Supabase client (do not edit), reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `src/lib/supabase.ts` — thin wrapper exposing `isSupabaseConfigured`, `signIn`/`signUp`/`signOut`/`getSession`, and a **mock-auth fallback** (`supabase = isSupabaseConfigured ? cloudSupabase : null`) used in local/demo mode.
- `src/contexts/AuthContext.tsx` — the real `AuthProvider` / `useAuth()` hook, and the actual seat of session logic:
  - Mock-auth session persisted to `localStorage` under `radariq_session` when Supabase isn't configured.
  - Real session restore via `supabase.auth.getSession()` / `setSession()`, including OAuth token fragments in the URL (`getOAuthTokensFromUrl` / `clearOAuthTokensFromUrl`).
  - `onAuthStateChange` listener that filters out noisy `TOKEN_REFRESHED` / `USER_UPDATED` / `INITIAL_SESSION` events to avoid UI flicker.
  - `fetchProfile()` reads/self-heals a `user_profiles` row and merges `user_roles` to detect `tier: 'admin'`.
  - Background profile refresh (every 30s + on focus/visibility) and a `last_seen_at` heartbeat (every 60s).
  - Timeouts (5–15s) around all Supabase auth/DB calls to avoid infinite loading states.
  - Exposes `login` / `logout` / `register` / `refreshProfile` / `syncAuthSession`.
- `src/integrations/lovable/index.ts` — wraps `@lovable.dev/cloud-auth-js` (`createLovableAuth()`) for social sign-in (`google` / `apple` / `microsoft` / `lovable`). On success it calls `supabase.auth.setSession(result.tokens)`, handing the result into the **same** Supabase session used everywhere else — there is one session store, not two.
- **Edge functions**: each creates a per-request Supabase client scoped to the caller's `Authorization` header and calls `supabase.auth.getUser()` (pattern centralized as `authedUserId()` in `_shared/action-engine.ts`). Cron/service endpoints instead check `Authorization: Bearer <SERVICE_ROLE_KEY>` or a custom trigger header (see `nightly-action-scan`).
- Admin-gated functions (`admin-*`) check `user_roles` server-side; `AuthContext` mirrors the same `tier === 'admin'` check client-side for route gating.
- **Implication for third-party OAuth (e.g. Etsy already, and any future provider)**: tokens are stored server-side only (`etsy_tokens`), fetched/refreshed inside edge functions, and never meant to reach the browser as raw tokens — `AppContext.tsx` was flagged in the audit for briefly pulling Etsy tokens into client state (see §6) and should be treated as the anti-pattern to avoid, not the precedent to follow.

## 5. Known Issues / TODOs / Parked Work

No inline `TODO`/`FIXME`/`HACK` markers exist in `src/` or `supabase/` — issue tracking lives in `documents/`.

From `documents/audit_results.md` (2026-06-06 full system audit) and `documents/fix.md` (companion remediation guide, items tagged `[LOCAL]`/`[LOVABLE]`/`[DECISION]`):

- 🔴 `.env` was not gitignored — a live Supabase URL/anon key and Stripe publishable key were committed to git history. Needs rotation/history scrub if not already done.
- 🔴 Most edge functions run with `verify_jwt = false` in `supabase/config.toml`, relying on internal auth checks that aren't uniformly present across all functions.
- 🟠 `AppContext.tsx` (`loadConnectedStore`) was pulling Etsy `access_token`/`refresh_token` into client state — tokens should never leave the server; needs re-verification against the current file.
- 🟠 Architectural debt: `@tanstack/react-query` is installed but `AppContext.tsx` is a sprawling, mixed-concern data layer instead of using it consistently.
- 🟠 Unverified cron triggers for `sync-all-stores`, `decay-grades`, `scheduled-optimization` — no migration or config confirms what invokes them.
- Performance concerns flagged for shops with 500+ listings (not fully detailed in the audit).
- The root `README.md` describes a stale architecture (direct Google Gemini calls, Google Cloud Functions, Neo4j Aura, GA4 Data API) that no longer matches the live Supabase-edge-function + Lovable-AI-Gateway implementation. Should be rewritten or clearly marked historical.
- `functions/` (repo root) is legacy Google Cloud Functions code, superseded by `supabase/functions/` — appears dead but unconfirmed; do not delete without verifying nothing still deploys from it.
- No "Smart Photo Engine" artifact exists yet under that name. The closest analog is `supabase/functions/analyze-photos/index.ts` + the `photo_analyses` table, plus the photo-grading branch inside `grade-listing/index.ts` — this is the most likely foundation for that feature if/when it's built out, but it is currently narrow (photo count/presence signals), not a full engine.

## 6. Dependencies / External Services

**Supabase (Lovable Cloud)** — project `brqkcbdbsciwfmnipzbx` (`supabase/config.toml`). Auth, Postgres, RLS, edge functions (Deno), and `pg_cron` all live here.

**Etsy Open API v3** (`https://openapi.etsy.com/v3/...`) — listings, shops, images, policies; OAuth token endpoint at `https://openapi.etsy.com/v3/public/oauth/token`. Uses RadarIQ's own app credentials (`ETSY_API_KEY` / `ETSY_SHARED_SECRET` server secrets, sent as `x-api-key`), not per-user app credentials.

**Lovable AI Gateway** (`https://ai.gateway.lovable.dev/v1/chat/completions`, auth via `LOVABLE_API_KEY`) — powers grading (`grade-listing`), fix generation (`_shared/action-engine.ts`'s `aiGateway()`), Echo chat, market/niche resolution, and listing rewrites. Model in active use: `google/gemini-2.5-flash`; broader model catalog documented in `lovable.md`.

**Stripe** — `create-checkout`, `create-portal-session`, `payments-webhook`, `sync-checkout-session`, `change-subscription` edge functions, backed by `_shared/stripe.ts`. Client-side via `@stripe/stripe-js` / `@stripe/react-stripe-js`.

**pg_cron** — schedules `process-email-queue` directly via SQL (`supabase/migrations/20260530030213_email_infra.sql`). `nightly-action-scan` uses Supabase's native function `schedule` config (`0 2 * * *`) instead.

**Other notable frontend deps**: `@tanstack/react-query`, `zustand`, `react-router-dom`, `react-hook-form` + `zod`, `recharts`, `date-fns`, Radix UI + Tailwind (shadcn), `lucide-react`.

No `.env.example` was found at the repo root during this investigation — worth confirming it still exists, since the audit flagged real `.env` files as committed instead of an example template.
