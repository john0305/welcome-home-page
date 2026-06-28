# Antigravity Rules — RadarIQ Project Reference & Pre-Flight Checklist

This document consolidates key architectural constraints, database schemas, security rules, and code patterns for the **RadarIQ** Etsy seller intelligence platform. Review this document before making any changes to the project.

---

## 1. Platform Overview & Core Stack

**RadarIQ** (radariq.app) is an AI-powered SaaS dashboard that helps Etsy sellers grade listings, identify optimizations, track store velocity, analyze competitor tag/price changes, and use **Echo** (an AI assistant) for data-driven shop recommendations.

- **Frontend**: React 18 + Vite 5 + TypeScript 5 + Tailwind CSS v3 + shadcn/ui.
- **Backend**: Lovable Cloud (managed Supabase: PostgreSQL database + Edge Functions + Realtime).
- **Authentication**: Supabase Auth (default test login: `admin / 1234`).
- **AI Gateway**: Google Gemini (via Supabase AI Gateway) for listing grading, optimizations, and Echo chat.

---

## 2. Hard Architectural Rules

Never violate these architectural constraints:

### A. Data Isolation & Security
- **Scope Every Query**: Every client or function query targeting user data must be scoped with:
  ```sql
  WHERE user_id = auth.uid()
  ```
- **Row-Level Security (RLS)**: Every database table must have RLS enabled. RLS policies must allow read/write only to the owner (`user_id = auth.uid()`) and full access to the `service_role`.
- **OAuth & API Tokens**: Etsy and Stripe access tokens must never transit to the browser. Read them in backend/edge functions using the service-role key.

### B. Database Conventions
- **Historical State**: Never `UPDATE` rows representing historical snapshots (e.g., `listing_snapshots`, `market_snapshots`). These must be `INSERT` only.
- **Timestamps**: All database timestamps must use `TIMESTAMPTZ`, not `TIMESTAMP`.
- **User Roles**: User roles are stored in a separate `user_roles` table with an `app_role` enum and a `SECURITY DEFINER` `has_role()` function. Do not store roles directly on `profiles` or `users`.

### C. Grading & Optimizations
- **Weights Single Source of Truth**: `src/lib/etsyRankingFactors.ts` (`ETSY_RANKING_FACTORS`) is the authoritative source for all grading checks and weights. Never hardcode grading weights elsewhere.
- **Fix Actions Queue**: The `fix_actions` table is the single source of truth for all optimization states. Never set done/pending state from UI buttons; write to and read from `fix_actions`.
- **Health Scores**: Do not average or merge `healthScore.overall` (shop health) and `overall_market_score` (shop intelligence score). Keep them separate.

### D. Edge Functions & AI Gateway
- **Graceful Error Handling**: All edge functions must return HTTP 200. Failures must be returned in the response payload as `{ success: false, error: '...' }`. Never let raw 500 errors propagate to the client.
- **AI Gateway Routing**: Route all AI model requests through the Supabase AI Gateway. Never invoke model APIs (Gemini, Claude) directly from edge functions.
- **Realtime Subscriptions**: To avoid the `cannot add postgres_changes callbacks after subscribe()` error, subscribe to channels with a unique suffix:
  ```typescript
  const channelName = `shop-intelligence-${userId}-${Math.random().toString(36).slice(2)}`
  ```

---

## 3. Pre-Flight Coding Checklist

Before making changes, verify that the proposed changes satisfy these questions:

- [ ] **Query Security**: Are all database queries scoped to `auth.uid()` or the verified `user_id`?
- [ ] **RLS Compliance**: If creating a table or schema migration, did you include `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and explicit policies?
- [ ] **Historical Snapshot Rule**: If the table is a history/snapshot log, is it write-only/insert-only?
- [ ] **Date/Time Types**: Are all timestamps defined as `TIMESTAMPTZ`?
- [ ] **Grading Consistency**: If the changes affect listing grading, does it align with `src/lib/etsyRankingFactors.ts`?
- [ ] **Fix State Integrity**: Does the optimization logic rely exclusively on `fix_actions` state rather than local state?
- [ ] **JWT Verification**: Have you verified that user-facing endpoints in `supabase/config.toml` have `verify_jwt = true` (or are protected by a secure token)?
- [ ] **Edge Function Contract**: Does the modified or new Edge Function catch all errors and return HTTP 200 with `{ success: false, error }` instead of throwing?
