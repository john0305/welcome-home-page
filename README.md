# RADARIQ — Etsy Listing Intelligence

AI-powered platform to grade, optimize, and track Etsy listings using Google Gemini.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in your keys
cp .env.example .env

# 3. Start dev server
npm run dev
```

Open http://localhost:5173 — log in with **admin / 1234**.

The app runs fully with mock data when no `.env` keys are set.

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS + Radix UI (shadcn/ui pattern) |
| Auth | Supabase Auth (falls back to mock) |
| Database | Supabase PostgreSQL |
| Storage | Supabase Storage (listing images) |
| AI | Google Gemini 1.5 Flash/Pro |
| Backend | Google Cloud Functions (Node.js) |
| Etsy | Etsy API v3 (OAuth 2.0 + PKCE) |
| Analytics | Google Analytics 4 Data API |
| Graph DB | Neo4j Aura (optional) |

---

## Service Setup

### 1. Supabase (Required for persistence)

1. Create project at [supabase.com](https://supabase.com)
2. Copy Project URL + anon key to `.env`
3. Run migrations in Supabase SQL Editor:
   ```sql
   -- Run supabase/migrations/001_initial_schema.sql
   -- Run supabase/migrations/002_rls_policies.sql
   ```

### 2. Etsy API

1. Register app at [etsy.com/developers/register](https://www.etsy.com/developers/register)
2. Copy API key to `VITE_ETSY_API_KEY`
3. Set `VITE_ETSY_REDIRECT_URI` to `http://localhost:5173/app/connect-etsy/callback`
4. In the app: Settings → Connections → Connect Etsy Store

**Token refresh**: Etsy access tokens expire after 1 hour. The `refresh-etsy-token` Cloud Function handles this automatically. Without Cloud Functions, tokens are refreshed on-demand before each API call.

### 3. Google Gemini

1. Get API key at [makersuite.google.com](https://makersuite.google.com/app/apikey)
2. Add to `VITE_GEMINI_API_KEY`
3. Default model: `gemini-1.5-flash` (fast, cheap). Change to `gemini-1.5-pro` for higher quality.

### 4. Google Analytics 4

1. In GA4: Admin → Data Streams → copy Measurement ID (`G-XXXXXXX`)
2. In GA4: Admin → Property Settings → copy Property ID
3. Add both to `.env`

### 5. Google Cloud Functions (Recommended for automation)

```bash
# Install Google Cloud CLI
brew install google-cloud-sdk

# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Deploy all functions
cd functions
npm install
npm run deploy:all
```

Set `VITE_CLOUD_FUNCTIONS_BASE_URL` to the base URL shown after deployment.

**Required env vars for functions** (set in Cloud Function environment):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `ETSY_API_KEY`

**Nightly schedule setup**:
```bash
# Create Pub/Sub topic
gcloud pubsub topics create radariq-nightly-optimization

# Create scheduler (runs at 2 AM daily)
gcloud scheduler jobs create pubsub radariq-nightly \
  --schedule="0 2 * * *" \
  --topic=radariq-nightly-optimization \
  --message-body="{}"
```

---

## Features

### Free Tier
- Listing sync from Etsy
- Manual listing grading (5/month)
- Basic dashboard KPIs
- 1 connected store

### Pro Tier ($19/month)
- Unlimited AI optimizations
- Automated nightly optimization runs
- Google Analytics integration
- Full trend analytics & grade correlation
- Up to 3 stores

### Enterprise Tier ($49/month)
- Everything in Pro
- Unlimited stores
- Multi-platform (eBay, Amazon — coming soon)
- Neo4j relationship insights
- API access

---

## Key Pages

| Route | Description |
|-------|-------------|
| `/` | Public landing page |
| `/login` | Sign in (default: admin/1234) |
| `/register` | New account creation (with optional invite code) |
| `/app/dashboard` | KPI overview, grade trends, activity feed |
| `/app/listings` | Browse all listings with filters |
| `/app/listings/:id` | Listing detail + optimization history with accept/reject |
| `/app/new-listing` | Create + AI-optimize a new listing |
| `/app/queue` | Optimization queue management |
| `/app/analytics` | Sales + grade correlation charts |
| `/app/settings` | Connections, **Billing/Stripe**, preferences, account |
| `/app/affiliate` | Affiliate dashboard — referrals, earnings, calculator |
| `/app/store-profile` | Brand personality wizard — personalizes AI system prompt |

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `user_profiles` | Extended user data + settings + Stripe IDs + invite code |
| `connected_stores` | Etsy (+ future eBay/Amazon) OAuth tokens |
| `listings` | Synced listing data from Etsy |
| `listing_grades` | AI grading history per listing |
| `optimization_records` | Before/after diffs + **rejection category + comment** |
| `optimization_queue` | Scheduled optimization jobs |
| `sales_history` | Sales with listing grade at time of sale |
| `analytics_snapshots` | Daily GA4 data snapshots |
| `affiliate_profiles` | Affiliate accounts — code, commission rate, earnings |
| `referrals` | Per-subscription commission records |
| `affiliate_payouts` | Payout history |
| `store_personalities` | Brand voice answers used to build AI system prompt |

### Migrations
Run in order: `001_initial_schema.sql` → `002_rls_policies.sql` → `003_stripe_affiliate.sql` → `004_store_profile_rejections.sql`

---

## Grading System

Each listing is graded 0–100 across 4 dimensions (25 pts each):

| Dimension | What's evaluated |
|-----------|-----------------|
| **Title** | Keyword density, length (100-140 ideal), specificity |
| **Description** | Length (500+ ideal), structure, keyword use, persuasion |
| **Tags** | Count (13 max), variety, long-tail phrases |
| **Images** | Count (10 max), variety of angles |

Grade labels: **A+** (90+), **A** (80+), **B** (70+), **C** (60+), **D** (50+), **F** (<50)

---

## Etsy API Rate Limits

Etsy allows 10 req/sec and 50,000 req/day. All Etsy API calls go through `EtsyRateLimiter` in `src/lib/etsy-rate-limiter.ts`:

- **Token bucket**: refills at 10 tokens/second
- **Request queue**: all calls queued and throttled automatically
- **Priority**: mark time-sensitive calls as `'high'` to jump the queue
- **Retry**: automatic exponential backoff on 429s (respects `Retry-After` header)
- **Pagination**: `paginateEtsy()` auto-handles multi-page responses with delays between pages
- **Batch**: `batchEtsyRequests()` for syncing many listings safely

## Platform Connector Architecture

Adding a new marketplace = creating a new connector file. Nothing else changes.

```typescript
// 1. Implement PlatformConnector interface
const MyConnector: PlatformConnector = { platform: 'ebay', ... }

// 2. Register it
ConnectorRegistry.register(MyConnector)

// 3. Use it
const connector = ConnectorRegistry.get('ebay')
await connector.syncListings(token, shopId)
```

Files: `src/types/platform.ts` (interface), `src/lib/connectors/etsy-connector.ts` (impl), `src/lib/connectors/ebay-connector.ts` (stub).

## Onboarding Flow

Critical first-5-minute experience:
1. User creates account → checklist appears on dashboard
2. After connecting Etsy → `StoreHealthScan` runs immediately (fake loading → real score)
3. Shows Store Health Score (0-100) + breakdown + 3 Quick Wins
4. `OnboardingChecklist` tracks steps with XP points and progress bar
5. Steps: create account → connect store → view score → first optimization → personalize AI → set up automation → check analytics
6. Empty states (`EmptyDashboard`, `EmptyListings`) shown until data exists — motivating, not confusing

## Notification System

`NotificationContext` — global notification state:
- In-app bell (header) with unread count, dropdown, dismiss
- Event types: optimization_complete, trend_alert, listing_sold, etc.
- Preferences stored in localStorage (and `notification_preferences` table)
- Scaffold: email/SMS/browser push/smart devices in `NotificationPreferences` UI

## Bulk Operations

Listings page smart filter presets (auto-counted):
- Lowest grade, Never optimized, No views (30d), Missing tags (<10/13), Few images (<5), Missing materials, Old listings (1yr+), Wishlisted not selling (favs≥10, sales=0), Top sellers (5+ sales)

Bulk action bar (appears when listings selected, floats above footer):
- Optimize all → schedules all selected
- Queue for tonight → adds to nightly batch
- Export CSV → downloads selected as CSV

## Security & Privacy

- Row Level Security on all tables — users can only see their own data
- OAuth tokens should use Supabase Vault in production (`pgp_sym_encrypt`)
- `data_deletion_requests` table — user requests deletion, admin approves, data purged (never automatic)
- `account_status` field: `active | suspended | deletion_requested | deleted`
- All ChromaDB data uses SHA-256 hashed user IDs — no PII

### GDPR Notes
Etsy is US-based; most sellers are too. If you have EU users:
1. Add a cookie consent banner (or use Supabase's built-in compliance tools)
2. Honor deletion requests within 30 days (the `data_deletion_requests` workflow covers this)
3. Add a "Download my data" button (export all user data as JSON/CSV)
4. Update your Privacy Policy to mention data processing and retention periods
5. For now: the anonymized data notice in the Register page + Insights page is sufficient

## Future Features (In Development)

Visible in sidebar as grayed-out "Coming Soon":
- **Competitor Analysis** — see what similar top sellers in your category are doing
- **Review Management** — AI-drafted responses, sentiment analysis, pattern detection (slow shipping flagged, etc.), alerts on 3★ or below

## Support System

Floating `?` button (bottom-right) opens `SupportWidget`:
- "Report Issue" tab: subject, severity selector, steps to reproduce
- "Suggest Feature" tab: feature idea + why it would help
- On submit: logged to console (wire to `support_tickets` table + email to support@rave.app in production)

## A/B Testing (Pro)

`/app/ab-testing` — Pro feature:
1. Select a listing
2. AI generates Version A and Version B optimizations
3. Version A goes live for 2 weeks, then Version B for 2 weeks
4. RAVE compares views/favorites/sales, recommends winner
5. One-click to apply winning version permanently

Data tracked in `ab_tests` table (migration 006).

## Data Export

`src/lib/export.ts`:
- `exportListingsCSV()` — all listing metrics as CSV
- `exportOptimizationsCSV()` — optimization history
- `exportSalesCSV()` — sales with grades at time of sale
- `exportAnalyticsPDF()` — opens print dialog → save as PDF

## ChromaDB Setup (Vector Search)

ChromaDB enables semantic listing search ("find listings similar to this one") and powers cross-user trend detection.

**Local development:**
```bash
docker run -p 8000:8000 chromadb/chroma
```
Set `VITE_CHROMA_URL=http://localhost:8000`

**Production options:**
- **Google Cloud Run**: deploy the official ChromaDB Docker image
- **Chroma Cloud**: managed service at [chromadb.com](https://www.trychroma.com)

Once configured, deploy the `generate-embedding` Cloud Function to start indexing listings. The `compute-insights` function runs nightly to produce cross-user trends.

**Data privacy:** All listing data stored in ChromaDB uses:
- SHA-256 hashed user IDs (never real user IDs)
- Rounded/bucketed metrics (views rounded to nearest 50, etc.)
- No personal info, shop names, or Etsy listing IDs

## Neo4j Setup (Graph Intelligence)

Neo4j maps relationships between tags, categories, listings, and optimization outcomes.

**Local:** [Neo4j Desktop](https://neo4j.com/download/) or `docker run -p 7474:7474 -p 7687:7687 neo4j`

**Production:** [Neo4j Aura](https://neo4j.com/cloud/aura/) (free tier available)

Graph queries enable: "tags that co-occur with top sellers", "category clusters with highest conversion", "buyer paths through listing types".

## Intelligence System

The intelligence engine runs nightly via `compute-insights` Cloud Function:
1. Aggregates listing + optimization outcome data from Supabase
2. Computes category benchmarks, tag trends, timing signals
3. Writes insights to `platform_insights` table
4. Users see personalized alerts on `/app/insights`

Users can ask natural language queries ("find listings similar to X") via semantic search using ChromaDB embeddings.

## Pricing

| Plan | Price | Affiliate Commission |
|------|-------|---------------------|
| Free | $0 | — |
| Starter | $12/mo | $2.40/mo per referral |
| Pro | $29/mo | $5.80/mo per referral |
| Agency | $79/mo | $15.80/mo per referral |

All commissions are 20% of monthly subscription, paid for up to 12 months per referred user.

## Admin Dashboard

`/app/admin` — only accessible to accounts with `tier: 'admin'`. Shows:
- User growth charts (hourly/daily/weekly)
- Tier distribution + MRR stacked bar chart
- Live event feed (signups, upgrades, churns)
- Affiliate table with monthly recurring commission and amount owed
- Platform health (Supabase, ChromaDB, Neo4j, Cloud Functions)

## Stripe Subscription Setup

1. Create products in your [Stripe Dashboard](https://dashboard.stripe.com/products):
   - **RAVE Pro** — $19/month + $15/month (annual)
   - **RAVE Enterprise** — $49/month + $39/month (annual)
2. Copy the Price IDs into `.env` (`VITE_STRIPE_PRO_MONTHLY_PRICE_ID`, etc.)
3. Add `VITE_STRIPE_PUBLISHABLE_KEY` (frontend, safe to expose)
4. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to Cloud Function env vars only
5. Deploy `create-checkout`, `customer-portal`, and `stripe-webhook` Cloud Functions
6. Register the webhook URL in Stripe Dashboard → Webhooks:
   ```
   https://us-central1-YOUR_PROJECT.cloudfunctions.net/stripe-webhook
   ```
   Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`

## Affiliate Program

- Users become affiliates automatically when they visit `/app/affiliate`
- Referral code is unique per user (auto-generated or customizable)
- Default commission: 20% of subscription revenue for 12 months per referral
- Tracked via `referred_by_code` on `user_profiles` + `referrals` table
- Commissions triggered by `invoice.payment_succeeded` Stripe webhook
- Payouts: manual process (request button → admin action)

## Store Personality / AI Personalization

Users fill out a brand voice questionnaire at `/app/store-profile`. Answers are saved locally (and synced to `store_personalities` table when Supabase is connected). The answers are assembled into a system prompt prefix injected into every Gemini call, making optimizations sound like they come from that specific shop.

A persistent **"Personalize AI"** button pulses in the header until the core questions are answered.

## Freemium Ceiling Design

Free users get 5 AI optimizations/month. The conversion strategy:
- Don't block upfront — let them use the 5th optimization
- Show the grade improvement result first
- Then immediately show `PostOptimizationUpgrade` modal ("You improved by 47 points — want unlimited?")
- `OptimizationUsageBanner` shows at 4/5 on Dashboard and Queue pages
- `OptimizeButtonWithGate` shows remaining count on the button itself

## Rejection Tracking & Learning

When a user rejects an optimization, they select a structured category (tone off, factually wrong, too salesy, etc.) plus an optional free-text comment. This data is:
1. Stored in `optimization_records.rejection_category` + `.rejection_comment`
2. Fed back into the next optimization prompt for that listing as a `PREVIOUS REJECTION FEEDBACK` context block
3. Visible in the listing's optimization history tab

## Neo4j Integration (Optional)

Neo4j can map relationships between tags, listing categories, and buyer patterns to surface non-obvious optimization opportunities. Example use cases:
- Tags that co-occur in top-selling listings
- Category clusters with highest view-to-sale conversion
- Buyer persona paths through listing combinations

Setup: Create free instance at [neo4j.com/cloud/aura](https://neo4j.com/cloud/aura) and add credentials to `.env`.

---

## Project Structure

```
src/
├── components/
│   ├── ui/           # shadcn/ui base components
│   ├── layout/       # Sidebar, Header, AppLayout
│   ├── auth/         # ProtectedRoute, PaidFeatureGate
│   ├── dashboard/    # KPI cards, charts
│   ├── listings/     # Listing card, filters, grade badge
│   └── optimization/ # Grade display, diff viewer, schedule modal
├── contexts/
│   ├── AuthContext.tsx   # Auth state (mock or Supabase)
│   └── AppContext.tsx    # App state (store, listings, queue)
├── data/
│   └── mockData.ts       # Rich mock data for DB-free mode
├── hooks/
│   └── use-toast.ts
├── lib/
│   ├── supabase.ts   # Supabase client
│   ├── etsy.ts       # Etsy API v3 helpers
│   ├── gemini.ts     # Gemini AI grading + optimization
│   └── analytics.ts  # GA4 Data API
├── pages/            # All route pages
└── types/            # TypeScript interfaces

supabase/migrations/  # PostgreSQL schema + RLS policies
functions/            # Google Cloud Functions
```
