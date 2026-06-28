# RadarIQ — Project Context for Antigravity

## What this is
RadarIQ (radariq.app) is a SaaS platform for Etsy sellers. 
It analyzes their shop, grades their listings, surfaces fixes, 
and tracks performance over time.

## Stack
- Frontend: React + Vite + TypeScript + Tailwind + shadcn/ui
- Backend: Supabase (Postgres + Edge Functions + Realtime)
- Auth: Supabase Auth
- Deployment: Lovable-connected GitHub repo

## Key tables
- listings — all Etsy listings per user
- listing_snapshots — nightly snapshot of each listing's stats
- listing_sales_events — detected sales from quantity drops
- store_velocity_stats — per-user rollup of sell-through metrics
- fix_actions — pending and applied fixes per listing
- market_snapshots — competitor market data
- shop_intelligence — nightly rebuilt market summary per user
- dismissed_alerts — user-dismissed alert records

## Key edge functions
- nightly-action-scan — classifies and inserts fix_actions nightly
- compute-velocity — populates listing_sales_events and store_velocity_stats
- rebuild-shop-intelligence — rebuilds market intelligence per user
- competitor-market-scan — scans competitor listings for tag gaps
- echo-chat — Echo AI advisor chat handler
- apply-fix-action — applies a single fix to a listing

## Critical rules — never violate these
- Every query must be scoped with WHERE user_id = auth.uid()
- All new tables need RLS enabled with service role full access
- Never UPDATE rows that represent historical state (snapshots are INSERT only)
- All timestamps must be TIMESTAMPTZ not TIMESTAMP
- Do not break existing fix apply functionality
- Do not merge or average healthScore.overall and overall_market_score

## Current beta user
RAVEfindsbyCC — Christina's Etsy shop, ~285 listings, 
vintage/jewelry/collectibles, qty-1 items mostly

## What's built and working
- Nightly listing grader with A-F scores
- Fix action queue with Echo Picks / High Impact / Quick Wins / 
  Most Expensive / All Fixes tabs
- Market intelligence with competitor tag gap analysis
- Shop intelligence with overall_market_score
- Store velocity tracking (listing_sales_events backfill in progress)
- Dashboard with performance comparison, score trend, 
  optimization activity feed
- Intelligence page with snapshot-based views/favorites drill-down
- Listing detail page with optimization impact chart, 
  renewal history, SEO grade, peer recommendations
- Dismissible alerts system

## What's in progress / known issues
- Store velocity backfill may not have fully populated 
  listing_sales_events yet
- Score ring still showing 43 despite optimizations applied — 
  recalculation trigger broken
- High Impact tab fix action classification needs nightly re-run
- Snapshot now button needs verification it writes to market_snapshots