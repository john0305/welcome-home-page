# RadarIQ — Market Intelligence Layer: Full Claude Code Build Spec
## Version 3 — Final, Phased, Production-Ready

---

## CRITICAL FIRST STEP — READ BEFORE WRITING ANY CODE

Before writing a single line, do the following:

1. **Read these project files first — before anything else:**
   - `lovable.md` (or any `.md` file in the project root —
     Lovable may name it differently; search for it)
   - Any existing `README.md`
   - `package.json` — understand what is already installed,
     do not add packages that already exist
   - `.env.example` — understand what environment variables exist
   - `src/integrations/supabase/` or equivalent — find the existing
     Supabase client setup. Do NOT create a second Supabase client.
   - `src/lib/` and `src/utils/` — find existing helper functions
     before writing new ones
   - `src/components/` — understand existing component library
     before building new components

   The `lovable.md` file in particular contains Lovable-generated
   project context including component structure, naming conventions,
   existing route definitions, and Supabase patterns already in use.
   Ignoring it risks creating conflicting patterns, duplicate clients,
   or components that break existing routing. Read it fully.

2. **Audit the entire existing codebase** — read every file
3. **Map all existing features** — document exactly what exists:
   - Shop health scoring (find it, read it, understand how it scores)
   - Listing scoring / AI grading system
   - Revert / before-after system (find exact table, columns,
     how revert is triggered, what field types it covers)
   - Renewal tracker and snapshot diffing logic
   - Echo chat advisor
   - Pinterest Spotlight (DO NOT TOUCH — paused pending API approval)
   - Achievement system (DISABLED — feature flag off, do not remove)
   - Personalization/onboarding form — find exact table and column
     names where shop category dropdown and all answers are stored
   - Any existing Etsy API integration or write access code
   - Any existing nightly/scheduled jobs
   - Current Supabase schema (read all migration files)
   - Existing design system — document color tokens, component
     patterns, typography, spacing, navigation, page layouts
   - Any existing inconsistencies in the UI — flag them before
     touching anything
4. **Do not duplicate anything** — extend existing systems, never rebuild
5. **List every existing feature, table, component, and function found**
   before proceeding. Developer must confirm audit is complete.
6. **Identify reuse opportunities:**
   - Renewal tracker snapshot diffing → reuse for competitor snapshots
   - Existing shop health scorer → extend, do not replace
   - Existing revert system → expand to cover all RadarIQ actions
   - Existing AI optimizer prompt → inject market context, do not rewrite
   - Personalization form data → first input to niche classifier

Only after completing and listing the full audit should you begin building.

---

## Project Context

**RadarIQ** is an Etsy listing optimization SaaS:
- **Frontend:** React + Tailwind (Claude Code writes UI directly 
  into existing codebase — match existing patterns)
- **Backend:** Supabase (Postgres, Edge Functions, Auth)
- **Scheduled jobs:** Supabase pg_cron (preferred for batch/nightly 
  work — reliable, no cold starts, easy to monitor)
- **Immediate triggers:** Supabase Edge Functions (event-driven only)
- **AI:** Anthropic Claude API (claude-sonnet-4-20250514)
- **Color system:** Primary teal #00C4AF, amber for HIGH IMPACT badges
- **Tiers:** Free / Starter ($14) / Pro ($39)
- **Write API:** Etsy write access is approved and available —
  use for direct listing edits (title, tags, description, price)
  Verify exact approved endpoints during audit

**Features currently paused — do not touch:**
- Pinterest Spotlight (paused pending Etsy API approval)
- Achievement system (disabled via feature flag — leave in place)
- Agency tier (removed from pricing — do not build for it)

---

## Platform Identity and Voice

This is not negotiable. Every piece of UI copy, every empty state,
every error message, every insight card must reflect this identity.

### The Four Personality Pillars

```
Confident  — Direct, not hedging
Specific   — Numbers and names, not vague suggestions  
Honest     — Surface bad news clearly, don't soften it into uselessness
Encouraging — Celebrate real wins only, never manufacture positivity
```

### Voice Examples

```
❌ NEVER:
"Your listing optimization score indicates potential areas 
for improvement in tag utilization."

✅ ALWAYS:
"You're leaving 3 high-traffic tags on the table. 
Your competitors are using them — you should be too."

❌ NEVER:
"Congratulations! Your score improved."

✅ ALWAYS:
"That title update worked. Your market score jumped 8 points 
in 7 days. Here's what to do next."

❌ NEVER:
"There may be some opportunities to consider regarding pricing."

✅ ALWAYS:
"Your price is 34% above niche average. That's likely hurting 
your click-through rate. Here's where competitors cluster."
```

### The Platform Flow — Every Page Reinforces This

```
SEE IT → UNDERSTAND IT → FIX IT → TRACK IT
```

Every page lives somewhere in this loop. Users should always know
where they are and what the next step is.

```
Dashboard        → SEE IT
  "Here's how your shop is performing vs your market"

Listing Detail   → UNDERSTAND IT
  "Here's specifically what's holding this listing back"

Guided Fix       → FIX IT
  "Here's exactly what to change — we'll help you do it"

Score History    → TRACK IT
  "Here's whether it worked"
```

Navigation, empty states, and copy all reinforce this loop.

---

## UI/UX Rules — Non-Negotiable

### Read the Existing Design System First

Before building any UI component:
1. Document all existing color tokens
2. Document all existing component patterns (cards, modals, 
   buttons, badges, tooltips)
3. Document typography scale and spacing system
4. Document navigation structure and page layouts
5. Flag any existing inconsistencies — propose fixes with rationale
   before changing anything

Do not introduce new patterns without justification.
If adding something new, document why existing patterns
didn't work for this case.

### Consistent Component Patterns

**Every insight card follows this structure — no exceptions:**
```
[Signal icon]  What we found          ← specific, never vague
[Impact badge] HIGH / MEDIUM / LOW    ← amber for HIGH
[Context]      How you compare        ← vs market benchmark
[Action]       What to do             ← one clear CTA only
[Status]       Not started / In progress / Done / Tracking
```

**Every score display includes:**
```
Score: 71/100
[Plain English: what 71 means in this context]
[What would move it to 80+]
[Trending indicator: ↑ ↓ → with delta]
```

**Every locked feature follows this pattern:**
```
[Specific number or count that exists behind the lock]
[Blurred/locked content preview]
[One sentence: exactly what unlocking gives you]
[Single upgrade CTA — never multiple competing buttons]
```

**Every action has:**
```
→ Loading state while executing
→ Success confirmation (specific: "3 tags added to your listing")
→ Error state with explanation and next step
→ Undo/revert option where applicable
```

**Every empty state is helpful:**
```
❌ "No data yet"
✅ "We're scanning your market. This usually takes about 60 seconds."
   [with progress indicator]

❌ "No listings found"  
✅ "Connect your Etsy shop to start seeing your market insights."
   [with connect button]
```

### User Onboarding Within the Product

Users should learn the platform by using it — not by reading docs.
Every page teaches without interrupting:
- Tooltips on first visit explain what each score means
- Progress indicators show where they are in the SEE→UNDERSTAND→FIX→TRACK loop
- Contextual hints appear when data is available but user hasn't acted
- "What this means" expandable sections on every score and metric
- Consistent iconography so users recognize signal types across pages

---

## Admin Panel — Command Center

The admin panel is not a reporting page. It is a control panel.
Every section has both visibility AND action.
Nothing requires a code deploy.
Nothing requires touching Supabase directly.

### The Principle

```
See something → do something about it
               from within the admin panel
               without writing code
               without a deploy
```

### Feature Flags Panel

This is how all toggleable behavior is controlled.
Every feature that can be turned on/off must be a feature flag.

```
FEATURE FLAGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Achievement System            [OFF]  ← disabled, leave off
Pinterest Spotlight           [PAUSED — pending API approval]
Echo Memory                   [ON — Pro only]
Competitor Alerts             [ON — Pro only]
Market Informed Optimizer     [ON — Pro only]
Algorithm Weight Model        [ON — Admin only]
Guided Fix — Tag Updates      [ON — All tiers]
Guided Fix — Title Updates    [ON — Pro only]
Guided Fix — Price Changes    [OFF — Coming soon]
Guided Fix — Description      [ON — Pro only]

Changes take effect immediately. No deploy needed.
```

```sql
CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL UNIQUE,
  label text NOT NULL,
  enabled boolean DEFAULT false,
  tier_restriction text,      -- null = all tiers, or 'pro', 'starter' etc
  paused boolean DEFAULT false,
  pause_reason text,
  last_changed_by text,
  last_changed_at timestamptz DEFAULT now(),
  notes text
);
```

### Admin Panel Pages

**`/admin` — Command Center Overview**
```
PLATFORM HEALTH                        QUICK ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    ━━━━━━━━━━━━━━━━━━━━
Total Users:      N                   [▶ Run Pipeline Now]
Active This Week: N                   [⚙ Adjust Weights]
Listings Scored:  N                   [+ Add Niche]
API Calls Today:  N / 9,000           [⚑ View Anomalies]
Cache Hit Rate:   N%                  [⚐ Feature Flags]
Last Nightly Run: June 7, 1:03 AM ✅

TIER DISTRIBUTION
Free: N  Starter: N  Pro: N

ANOMALY FLAGS                          PIPELINE STATUS
⚠️ High score/no traction: N  [View]  Last run: ✅ Complete
⚠️ Unknown niches: N          [Review] Next run: 1:00 AM
⚠️ Inactive 14+ days: N       [View]  Quota: ████░░ 43%
✅ No pipeline failures 48h            [View Full Log →]
```

**`/admin/pipeline` — Pipeline Health**
```
Every pipeline run visible here with full detail.
Admin can trigger runs, pause users, clear errors.

Actions available:
[▶ Run All Users Now]
[▶ Run Single User]  ← search by shop name
[⏸ Pause User Pipeline]
[✕ Clear Error State]
[↺ Retry Failed Runs]

Run log shows: user, time, type, status, 
listings processed, API calls, cache hits, errors
Click any row → full detail drilldown
```

**`/admin/niches` — Niche Manager**

This is the primary tool for managing seed niches and 
assigning niches to shops manually.

```
NICHE MANAGER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ADD NEW NICHE
[ Enter niche keyword... ] [→ Generate Queries]

Type "bath bombs" → Claude generates:
  ✅ "handmade bath bomb gift set"
  ✅ "natural fizzy bath bomb"
  ✅ "bath bomb self care bundle"
  [+ Add custom query]  [Edit any query]
[Confirm & Start Monitoring]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ASSIGN NICHE TO SHOP (for test accounts / overrides)
Shop:   [Select connected shop ▾]
Niche:  [Select active niche ▾]
Reason: [Test account / No listings / Manual override / Other]
[Assign & Run Pipeline Immediately]

Stored as niche_source: 'admin_assigned' in user_niche_profiles.
Overrides auto-detection. Audit trail preserved.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ACTIVE NICHES

Bath Bombs
  Queries: 3 active  |  Competitors tracked: 47
  Real users: 1  |  Admin-assigned: 2 (test accounts)
  Saturation: MEDIUM  Trend: ↑ Growing
  Cache TTL: 18h remaining
  [▶ Refresh Now] [✎ Edit Queries] [⏸ Deactivate]

UNKNOWN NICHES — NEEDS REVIEW
  Shop: ████  Tags suggest: "resin art"
  [+ Add as Niche] [✕ Ignore]
```

**`/admin/algorithm` — Etsy Algorithm Model**
```
ETSY ALGORITHM MODEL  v2026-Q2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Confidence: 67%  |  Sample size: 847 listing/rank pairs
Last adjusted: June 3  |  By: admin

LISTING SIGNALS
title_keyword_match   [████████░░] 0.82  [✎ Edit]
tag_relevance         [███████░░░] 0.71  [✎ Edit]
photo_count           [█████░░░░░] 0.54  [✎ Edit]
recency               [████░░░░░░] 0.43  [✎ Edit]
price_competitiveness [███░░░░░░░] 0.31  [✎ Edit]
description_quality   [██░░░░░░░░] 0.24  [✎ Edit]

SHOP SIGNALS
shop_age              [████████░░] 0.79  [✎ Edit]
review_score          [███████░░░] 0.74  [✎ Edit]
sales_velocity        [██████░░░░] 0.62  [✎ Edit]
review_count          [█████░░░░░] 0.58  [✎ Edit]

[▶ Re-score All Users With Current Weights]
[↺ Revert to Previous Version]
[📋 View Weight History]
[⬇ Export Model as JSON]

VALIDATION
Predicted vs actual rank correlation: 0.71 (good)
Last validated: June 5, 2026
[▶ Run Validation Now]
```

**`/admin/users` — User Intelligence**
```
Filter: [All Tiers ▾] [All Niches ▾] [All Status ▾]

Name       Tier     Niche           Score   Active    Flags
████████   Pro      Vintage Jewelry 71/100  Today     ✅
████████   Free     Bath & Beauty   43/100  3d ago    ✅
████████   Starter  Home Decor      58/100  8d ago    ⚠️ Inactive

Click any user → full drilldown:
  Pipeline history, score timeline, actions taken,
  niche profile, personalization answers, anomaly detail
  
Per-user actions:
  [▶ Run Pipeline]  [✎ Assign Niche]  
  [⚑ Change Tier]  [✉ Note]
```

**`/admin/anomalies` — Flags and Investigation**
```
HIGH SCORE / NO TRACTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
These shops score well but aren't getting traction.
Something external is suppressing them.

User ████  Market: 81  Quality: 79  Favorites: 3
  Likely: New shop suppression (shop age: 18 days)
  Action: [Surface suppression notice to user]
          [Add note] [Dismiss]

REVERT RATES BY ACTION TYPE
Tags updated      reverted 34% of the time  ⚠️ [Investigate]
Title updated     reverted 12% of the time  ✅
Photos confirmed  reverted  3% of the time  ✅

High revert rate on tags suggests recommendations
may not be resonating. Review tag gap logic.
```

**`/admin/settings` — Platform Settings**
```
All adjustable from here. No code deploy needed.

SCORING
  Score refresh rate:     [Daily ▾] for active listings
  Competitor pull limit:  [15 results ▾] per query
  Attribution window:     [7 days ▾]
  
TIER LIMITS
  Free listing limit:     [1 ▾]
  Starter listing limit:  [5 ▾]
  Score history free:     [7 days ▾]
  Score history starter:  [30 days ▾]

API
  Daily quota ceiling:    [9000 ▾] (of 10,000)
  Hourly burst limit:     [800 ▾]
  Stagger delay (batch):  [30s ▾]

NOTIFICATIONS
  Anomaly alert email:    [admin@radariq.app]
  Pipeline failure alert: [ON ▾]
  Quota warning at:       [80% ▾]
```

---

## Phased Build Plan

### Phase 1 — Core Engine (build first, ship it)
```
Priority order — do not deviate:

1.  Full codebase + design system audit (list everything found)
2.  Feature flags table + admin feature flags panel
3.  API quota manager (nothing calls Etsy without going through this)
4.  Shared market insight cache (cross-user, saves quota)
5.  Database migrations (new tables + alter existing)
6.  Tier access system — single source of truth
7.  Niche classifier (personalization form first, tags fallback)
8.  Onboarding pipeline Edge Function (immediate trigger)
9.  Deploy backfill Edge Function (existing connected users)
10. Market score calculation + missing tags
11. Photo change detection (num_images delta + URL diff)
12. Expand existing revert system (add source, attribution window)
13. Guided fix — tag updates (direct API write + revert)
14. Guided fix — title updates (AI market-informed + revert)
15. Phase 1 UI components (market score card, locked features,
    guided fix UI, loading states)
16. Admin panel Phase 1 (/admin overview, /admin/pipeline,
    /admin/niches with shop assignment, /admin/settings)
17. End-to-end test: signup → niche detected → pipeline fires →
    dashboard populated → guided fix works → revert works
18. End-to-end test: free/starter/pro tier gating correct
```

### Phase 2 — Expand + Intelligence
```
19. pg_cron scheduled jobs (replace any Edge Function cron)
20. Smart refresh tiers (daily/3day/weekly by listing activity)
21. Shop health scorer improvements (extend existing)
22. Algorithm weight model + admin panel (/admin/algorithm)
23. Admin users panel (/admin/users with drilldown)
24. Admin anomalies panel (/admin/anomalies)
25. Seed niche system (query-based, Claude-generated queries)
26. Niche opportunity finder
27. Action logging (user_listing_actions)
28. AI optimizer market context injection (extend existing)
29. Echo conversation history + score awareness (extend existing)
30. Score Roadmap benchmark overlay (extend existing)
31. Renewal Tracker timing intelligence (extend existing)
32. Data recycling (free user listings → competitor dataset)
33. Guided fix — description updates
34. Guided fix — price changes
```

### Phase 3 — Intelligence Layer (after 30+ days of real data)
```
35. Action attribution dashboard
36. Algorithm model validation automation
37. Competitor alerts (Pro users)
38. Email digests via Resend
39. Echo memory improvements
40. "What's working" admin dashboard with real data
41. Revert rate analysis and recommendations
42. Status page integration
```

---

## Non-Negotiable Architecture

### API Quota Manager — Build Before Any API Calls

Every Etsy API call goes through this. No exceptions.

```typescript
// lib/etsy-api-client.ts

const DAILY_LIMIT = 9000         // configurable from admin settings
const HOURLY_LIMIT = 800

class EtsyApiClient {
  // All reads go through here
  async search(query: string, options: SearchOptions) {
    await this.checkQuota()
    await this.logCall('search', query)
    // on 429: pause 60s, retry once, then fail gracefully
    // on quota exceeded: log warning, return empty with flag
    // never throw — always return usable response
  }

  // All writes go through here
  async updateListing(listingId: string, updates: ListingUpdates) {
    await this.checkQuota()
    await this.logCall('write', `listing:${listingId}`)
    // snapshot before state first
    // execute PATCH
    // snapshot after state
    // return both for revert system
  }

  // Priority: Pro > Starter > Free > Seed
  getPriority(tier: string): number {
    const priorities = { agency: 1, pro: 2, starter: 3, free: 4 }
    return priorities[tier] ?? 5
  }

  async checkQuota() {
    const [todayUsage, hourUsage] = await Promise.all([
      getApiCallsToday(),
      getApiCallsThisHour()
    ])
    const settings = await getAdminSettings()
    if (todayUsage >= settings.daily_quota_ceiling) {
      await logQuotaWarning('daily_limit_reached')
      return { quota_exceeded: true, reason: 'daily' }
    }
    if (hourUsage >= settings.hourly_burst_limit) {
      await sleep(60000) // wait 60s, then retry
    }
  }
}
```

### Shared Market Insight Cache

```sql
CREATE TABLE IF NOT EXISTS market_insight_cache (
  keyword_cluster text PRIMARY KEY,
  insights jsonb NOT NULL,
  competitor_listings jsonb,
  source text DEFAULT 'etsy_api',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
  -- Active niches (3+ users): 24h TTL
  -- Low activity (1-2 users): 48h TTL
  -- Seed niches: 72h TTL
);
```

Cache flow:
```
User A (bath bombs) → cache MISS → pull Etsy → store cache
User B (bath bombs) → cache HIT  → 0 API calls
User C (bath bombs) → cache HIT  → 0 API calls
```

### Smart Refresh Tiers

```typescript
function getRefreshSchedule(listing: Listing): 'daily' | 'every3days' | 'weekly' {
  const isNew = listing.age_days < 14
  const hasTraction = listing.num_favorers > 20
  const hasActivity = listing.num_favorers > 5
  if (isNew || hasTraction) return 'daily'
  if (hasActivity) return 'every3days'
  return 'weekly'
}
// Cuts API usage 60-70% at scale
```

### pg_cron Schedule

```sql
-- Nightly batch (not Edge Functions — more reliable)
SELECT cron.schedule('market-intelligence-nightly',
  '0 1 * * *', $$ SELECT run_market_intelligence_batch(); $$);

SELECT cron.schedule('shop-health-weekly',
  '0 3 * * 0', $$ SELECT run_shop_health_batch(); $$);

SELECT cron.schedule('platform-metrics-rollup',
  '0 5 * * *', $$ SELECT run_platform_metrics_rollup(); $$);

SELECT cron.schedule('action-attribution-nightly',
  '0 4 * * *', $$ SELECT run_action_attribution(); $$);
```

Edge Functions handle only:
- `onboarding-pipeline` — immediate, shop connect webhook
- `on-demand-refresh` — user clicks Refresh button
- `deploy-backfill` — one-time, run after deploy
- `guided-fix-apply` — immediate, user applies a fix

---

## Database Schema

### Audit First
Read all migration files. Alter existing tables — never recreate.
Find and document the existing revert table before touching schema.

### New Tables

```sql
-- Feature flags (admin controlled, no code deploy needed)
CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL UNIQUE,
  label text NOT NULL,
  enabled boolean DEFAULT false,
  tier_restriction text,
  paused boolean DEFAULT false,
  pause_reason text,
  last_changed_by text,
  last_changed_at timestamptz DEFAULT now(),
  notes text
);

-- Seed flags for known features
INSERT INTO feature_flags (flag_key, label, enabled, paused, pause_reason) VALUES
  ('achievement_system', 'Achievement System', false, false, null),
  ('pinterest_spotlight', 'Pinterest Spotlight', false, true, 
   'Paused pending Etsy API commercial approval'),
  ('echo_memory', 'Echo Memory', true, false, null),
  ('competitor_alerts', 'Competitor Alerts', true, false, null),
  ('market_informed_optimizer', 'Market Informed Optimizer', true, false, null),
  ('algorithm_weight_model', 'Algorithm Weight Model (Beta)', true, false, null),
  ('guided_fix_tags', 'Guided Fix — Tag Updates', true, false, null),
  ('guided_fix_title', 'Guided Fix — Title Updates', true, false, null),
  ('guided_fix_price', 'Guided Fix — Price Changes', false, false, null),
  ('guided_fix_description', 'Guided Fix — Description', true, false, null)
ON CONFLICT (flag_key) DO NOTHING;

-- Shared market cache (cross-user)
CREATE TABLE IF NOT EXISTS market_insight_cache (
  keyword_cluster text PRIMARY KEY,
  insights jsonb NOT NULL,
  competitor_listings jsonb,
  source text DEFAULT 'etsy_api',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Competitor snapshots (shared, not per-user)
CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_cluster text NOT NULL,
  etsy_listing_id text NOT NULL,
  shop_id text,
  shop_name text,
  title text,
  tags text[],
  price decimal,
  num_favorers integer,
  quantity integer,
  photo_count integer,
  image_urls text[],               -- for URL diff detection
  description_length integer,
  rank_position integer,
  source text DEFAULT 'etsy_api', -- 'etsy_api'|'platform_user'|'seed'
  captured_at timestamptz DEFAULT now(),
  UNIQUE(keyword_cluster, etsy_listing_id, captured_at::date)
);

-- Per-user market scores
CREATE TABLE IF NOT EXISTS listing_market_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  listing_id text NOT NULL,
  keyword_cluster text NOT NULL,
  quality_score integer,           -- existing AI grade, preserved as-is
  market_score integer,            -- new: 0-100 vs market
  title_score integer,
  tag_score integer,
  price_score integer,
  photo_score integer,
  favorites_score integer,
  description_score integer,
  market_rank_estimate integer,
  missing_tags text[],
  missing_tag_count integer,
  favorites_count integer,
  -- Photo tracking:
  photo_count integer,
  image_urls text[],               -- snapshot for diff
  primary_image_url text,
  scored_at timestamptz DEFAULT now()
);

-- User niche profiles
CREATE TABLE IF NOT EXISTS user_niche_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  primary_niche text,
  secondary_niches text[],
  keyword_clusters text[],
  niche_source text,
  -- 'personalization_form'|'tag_inference'|'admin_assigned'|'combined'
  niche_confidence decimal,
  personalization_category text,   -- raw dropdown value from form
  tag_inference_niche text,
  niches_conflict boolean,
  -- From personalization form (populated after audit confirms fields):
  target_customer text,
  price_range text,
  seller_goals text[],
  detected_at timestamptz DEFAULT now(),
  last_updated timestamptz DEFAULT now()
);

-- Seed niches (query-based, no shop IDs)
CREATE TABLE IF NOT EXISTS seed_niches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche_label text NOT NULL,
  niche_key text NOT NULL UNIQUE,
  ai_generated_queries text[],
  custom_queries text[],
  active boolean DEFAULT true,
  last_refreshed timestamptz,
  competitor_listing_count integer DEFAULT 0,
  real_user_count integer DEFAULT 0,
  admin_assigned_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Etsy algorithm weight model
CREATE TABLE IF NOT EXISTS algorithm_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  weights jsonb NOT NULL,
  confidence decimal,
  sample_size integer,
  validation_correlation decimal,
  last_validated_at timestamptz,
  is_active boolean DEFAULT false,
  notes text,
  created_by text,
  created_at timestamptz DEFAULT now()
);

-- Algorithm weight history (audit trail)
CREATE TABLE IF NOT EXISTS algorithm_weight_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weights jsonb NOT NULL,
  version text NOT NULL,
  changed_by text,
  change_reason text,
  confidence_before decimal,
  confidence_after decimal,
  created_at timestamptz DEFAULT now()
);

-- Action effectiveness (build now, dashboard Phase 3)
CREATE TABLE IF NOT EXISTS action_effectiveness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  cohort_date date NOT NULL,
  sample_size integer,
  avg_delta_7d decimal,
  avg_delta_30d decimal,
  pct_improved decimal,
  pct_declined decimal,
  pct_reverted decimal,            -- track revert rates
  UNIQUE(action_type, cohort_date)
);

-- Every action user takes through RadarIQ
CREATE TABLE IF NOT EXISTS user_listing_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  listing_id text NOT NULL,
  action_type text NOT NULL,
  -- 'title_updated'|'tags_updated'|'photos_added'|'photo_replaced'
  -- 'price_changed'|'description_updated'|'renewed'
  -- 'optimized_ai'|'optimized_market'|'echo_suggestion_applied'
  action_source text,
  -- 'ai_suggestion'|'manual'|'echo_chat'
  -- 'guided_fix'|'score_roadmap'|'market_insight'
  before_value jsonb,
  after_value jsonb,
  attribution_window_ends timestamptz, -- performed_at + 7 days
  reverted_at timestamptz,
  revert_reason text,
  performed_at timestamptz DEFAULT now()
);

-- Niche health over time
CREATE TABLE IF NOT EXISTS niche_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_cluster text NOT NULL,
  date date NOT NULL,
  avg_competition_score decimal,
  avg_competitor_favorers decimal,
  active_listing_count integer,
  saturation_level text,
  trend text,
  UNIQUE(keyword_cluster, date)
);

-- Platform admin daily metrics
CREATE TABLE IF NOT EXISTS platform_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date UNIQUE NOT NULL,
  active_users integer DEFAULT 0,
  listings_scored integer DEFAULT 0,
  actions_taken integer DEFAULT 0,
  actions_reverted integer DEFAULT 0,
  avg_market_score decimal,
  avg_quality_score decimal,
  api_calls_made integer DEFAULT 0,
  api_quota_remaining integer,
  cache_hit_rate decimal,
  job_success_rate decimal,
  high_score_no_traction_count integer DEFAULT 0,
  free_users integer DEFAULT 0,
  starter_users integer DEFAULT 0,
  pro_users integer DEFAULT 0
);

-- Pipeline run log
CREATE TABLE IF NOT EXISTS pipeline_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users,
  run_type text NOT NULL,
  trigger_reason text,
  status text DEFAULT 'running',
  listings_processed integer DEFAULT 0,
  api_calls_made integer DEFAULT 0,
  cache_hits integer DEFAULT 0,
  errors jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- API quota tracking
CREATE TABLE IF NOT EXISTS api_quota_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  called_at timestamptz DEFAULT now(),
  endpoint text,
  call_type text,                  -- 'read'|'write'
  user_id uuid,
  priority integer,
  success boolean DEFAULT true
);

-- Admin platform settings (adjustable from UI)
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  label text,
  last_changed_by text,
  last_changed_at timestamptz DEFAULT now()
);

-- Seed defaults
INSERT INTO platform_settings (key, value, label) VALUES
  ('daily_quota_ceiling', '9000', 'Daily API quota ceiling'),
  ('hourly_burst_limit', '800', 'Hourly API burst limit'),
  ('batch_stagger_seconds', '30', 'Seconds between batch pipeline runs'),
  ('attribution_window_days', '7', 'Days to track score after action'),
  ('free_listing_limit', '1', 'Max listings for free tier'),
  ('starter_listing_limit', '5', 'Max listings for starter tier'),
  ('score_history_free_days', '7', 'Score history days for free tier'),
  ('score_history_starter_days', '30', 'Score history days for starter tier'),
  ('anomaly_threshold_market_score', '75', 'Min market score for anomaly flag'),
  ('anomaly_threshold_favorites', '10', 'Max favorites for anomaly flag'),
  ('inactive_user_days', '14', 'Days before user flagged inactive')
ON CONFLICT (key) DO NOTHING;

-- Echo conversation history
CREATE TABLE IF NOT EXISTS echo_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  listing_id text,
  role text NOT NULL,              -- 'user'|'assistant'
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

### Existing Table Alterations (after audit confirms table names)

```sql
-- Users table
ALTER TABLE [users_table] ADD COLUMN IF NOT EXISTS
  market_intelligence_initialized boolean DEFAULT false;
ALTER TABLE [users_table] ADD COLUMN IF NOT EXISTS
  last_pipeline_run timestamptz;
ALTER TABLE [users_table] ADD COLUMN IF NOT EXISTS
  niche_detected boolean DEFAULT false;
ALTER TABLE [users_table] ADD COLUMN IF NOT EXISTS
  data_contributes_to_platform boolean DEFAULT true;

-- Existing shop health table (extend, do not replace)
ALTER TABLE [shop_health_table] ADD COLUMN IF NOT EXISTS
  suppression_risk text;
ALTER TABLE [shop_health_table] ADD COLUMN IF NOT EXISTS
  suppression_reasons text[];
ALTER TABLE [shop_health_table] ADD COLUMN IF NOT EXISTS
  competitor_avg_health decimal;
ALTER TABLE [shop_health_table] ADD COLUMN IF NOT EXISTS
  market_context_score integer;

-- Existing revert table (extend, do not replace)
ALTER TABLE [revert_table] ADD COLUMN IF NOT EXISTS
  action_source text;
ALTER TABLE [revert_table] ADD COLUMN IF NOT EXISTS
  attribution_window_ends timestamptz;
ALTER TABLE [revert_table] ADD COLUMN IF NOT EXISTS
  reverted_at timestamptz;
ALTER TABLE [revert_table] ADD COLUMN IF NOT EXISTS
  revert_reason text;
```

---

## Tier Access System

```typescript
// lib/tier-access.ts — single source of truth
// Never hardcode tier logic anywhere else

export type Tier = 'free' | 'starter' | 'pro'

export type Feature =
  | 'listings_1' | 'listings_5' | 'listings_all'
  | 'market_score_basic'        // single number — all tiers
  | 'market_score_breakdown'    // per-dimension — pro only
  | 'tag_gap_count_only'        // "missing 8 tags" — free
  | 'tag_gap_top3'              // 3 tags shown — starter
  | 'tag_gap_full'              // all tags — pro
  | 'competitor_count_only'     // "23 competitors" — free
  | 'competitor_basic'          // avg price only — starter
  | 'competitor_full'           // full details — pro
  | 'score_history_7d'
  | 'score_history_30d'
  | 'score_history_unlimited'
  | 'price_positioning_basic'
  | 'price_positioning_full'
  | 'niche_health'
  | 'shop_suppression_analysis'
  | 'market_rank_estimate'
  | 'action_attribution'
  | 'competitor_alerts'
  | 'market_informed_optimization'
  | 'guided_fix_tags'           // all tiers (if feature flag on)
  | 'guided_fix_title'          // pro only
  | 'guided_fix_description'    // pro only
  | 'guided_fix_price'          // coming soon
  | 'echo_memory'

export const TIER_ACCESS: Record<Tier, Feature[]> = {
  free: [
    'listings_1',
    'market_score_basic',
    'tag_gap_count_only',
    'competitor_count_only',
    'score_history_7d',
    'guided_fix_tags',
  ],
  starter: [
    'listings_5',
    'market_score_basic',
    'tag_gap_top3',
    'competitor_basic',
    'score_history_30d',
    'price_positioning_basic',
    'guided_fix_tags',
  ],
  pro: [
    'listings_all',
    'market_score_basic',
    'market_score_breakdown',
    'tag_gap_full',
    'competitor_full',
    'score_history_unlimited',
    'price_positioning_basic',
    'price_positioning_full',
    'niche_health',
    'shop_suppression_analysis',
    'market_rank_estimate',
    'action_attribution',
    'competitor_alerts',
    'market_informed_optimization',
    'guided_fix_tags',
    'guided_fix_title',
    'guided_fix_description',
    'echo_memory',
  ],
}

// Check feature flag AND tier access
export async function canUse(tier: Tier, feature: Feature): Promise<boolean> {
  const tierAllows = TIER_ACCESS[tier]?.includes(feature) ?? false
  if (!tierAllows) return false
  const flag = await getFeatureFlag(feature)
  if (flag?.paused || flag?.enabled === false) return false
  return true
}

export function getUpgradePrompt(feature: Feature): { headline: string; cta: string } {
  const prompts: Partial<Record<Feature, { headline: string; cta: string }>> = {
    tag_gap_full: {
      headline: 'See all 8 tags your competitors use that you don\'t',
      cta: 'Unlock Tag Gap Analysis'
    },
    competitor_full: {
      headline: 'See exactly who\'s beating you and what they\'re doing right',
      cta: 'Unlock Competitor Intelligence'
    },
    score_history_unlimited: {
      headline: 'Track your progress over 90+ days',
      cta: 'Unlock Full Score History'
    },
    market_informed_optimization: {
      headline: 'Optimize against what\'s actually winning in your market right now',
      cta: 'Unlock Market Optimization'
    },
  }
  return prompts[feature] ?? { headline: 'Unlock this feature', cta: 'Upgrade to Pro' }
}
```

---

## Niche Classifier

### Priority Order — Personalization Form First

```typescript
async function classifyUserNiche(userId: string): Promise<NicheProfile> {

  // STEP 1: Personalization form (highest confidence — human confirmed)
  // Find exact table/column during audit
  const personalization = await getPersonalizationAnswers(userId)

  if (personalization?.shop_category) {
    const niche = CATEGORY_TO_NICHE_MAP[personalization.shop_category]
    if (niche) {
      return {
        primary_niche: niche,
        niche_source: 'personalization_form',
        confidence: 0.95,
        personalization_category: personalization.shop_category,
        target_customer: personalization.target_customer,
        price_range: personalization.price_range,
        seller_goals: personalization.goals,
      }
    }
  }

  // STEP 2: Tag inference fallback
  const listings = await getUserListings(userId)
  const allTags = listings.flatMap(l => l.tags)
  return classifyFromTags(allTags)

  // STEP 3: If confidence < 0.3 → flag as unknown in admin panel
  // Admin can assign niche manually from /admin/niches
}
```

### Category Map (build from actual dropdown values found in audit)

```typescript
const CATEGORY_TO_NICHE_MAP: Record<string, string> = {
  // Populate with real dropdown values after audit
  // Examples:
  'Bath & Beauty': 'handmade_bath_beauty',
  'Jewelry': 'jewelry',
  'Vintage': 'vintage',
  'Home & Living': 'home_decor',
  'Art': 'art_collectibles',
  'Clothing': 'clothing_accessories',
  'Toys & Games': 'toys_games',
  'Paper & Party': 'paper_party',
  'Craft Supplies': 'craft_supplies',
}
```

### Using Other Personalization Fields

```typescript
// target_customer → informs search query generation
// "gift buyers" → add "gift for her", "gift for him" to queries

// price_range → informs price positioning benchmark
// "budget" → benchmark vs budget competitors
// "premium" → benchmark vs premium tier

// seller_goals → informs which insights surface first
// "more visibility" → prioritize tag gap + title
// "more sales" → prioritize price positioning + conversion
// "grow faster" → prioritize competitor intelligence

// Store all in user_niche_profiles for system-wide reference
```

---

## Photo Change Detection

```typescript
interface ListingPhotoSnapshot {
  num_images: number
  image_urls: string[]
  primary_image_url: string
  captured_at: string
}

function detectPhotoChanges(
  before: ListingPhotoSnapshot,
  after: ListingPhotoSnapshot
) {
  return {
    photos_added: after.num_images > before.num_images,
    photos_removed: after.num_images < before.num_images,
    count_delta: after.num_images - before.num_images,
    primary_photo_changed: after.primary_image_url !== before.primary_image_url,
    any_photo_replaced:
      after.num_images === before.num_images &&
      JSON.stringify(after.image_urls) !== JSON.stringify(before.image_urls),
  }
}

// IMPORTANT: Before relying on URL diffing, validate that
// Etsy CDN does not change URLs on cache refresh.
// Test: snapshot same listing twice 24h apart with no changes.
// If URLs are stable → use URL diffing.
// If URLs change → use count-only + primary URL hash comparison.
```

---

## Revert System Expansion

**Find the existing revert system during audit. Document exactly how it works.
Then expand it — do not replace it.**

All RadarIQ-initiated listing changes use one unified revert system:

```typescript
// Every write to Etsy goes through this flow:

async function applyListingChange(
  userId: string,
  listingId: string,
  changes: ListingUpdates,
  source: ActionSource
) {
  // 1. Snapshot current state (before)
  const beforeState = await getListingSnapshot(listingId)

  // 2. Show user exactly what will change (confirmation UI)
  // Do not apply without explicit user confirm

  // 3. Execute write via EtsyApiClient
  const result = await etsyClient.updateListing(listingId, changes)

  // 4. Snapshot new state (after)
  const afterState = await getListingSnapshot(listingId)

  // 5. Store in existing revert table (with new columns)
  await storeRevertRecord({
    listing_id: listingId,
    before_value: beforeState,
    after_value: afterState,
    action_source: source,
    attribution_window_ends: addDays(new Date(), 7),
  })

  // 6. Log to user_listing_actions
  await logAction({
    user_id: userId,
    listing_id: listingId,
    action_type: detectActionType(changes),
    action_source: source,
    before_value: beforeState,
    after_value: afterState,
    attribution_window_ends: addDays(new Date(), 7),
  })

  // 7. Return revert token so UI can show revert button
  return { success: true, revert_id: revertRecord.id }
}
```

### Revert on Score History Chart

Mark revert events on the score timeline:

```
Score chart:
──●────────●────────●────────●──
  Jun 1    Jun 3   Jun 5    Jun 7
  Tags     ↺Rev    Photos
  added    erted   added

Hover Jun 3: "Tags update reverted — score
              returned to 54 from 61.
              The change was working."
```

---

## Guided Fix UI

### The Fix Flow (consistent pattern for all fix types)

```
1. SURFACE INSIGHT
   [Signal icon] Specific finding
   [Impact badge] HIGH IMPACT
   Context vs market benchmark
   [Fix This →] CTA

2. SHOW WHAT WILL CHANGE
   Before: current state
   After:  proposed change
   [Apply]  [Edit First]  [Skip]

3. CONFIRM AND EXECUTE
   Loading: "Updating your listing..."
   Success: "3 tags added. We'll track 
             your score for the next 7 days."
   [↺ Undo this change]  ← visible 48h

4. TRACK
   Attribution window starts
   "Check back in 7 days to see if this helped"
   Score chart marks the change event
```

### Tag Updates (all tiers — if feature flag on)

```
MISSING TAGS                          HIGH IMPACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Top competitors use these tags you don't:
[cottagecore] [gift for her] [handmade gift]
[self care gift] [boho decor]

Your listing: 8 of 13 tag slots used
You have room for all 5.

[+ Add All 5 Tags]   [+ Choose Which]   [I'll Do It Myself]

On "Add All 5":
→ Confirm dialog: shows exact tags being added
→ PATCH /listings/{id} via approved write API
→ Success: "5 tags added to your listing"
→ Revert button appears: "Undo tag changes"
→ Attribution window starts (7 days)
```

### Title Updates (Pro only)

```
TITLE TOO SHORT                       HIGH IMPACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your title: 67 chars
Niche average: 94 chars

AI-suggested title (market-informed):
"Handmade Bath Bomb Gift Set, Natural Fizzy Bath
Bombs, Self Care Gift for Her, Cottagecore Spa Day"
                                        94 chars ✓

[Apply This Title]   [Edit Before Applying]   [Regenerate]

Diff view: 
  Before: [highlighted removed text]
  After:  [highlighted added text]

On "Apply":
→ Confirm dialog
→ PATCH /listings/{id}
→ Success + revert button + attribution window
```

---

## Existing Feature Improvements

### AI Optimizer — Market Context Injection

Find existing prompt. Prepend only — do not rewrite:

```typescript
const marketData = await getFromCache(listing.keyword_cluster)
const personalization = await getPersonalizationAnswers(userId)

const marketContext = marketData ? `
LIVE MARKET CONTEXT:
- Niche: ${userNicheProfile.primary_niche}
- Top competitors average ${marketData.avg_title_length} char titles
  (this listing: ${listing.title.length} chars)
- Missing high-performing tags: ${marketData.missing_tags.join(', ')}
- Avg competitor photos: ${marketData.avg_photo_count}
  (this listing: ${listing.photo_count})
- Avg competitor price: $${marketData.avg_price}
  (this listing: $${listing.price})
- Seller goal: ${personalization?.seller_goals?.join(', ') ?? 'not specified'}
- Target customer: ${personalization?.target_customer ?? 'not specified'}

Optimize to be competitive with what is ACTUALLY WINNING in this
specific market right now. Be specific. No generic advice.
Close the specific gaps identified above.
` : ''
// Prepend to existing prompt only
```

### Echo — Conversation History + Score Awareness

Find existing Echo. Add only:

```typescript
// Pass last 10 conversation turns from echo_conversations table
// Inject recent score context:
const recentScores = await getRecentScoreHistory(userId, listingId, 14)
const scoreContext = `
RECENT SCORE HISTORY:
${recentScores.map(s =>
  `${formatDate(s.scored_at)}: Market ${s.market_score}/100`
).join('\n')}
`
// Prepend to existing Echo system prompt — do not replace it
```

### Score Roadmap — Market Benchmark Overlay

Find existing Score Roadmap. Add:
- Niche average line on existing chart
- Action events marked on timeline
- "Users who did X in this niche saw +N pts avg" hints

### Renewal Tracker — Timing Intelligence

Find existing renewal tracker. Reuse its diff pattern. Add:
```typescript
const competitorActivity = await getCompetitorRenewalsInCluster(
  listing.keyword_cluster, hoursBack: 48
)
if (competitorActivity < CLUSTER_AVERAGE * 0.7 && listing.needsRenewal) {
  // Surface: "Good time to renew — competitor activity is low right now"
}
```

---

## Algorithm Weight Model

### The Living Hypothesis

```typescript
// Default weights — admin adjustable from UI, no code deploy needed
const DEFAULT_WEIGHTS = {
  // Listing signals
  title_keyword_match: 0.82,
  tag_relevance: 0.71,
  photo_count: 0.54,
  recency: 0.43,
  price_competitiveness: 0.31,
  description_quality: 0.24,
  // Shop signals
  shop_age: 0.79,
  review_score: 0.74,
  sales_velocity: 0.62,
  review_count: 0.58,
  response_rate: 0.41,
}

// Weights stored in algorithm_weights table
// Admin adjusts from /admin/algorithm
// On save: snapshot to algorithm_weight_history
//          re-score all users with new weights
//          calculate new confidence score
```

### Confidence Validation

```typescript
// For each listing where you know:
// → Your predicted rank (from weighted score)
// → Actual Etsy rank (position 1-25 in search results)
// Correlation between predicted and actual = confidence score
// More users + more data = higher confidence over time
```

---

## Loading States

Simple polling — no Supabase Realtime complexity needed:

```typescript
// Poll pipeline_run_log every 5 seconds
// Render each section as its data becomes available
// Never show a fully blank dashboard

const PIPELINE_STAGES = [
  { key: 'niche',    label: 'Detecting your niche...',    estimatedSeconds: 5  },
  { key: 'market',   label: 'Scanning your market...',    estimatedSeconds: 30 },
  { key: 'scoring',  label: 'Scoring your listings...',   estimatedSeconds: 45 },
  { key: 'complete', label: 'Your insights are ready!',   estimatedSeconds: 60 },
]

// Skeleton cards per section — not full page spinner
// Each section renders immediately when its data is ready
// Status bar shows current stage with estimated time remaining
```

---

## Deploy Backfill

```typescript
// supabase/functions/deploy-backfill/index.ts
// Run once after deploy via Supabase dashboard or CLI

async function deployBackfill() {
  const users = await getUsersWithConnectedShops()
  const unprocessed = users.filter(u => !u.market_intelligence_initialized)

  console.log(`Found ${unprocessed.length} users needing backfill`)

  for (const [index, user] of unprocessed.entries()) {
    await sleep(index * 30000)  // 30s stagger, rate limit protection
    try {
      await invokeOnboardingPipeline(user.id, {
        run_type: 'backfill',
        trigger_reason: 'deploy',
        force: false,           // skip if already initialized
      })
      console.log(`✅ ${user.id} backfilled`)
    } catch (err) {
      console.log(`❌ ${user.id} failed: ${err.message}`)
    }
  }
}
```

---

## What Success Looks Like

### Phase 1
- New user connects shop → niche detected from personalization form or tags
- Pipeline fires immediately — no nightly wait
- Within 60-90 seconds: market score, missing tags, competitor count visible
- Free user: market score + locked previews with specific numbers behind locks
- Pro user: full tag gap, full competitor data, full history
- Second user same niche: cached market data, 0 extra API calls
- Test accounts: admin assigns niche from /admin/niches → pipeline runs
- Guided fix: tag update applies directly to Etsy listing via write API
- Revert: one click, works for all RadarIQ-initiated changes
- API quota: never exceeded, graceful degradation near limit
- Feature flags: Pinterest Spotlight paused, achievements off
- Nothing broken in existing system — only additive

### Phase 2
- Admin can manage entire platform from /admin without touching code
- Niche manager generates queries via Claude, admin reviews and approves
- Algorithm weights adjustable from UI, re-scores all users on save
- Anomaly flags surfaced with drilldown and admin action options
- All settings adjustable from /admin/settings

### Phase 3
- Attribution dashboard shows which actions actually improve scores
- "RadarIQ users who follow guided fixes see X% improvement in 30 days"
- That statement is backed by real tracked data, not assumed

