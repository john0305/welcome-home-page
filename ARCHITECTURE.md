# RadarIQ — Architecture

> Living document. Sections 1–6 map the pre-July-2026 baseline; **§7 records the
> 2026-07 build pass** (security lockdown, shop-type detection, photo/trend
> intelligence, priority gate, integrations, tone/UX pass, tier map, judgment
> calls). Update §7 as work continues — this file is the onboarding/debugging
> reference for future sessions.

## 1. Directory / Module Map

```
src/                    React 18 + Vite + TypeScript frontend
supabase/                Supabase (Lovable Cloud) backend
  functions/              Deno edge functions (the actual backend logic)
  migrations/              104 SQL migrations — schema of record
  config.toml               per-function verify_jwt + cron schedule config
documents/                Planning/audit docs (audit_results.md, fix.md, compliance + data audits)
updates/                  Product/build specs
lovable.md                Reference doc for the Lovable platform (accurate, current)
```

(Removed in 2026-07 pass: legacy root `functions/` Google Cloud Functions dir —
verified nothing in-repo deployed it; preserved in git history.)

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

`.env.example` exists at the repo root (only `VITE_`-prefixed publishable values); `.env` was untracked in the 2026-07 pass.

---

## 7. 2026-07 Build Pass (Fable 5) — What Changed and Why

Executed against `documents/RadarIQ_Fable5_Brief (1).md` in its Section 15
order. Every subsection below is live code, not plan.

### 7.1 Security / stability (Phase 1)

- **`.env` untracked + gitignored** (`.env.example` kept). Credential rotation handled separately by the owner.
- **Caller-verification audit of all 58 edge functions.** Key insight: platform `verify_jwt` also passes the PUBLIC anon key, so in-function checks are the real gate. New shared helpers in `supabase/functions/_shared/service-auth.ts` (`isServiceCall`, `isCronCall`, `callerUserId`, `isAdminCall`). Locked down (previously anon-invocable): `rebuild-shop-intelligence` + `competitor-market-scan` (service-only; they take arbitrary `user_id` and spend AI/Etsy quota), `calculate-attribution` + `platform-aggregate-stats` (admin-or-service; attribution allows self-recompute), `send-transactional-email` (service full; authed users limited to signup templates bound to their own email — was an open spam vector from RadarIQ's domain).
- **Impersonation redesign**: `admin-impersonate` writes an `impersonation_sessions` audit row (who/whom/when/expiry) BEFORE issuing the magic link; redirect carries `?impersonation=<session_id>`; `ImpersonationBanner` (mounted in `AppLayout`) shows a persistent "Viewing as" bar, offers End Session (stamps `ended_at`), and auto-signs-out after 30 min. **Accepted limitation (judgment call)**: the underlying magic-link session is a standard Supabase session — the 30-min limit is client-enforced; hard server-side JWT revocation would need custom JWT infra. Acceptable at current user scale; revisit before real growth.
- **Cron triggers made deterministic**: `sync-all-stores` (01:00), `decay-grades` (02:30), `scheduled-optimization` (03:00) now have native `schedule` entries in `config.toml` (previously nothing verifiably invoked them). If Lovable had external triggers configured, remove them (see handoff).
- Legacy root `functions/` (Google Cloud) deleted after verifying no in-repo deploy path.

### 7.2 Pipeline fixes (Phase 2)

- **Dashboard↔Intelligence contradiction**: `TopImpactActions` filtered pending actions to `score_delta > 0`, hiding real pending work and claiming "no pending actions / great shape" while the Dashboard counted low-grade listings. Now: no hiding (unscored actions rank below scored), honest empty-state copy.
- **Wins dedup**: `wins_feed` was plain-INSERTed on every attribution re-run, and `first_sale_wN` produced identical window-less headlines per window. Fixed with dedupe migration + unique `(attribution_id, kind)` index + upsert + once-per-listing `first_sale` guard (`20260702000002`).
- **Dashboard consolidation**: one health score (hero ring; detail lives on ScoreRoadmap), one action queue (`EchoPicksPanel` in the main column; the near-verbatim "Your Priority Actions" duplicate removed).
- **Pinterest Spotlight**: confirmed a **parked stub** — `pinterest_posts` is read by achievements but nothing writes it. Left as-is; see "recommended, not built".

### 7.3 Black-page fix (Phase 3) — Etsy reviewer issue

Root cause: empty `#root`, no `noscript`, and the default landing theme
(midnight-teal, dark) stamped on `html` pre-paint — any environment that
didn't execute the JS bundle painted an empty black viewport. `index.html`
now ships a static, light-background branded fallback inside `#root`
(React replaces it on mount) plus a descriptive `noscript` block. Verify by
loading the site with JS disabled before resubmitting the API appeal.

### 7.4 Etsy data + shop-type detection (Phases 4–5)

- `sync-listings` now captures Etsy's own classification fields: `listing_type`, `who_made`, `when_made`, `is_supply`, `taxonomy_id`, `shop_section_id`, `processing_min/max`, `has_variations`, `is_personalizable` (migration `20260702000003`). Ranked audit of everything else: `documents/etsy_api_data_audit.md`.
- **Shop-type detection is now largely deterministic** (`src/lib/shopType.ts` + server mirror `_shared/shop-type.ts` — keep in sync). Per-listing `classifyListing()` (digital / made_to_order / personalized / vintage / supplies / one_of_a_kind / inventory); `deriveShopTypeProfile()` persists type+confidence+breakdown onto `user_niche_profiles` at the end of every sync, never overwriting a seller override.
- **Confirm/correct loop**: `ShopTypeCard` on Store Profile; every confirm/correct logs to `shop_type_corrections` (training signal); corrections set `shop_type_override`, which wins everywhere (migration `20260702000004`).

### 7.5 Photo intelligence (Phase 6)

`analyze-photos` rebuilt: routes through the Lovable AI Gateway (was the only
direct-Anthropic caller), branches its grading lens by listing kind (digital →
preview readability, never "fix your lighting"; made-to-order → variation
coverage; vintage → condition-honesty close-ups; supplies → quantity/scale),
classifies each photo keep/edit/retake with plain-language `action_reason` +
`edit_guidance`, returns `recommended_order` + `reorder_reason` (explicit
position swaps), and benchmarks photo count against niche peers from
`competitor_snapshots` (aggregate only). `PhotoAnalysisPanel` surfaces all of it.
Note: Etsy API v3 supports image upload/reorder (`uploadListingImage` + rank),
so photo fixes CAN eventually be applied in-app — see "recommended, not built".

### 7.6 Compliance + own-data trends (Phase 7)

**Read `documents/etsy_compliance_trend_design.md` before touching anything
market-related.** Current Etsy API Terms prohibit collecting Etsy content "for
purposes of analytics/ML" without written authorization; **`competitor-market-scan`
is flagged as the top risk to the pending API appeal** (owner decision:
authorization or feature-flag off — deliberately not disabled unilaterally).
Built compliant-by-construction from the seller's own `listing_snapshots`:
`traction_decline` (14d-vs-prior-14d early warning) and `renewal_timing`
("renew now vs refresh first" — the renewal-tracker upgrade) — computed in
`nightly-action-scan` step 3.5, self-expiring, registered as `pipeline_computed`
factors (new flag; stops the nightly re-check from superseding pipeline-created
actions — note: market factors intentionally KEEP the nightly
supersede-and-regenerate behavior).

### 7.7 Priority gate + proactive assistant (Phase 8)

`fix_actions` gains `priority_score` (0–100) + `notify_worthy` (migration
`20260702000005`), computed by `_shared/priority-gate.ts` at the end of every
scan: severity base + expected impact + one-tap bonus + own-data confidence,
adjusted by 90-day per-factor outcome history (consistently-dismissed types
−20, adopted +10 — the Section 8 learning loop reads `fix_actions` statuses
directly: applied / edited_applied ("acted differently") / dismissed(reason) /
stale-pending ("ignored")). Hard cap: at most 3 fresh actions/day at score ≥70
become `notify_worthy`. Client `useProactiveInsights` surfaces ONLY
server-flagged rows as teaser notifications (notification → conversation →
reveal) — the gate cannot be bypassed client-side.

### 7.8 Refresh timing + theme adaptation (Phase 9)

- `user_profiles.activity_hours` (UTC login-hour histogram, written once per session by `AuthContext`; migration `20260702000006`).
- `predictive-refresh` (hourly cron, :10): when a user's modal login hour is ~2h away, their last completed scan >20h old, and they have ≥5 recorded sessions → sync + single-user scan so insights land just before they show up. Fixed nightly schedule remains the safety net.
- Event-driven: a user-triggered sync that finds real listing changes fires an immediate single-user rescan (`source: listing_change`).
- Confidence decay: pending actions are re-verified every nightly scan (≤24h, well inside the brief's 5-day bar) and the notify gate only flags <24h-old findings — satisfied by design, documented rather than rebuilt.
- Theme adaptation (skin-deep only): `src/lib/themeAdaptation.ts` maps confirmed `store_personalization.category` → one of the four existing color themes. Manual Settings pick (`radariq_color_theme`) is a permanent lock; auto writes `radariq_color_theme_auto`; the pre-paint script prefers manual.

### 7.9 Data integrations (Phase 10)

Contract in `_shared/data-integrations.ts` (`DataIntegration`: buildAuthUrl /
exchangeCode / refreshToken / fetchMetrics / mapToInsights + registry). Adding
a provider = implement + register; no new endpoints. GA4 connector is live
code: OAuth (offline), property auto-discovery, 28d runReport, etsy/social
referral rollups; social spike/collapse → `external_traffic_signal` inform
actions in the SAME `fix_actions` queue. Storage: `integration_connections`
(tokens server-only via column grants) + `integration_metrics` (migration
`20260702000007`). Functions: `integration-oauth` (generic authorize/callback,
reuses `oauth_states.provider`), `sync-integration-data` (daily cron 01:30).
**Needs `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` secrets** (see
handoff). Second integration verified unavailable: eRank/EverBee/Sale
Samurai/Alura expose no public developer APIs.

### 7.10 Tone, fallbacks, UX (Phases 11–12)

- **Tone (7a)**: the brief's worked example rewritten at its source (`onboarding-pipeline` title rationale) + the same clinical copy in `useShopMarketOverview` / `GuidedFixFlow`; `ScoreFactorRows` "Fair"/"Poor" → "Getting there"/"Big upside here". Dashboard hero already softened F/D ("Just Starting"/"Building Up").
- **AI fallbacks (12a)**: `grade-listing` returns the last computed grade marked `stale: true` + notice on gateway failure (never blank/error when a prior grade exists); `rewrite-listing`, `create-optimized-listing`, `analyze-photos` refund the reserved credit via new `refund_optimization` RPC (migration `20260702000008`) and say so plainly (`optimize-listing` already refunded); Echo chat already failed friendly.
- **Insight-led Listings** (user feedback: "we promise intelligence, then the next click is a table"): `ListingsInsightHeader` ("Echo's read" — warm synthesis + tappable opportunity chips driving the existing tab filters) leads the page; the dense filter zone collapses behind "Fine-tune filters" in simple mode.
- **Two-mode system (Section 7)**: `useViewMode` (`simple` default / `advanced`; persisted, broadcast). Toggle in Settings → Appearance ("Detail level"). Currently applied to Listings' filter machinery; extend to Intelligence/Performance advanced panels as a follow-up.
- **Assistant identity = Echo** (Section 13 conflict resolved): Echo is the marketed brand (landing "Meet Echo", pricing "Echo Lite/…", public demo). Renamed the Dashboard "Radar's Insight" box → "Echo's Insight" + all "Radar is …" persona copy → Echo. Code identifiers (`echo-chat`, `components/echo/`) intentionally unchanged. Future mascot can be Echo-the-radar-creature; no conflict.

### 7.11 Tier map (holistic pass — Section 2)

Tiers in code: `free | starter | pro` (`src/lib/tier-access.ts`; billing also
knows `agency`). Principle applied: **advice correctness is never gated** (a
free seller must never get wrong advice because of their tier); depth,
frequency, and integrations are the honest paid step-ups.

| Feature (this pass) | Tier | Reasoning |
|---|---|---|
| Shop-type detection + confirm/correct | All | Gating would make free users' advice *wrong*, not just shallower. |
| Type-branched photo lens, retake/edit/reorder, benchmark | All tiers via existing optimization-credit gate (free: 5/mo) | Heavy AI cost is already metered by credits; no second gate. |
| `traction_decline` / `renewal_timing` insights | All | Own-data, cheap, core "assistant" value — this is what makes Free feel respected. |
| Priority gate + proactive notifications | All | Trust/noise-control feature; gating it would make lower tiers noisier, i.e. worse. |
| Predictive + event-driven refresh | All | Cheap; self-limits via session-count threshold. |
| Theme adaptation, Simple/Advanced mode | All | Cosmetic/ergonomic. |
| Data integrations (GA4+) | **Pro** (`data_integrations` feature; enforced client + server in `integration-oauth`) | "More integrations" is the honest upgrade named in the strategy; core Etsy insights stay free. |
| Stale-grade fallback, credit refunds | All | Fairness features by definition. |

Pre-existing gates (unchanged): listings visibility (1/5/all), market-score
depth, tag-gap depth, competitor detail, score history window, guided fixes,
Echo memory + message caps, grade cap (free 50/mo), optimization credits.
Dark-pattern check: no insight is teased-but-hidden; count-only gates
(`tag_gap_count_only`, `competitor_count_only`) are the closest case —
acceptable because the count is itself honest information, but flagged for
review if sellers report it feeling baity.

### 7.12 Known issues / recommended-but-not-built (current)

Resolved from the old §5 list: `.env` tracking ✅, function auth ✅, cron
triggers ✅, README ✅ (rewritten), legacy `functions/` ✅ (removed),
Dashboard/Intelligence contradiction ✅, wins dedup ✅, health-score/actions
duplication ✅, naming collision ✅.

Still open / new:
1. **Etsy ToS vs competitor scanning** — owner decision required (§7.6). Highest priority before appeal resubmission.
2. **Generated `types.ts` lags new migrations** — code uses the repo's `(supabase as any)` pattern in 4 spots (`ShopTypeCard`, `useProactiveInsights`, `AuthContext` histogram, `IntegrationsCard`); remove casts after Lovable regenerates types.
3. `AppContext.tsx` remains a sprawling data layer (React Query underused) — deliberate deferral; refactor is high-churn, low-user-visible-value at current scale.
4. 500+ listing performance concerns — unaddressed this pass (no shop that size yet); `usePendingFixActions` caps at 1000 rows.
5. Pinterest Spotlight — parked stub; if wanted, build as a `DataIntegration` provider.
6. Photo apply-in-app (upload/reorder via Etsy API) — feasible, not built; would make photo fixes one-tap like tags/titles.
7. Review-text mining — highest-value deferred data item (see `documents/etsy_api_data_audit.md`).

## 8. 2026-07-03 Visual / Mobile / A11y Pass (Opus 4.8)

Scope: finish the visual identity, theme adaptation, mobile, WCAG, and AI-fallback
verification the build pass left partial. **Finding up front:** the warm design
system (tokens, Bricolage display font, rounded radius, warm shadows, gentle
`cubic-bezier` motion, global 44px touch targets) was already strong — so this
pass was targeted refinement + the missing pieces, not a risky wholesale repaint
of screens that can't be visually verified without auth.

**Verification tooling (new, in `scripts/`, kept for future passes):**
- `contrast-audit.mjs` — pure-Node WCAG contrast math over the token palette.
- `visual-qa.mjs` — Playwright desktop+mobile screenshots + `@axe-core` scan + 390px overflow check (run against public routes; authed screens need a logged-in session).
- `ai-fallback-sim.mjs` — reproduces the edge-function fallback branches and asserts each failure scenario (11 assertions).

**Systemic a11y/visual fixes (propagate app-wide):**
- Grade ramp rebuilt warm + AA: `badge.tsx` grade variants were dark-theme `-400` text failing AA badly (1.49–2.28:1). Now emerald→teal→amber→clay, F = clay (never red), all 4.9–6.9:1. `getGradeColor`/`GradeDot` aligned; `muted-foreground` 47→40% L (was 4.2:1, now 5.4:1).
- Two **light-mode CSS remaps scoped to `[data-app-shell]`** (so dark marketing pages are untouched): `text-*-400` → AA `-700` (114 legacy uses across 40+ files); low-alpha white utilities (`bg/border/hover-white` 1–10%) → warm tokens (were invisible white-on-white). Mirrors the existing dark-mode remap block in `index.css`.
- Inline-style light-mode bugs the CSS can't reach, fixed directly: Performance MetricPill/thumbnail/hover; Login button dark-on-teal; Register waitlist h1 (invisible dark-on-dark) + WaitlistCard inputs (white-on-cream).

**Features:**
- **Simple/Advanced** now covers all four data screens: Intelligence hides Competitors/Customers/Trends/Activity tabs in Simple (with "+ More detail"); Performance hides the per-listing attribution list. Uses the existing `useViewMode` hook.
- **Theme adaptation surfaced** (was invisible): `themeAdaptation.ts` gained `getThemeState`/`getShopMatchedTheme`/`lockTheme`/`resetToShopMatch` + full category coverage + drift-on-load; Settings→Appearance shows "Matched to your shop" and a "Match to my shop" reset, with manual pick as a permanent lock.

**Verified:** all public routes 0px overflow at 390px; `/login` 0 axe violations; grade/contrast pairs pass AA via `contrast-audit.mjs`; AI fallback 15/15 via `ai-fallback-sim.mjs`.

**Resolved since this section was written:** `grade-listing` now refunds a failed grade via `refund_grade` (migration `20260703000002_refund_grade.sql`, mirrors `refund_optimization` exactly), called in the `!aiRes.ok` branch before it returns either the stale-grade fallback or an error — `consume_grade`'s upfront charge no longer costs the seller a credit on AI-gateway failure. The misleading in-code comment is corrected.

**Open / found this pass:**
1. **Authed-screen visual QA needs the owner's eyes** — no local login means Dashboard/Listings/Intelligence/Performance/Fix-Actions/Personalize interiors were audited by code + token math, not screenshots. The systemic fixes propagate to them, but final visual sign-off is the owner's.
2. `/register` waitlist page mixes light-tuned tokens on a hardcoded dark card (2 small helper-text nodes at 3.08:1). Reconciling that semi-dark marketing page's palette is a separate task.
3. Deferred backend items from §7.12 (competitor-scan ToS, types regen, AppContext refactor, 500+ listings, Pinterest, photo apply-in-app, review-text mining) remain as listed.
