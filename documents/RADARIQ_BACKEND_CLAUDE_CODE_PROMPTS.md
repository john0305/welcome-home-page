================================================================
RADARIQ BACKEND — CLAUDE CODE PROMPTS
================================================================
These prompts are designed for Claude Code sessions.
Run them in order. Each builds on the previous.
Do not skip phases. Validate each phase before proceeding.
================================================================


================================================================
PRE-FLIGHT: READ BEFORE ANY PROMPT
================================================================

Before running any prompt below, open Claude Code and say:

"Before we start, please read and confirm you understand
these existing architectural constraints for RadarIQ:

1. fix_actions is the single source of truth for all action
   state. Never set done/pending state from button clicks.
   Always read from fix_actions.

2. ETSY_RANKING_FACTORS in src/lib/etsyRankingFactors.ts
   is the authoritative source for all grading weights.
   Never hardcode weights elsewhere.

3. The nightly-action-scan edge function already exists.
   Do not recreate it. We are extending it, not replacing it.

4. All edge functions must return HTTP 200 always.
   Use { success: false, error: '...' } for failures.
   Never let a raw 500 propagate to the client.

5. Supabase project ref: brqkcbdbsciwfmnipzbx

6. AI model for all new edge functions: claude-haiku-4-5
   Route through Supabase AI Gateway — never call Anthropic
   directly from edge functions.

7. All new tables need RLS policies. No exceptions.

8. Every data record must have user_id and created_at.
   Never update rows that represent historical state —
   always insert a new snapshot row.

Confirm you've read these before we proceed."

Wait for confirmation before running any prompt below.


================================================================
PROMPT 1 — DATABASE SCHEMA: COMPETITOR + INTELLIGENCE TABLES
================================================================
Run this first. Validate the migration before moving to Prompt 2.
================================================================

We need to add three new tables to support competitor
intelligence and Echo's shop context. These extend the
existing RadarIQ schema without touching existing tables.

Please do the following:

STEP 1 — INSPECT EXISTING SCHEMA
Before writing any SQL, query the Supabase database and list
every existing table name and its columns. I need to confirm
nothing we're adding conflicts with what already exists.
Report the full list before proceeding.

STEP 2 — CREATE MIGRATION FILE
Create a new migration file:
supabase/migrations/[timestamp]_competitor_intelligence.sql

The migration must create these three tables:

────────────────────────────────────────────────────────────
TABLE 1: market_snapshots
Purpose: Stores competitor listing data for each search term
         we scan on behalf of a user.
────────────────────────────────────────────────────────────

CREATE TABLE market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_term TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result_count INTEGER NOT NULL DEFAULT 0,
  listings JSONB NOT NULL DEFAULT '[]',
  -- listings is an array of objects, each containing:
  -- { etsy_listing_id, title, tags[], price, photo_count,
  --   review_count, listing_age_days, ships_fast,
  --   has_free_shipping, return_policy_present,
  --   materials_filled, rank_position }
  scan_source TEXT NOT NULL DEFAULT 'nightly',
  -- scan_source values: 'nightly' | 'onboarding' | 'manual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_market_snapshots_user_id
  ON market_snapshots(user_id);
CREATE INDEX idx_market_snapshots_search_term
  ON market_snapshots(user_id, search_term);
CREATE INDEX idx_market_snapshots_captured_at
  ON market_snapshots(captured_at DESC);

-- RLS
ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own market snapshots"
  ON market_snapshots FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to market_snapshots"
  ON market_snapshots FOR ALL
  USING (auth.role() = 'service_role');

────────────────────────────────────────────────────────────
TABLE 2: competitor_alerts
Purpose: Records detected changes in competitor listings
         so Echo can surface them proactively.
────────────────────────────────────────────────────────────

CREATE TABLE competitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_term TEXT NOT NULL,
  competitor_listing_id TEXT NOT NULL,
  competitor_title TEXT,
  change_type TEXT NOT NULL,
  -- change_type values:
  -- 'price_change' | 'tags_updated' | 'title_updated'
  -- 'photos_added' | 'new_competitor' | 'competitor_removed'
  -- 'policy_added' | 'rank_change'
  before_value JSONB,
  after_value JSONB,
  rank_before INTEGER,
  rank_after INTEGER,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  surfaced_to_user BOOLEAN NOT NULL DEFAULT FALSE,
  surfaced_at TIMESTAMPTZ,
  dismissed_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  severity TEXT NOT NULL DEFAULT 'info',
  -- severity values: 'info' | 'warning' | 'critical'
  -- critical = competitor jumped 5+ positions or major change
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_competitor_alerts_user_id
  ON competitor_alerts(user_id);
CREATE INDEX idx_competitor_alerts_unsurfaced
  ON competitor_alerts(user_id, surfaced_to_user)
  WHERE surfaced_to_user = FALSE;
CREATE INDEX idx_competitor_alerts_detected_at
  ON competitor_alerts(detected_at DESC);

-- RLS
ALTER TABLE competitor_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own competitor alerts"
  ON competitor_alerts FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can update own competitor alerts"
  ON competitor_alerts FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to competitor_alerts"
  ON competitor_alerts FOR ALL
  USING (auth.role() = 'service_role');

────────────────────────────────────────────────────────────
TABLE 3: shop_intelligence
Purpose: Pre-aggregated shop context for Echo.
         One row per user, rebuilt nightly after grader runs.
         This is Echo's brain — loaded on every query.
────────────────────────────────────────────────────────────

CREATE TABLE shop_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Score state
  overall_market_score INTEGER,
  score_delta_7d INTEGER DEFAULT 0,
  score_delta_30d INTEGER DEFAULT 0,
  score_trend TEXT DEFAULT 'stable',
  -- score_trend: 'improving' | 'declining' | 'stable'

  -- Fix action summary
  open_fix_count INTEGER DEFAULT 0,
  applied_fix_count INTEGER DEFAULT 0,
  tracked_fix_count INTEGER DEFAULT 0,
  resolved_fix_count INTEGER DEFAULT 0,
  superseded_fix_count INTEGER DEFAULT 0,
  total_points_available INTEGER DEFAULT 0,
  total_points_gained INTEGER DEFAULT 0,

  -- Top opportunities (pre-ranked for Echo)
  top_opportunities JSONB DEFAULT '[]',
  -- Array of fix_action summaries ranked by impact_points:
  -- [{ fix_action_id, listing_id, listing_title,
  --    dimension, issue, impact_points, suggested_fix }]

  -- Competitor intelligence summary
  active_competitor_alerts INTEGER DEFAULT 0,
  critical_competitor_alerts INTEGER DEFAULT 0,
  competitor_summary JSONB DEFAULT '{}',
  -- { alerts_count, top_moving_competitors[], last_scan_at }

  -- Shop health summary
  total_listings INTEGER DEFAULT 0,
  analyzed_listings INTEGER DEFAULT 0,
  listings_needing_attention INTEGER DEFAULT 0,
  avg_listing_score NUMERIC(5,2),

  -- Best and worst performers
  best_performing_listings JSONB DEFAULT '[]',
  worst_performing_listings JSONB DEFAULT '[]',
  -- Array: [{ listing_id, title, score, top_issue }]

  -- Activity context
  last_fix_applied_at TIMESTAMPTZ,
  last_fix_category TEXT,
  active_strategy TEXT DEFAULT 'echo',
  listings_analyzed_this_month INTEGER DEFAULT 0,

  -- Temporal markers
  last_graded_at TIMESTAMPTZ,
  last_competitor_scan_at TIMESTAMPTZ,
  next_scheduled_scan TIMESTAMPTZ,
  rebuilt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per user
  CONSTRAINT shop_intelligence_user_id_unique UNIQUE (user_id)
);

-- Indexes
CREATE INDEX idx_shop_intelligence_user_id
  ON shop_intelligence(user_id);
CREATE INDEX idx_shop_intelligence_rebuilt_at
  ON shop_intelligence(rebuilt_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_shop_intelligence_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shop_intelligence_updated_at
  BEFORE UPDATE ON shop_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION update_shop_intelligence_updated_at();

-- RLS
ALTER TABLE shop_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own shop intelligence"
  ON shop_intelligence FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to shop_intelligence"
  ON shop_intelligence FOR ALL
  USING (auth.role() = 'service_role');

STEP 3 — VALIDATE MIGRATION
After creating the migration file:
1. Run it against the local Supabase instance
2. Confirm all three tables exist with correct columns
3. Confirm all indexes were created
4. Confirm RLS is enabled on all three tables
5. Confirm all policies exist
6. Report any errors before proceeding

Do not proceed to Prompt 2 until this migration is
confirmed clean with zero errors.


================================================================
PROMPT 2 — EDGE FUNCTION: competitor-market-scan
================================================================
Run after Prompt 1 migration is validated.
================================================================

Create a new Supabase edge function that scans the Etsy
market for a user's search terms and stores competitor data.

File: supabase/functions/competitor-market-scan/index.ts

STEP 1 — UNDERSTAND THE CONTEXT
Before writing code, read these existing files and confirm
you understand their structure:
- src/lib/etsyRankingFactors.ts
- supabase/functions/nightly-action-scan/index.ts
  (to understand how we call Etsy API and auth patterns)
- The market_snapshots and competitor_alerts table schemas
  from the migration we just ran

Report what you found before writing any code.

STEP 2 — WRITE THE FUNCTION

The function accepts POST with body:
{
  user_id: string,
  search_terms?: string[], // optional override
  source: 'nightly' | 'manual' | 'onboarding'
}

If search_terms is not provided, derive them automatically:
- Query the user's listings table
- Extract all unique tags from their active listings
- Score each tag by frequency (how many listings use it)
- Take the top 8 most-used tags as search terms
- Also include the first 3 words of their top 5 listing
  titles as additional search terms
- Deduplicate and cap at 12 total search terms

For each search term:
1. Call Etsy public search API:
   GET https://openapi.etsy.com/v3/application/listings/active
   Params: keywords={term}&limit=20&sort_on=score
   Headers: x-api-key: {ETSY_API_KEY from env}

2. Parse the response into our competitor format:
   For each listing in results:
   {
     etsy_listing_id: string,
     title: string,
     tags: string[],
     price: number,
     photo_count: number,
     review_count: number,
     listing_age_days: number, // calculate from creation_tsz
     ships_fast: boolean,      // shipping_profile.min_processing_days <= 3
     has_free_shipping: boolean,
     return_policy_present: boolean,
     materials_filled: boolean,
     rank_position: number     // 1-20
   }

3. Insert new row into market_snapshots:
   {
     user_id,
     search_term,
     result_count: listings.length,
     listings: parsedListings,
     scan_source: source,
     captured_at: NOW()
   }

4. CHANGE DETECTION — compare to previous snapshot:
   - Query the most recent market_snapshot for this
     user + search_term before this scan
   - If no previous snapshot exists, skip change detection
   - If previous exists, compare:

   For each listing in top 10 of BOTH snapshots:
     a. Price change > 10%? → competitor_alert
        change_type: 'price_change'
        severity: rank_position <= 3 ? 'critical' : 'warning'

     b. Tags completely different (< 50% overlap)?
        → competitor_alert
        change_type: 'tags_updated'
        severity: 'warning'

     c. Title changed?
        → competitor_alert
        change_type: 'title_updated'
        severity: 'info'

     d. Rank changed by 5+ positions?
        → competitor_alert
        change_type: 'rank_change'
        severity: rank_after < rank_before ? 'warning' : 'info'

   For listings in new snapshot NOT in previous top 20:
     → competitor_alert
     change_type: 'new_competitor'
     severity: rank_position <= 5 ? 'critical' : 'info'

   Insert all detected alerts into competitor_alerts table.

STEP 3 — ERROR HANDLING

Every external API call must be wrapped in try/catch.
If Etsy API returns 429 (rate limit):
  - Wait 2 seconds and retry once
  - If still fails, log and skip this search term
  - Continue with remaining terms
  - Include skipped terms in response

If Etsy API returns any other error:
  - Log the error with search_term and status code
  - Skip this term and continue
  - Include in response as failed_terms

Always return HTTP 200 with:
{
  success: boolean,
  user_id: string,
  search_terms_scanned: number,
  search_terms_failed: number,
  failed_terms: string[],
  snapshots_created: number,
  alerts_created: number,
  duration_ms: number
}

STEP 4 — VALIDATE

After writing the function:
1. Deploy it to local Supabase
2. Invoke it manually with our test user (RAVEfindsbyCC)
   and source: 'manual'
3. Confirm market_snapshots rows were created
4. Confirm the search terms derived from their listings
   look correct
5. Check for any console errors in the function logs
6. Report the full response and any issues

Do not proceed to Prompt 3 until this function
runs clean on the test user.


================================================================
PROMPT 3 — EDGE FUNCTION: rebuild-shop-intelligence
================================================================
Run after Prompt 2 is validated.
================================================================

Create a new Supabase edge function that rebuilds the
shop_intelligence row for a user. This runs after every
nightly grader pass and after every fix is applied.

File: supabase/functions/rebuild-shop-intelligence/index.ts

STEP 1 — READ EXISTING DATA STRUCTURES
Before writing code, query the following for our test user
and report what you find:
- All columns in fix_actions table — list column names
- All columns in listings table — list column names
- What daily_action_summaries contains
- Whether listing_scores or equivalent exists
- The structure of existing competitor_alerts rows
  (if any exist from Prompt 2)

Report everything you find. This shapes how we aggregate.

STEP 2 — WRITE THE FUNCTION

Accepts POST with body:
{ user_id: string, trigger: string }
-- trigger values: 'nightly' | 'fix_applied' | 'manual'

The function rebuilds shop_intelligence by running
these aggregation queries in order:

── AGGREGATION 1: Score State ──

Query fix_actions for this user to calculate overall score.
Since we don't have a standalone score table, derive it from:
- Sum all impact_points from resolved fix_actions
  as total_points_gained
- Sum all impact_points from open fix_actions
  as total_points_available
- overall_market_score = base_score + total_points_gained
  where base_score = 43 (default starting score)
  capped at 100

For score_delta_7d:
- Query fix_actions WHERE status = 'resolved'
  AND resolved_at >= NOW() - INTERVAL '7 days'
- Sum their score_delta values

For score_delta_30d: same but 30 days

score_trend:
- If score_delta_7d > 3: 'improving'
- If score_delta_7d < -3: 'declining'
- Else: 'stable'

── AGGREGATION 2: Fix Action Counts ──

Run a single query grouping fix_actions by status:
SELECT status, COUNT(*) FROM fix_actions
WHERE user_id = $1
GROUP BY status

Map to:
- open_fix_count: status = 'pending'
- applied_fix_count: status = 'applied'
- tracked_fix_count: status = 'tracking'
- resolved_fix_count: status = 'resolved'
- superseded_fix_count: status = 'superseded'

── AGGREGATION 3: Top Opportunities ──

Query fix_actions WHERE user_id = $1
AND status = 'pending'
ORDER BY impact_points DESC
LIMIT 10

For each, join to listings table to get listing title.
Format as:
{
  fix_action_id: string,
  listing_id: string,
  listing_title: string,
  dimension: string,    // factor_key from fix_actions
  issue: string,        // description from fix_actions
  impact_points: number,
  suggested_fix: any    // guided_payload from fix_actions
}

── AGGREGATION 4: Competitor Intelligence ──

Query competitor_alerts WHERE user_id = $1
AND surfaced_to_user = FALSE
AND dismissed_by_user = FALSE

Count total and count where severity = 'critical'

For competitor_summary:
{
  alerts_count: number,
  critical_count: number,
  top_moving_competitors: [
    // Top 3 competitors with most alerts this week
    { listing_id, title, change_count, latest_change_type }
  ],
  last_scan_at: timestamp from most recent market_snapshot
}

── AGGREGATION 5: Shop Health ──

Query listings WHERE user_id = $1 AND status = 'active'
- total_listings: COUNT(*)
- analyzed_listings: COUNT(*) WHERE last_graded_at IS NOT NULL
- listings_needing_attention: COUNT(*) WHERE EXISTS
  (SELECT 1 FROM fix_actions fa WHERE fa.listing_id = l.id
   AND fa.status = 'pending' AND fa.impact_points >= 7)

── AGGREGATION 6: Best and Worst Performers ──

For best_performing_listings:
Query listings WHERE user_id = $1 AND last_graded_at IS NOT NULL
JOIN with fix_actions to calculate per-listing score
Order by score DESC, take top 5
Format: [{ listing_id, title, score, pending_fix_count }]

For worst_performing_listings:
Same but order ASC, take bottom 5 with at least 1 pending fix

── AGGREGATION 7: Activity Context ──

last_fix_applied_at and last_fix_category:
SELECT applied_at, factor_key FROM fix_actions
WHERE user_id = $1 AND status IN ('applied','tracking','resolved')
ORDER BY applied_at DESC LIMIT 1

listings_analyzed_this_month:
SELECT COUNT(*) FROM listings WHERE user_id = $1
AND last_graded_at >= date_trunc('month', NOW())

── WRITE THE ROW ──

UPSERT into shop_intelligence using user_id as conflict key:
INSERT INTO shop_intelligence (...all fields...)
ON CONFLICT (user_id) DO UPDATE SET ...all fields...
rebuilt_at = NOW()

── RETURN ──

Always return HTTP 200:
{
  success: boolean,
  user_id: string,
  overall_market_score: number,
  open_fix_count: number,
  active_competitor_alerts: number,
  rebuilt_at: string,
  duration_ms: number
}

STEP 3 — VALIDATE

After writing the function:
1. Deploy locally
2. Invoke with test user and trigger: 'manual'
3. Query shop_intelligence for the test user and
   report every column value
4. Verify scores look reasonable for RAVEfindsbyCC
5. Verify top_opportunities contains real fix_actions
   with correct titles
6. Report any null columns that should have values

Do not proceed to Prompt 4 until shop_intelligence
row looks complete and accurate.


================================================================
PROMPT 4 — EXTEND: nightly-action-scan
================================================================
Run after Prompt 3 is validated.
================================================================

We need to extend the existing nightly-action-scan edge
function to do three additional things after it completes:

IMPORTANT: Do not rewrite the function. Read it first,
understand its current flow, and add to it surgically.

STEP 1 — READ THE EXISTING FUNCTION
Open supabase/functions/nightly-action-scan/index.ts
and report:
- The current function signature and what it accepts
- The current sequence of operations (numbered list)
- Where it currently ends / what it returns
- Any existing calls to other functions

Report this before touching anything.

STEP 2 — ADD THREE EXTENSIONS

After the existing function completes its current work,
add these three steps in order:

EXTENSION A — Trigger competitor-market-scan
After nightly grader completes for a user, invoke the
competitor-market-scan function:

const scanResponse = await fetch(
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/competitor-market-scan`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
    },
    body: JSON.stringify({
      user_id: userId,
      source: 'nightly'
    })
  }
)

Do not await the full response — fire and continue.
Log whether the invocation succeeded or failed.
Never let a competitor scan failure block the grader.

EXTENSION B — Trigger rebuild-shop-intelligence
After grader completes AND competitor scan is invoked,
rebuild shop intelligence:

const rebuildResponse = await fetch(
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/rebuild-shop-intelligence`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
    },
    body: JSON.stringify({
      user_id: userId,
      trigger: 'nightly'
    })
  }
)
await rebuildResponse.json() // Wait for this one — Echo needs it
Log the result.

EXTENSION C — Resolve tracked fix_actions at 7 days
After the grader runs, check for fix_actions that have
been in 'tracking' or 'applied' status for 7+ days:

Query:
SELECT fa.*, l.current_score, l.previous_score
FROM fix_actions fa
JOIN listings l ON fa.listing_id = l.id
WHERE fa.user_id = $userId
AND fa.status IN ('tracking', 'applied')
AND fa.applied_at <= NOW() - INTERVAL '7 days'

For each found action:
1. Re-run the grading check for that listing's dimension
   (using ETSY_RANKING_FACTORS check() logic)
2. If the dimension now passes (issue resolved):
   - Calculate score_delta: new_score - score_at_application
   - UPDATE fix_actions SET
       status = 'resolved',
       resolved_at = NOW(),
       score_delta = calculated_delta
   - This data feeds Echo's "that fix worked" responses
3. If the dimension still fails:
   - UPDATE fix_actions SET
       status = 'needs_attention',
       resolved_at = NOW(),
       score_delta = 0,
       resolution_note = 'No improvement detected after 7 days'
   - Echo will surface this as "that fix didn't move the
     needle — here's what to try next"
4. In both cases, include in the rebuild-shop-intelligence
   call's context so Echo has fresh data

New status values to add to fix_actions if not present:
- 'tracking' (already exists per previous work)
- 'needs_attention' (may be new — check first)
- Add 'resolution_note TEXT' column to fix_actions if missing

STEP 3 — VALIDATE EXTENSIONS

After adding extensions:
1. Manually invoke nightly-action-scan for test user
2. Check Supabase function logs — confirm all three
   extensions ran and logged their results
3. Confirm shop_intelligence was rebuilt (check rebuilt_at)
4. Confirm competitor-market-scan was invoked
   (check market_snapshots for new rows)
5. If any fix_actions are 7+ days old in applied/tracking,
   confirm they were resolved or marked needs_attention
6. Report any errors in the logs

Do not proceed to Prompt 5 until all three extensions
run without errors.


================================================================
PROMPT 5 — EXTEND: apply-fix-action + rebuild trigger
================================================================
Run after Prompt 4 is validated.
================================================================

When a user applies a fix, two things need to happen that
currently don't: the fix needs to be marked for 7-day
tracking, and shop_intelligence needs to be rebuilt
immediately so Echo has fresh context.

STEP 1 — READ EXISTING apply-fix-action
Open supabase/functions/apply-fix-action/index.ts
Report:
- What it currently does after a fix is successfully applied
- What status it sets on the fix_action row
- Whether it currently calls any other functions after apply
- The current return shape

STEP 2 — ADD TWO THINGS

After a fix is successfully applied, add:

ADDITION A — Set tracking state
When a fix is applied successfully, update fix_action:
SET status = 'tracking',
    applied_at = NOW(),
    tracking_started_at = NOW(),
    score_at_application = [current listing score]

Add 'tracking_started_at TIMESTAMPTZ' column if missing.
Add 'score_at_application INTEGER' column if missing.

The 'tracking' status means:
- Fix has been applied to Etsy
- We are waiting 7 days before evaluating result
- Echo knows about it and will check back

ADDITION B — Async rebuild-shop-intelligence
After setting tracking status, fire-and-forget:

fetch(rebuild-shop-intelligence, {
  user_id,
  trigger: 'fix_applied'
})

Do not await — return to user immediately.
Log whether the invoke succeeded.

STEP 3 — VALIDATE

1. Apply a fix manually through the UI for test user
2. Check fix_actions row — confirm status = 'tracking'
   and tracking_started_at is set
3. Wait 5 seconds, then check shop_intelligence rebuilt_at
   — it should have updated
4. Check that open_fix_count decreased by 1 and
   tracked_fix_count increased by 1
5. Report results


================================================================
PROMPT 6 — ECHO CONTEXT LOADING
================================================================
Run after Prompt 5 is validated.
================================================================

Echo currently receives questions without shop context.
We need to wire shop_intelligence into every Echo query
so it can give specific, data-driven answers.

STEP 1 — FIND ECHO'S CURRENT IMPLEMENTATION
Search the codebase for:
- The echo-demo-chat edge function (for landing page)
- Any in-app Echo chat implementation
- How Echo is currently called from the frontend
- What context (if any) is currently passed to Echo

Report everything you find before making changes.

STEP 2 — CREATE: echo-chat edge function (in-app version)

This is separate from the landing page echo-demo-chat.
This is the real Echo that authenticated users talk to.

File: supabase/functions/echo-chat/index.ts

Accepts POST with:
{
  message: string,
  conversation_history: Array<{role: string, content: string}>,
  user_id: string
}

Authentication: require valid Supabase JWT in Authorization header.

BEFORE calling the AI, load shop context:

1. Query shop_intelligence WHERE user_id = $user_id
   Load the full row.

2. Query competitor_alerts WHERE user_id = $user_id
   AND surfaced_to_user = FALSE
   AND dismissed_by_user = FALSE
   LIMIT 5
   Order by severity DESC, detected_at DESC

3. Query fix_actions WHERE user_id = $user_id
   AND status = 'needs_attention'
   LIMIT 3

4. Build context block:

const shopContext = `
SHOP INTELLIGENCE CONTEXT (updated: ${si.rebuilt_at}):

Market Score: ${si.overall_market_score}/100
Score trend (7 days): ${si.score_delta_7d > 0 ? '+' : ''}${si.score_delta_7d} points (${si.score_trend})
Score trend (30 days): ${si.score_delta_30d > 0 ? '+' : ''}${si.score_delta_30d} points

Fix Actions:
- Open fixes: ${si.open_fix_count} (${si.total_points_available} points available)
- Applied & tracking: ${si.tracked_fix_count}
- Resolved this month: ${si.resolved_fix_count}
- Total points gained: ${si.total_points_gained}

Shop Health:
- Total active listings: ${si.total_listings}
- Listings analyzed: ${si.analyzed_listings}
- Listings needing attention: ${si.listings_needing_attention}

Top 3 Opportunities Right Now:
${si.top_opportunities.slice(0,3).map((o,i) => 
  `${i+1}. [${o.dimension}] ${o.issue} — worth +${o.impact_points} pts (listing: "${o.listing_title}")`
).join('\n')}

${competitorAlerts.length > 0 ? `
Competitor Alerts (unsurfaced):
${competitorAlerts.map(a => 
  `- [${a.severity.toUpperCase()}] ${a.change_type} detected for "${a.competitor_title}" on search: "${a.search_term}"`
).join('\n')}
` : 'No new competitor alerts.'}

${needsAttentionFixes.length > 0 ? `
Fixes That Didn't Work (needs new approach):
${needsAttentionFixes.map(f => 
  `- ${f.factor_key} fix on "${f.listing_title}" — applied ${f.applied_at}, no improvement detected`
).join('\n')}
` : ''}

Last fix applied: ${si.last_fix_applied_at ? 
  `${si.last_fix_category} (${si.last_fix_applied_at})` : 'None yet'}
Active strategy: ${si.active_strategy}
`

5. Build system prompt:

const ECHO_SYSTEM_PROMPT = `
You are Echo, the AI shop advisor built into RadarIQ.

Your role: Give this seller specific, actionable guidance
about their actual Etsy shop. You have real data about
their shop loaded below. Use it. Be specific.
Never give generic Etsy advice when you have real data.

Your personality:
- Direct and honest. Never vague.
- Lead with their actual numbers, not generalities.
- Suggest the next specific action, not a category of action.
- When a fix didn't work, say so clearly and suggest why.
- When a competitor makes a move, explain what it means.
- Keep responses under 150 words unless detail is essential.
- Never recommend they "consider" something — tell them what to do.
- You are not Claude. You are Echo, built by RadarIQ.

${shopContext}

Current date: ${new Date().toISOString().split('T')[0]}
`

6. Call AI via Supabase AI Gateway:
   Model: claude-haiku-4-5 (or Lovable gateway equivalent)
   System: ECHO_SYSTEM_PROMPT
   Messages: conversation_history + new user message
   Max tokens: 400

7. After getting response, mark surfaced alerts:
   UPDATE competitor_alerts
   SET surfaced_to_user = TRUE, surfaced_at = NOW()
   WHERE id IN (alertIds loaded in step 2)

8. Return:
{
  success: true,
  response: string,      // Echo's message
  alerts_surfaced: number
}

STEP 3 — WIRE TO FRONTEND

Find where Echo is rendered in the authenticated dashboard.
Update the Echo chat component to:
1. Call /functions/v1/echo-chat instead of the landing demo
2. Pass conversation_history on every message
3. Show a subtle indicator when Echo has loaded shop context
   (e.g., small "Shop data loaded" tag near the input)
4. On first load, show Echo's opening message which should
   reference their actual score and top opportunity

STEP 4 — VALIDATE

1. Log in as test user
2. Open Echo chat
3. Ask: "What's the most important thing I should fix today?"
4. Confirm Echo's response references their actual:
   - Market score (should be a specific number)
   - A real listing name
   - A specific fix with real point value
5. Ask: "Did any of my recent fixes work?"
6. Confirm Echo references actual applied/resolved fixes
7. Report the full exchange and any issues


================================================================
PROMPT 7 — CRON SCHEDULING
================================================================
Run after Prompt 6 is validated.
================================================================

Set up the scheduled jobs so everything runs automatically.

STEP 1 — CHECK EXISTING CRON SETUP
Read supabase/functions/nightly-action-scan/index.ts
and check if a cron schedule already exists for it.
Also check supabase/config.toml for any existing crons.
Report what you find.

STEP 2 — ADD/VERIFY CRON SCHEDULES

In supabase/config.toml, ensure these cron entries exist:

# Nightly grader — runs at 2:00 AM UTC
# Triggers grader → competitor scan → shop intelligence rebuild
[functions.nightly-action-scan]
schedule = "0 2 * * *"
verify_jwt = false

If the nightly-action-scan cron already exists, leave it.
Do not create a separate cron for competitor-market-scan or
rebuild-shop-intelligence — they are triggered by the grader.

STEP 3 — ADD CRON SECURITY

The nightly-action-scan function should verify the
CRON_SECRET env var when called by the scheduler:

At the top of the function, check:
const authHeader = req.headers.get('Authorization')
const cronSecret = Deno.env.get('CRON_SECRET')

// Allow service role OR valid cron secret
const isServiceRole = authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
const isCron = authHeader === `Bearer ${cronSecret}`

if (!isServiceRole && !isCron) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401
  })
}

If CRON_SECRET check already exists, leave it. Do not
double-add it.

STEP 4 — MULTI-USER SUPPORT

Currently nightly-action-scan likely runs for one user.
We need it to run for ALL active users nightly.

Check if it currently iterates over all users or accepts
a specific user_id. If it only handles one user:

Add a scheduled mode where it queries:
SELECT DISTINCT user_id FROM etsy_connections
WHERE status = 'active'

Then invokes itself for each user_id sequentially
(not in parallel — to avoid Etsy rate limits).

Use a 3-second delay between each user:
await new Promise(r => setTimeout(r, 3000))

Return a summary:
{
  users_processed: number,
  users_failed: number,
  failed_user_ids: string[],
  total_duration_ms: number
}

STEP 5 — VALIDATE SCHEDULING

1. Check supabase/config.toml cron is correct
2. Manually trigger the cron endpoint as if it were
   the scheduler (with CRON_SECRET header)
3. Confirm it processes the test user correctly
4. Confirm it would iterate all users in production
5. Report cron configuration and test results


================================================================
PROMPT 8 — DASHBOARD WIRING (frontend)
================================================================
Run after Prompt 7 is validated.
================================================================

The authenticated dashboard needs to reflect the real data
we're now collecting. This prompt wires shop_intelligence
into the main dashboard view.

STEP 1 — FIND THE CURRENT DASHBOARD
Identify the main dashboard component file.
Report:
- File path
- What data it currently loads
- How it currently gets the user's score
- How it currently gets fix_actions
- Whether it has a strategy selector or fix card tiles

STEP 2 — CREATE: useShopIntelligence hook

Create src/hooks/useShopIntelligence.ts:

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useShopIntelligence(userId: string | undefined) {
  const [intelligence, setIntelligence] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) return

    // Initial load
    const load = async () => {
      const { data, error } = await supabase
        .from('shop_intelligence')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') {
        setError(error)
      } else {
        setIntelligence(data)
      }
      setLoading(false)
    }

    load()

    // Realtime subscription — update when rebuilt
    const channel = supabase
      .channel(`shop-intelligence-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'shop_intelligence',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        setIntelligence(payload.new)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return { intelligence, loading, error }
}

STEP 3 — UPDATE DASHBOARD COMPONENT

In the main dashboard component:
1. Import and use useShopIntelligence hook
2. Pass the score ring the value from
   intelligence.overall_market_score
3. Pass the fix card list from
   intelligence.top_opportunities (mapped to fix card format)
4. Show competitor alerts badge on nav if
   intelligence.active_competitor_alerts > 0
5. Show score trend indicator (↑ / → / ↓) next to score ring
   based on intelligence.score_trend

Do not remove any existing functionality.
Only add data sources where currently using mock/placeholder data.

STEP 4 — VALIDATE

1. Log in as test user
2. Open dashboard
3. Confirm score ring shows real score from shop_intelligence
4. Confirm fix cards show real data from top_opportunities
5. Make a small fix through the UI
6. Wait 10 seconds
7. Confirm score ring updates via realtime subscription
8. Report what you see


================================================================
POST-COMPLETION VALIDATION CHECKLIST
================================================================
Run this after all 8 prompts are complete.
================================================================

Ask Claude Code to run through this checklist and report
pass/fail for each item:

NIGHTLY GRADER
□ nightly-action-scan runs for all active users
□ superseded status applied when issues resolve externally
□ No duplicate fix_actions created per listing per dimension
□ daily_action_summaries row written after each run
□ Competitor scan triggered after grader completes
□ shop_intelligence rebuilt after grader completes

COMPETITOR INTELLIGENCE
□ market_snapshots created for each search term
□ Change detection working — alerts created for price/tag/rank changes
□ Alerts correctly categorized by severity
□ Top search terms derived correctly from user's listings

SHOP INTELLIGENCE
□ shop_intelligence row exists for test user
□ overall_market_score is a reasonable number (not 0, not 100)
□ top_opportunities contains real fix_actions with titles
□ competitor_summary reflects actual alert data
□ rebuilt_at updates within 30 seconds of fix applied

FIX TRACKING
□ Applied fixes set to 'tracking' status
□ 7-day check runs nightly
□ Resolved fixes have score_delta filled
□ needs_attention fixes are surfaced to Echo
□ Echo references actual resolved/failed fixes

ECHO IN-APP
□ Echo loads shop_intelligence before every response
□ Echo references real listing names and scores
□ Echo surfaces competitor alerts when relevant
□ Competitor alerts marked surfaced after Echo mentions them

REALTIME
□ Dashboard score ring updates live when shop_intelligence rebuilt
□ Fix card list updates when new fix_actions created
□ No duplicate realtime channel names

DATA INTEGRITY
□ All new tables have RLS enabled
□ No user can read another user's data
□ Service role has full access to all tables
□ All timestamps are TIMESTAMPTZ (not TIMESTAMP)
□ No rows updated in place that represent historical state
□ Snapshot tables only have INSERT, never UPDATE

================================================================
END OF PROMPTS
================================================================
