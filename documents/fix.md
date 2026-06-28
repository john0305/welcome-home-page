# RadarIQ — Fix Guide

**Based on:** `audit_results.md` (2026-06-06)

This guide covers all 14 items in the priority fix list. Each fix is labeled:

- **[LOCAL]** — apply here in this repo (Claude Code / your editor)
- **[LOVABLE]** — must be done via the Lovable editor or Lovable prompt (Supabase Edge Function internals, schema changes)
- **[DECISION]** — requires a product call before implementing

---

## Fix 1 — Add `.env` / `.env.*` to `.gitignore` [LOCAL]

**Risk: 🔴 Critical | Effort: XS (30 seconds)**

The `.gitignore` only ignores `*.local` files. All `.env` files including production Stripe and Supabase keys are committed.

**File:** `.gitignore`

Add these four lines anywhere in the file:

```gitignore
.env
.env.development
.env.production
.env.staging
```

> **Note:** This does not remove the files from git history. If the Supabase project ref or any secret has been pushed to a public repo, rotate the keys in the Supabase dashboard and Stripe dashboard immediately. The `VITE_SUPABASE_PUBLISHABLE_KEY` is technically public by design (anon key), but the Stripe publishable key and project ref should not be in version history.

---

## Fix 2 — Re-enable JWT verification on user-facing edge functions [LOVABLE + LOCAL]

**Risk: 🔴 Critical | Effort: S**

### Part A — Fix `supabase/config.toml` [LOCAL]

The table below classifies each function. Update the file so only the legitimate exceptions keep `verify_jwt = false`:

| Function | Current | Correct | Reason |
|---|---|---|---|
| `auth-email-hook` | false | **false** | Supabase auth hook — cannot carry user JWT |
| `snapshot-performance` | false | **true** | Called by authenticated users |
| `change-subscription` | false | **true** | User action, must verify caller |
| `create-checkout` | false | **true** | User action, must verify caller |
| `create-portal-session` | false | **true** | User action, must verify caller |
| `payments-webhook` | false | **false** | Stripe webhook — verify with Stripe sig |
| `sync-checkout-session` | false | **false** | Stripe webhook — verify with Stripe sig |
| `decay-grades` | false | **false** | pg_cron — no user JWT; protect with cron secret |
| `sync-all-stores` | false | **false** | pg_cron — no user JWT; protect with cron secret |
| `scheduled-optimization` | false | **false** | pg_cron — protect with cron secret |
| `join-feature-waitlist` | false | **false** | Public form — legitimately unauthenticated |
| `etsy-oauth` | false | **false** | OAuth callback — no user JWT yet |
| `process-email-queue` | true | **true** | Correct |
| `nightly-action-scan` | (if present) | **false** | pg_cron — protect with cron secret |

Replace the entire `supabase/config.toml` with:

```toml
project_id = "brqkcbdbsciwfmnipzbx"

[functions.auth-email-hook]
  verify_jwt = false

[functions.snapshot-performance]
  verify_jwt = true

[functions.change-subscription]
  verify_jwt = true

[functions.create-checkout]
  verify_jwt = true

[functions.create-portal-session]
  verify_jwt = true

[functions.payments-webhook]
  verify_jwt = false

[functions.sync-checkout-session]
  verify_jwt = false

[functions.decay-grades]
  verify_jwt = false

[functions.sync-all-stores]
  verify_jwt = false

[functions.process-email-queue]
  verify_jwt = true

[functions.scheduled-optimization]
  verify_jwt = false

[functions.join-feature-waitlist]
  verify_jwt = false

[functions.etsy-oauth]
  verify_jwt = false
```

### Part B — Add internal auth guards to cron/webhook functions [LOVABLE]

The config change alone re-enables JWT checks on user-facing functions. For cron jobs and webhooks that keep `verify_jwt = false`, you must add internal validation. Use this Lovable prompt for each:

**For cron functions (`decay-grades`, `sync-all-stores`, `scheduled-optimization`, `nightly-action-scan`):**

> In the `[function-name]` edge function, add a cron secret guard at the top of the handler. Check for an `x-cron-trigger` header whose value matches a `CRON_SECRET` environment variable. If the header is missing or the value doesn't match, return a 401. This prevents the function from being called by arbitrary HTTP requests since `verify_jwt = false`.

**For Stripe webhook functions (`payments-webhook`, `sync-checkout-session`):**

> Confirm that `payments-webhook` and `sync-checkout-session` are verifying the Stripe webhook signature using `stripe.webhooks.constructEvent()` with the `STRIPE_WEBHOOK_SECRET` env var. This is the correct defense-in-depth replacement for JWT verification on webhook endpoints.

---

## Fix 3 — Remove duplicate entries in `supabase/config.toml` [LOCAL]

**Risk: 🔴 Critical | Effort: XS**

The current file has `[functions.snapshot-performance]` with two consecutive `verify_jwt = false` lines, and `[functions.sync-checkout-session]` appears twice. TOML rejects duplicate table names.

This is fully resolved by applying the complete replacement in **Fix 2 Part A** above.

---

## Fix 4 — Remove CORS wildcard fallback in `customer-portal` [LOCAL]

**Risk: 🟠 High | Effort: XS**

**File:** `functions/customer-portal/index.ts:19`

```diff
- res.set('Access-Control-Allow-Origin', process.env.APP_URL ?? '*')
+ const allowedOrigin = process.env.APP_URL
+ if (!allowedOrigin) {
+   return res.status(500).json({ error: 'APP_URL not configured' })
+ }
+ res.set('Access-Control-Allow-Origin', allowedOrigin)
```

Also update the OPTIONS handler on the same line:

```diff
- if (req.method === 'OPTIONS') return res.status(204).send('')
+ if (req.method === 'OPTIONS') {
+   res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
+   res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
+   return res.status(204).send('')
+ }
```

Additionally, this function trusts the `user_id` from the POST body without verifying the caller is who they claim to be. Add a caller authentication check:

```diff
+ // Verify the request carries a valid service key or signed user token.
+ const authHeader = req.headers.authorization ?? ''
+ if (!authHeader.startsWith('Bearer ') || authHeader.slice(7) !== process.env.SERVICE_SECRET) {
+   return res.status(401).json({ error: 'Unauthorized' })
+ }
```

> **Note:** Long-term, this function should be migrated to a Supabase Edge Function where Supabase JWT verification handles caller auth natively. Google Cloud Functions require manual auth.

---

## Fix 5 — Remove Etsy OAuth tokens from browser-side state [LOCAL]

**Risk: 🟠 High | Effort: S**

Etsy `access_token` and `refresh_token` are fetched to the React client and stored in global state. No UI component reads them — they're only used by edge functions server-side.

### Step A — Update `AppContext.tsx`

**File:** `src/contexts/AppContext.tsx:448-470`

```diff
- const { data: token, error: tokenErr } = await supabase
-   .from('etsy_tokens')
-   .select('shop_id, shop_name, access_token, refresh_token, expires_at, created_at')
-   .eq('user_id', user.id)
-   .maybeSingle()
+ const { data: token, error: tokenErr } = await supabase
+   .from('etsy_tokens')
+   .select('shop_id, shop_name, expires_at, created_at')
+   .eq('user_id', user.id)
+   .maybeSingle()
```

Update the type cast and object construction on the same block:

```diff
- const t = token as { shop_id: string; shop_name: string | null; access_token: string; refresh_token: string; expires_at: string; created_at: string }
+ const t = token as { shop_id: string; shop_name: string | null; expires_at: string; created_at: string }
```

```diff
  setConnectedStore({
    id: t.shop_id, user_id: user.id, platform: 'etsy', shop_id: t.shop_id,
    shop_name: t.shop_name ?? 'Etsy Shop',
-   access_token: t.access_token,
-   refresh_token: t.refresh_token,
-   token_expires_at: t.expires_at,
+   access_token: '',
+   refresh_token: '',
+   token_expires_at: t.expires_at,
    is_connected: true, created_at: t.created_at,
    ...
  })
```

> Setting `access_token` and `refresh_token` to empty strings (rather than deleting them) avoids breaking the `ConnectedStore` type without a larger refactor. The values are never read downstream.

### Step B — Make token fields optional in the type [LOCAL]

**File:** `src/types/index.ts`

```diff
  export interface ConnectedStore {
    ...
-   access_token: string
-   refresh_token: string
+   access_token?: string
+   refresh_token?: string
    token_expires_at: string
    ...
  }
```

This also lets `mockData.ts` keep its mock strings without type errors.

---

## Fix 6 — Fix `etsy-refresh-token` vs `refresh-etsy-token` name mismatch [LOCAL]

**Risk: 🟡 Medium | Effort: XS**

`AuthContext` calls a function that doesn't match the deployed name. The edge function is `refresh-etsy-token` (based on `supabase/config.toml` and the `functions/` directory naming convention). The call site uses `etsy-refresh-token`.

**File:** `src/contexts/AuthContext.tsx:235`

```diff
- void supabase.functions.invoke('etsy-refresh-token', { body: {} })
+ void supabase.functions.invoke('refresh-etsy-token', { body: {} })
```

> If the deployed Supabase Edge Function is actually named `etsy-refresh-token` in Lovable, update to that instead. Verify via the Lovable Edge Functions panel to confirm the canonical name.

---

## Fix 7 — Remove unused `@google/generative-ai` dependency [LOCAL]

**Risk: 🟡 Medium | Effort: XS**

The package is in `dependencies` but has zero imports anywhere in the source. All AI calls route through the Lovable AI Gateway (Supabase Edge Functions).

**File:** `package.json`

```diff
  "dependencies": {
-   "@google/generative-ai": "^0.3.1",
    "@hookform/resolvers": "^3.3.4",
```

Then run: `npm install` (or `bun install`) to update the lock file.

---

## Fix 8 — Remove full-listings prefetch on login [LOCAL]

**Risk: 🟠 High | Effort: XS**

Every login fires a `SELECT *` across all listings in the background. For a 500-listing shop that's 200KB+ transferred before the user has even navigated to the Listings page. The `dashboardRows` slim payload already powers everything on the Dashboard.

**File:** `src/contexts/AppContext.tsx`

Find the `loadConnectedStore().then(async () => {` block (around line 493). Remove the prefetch call:

```diff
  void loadConnectedStore().then(async () => {
    void Promise.all([loadDashboardData(), refreshSyncStats()])
    void loadRecentOptimizations()
    void refreshPendingReviewIds()
-   // Prefetch the full listings payload in the background so navigating to
-   // the Listings page is instant — no blank flash while it loads.
-   void loadListings()

    // ── Auto-sync (session-guarded) ──
```

`loadListings()` already runs lazily when the Listings page mounts (via `listingsLoadedRef`), so the user experience on that page is unchanged.

---

## Fix 9 — Add a root `ErrorBoundary` [LOCAL]

**Risk: 🟡 Medium | Effort: S**

Zero error boundaries exist. A null reference in any rendered component crashes the entire app to a blank screen with no recovery.

### Step A — Create `src/components/ErrorBoundary.tsx`

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
          <p className="text-lg font-semibold">Something went wrong.</p>
          <button
            className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

### Step B — Wrap the app in `src/App.tsx`

```diff
+ import { ErrorBoundary } from '@/components/ErrorBoundary'

  export default function App() {
    return (
+     <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            ...
          </BrowserRouter>
        </QueryClientProvider>
+     </ErrorBoundary>
    )
  }
```

---

## Fix 10 — Fix hardcoded optimization limit copy [DECISION → LOCAL]

**Risk: 🟡 Medium | Effort: XS**

There is a three-way inconsistency in the free tier optimization limit:

| Source | Value |
|---|---|
| `src/lib/payments.ts` — PLANS definition | **10** |
| `src/hooks/useOptimizationUsage.tsx` — enforcement | **5** |
| `src/components/optimization/OptimizationLimitGate.tsx` — enforcement | **5** |
| `src/hooks/useListingActions.tsx` — toast copy | **5** |
| `src/pages/NewListing.tsx` — toast copy | **5** |
| `src/pages/Terms.tsx` — legal text | **5** |

**The Terms of Service says 5. The enforcement code enforces 5.** The `payments.ts` PLANS array (used for marketing display only) incorrectly shows 10.

**Decision required:** Is the authoritative limit 5 or 10? 

- If **5**: Update `payments.ts` free tier features array from "10 AI optimizations per month" → "5 AI optimizations per month", and update `limits: { optimizations_per_month: 5 }`.
- If **10**: Update `useOptimizationUsage.tsx`, `OptimizationLimitGate.tsx`, both toast messages in `useListingActions.tsx`, `NewListing.tsx`, and `Terms.tsx`.

**Assuming the decision is 5 (matches legal text and enforcement):**

**File:** `src/lib/payments.ts:49-56`

```diff
  {
    id: 'free' as const,
    ...
    features: [
-     '10 AI optimizations per month',
+     '5 AI optimizations per month',
      ...
    ],
-   limits: { optimizations_per_month: 10, stores: 1 },
+   limits: { optimizations_per_month: 5, stores: 1 },
  },
```

---

## Fix 11 — Remove stale env var declarations from `vite-env.d.ts` [LOCAL]

**Risk: 🟢 Low | Effort: XS**

Five env var declarations reference old Stripe price ID patterns that no longer exist in any `.env` file or code.

**File:** `src/vite-env.d.ts`

```diff
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly VITE_ETSY_REDIRECT_URI: string
    readonly VITE_GA_MEASUREMENT_ID: string
    readonly VITE_GA_PROPERTY_ID: string
    readonly VITE_APP_URL: string
-   readonly VITE_STRIPE_PUBLISHABLE_KEY: string
-   readonly VITE_STRIPE_PRO_MONTHLY_PRICE_ID: string
-   readonly VITE_STRIPE_PRO_YEARLY_PRICE_ID: string
-   readonly VITE_STRIPE_ENTERPRISE_MONTHLY_PRICE_ID: string
-   readonly VITE_STRIPE_ENTERPRISE_YEARLY_PRICE_ID: string
    readonly VITE_CHROMA_URL: string
+   readonly VITE_PAYMENTS_CLIENT_TOKEN: string
+   readonly VITE_SHOW_AGENCY_TIER: string
+   readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
+   readonly VITE_SUPABASE_PROJECT_ID: string
  }
```

---

## Fix 12 — Add bundle splitting to Vite config [LOCAL]

**Risk: 🟡 Medium | Effort: S**

All pages and libraries build into a single JS bundle. Route-level code splitting reduces initial load time significantly, especially for the heavy Admin, Intelligence, and PersonalWorkspace pages.

**File:** `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-stripe': ['@stripe/stripe-js', '@stripe/react-stripe-js'],
          'vendor-charts': ['recharts'],
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
          ],
        },
      },
    },
  },
})
```

For maximum improvement, also lazy-load heavy pages in `App.tsx`. Example pattern:

```diff
- import Admin from '@/pages/Admin'
- import Intelligence from '@/pages/Intelligence'
- import PersonalWorkspace from '@/pages/PersonalWorkspace'
+ import { lazy, Suspense } from 'react'
+ const Admin = lazy(() => import('@/pages/Admin'))
+ const Intelligence = lazy(() => import('@/pages/Intelligence'))
+ const PersonalWorkspace = lazy(() => import('@/pages/PersonalWorkspace'))
```

Wrap the `<Routes>` block with a fallback:

```diff
+ <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
    <Routes>
      ...
    </Routes>
+ </Suspense>
```

---

## Fix 13 — Debounce heartbeat and profile refresh on focus [LOCAL]

**Risk: 🟡 Medium | Effort: S**

Every `window focus` and `visibilitychange` event triggers both a Supabase profile read and a `user_profiles` write (`last_seen_at`). For active users this fires many times per minute.

**File:** `src/contexts/AuthContext.tsx`

### Part A — Debounce profile refresh (30s minimum between focus-triggered refreshes)

Locate the profile refresh `useEffect` (around line 266). Add a ref to track the last refresh time:

```diff
  useEffect(() => {
    if (usingMockAuth || !user?.id) return
+   let lastRefreshMs = 0
+   const MIN_REFRESH_INTERVAL = 30_000

    const refreshCurrentProfile = () => {
+     const now = Date.now()
+     if (now - lastRefreshMs < MIN_REFRESH_INTERVAL) return
+     lastRefreshMs = now
      void fetchProfile(user.id, undefined, { background: true })
    }
```

### Part B — Debounce heartbeat (2 minutes minimum between pings)

Locate the heartbeat `useEffect` (around line 290). Add the same pattern:

```diff
  useEffect(() => {
    if (usingMockAuth || !user?.id || !supabase) return
+   let lastPingMs = 0
+   const MIN_PING_INTERVAL = 120_000

    const ping = () => {
      if (document.visibilityState !== 'visible') return
+     const now = Date.now()
+     if (now - lastPingMs < MIN_PING_INTERVAL) return
+     lastPingMs = now
      void supabase!
        .from('user_profiles')
```

---

## Fix 14 — Delete abandoned `Insights.tsx` page [LOCAL]

**Risk: 🟢 Low | Effort: S**

`/app/insights` redirects to `/app/score-roadmap`. `Insights.tsx` renders 100% mock data and is unreachable via the UI. Keeping it creates maintenance debt and risks future confusion if the redirect is ever removed.

### Files to delete:
- `src/pages/Insights.tsx`

### Remaining references to clean up after deletion:

**`src/components/layout/Sidebar.tsx:28`** — Remove the `/app/insights` entry.

**`src/components/layout/Header.tsx:36`** — Remove `/app/insights` from `TOP_LEVEL_ROUTES`.

**`src/hooks/usePageContext.ts:25`** — Remove the `'/app/insights': 'Shop Insights'` entry.

**`src/lib/echo/pageLabels.ts:11`** — Remove the `'/app/insights'` entry.

**`src/lib/echo/sampleQuestions.ts:50`** — Remove the `'/app/insights'` array.

**`src/lib/sampleQuestions.ts:106`** — Remove the `'Shop Insights': DEFAULT` entry.

> **Alternative:** If Insights is planned to be a real page (backed by live data), do not delete it — instead wire it to real data and remove the mock imports. This is a product decision, but given the `/app/insights → /app/score-roadmap` redirect in `App.tsx`, deletion is the right call unless there's an active plan to revive it.

---

## Execution Order

Apply fixes in this order to avoid cascading issues:

| Order | Fix | Where |
|---|---|---|
| 1 | `.gitignore` (Fix 1) | Local |
| 2 | `supabase/config.toml` full replacement (Fix 2 + 3) | Local |
| 3 | CORS wildcard removal (Fix 4) | Local |
| 4 | Remove tokens from browser query (Fix 5) | Local |
| 5 | Function name typo (Fix 6) | Local |
| 6 | Remove `@google/generative-ai` + reinstall (Fix 7) | Local |
| 7 | Remove login prefetch (Fix 8) | Local |
| 8 | Add ErrorBoundary (Fix 9) | Local |
| 9 | `vite-env.d.ts` cleanup (Fix 11) | Local |
| 10 | Vite bundle splitting (Fix 12) | Local |
| 11 | Debounce heartbeat (Fix 13) | Local |
| 12 | Delete Insights + refs (Fix 14) | Local |
| 13 | Decide free limit, fix copy (Fix 10) | Decision → Local |
| 14 | Add cron secret guards in edge functions (Fix 2 Part B) | Lovable |

---

## Lovable Prompt Summary

The following is a ready-to-paste Lovable prompt for the edge function changes (Fix 2 Part B) that can't be done locally:

---

> I need to add internal auth guards to several Supabase Edge Functions that run as cron jobs or webhooks (they have `verify_jwt = false`). Please do the following:
>
> 1. **`decay-grades`, `sync-all-stores`, `scheduled-optimization`, `nightly-action-scan`** — At the very top of each handler, before any business logic, check for an `x-cron-trigger` header. The value must match a `CRON_SECRET` environment variable. If the header is absent or wrong, return `new Response('Unauthorized', { status: 401 })`. Add `CRON_SECRET` to the function's required env vars.
>
> 2. **`payments-webhook`, `sync-checkout-session`** — Confirm (or add) Stripe webhook signature verification using `stripe.webhooks.constructEvent(body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET'))`. If signature validation fails, return 400. Do not process the event body without a valid signature.
>
> 3. **`snapshot-performance`, `create-checkout`, `create-portal-session`, `change-subscription`** — These have been updated to `verify_jwt = true` in `supabase/config.toml`. Confirm each function uses `const authHeader = req.headers.get('Authorization')` (or equivalent) to get the calling user's identity. Do not hardcode or accept `user_id` from the request body for privileged operations — always derive it from the verified JWT via `supabase.auth.getUser(token)`.
