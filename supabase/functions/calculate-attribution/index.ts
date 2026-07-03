// Computes performance attribution windows (7/14/30/60/90d) for optimizations
// using existing listing_snapshots + shop_snapshots data. Insert-only on
// snapshots — this function only writes to performance_attribution and wins_feed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callerUserId, isAdminCall, isServiceCall } from "../_shared/service-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WINDOWS = [7, 14, 30, 60, 90] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: { optimization_id?: string; user_id?: string; run_all?: boolean } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  // Callers: service role (pipeline) and admins get full access; an
  // authenticated user may only recompute their own attribution.
  const privileged = isServiceCall(req) || (await isAdminCall(req));
  if (!privileged) {
    const caller = await callerUserId(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);
    if (body.run_all) return json({ error: "Forbidden" }, 403);
    if (body.user_id && body.user_id !== caller) return json({ error: "Forbidden" }, 403);
    body.user_id = body.user_id ?? caller;
    if (body.optimization_id) {
      const { data: owned } = await supabase.from("optimizations")
        .select("id").eq("id", body.optimization_id).eq("user_id", caller).maybeSingle();
      if (!owned) return json({ error: "Forbidden" }, 403);
    }
  }

  try {
    let optimizations: any[] = [];
    if (body.optimization_id) {
      const { data } = await supabase.from("optimizations").select("*")
        .eq("id", body.optimization_id).limit(1);
      optimizations = data ?? [];
    } else if (body.user_id) {
      const { data } = await supabase.from("optimizations").select("*")
        .eq("user_id", body.user_id).eq("status", "approved");
      optimizations = data ?? [];
    } else if (body.run_all) {
      const { data } = await supabase.from("optimizations").select("*")
        .eq("status", "approved");
      optimizations = data ?? [];
    } else {
      return json({ error: "Provide optimization_id, user_id, or run_all" }, 400);
    }

    let processed = 0;
    let wins = 0;
    for (const opt of optimizations) {
      try {
        const r = await processOptimization(supabase, opt);
        processed += r.windows;
        wins += r.wins;
      } catch (e) {
        console.error("attribution failed for", opt.id, e);
      }
    }

    return json({ ok: true, optimizations: optimizations.length, attribution_windows: processed, wins_emitted: wins });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

async function processOptimization(supabase: any, opt: any) {
  const optimizedAt = new Date(opt.pushed_at ?? opt.updated_at ?? opt.created_at);
  const now = new Date();

  // Pre-snapshot: most recent listing_snapshot on/before optimization date
  const { data: preSnap } = await supabase.from("listing_snapshots")
    .select("*")
    .eq("listing_id", opt.listing_id)
    .lte("recorded_on", optimizedAt.toISOString().slice(0, 10))
    .order("recorded_on", { ascending: false })
    .limit(1);
  const pre = preSnap?.[0] ?? null;

  let windowsWritten = 0;
  let winsEmitted = 0;

  for (const w of WINDOWS) {
    const targetDate = new Date(optimizedAt.getTime() + w * 86400000);
    const sufficient = now.getTime() >= targetDate.getTime();

    // Closest snapshot at-or-after target date (or latest available if sufficient)
    let post: any = null;
    if (sufficient) {
      const { data } = await supabase.from("listing_snapshots")
        .select("*")
        .eq("listing_id", opt.listing_id)
        .gte("recorded_on", targetDate.toISOString().slice(0, 10))
        .order("recorded_on", { ascending: true })
        .limit(1);
      post = data?.[0] ?? null;
    }

    const preViews = pre?.views ?? 0;
    const postViews = post?.views ?? 0;
    const preFavs = pre?.favorites ?? 0;
    const postFavs = post?.favorites ?? 0;
    const preSales = 0; // sales not tracked at listing snapshot — derived 0 fallback
    const postSales = 0;
    const preRev = Number(pre?.price ?? 0);
    const postRev = Number(post?.price ?? 0);
    const preScore = opt.original_grade ?? null;
    const postScore = opt.new_grade ?? null;

    const viewsDelta = postViews - preViews;
    const favDelta = postFavs - preFavs;
    const salesDelta = postSales - preSales;
    const revDelta = postRev - preRev;
    const scoreDelta = (postScore != null && preScore != null) ? postScore - preScore : null;

    const pct = (pre: number, delta: number) => pre > 0 ? Math.round((delta / pre) * 1000) / 10 : null;

    const viewsPct = pct(preViews, viewsDelta);
    const favPct = pct(preFavs, favDelta);
    const salesPct = pct(preSales, salesDelta);
    const revPct = pct(preRev, revDelta);

    // Anomaly: implausibly large pct change in short window
    let isAnomaly = false;
    let anomalyReason: string | null = null;
    if (sufficient) {
      if ((viewsPct ?? 0) > 1000) { isAnomaly = true; anomalyReason = `views +${viewsPct}%`; }
      else if ((salesPct ?? 0) > 1000) { isAnomaly = true; anomalyReason = `sales +${salesPct}%`; }
      else if (w <= 7 && salesDelta > 100) { isAnomaly = true; anomalyReason = `+${salesDelta} sales in 7d`; }
    }

    const row = {
      optimization_id: opt.id,
      listing_id: opt.listing_id,
      user_id: opt.user_id,
      window_days: w,
      optimized_at: optimizedAt.toISOString(),
      pre_snapshot_date: pre?.recorded_on ?? null,
      post_snapshot_date: post?.recorded_on ?? null,
      pre_views: preViews, post_views: postViews, views_delta: viewsDelta, views_pct: viewsPct,
      pre_favorites: preFavs, post_favorites: postFavs, favorites_delta: favDelta, favorites_pct: favPct,
      pre_sales: preSales, post_sales: postSales, sales_delta: salesDelta, sales_pct: salesPct,
      pre_revenue: preRev, post_revenue: postRev, revenue_delta: revDelta, revenue_pct: revPct,
      pre_score: preScore, post_score: postScore, score_delta: scoreDelta,
      is_sufficient_data: sufficient && !!post,
      is_anomaly: isAnomaly,
      anomaly_reason: anomalyReason,
    };

    const { data: upserted } = await supabase.from("performance_attribution")
      .upsert(row, { onConflict: "optimization_id,window_days" })
      .select("id")
      .single();

    windowsWritten++;

    // Wins feed milestones (only for valid sufficient data)
    if (sufficient && post && !isAnomaly && upserted?.id) {
      const milestones: { kind: string; headline: string; metric: number }[] = [];
      if ((viewsPct ?? 0) >= 50) milestones.push({
        kind: `views_50_w${w}`,
        headline: `Views are up ${Math.round(viewsPct!)}% at ${w} days`,
        metric: viewsPct!,
      });
      if ((scoreDelta ?? 0) >= 20) milestones.push({
        kind: `score_jump_w${w}`,
        headline: `Listing score jumped +${scoreDelta} after optimization`,
        metric: scoreDelta!,
      });
      // First sale is a once-per-listing milestone: without the guard, every
      // window (7/14/30/60/90d) emitted an identical window-less headline.
      if (salesDelta > 0 && preSales === 0) {
        const { data: existingFirstSale } = await supabase.from("wins_feed")
          .select("id")
          .eq("user_id", opt.user_id)
          .eq("listing_id", opt.listing_id)
          .like("kind", "first_sale%")
          .limit(1)
          .maybeSingle();
        if (!existingFirstSale) {
          milestones.push({
            kind: "first_sale",
            headline: `First sale recorded after optimization`,
            metric: salesDelta,
          });
        }
      }

      for (const m of milestones) {
        // Upsert on (attribution_id, kind) so nightly/admin re-runs never
        // duplicate a win already on the feed.
        const { error } = await supabase.from("wins_feed").upsert({
          user_id: opt.user_id,
          listing_id: opt.listing_id,
          attribution_id: upserted.id,
          kind: m.kind,
          headline: m.headline,
          metric_value: m.metric,
          window_days: w,
        }, { onConflict: "attribution_id,kind", ignoreDuplicates: true });
        if (!error) winsEmitted++;
      }
    }
  }

  return { windows: windowsWritten, wins: winsEmitted };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
