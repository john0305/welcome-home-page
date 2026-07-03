/**
 * rebuild-shop-intelligence
 *
 * Aggregates all user-specific signals into a single shop_intelligence row.
 * Called after nightly grader, after fix applied, or manually.
 *
 * POST body: { user_id: string, trigger: 'nightly' | 'fix_applied' | 'manual' }
 * Always returns HTTP 200.
 *
 * Schema notes (deviations from prompt spec):
 *  - fix_actions has no impact_points → derived from severity (critical=10, high=8, medium=5, low=3)
 *  - fix_actions has no resolved_at / score_delta → applied_at is used instead
 *  - fix_actions has no 'resolved' or 'tracking' status → 'applied'+'edited_applied' map to applied;
 *    tracked_fix_count and resolved_fix_count are set to 0 / applied count respectively
 *  - listings score column is `score` (INT 0-100); graded timestamp is `last_graded`
 *  - listings.state = 'active' (not 'status')
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isServiceOrCronCall } from "../_shared/service-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Severity → point weight (proxy for impact_points which doesn't exist in schema)
const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 10,
  high: 8,
  medium: 5,
  low: 3,
};

function severityWeight(s: string | null): number {
  return SEVERITY_WEIGHT[s ?? "medium"] ?? 5;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FixAction {
  id: string;
  status: string;
  severity: string | null;
  dimension: string;
  factor_key: string;
  rationale: string | null;
  guided_payload: unknown;
  listing_id: string | null;
  applied_at: string | null;
}

interface Listing {
  id: string;
  title: string;
  score: number | null;
  state: string | null;
  last_graded: string | null;
}

interface CompetitorAlert {
  competitor_listing_id: string;
  competitor_title: string | null;
  change_type: string;
  severity: string;
  detected_at: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Internal pipeline function: all legitimate callers (nightly-action-scan,
  // apply-fix-action) pass the service-role bearer. It accepts an arbitrary
  // user_id and spends AI quota, so it must never be anon-invocable.
  if (!isServiceOrCronCall(req)) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const startMs = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const { user_id } = body;

    if (!user_id) {
      return json({ success: false, error: "user_id is required" });
    }

    // ── Fetch all signals in parallel ─────────────────────────────────────
    const [
      fixActionsRes,
      competitorAlertsRes,
      listingsRes,
      lastSnapshotRes,
    ] = await Promise.all([
      supabase
        .from("fix_actions")
        .select("id, status, severity, dimension, factor_key, rationale, guided_payload, listing_id, applied_at")
        .eq("user_id", user_id),
      supabase
        .from("competitor_alerts")
        .select("competitor_listing_id, competitor_title, change_type, severity, detected_at")
        .eq("user_id", user_id)
        .eq("surfaced_to_user", false)
        .eq("dismissed_by_user", false)
        .order("detected_at", { ascending: false }),
      supabase
        .from("listings")
        .select("id, title, score, state, last_graded")
        .eq("user_id", user_id),
      supabase
        .from("market_snapshots")
        .select("captured_at")
        .eq("user_id", user_id)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const allFixActions = (fixActionsRes.data ?? []) as FixAction[];
    const competitorAlerts = (competitorAlertsRes.data ?? []) as CompetitorAlert[];
    const allListings = (listingsRes.data ?? []) as Listing[];
    const lastScanAt = lastSnapshotRes.data?.captured_at ?? null;

    // ── Aggregation 1: Score State ─────────────────────────────────────────
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 86400 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 86400 * 1000).toISOString();

    let totalPointsGained = 0;
    let totalPointsAvailable = 0;
    let scoreDelta7d = 0;
    let scoreDelta30d = 0;

    for (const fa of allFixActions) {
      const w = severityWeight(fa.severity);
      if (fa.status === "applied" || fa.status === "edited_applied") {
        totalPointsGained += w;
        if (fa.applied_at && fa.applied_at >= sevenDaysAgo) scoreDelta7d += w;
        if (fa.applied_at && fa.applied_at >= thirtyDaysAgo) scoreDelta30d += w;
      } else if (fa.status === "pending") {
        totalPointsAvailable += w;
      }
    }

    const BASE_SCORE = 43;
    const overallMarketScore = Math.min(100, BASE_SCORE + totalPointsGained);
    const scoreTrend =
      scoreDelta7d > 3 ? "improving" : scoreDelta7d < -3 ? "declining" : "stable";

    // ── Aggregation 2: Fix Action Counts ───────────────────────────────────
    const statusCounts: Record<string, number> = {};
    for (const fa of allFixActions) {
      statusCounts[fa.status] = (statusCounts[fa.status] ?? 0) + 1;
    }

    const openFixCount = statusCounts["pending"] ?? 0;
    const appliedFixCount = (statusCounts["applied"] ?? 0) + (statusCounts["edited_applied"] ?? 0);
    const trackedFixCount = statusCounts["tracking"] ?? 0;
    const resolvedFixCount = statusCounts["resolved"] ?? 0;
    const supersededFixCount = statusCounts["superseded"] ?? 0;

    // ── Aggregation 3: Top Opportunities ──────────────────────────────────
    const listingMap = new Map(allListings.map((l) => [l.id, l.title]));

    const pendingActions = allFixActions
      .filter((fa) => fa.status === "pending")
      .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
      .slice(0, 10);

    const topOpportunities = pendingActions.map((fa) => ({
      fix_action_id: fa.id,
      listing_id: fa.listing_id ?? null,
      listing_title: fa.listing_id ? (listingMap.get(fa.listing_id) ?? "Unknown listing") : "Shop-level",
      dimension: fa.factor_key,
      issue: fa.rationale ?? fa.dimension,
      impact_points: severityWeight(fa.severity),
      suggested_fix: fa.guided_payload ?? null,
    }));

    // ── Aggregation 4: Competitor Intelligence ─────────────────────────────
    const activeCompetitorAlerts = competitorAlerts.length;
    const criticalCompetitorAlerts = competitorAlerts.filter(
      (a) => a.severity === "critical",
    ).length;

    // Top 3 competitor listing IDs by alert frequency this week
    const alertsByListing = new Map<
      string,
      { title: string | null; count: number; latestChangeType: string; latestAt: string }
    >();
    const oneWeekAgo = new Date(now - 7 * 86400 * 1000).toISOString();
    for (const a of competitorAlerts) {
      if (a.detected_at < oneWeekAgo) continue;
      const existing = alertsByListing.get(a.competitor_listing_id);
      if (!existing || a.detected_at > existing.latestAt) {
        alertsByListing.set(a.competitor_listing_id, {
          title: a.competitor_title,
          count: (existing?.count ?? 0) + 1,
          latestChangeType: a.change_type,
          latestAt: a.detected_at,
        });
      } else {
        existing.count += 1;
      }
    }

    const topMovingCompetitors = [...alertsByListing.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([listingId, info]) => ({
        listing_id: listingId,
        title: info.title,
        change_count: info.count,
        latest_change_type: info.latestChangeType,
      }));

    const competitorSummary = {
      alerts_count: activeCompetitorAlerts,
      critical_count: criticalCompetitorAlerts,
      top_moving_competitors: topMovingCompetitors,
      last_scan_at: lastScanAt,
    };

    // ── Aggregation 5: Shop Health ─────────────────────────────────────────
    const activeListings = allListings.filter((l) => l.state === "active");
    const totalListings = activeListings.length;
    const analyzedListings = activeListings.filter((l) => l.last_graded !== null).length;

    // Listings needing attention: have at least one high/critical pending fix
    // (proxy for impact_points >= 7 since that column doesn't exist)
    const highImpactListingIds = new Set(
      allFixActions
        .filter(
          (fa) =>
            fa.status === "pending" &&
            (fa.severity === "high" || fa.severity === "critical") &&
            fa.listing_id !== null,
        )
        .map((fa) => fa.listing_id as string),
    );
    const listingsNeedingAttention = activeListings.filter((l) =>
      highImpactListingIds.has(l.id)
    ).length;

    // avg listing score over active graded listings
    const gradedActive = activeListings.filter(
      (l) => l.last_graded !== null && l.score !== null,
    );
    const avgListingScore =
      gradedActive.length > 0
        ? gradedActive.reduce((sum, l) => sum + (l.score ?? 0), 0) / gradedActive.length
        : null;

    // ── Aggregation 6: Best and Worst Performers ───────────────────────────
    const gradedListings = allListings
      .filter((l) => l.last_graded !== null && l.score !== null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const pendingFixListingIds = new Set(
      allFixActions
        .filter((fa) => fa.status === "pending" && fa.listing_id !== null)
        .map((fa) => fa.listing_id as string),
    );

    const bestPerformingListings = gradedListings.slice(0, 5).map((l) => ({
      listing_id: l.id,
      title: l.title,
      score: l.score,
      pending_fix_count: allFixActions.filter(
        (fa) => fa.listing_id === l.id && fa.status === "pending",
      ).length,
    }));

    const worstPerformingListings = gradedListings
      .filter((l) => pendingFixListingIds.has(l.id))
      .reverse()
      .slice(0, 5)
      .map((l) => ({
        listing_id: l.id,
        title: l.title,
        score: l.score,
        top_issue: allFixActions.find(
          (fa) =>
            fa.listing_id === l.id &&
            fa.status === "pending" &&
            (fa.severity === "critical" || fa.severity === "high"),
        )?.factor_key ?? null,
      }));

    // ── Aggregation 7: Activity Context ───────────────────────────────────
    const lastApplied = allFixActions
      .filter(
        (fa) =>
          (fa.status === "applied" || fa.status === "edited_applied") &&
          fa.applied_at !== null,
      )
      .sort((a, b) => (b.applied_at! > a.applied_at! ? 1 : -1))[0] ?? null;

    const lastFixAppliedAt = lastApplied?.applied_at ?? null;
    const lastFixCategory = lastApplied?.dimension ?? null;

    const thisMonthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ).toISOString();
    const listingsAnalyzedThisMonth = allListings.filter(
      (l) => l.last_graded !== null && l.last_graded >= thisMonthStart,
    ).length;

    // ── Upsert shop_intelligence ───────────────────────────────────────────
    const rebuiltAt = new Date().toISOString();

    const { error: upsertErr } = await supabase.from("shop_intelligence").upsert(
      {
        user_id,

        // Score state
        overall_market_score: overallMarketScore,
        score_delta_7d: scoreDelta7d,
        score_delta_30d: scoreDelta30d,
        score_trend: scoreTrend,

        // Fix action counts
        open_fix_count: openFixCount,
        applied_fix_count: appliedFixCount,
        tracked_fix_count: trackedFixCount,
        resolved_fix_count: resolvedFixCount,
        superseded_fix_count: supersededFixCount,
        total_points_available: totalPointsAvailable,
        total_points_gained: totalPointsGained,

        // Top opportunities
        top_opportunities: topOpportunities,

        // Competitor intelligence
        active_competitor_alerts: activeCompetitorAlerts,
        critical_competitor_alerts: criticalCompetitorAlerts,
        competitor_summary: competitorSummary,

        // Shop health
        total_listings: totalListings,
        analyzed_listings: analyzedListings,
        listings_needing_attention: listingsNeedingAttention,
        avg_listing_score: avgListingScore,

        // Best/worst performers
        best_performing_listings: bestPerformingListings,
        worst_performing_listings: worstPerformingListings,

        // Activity context
        last_fix_applied_at: lastFixAppliedAt,
        last_fix_category: lastFixCategory,
        listings_analyzed_this_month: listingsAnalyzedThisMonth,

        // Temporal markers
        last_competitor_scan_at: lastScanAt,
        rebuilt_at: rebuiltAt,
      },
      { onConflict: "user_id" },
    );

    if (upsertErr) {
      console.error("shop_intelligence upsert failed", upsertErr);
      return json({
        success: false,
        error: `Upsert failed: ${upsertErr.message}`,
        user_id,
        overall_market_score: overallMarketScore,
        open_fix_count: openFixCount,
        active_competitor_alerts: activeCompetitorAlerts,
        rebuilt_at: rebuiltAt,
        duration_ms: Date.now() - startMs,
      });
    }

    return json({
      success: true,
      user_id,
      overall_market_score: overallMarketScore,
      open_fix_count: openFixCount,
      active_competitor_alerts: activeCompetitorAlerts,
      rebuilt_at: rebuiltAt,
      duration_ms: Date.now() - startMs,
    });
  } catch (err) {
    console.error("rebuild-shop-intelligence error", err);
    return json({
      success: false,
      error: String(err),
      user_id: "",
      overall_market_score: 0,
      open_fix_count: 0,
      active_competitor_alerts: 0,
      rebuilt_at: new Date().toISOString(),
      duration_ms: Date.now() - startMs,
    });
  }
});
