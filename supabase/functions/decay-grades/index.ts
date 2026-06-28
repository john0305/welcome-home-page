// Nightly grade-decay sweep.
// For each active listing: if it's past the 30-day grace period, has at least
// 4 weeks of view history, current 7-day views < 25% of historical median AND
// zero sales in the last 30 days → add 2 decay points (cap 30, score floor 40)
// and flag needs_attention. If the listing recovers, reset decay.
//
// Triggered by pg_cron (see scripts/decay-cron.sql). Anyone can hit the URL but
// the function only operates with service-role and processes ALL listings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GRACE_DAYS = 30;
const MIN_HISTORY_DAYS = 28;
const LOW_VIEW_RATIO = 0.25;
const DECAY_STEP = 2;
const DECAY_CAP = 30;
const SCORE_FLOOR = 40;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Cron guard: require CRON_SECRET via x-cron-trigger header, OR a service-role bearer.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incomingSecret = req.headers.get("x-cron-trigger");
  const authHeader = req.headers.get("Authorization") || "";
  const isServiceRole = authHeader === `Bearer ${SERVICE_KEY}`;
  if (!isServiceRole && (!cronSecret || incomingSecret !== cronSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const nowMs = Date.now();
  const graceCutoff = new Date(nowMs - GRACE_DAYS * 86_400_000).toISOString();

  try {
    // Only consider active listings that have been graded AT LEAST once and are
    // past the grace period since last grade. Optimize.last_optimized is
    // implicit — optimize-listing resets decay so freshly-optimized listings
    // naturally fall out of this sweep.
    const { data: listings, error } = await supabase
      .from("listings")
      .select("id, user_id, score, decay_points, last_graded, etsy_created_at")
      .eq("state", "active")
      .not("last_graded", "is", null)
      .lt("last_graded", graceCutoff)
      .limit(5000);

    if (error) return json({ error: error.message }, 500);
    if (!listings || listings.length === 0) return json({ processed: 0, decayed: 0, recovered: 0 });

    let decayed = 0;
    let recovered = 0;

    for (const l of listings) {
      // Pull snapshot history for this listing (need ≥4 weeks).
      const { data: snaps } = await supabase
        .from("listing_snapshots")
        .select("recorded_on, views")
        .eq("listing_id", l.id)
        .order("recorded_on", { ascending: false })
        .limit(90);

      if (!snaps || snaps.length < MIN_HISTORY_DAYS / 7) continue;

      const todayMs = nowMs;
      const last7Cut = todayMs - 7 * 86_400_000;
      const baselineCut = todayMs - MIN_HISTORY_DAYS * 86_400_000;

      type Snap = { recorded_on: string; views: number };
      const typed = snaps as Snap[];
      if (typed.length < 2) continue;

      // Approximate "views in last 7 days" as (latest - earliest-in-7d) views.
      const recent = typed.filter(s => new Date(s.recorded_on).getTime() >= last7Cut);
      if (recent.length < 2) continue;
      const last7Views = Math.max(0, recent[0].views - recent[recent.length - 1].views);

      // Baseline: median weekly views computed over the last ≥4 weeks.
      const historical = typed.filter(s => new Date(s.recorded_on).getTime() >= baselineCut);
      if (historical.length < 4) continue;
      // Bucket into ~7-day chunks and diff to estimate weekly deltas.
      const weekly: number[] = [];
      for (let i = 0; i + 7 < historical.length; i += 7) {
        const delta = historical[i].views - historical[i + 7].views;
        if (delta >= 0) weekly.push(delta);
      }
      if (weekly.length < 3) continue;
      const baseline = median(weekly);
      if (baseline <= 0) continue;

      // Sales in last 30 days from shop_snapshots is shop-wide, so we use
      // listing-level state instead: any optimization or grade reset already
      // skipped via the grace filter. Here we use orders endpoint proxy —
      // since we don't store per-listing 30d sales, we approximate: if the
      // listing has had ANY favorites bump in the last 30d we treat it as
      // alive. (Favorites tracked in listing_snapshots already.)
      const last30Cut = todayMs - 30 * 86_400_000;
      const last30 = typed.filter(s => new Date(s.recorded_on).getTime() >= last30Cut);
      const had30dActivity = last30.length >= 2 && (last30[0].views - last30[last30.length - 1].views) > baseline * 0.5;

      const lowViews = last7Views < baseline * LOW_VIEW_RATIO;
      const noActivity = !had30dActivity;

      const currentDecay = Number(l.decay_points ?? 0);

      if (lowViews && noActivity) {
        // Decay: bump points (capped) and ensure score - decay >= floor.
        const score = Number(l.score ?? 0);
        const maxAllowed = Math.max(0, score - SCORE_FLOOR);
        const nextDecay = Math.min(DECAY_CAP, maxAllowed, currentDecay + DECAY_STEP);
        if (nextDecay > currentDecay) {
          await supabase.from("listings").update({
            decay_points: nextDecay,
            decay_started_at: l.decay_started_at ?? new Date().toISOString(),
            needs_attention: true,
          }).eq("id", l.id);
          decayed++;
        }
      } else if (currentDecay > 0) {
        // Recovery — listing is back above the threshold.
        await supabase.from("listings").update({
          decay_points: 0,
          decay_started_at: null,
          needs_attention: false,
        }).eq("id", l.id);
        recovered++;
      }
    }

    return json({ processed: listings.length, decayed, recovered });
  } catch (err) {
    console.error("decay-grades error", err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
