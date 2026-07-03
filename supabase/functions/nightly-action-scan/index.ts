/**
 * nightly-action-scan
 *
 * Runs once per night per user with a connected store. For each user:
 *   1. RE-CHECK every existing pending action — if check() now passes, mark
 *      it superseded with reason='resolved_externally'. We never surface a
 *      fix for something the seller already handled on their own.
 *   2. For every listing + every listing-scope factor: if it fails and there's
 *      no pending action, call generate-fix-action (which dedupes again).
 *   3. For every shop-scope factor: same thing, scoped to the shop.
 *   4. Auto-apply any pending actions whose factor_key is in the user's
 *      auto_apply_preferences.allowed_factors AND prefs.enabled is true.
 *   5. Roll up the result into daily_action_summaries for the morning briefing.
 *
 * Invoked by:
 *   - pg_cron at 04:00 UTC nightly (scheduled separately via the insert tool)
 *   - The onboarding flow after first store connect (so new users land on a
 *     populated queue) — pass body { user_id, source: 'onboarding_scan' }
 *
 * Auth: accepts either a service-role key (cron + internal calls) or a logged-
 * in user (manual "scan now" trigger).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  aiGateway,
  corsHeaders,
  etsyApiFor,
  json,
  loadListingCtx,
  loadShopCtx,
  makeServiceClient,
} from "../_shared/action-engine.ts";
import {
  ETSY_RANKING_FACTORS,
  getFactor,
  listingFactors,
  shopFactors,
  type CheckResult,
} from "../_shared/etsy-ranking-factors.ts";
import { applyPriorityGate } from "../_shared/priority-gate.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const source = body.source || "nightly_scan";
    const supabase = makeServiceClient();

    // Auth: every invocation must be service-role or cron-secret.
    // Single-user calls (body.user_id) come from internal triggers (e.g. onboarding-pipeline)
    // which already pass the service-role key; bulk calls come from the scheduler.
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cronSecretEnv = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("Authorization") || "";
    const incomingSecret = req.headers.get("x-cron-trigger");
    const isServiceRole = Boolean(serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`);
    const isCronHeader = Boolean(cronSecretEnv && incomingSecret === cronSecretEnv);
    if (!isServiceRole && !isCronHeader) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Resolve target users
    let userIds: string[];
    if (body.user_id) {
      userIds = [body.user_id];
    } else {
      const { data: tokens } = await supabase.from("etsy_tokens").select("user_id");
      userIds = Array.from(new Set((tokens || []).map((t) => t.user_id)));
    }

    const results: Record<string, unknown> = {};
    // Run the actual scan in the background so the caller (cron/onboarding)
    // doesn't hang and never hits the 150s edge idle timeout.
    const work = (async () => {
      const startMs = Date.now();
      const failedUserIds: string[] = [];
      let processed = 0;
      for (let i = 0; i < userIds.length; i++) {
        const userId = userIds[i];
        // Stagger requests to avoid Etsy rate limits across consecutive users.
        if (i > 0) await new Promise((r) => setTimeout(r, 3000));
        try {
          results[userId] = await scanUser(supabase, userId, source);
          processed++;
          // Fire-and-forget sanity check (only re-scan listings whose content
          // changed since their last sanity scan).
          try {
            const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sanity-check-scan`;
            fetch(fnUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ scope: "changed", user_id: userId }),
            }).catch((e) => console.error("sanity-check-scan dispatch", e));
          } catch (e) { console.error("sanity-check-scan invoke", e); }
        } catch (e) {
          console.error(`scanUser failed for ${userId}`, e);
          results[userId] = { error: String(e) };
          failedUserIds.push(userId);
        }
      }
      console.log("nightly-action-scan complete", {
        users_processed: processed,
        users_failed: failedUserIds.length,
        failed_user_ids: failedUserIds,
        total_duration_ms: Date.now() - startMs,
      });
    })();

    // @ts-ignore — EdgeRuntime is provided by Supabase Functions runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(work);
    } else {
      // Fallback for environments without EdgeRuntime (tests): await inline.
      await work;
    }

    return json({ ok: true, queued: true, users: userIds.length });

  } catch (err) {
    console.error("nightly-action-scan error", err);
    return json({ error: String(err) }, 500);
  }
});

async function scanUser(
  supabase: ReturnType<typeof makeServiceClient>,
  userId: string,
  source: string,
) {
  const summary = {
    scanned_listings: 0,
    actions_generated: 0,
    auto_applied: 0,
    awaiting_approval: 0,
    guided: 0,
    inform: 0,
    resolved_externally: 0,
    failures: 0,
    details: [] as Array<Record<string, unknown>>,
  };

  const today = new Date().toISOString().slice(0, 10);
  // Mark scan in-progress so observers see a row even if the background
  // execution dies partway through.
  await supabase.from("daily_action_summaries").upsert({
    user_id: userId,
    scan_date: today,
    status: "in_progress",
    scan_started_at: new Date().toISOString(),
    scan_completed_at: null,
    scanned_listings: 0,
    actions_generated: 0,
    auto_applied: 0,
    awaiting_approval: 0,
    guided: 0,
    inform: 0,
    resolved_externally: 0,
    failures: 0,
  }, { onConflict: "user_id,scan_date" });

  // ── Step 1: re-check existing pending actions ────────────────────────────
  const { data: pendings } = await supabase
    .from("fix_actions")
    .select("id, factor_key, listing_id, etsy_shop_id")
    .eq("user_id", userId)
    .eq("status", "pending");

  await runWithConcurrency(pendings || [], 5, async (p) => {
    const factor = getFactor(p.factor_key);
    if (!factor) return;
    // Pipeline-computed factors (pass-through checks) are created and
    // resolved by their own pipeline steps — a re-check here would
    // supersede them every night.
    if (factor.pipeline_computed) return;
    const ctx = factor.scope === "listing"
      ? (p.listing_id ? await loadListingCtx(supabase, userId, p.listing_id) : null)
      : await loadShopCtx(supabase, userId, p.etsy_shop_id ?? undefined);
    if (!ctx) return;
    const check: CheckResult = await factor.check(ctx);
    if (check.passes) {
      await supabase
        .from("fix_actions")
        .update({ status: "superseded", superseded_reason: "resolved_externally" })
        .eq("id", p.id);
      summary.resolved_externally += 1;
    }
  });

  // ── Step 2: scan listings ────────────────────────────────────────────────
  const { data: listings } = await supabase
    .from("listings")
    .select("id")
    .eq("user_id", userId)
    .eq("state", "active");
  summary.scanned_listings = (listings || []).length;

  const lFactors = listingFactors();
  await runWithConcurrency(listings || [], 5, async (l) => {
    const ctx = await loadListingCtx(supabase, userId, l.id);
    if (!ctx) return;
    for (const factor of lFactors) {
      const check = await factor.check(ctx);
      if (check.passes) continue;
      const created = await generateAndInsert(
        supabase, userId, factor, ctx, check, source, l.id, null,
      );
      if (created) {
        summary.actions_generated += 1;
        summary.details.push({ listing_id: l.id, factor: factor.key, mode: created.mode });
      }
    }
  });

  // ── Step 3: scan shop-level factors ──────────────────────────────────────
  const shopCtx = await loadShopCtx(supabase, userId);
  if (shopCtx) {
    await runWithConcurrency(shopFactors(), 5, async (factor) => {
      const check = await factor.check(shopCtx);
      if (check.passes) return;
      const created = await generateAndInsert(
        supabase, userId, factor, shopCtx, check, source, null, shopCtx.etsy_shop_id,
      );
      if (created) {
        summary.actions_generated += 1;
        summary.details.push({ shop: shopCtx.etsy_shop_id, factor: factor.key, mode: created.mode });
      }
    });
  }


  // ── Step 3.5: own-data trend scan (traction decline + renewal timing) ─────
  // Uses ONLY the seller's own listing_snapshots history — no competitor or
  // marketplace scanning (see documents/etsy_compliance_trend_design.md).
  try {
    const trendActions = await scanOwnDataTrends(supabase, userId, source);
    summary.actions_generated += trendActions;
  } catch (e) {
    console.error("own-data trend scan failed", userId, e);
  }

  // ── Step 4: auto-apply opted-in safe fixes ───────────────────────────────
  const { data: prefs } = await supabase
    .from("auto_apply_preferences")
    .select("enabled, allowed_factors")
    .eq("user_id", userId)
    .maybeSingle();

  if (prefs?.enabled && Array.isArray(prefs.allowed_factors) && prefs.allowed_factors.length > 0) {
    const { data: autoCandidates } = await supabase
      .from("fix_actions")
      .select("id, factor_key, listing_id, etsy_shop_id, proposed_value")
      .eq("user_id", userId)
      .eq("status", "pending")
      .eq("mode", "auto")
      .in("factor_key", prefs.allowed_factors);

    for (const c of autoCandidates || []) {
      const factor = getFactor(c.factor_key);
      if (!factor || !factor.applyFix || !factor.safe_auto_apply) continue;
      try {
        const ctx = factor.scope === "listing"
          ? (c.listing_id ? await loadListingCtx(supabase, userId, c.listing_id) : null)
          : await loadShopCtx(supabase, userId, c.etsy_shop_id ?? undefined);
        if (!ctx) continue;
        const api = await etsyApiFor(supabase, userId);
        const r = await factor.applyFix(ctx, c.proposed_value, api);
        if (r.ok) {
          await supabase.from("fix_actions").update({
            status: "applied",
            applied_at: new Date().toISOString(),
            applied_value: r.applied_value as object | null,
            etsy_response: r.etsy_response as object | null,
          }).eq("id", c.id);
          summary.auto_applied += 1;
        } else {
          summary.failures += 1;
          if (r.demote_to_guided) {
            await supabase.from("fix_actions").update({
              mode: "guided",
              failure_reason: r.failure_reason ?? null,
            }).eq("id", c.id);
          }
        }
      } catch (e) {
        console.error("auto-apply failed", c.id, e);
        summary.failures += 1;
      }
    }
  }

  // ── Step 5: count what's left awaiting attention ─────────────────────────
  const { data: leftovers } = await supabase
    .from("fix_actions")
    .select("mode")
    .eq("user_id", userId)
    .eq("status", "pending");
  for (const l of leftovers || []) {
    if (l.mode === "auto") summary.awaiting_approval += 1;
    else if (l.mode === "guided") summary.guided += 1;
    else if (l.mode === "inform") summary.inform += 1;
  }

  // ── Roll up daily summary ────────────────────────────────────────────────
  await supabase.from("daily_action_summaries").upsert({
    user_id: userId,
    scan_date: today,
    status: "complete",
    scan_completed_at: new Date().toISOString(),
    scanned_listings: summary.scanned_listings,
    actions_generated: summary.actions_generated,
    auto_applied: summary.auto_applied,
    awaiting_approval: summary.awaiting_approval,
    guided: summary.guided,
    inform: summary.inform,
    resolved_externally: summary.resolved_externally,
    failures: summary.failures,
    details: { sample: summary.details.slice(0, 50) },
  }, { onConflict: "user_id,scan_date" });

  // ── Priority gate (Section 5): score everything, flag <=3/day notify-worthy ─
  try {
    const gate = await applyPriorityGate(supabase, userId);
    console.log(`priority gate for ${userId}:`, gate);
  } catch (e) {
    console.error("priority gate failed", userId, e);
  }

  // ── Extension C: resolve applied/tracking actions at 7+ days ────────────
  await resolveMaturedActions(supabase, userId);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // ── Extension A: fire competitor-market-scan (fire-and-forget) ───────────
  // Do not block on the scan completing — it runs in its own function context.
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/competitor-market-scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ user_id: userId, source: "nightly" }),
    });
    console.log(`competitor-market-scan invoked for ${userId}: HTTP ${r.status}`);
  } catch (e) {
    console.error(`competitor-market-scan invocation failed for ${userId}`, e);
  }

  // ── Extension B: await rebuild-shop-intelligence ─────────────────────────
  // Echo needs fresh shop_intelligence before the next query — wait for it.
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/rebuild-shop-intelligence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ user_id: userId, trigger: "nightly" }),
    });
    const result = await r.json();
    console.log(`rebuild-shop-intelligence for ${userId}:`, result);
  } catch (e) {
    console.error(`rebuild-shop-intelligence failed for ${userId}`, e);
  }

  return summary;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try { await worker(items[idx]); }
      catch (e) { console.error("worker error", e); }
    }
  });
  await Promise.all(runners);
}


async function generateAndInsert(
  supabase: ReturnType<typeof makeServiceClient>,
  userId: string,
  factor: typeof ETSY_RANKING_FACTORS[number],
  ctx: unknown,
  check: CheckResult,
  source: string,
  listing_id: string | null,
  etsy_shop_id: string | null,
): Promise<{ mode: string } | null> {
  // Dedup: skip if a pending row already exists.
  const dedup = supabase.from("fix_actions").select("id")
    .eq("user_id", userId).eq("factor_key", factor.key).eq("status", "pending");
  const existing = listing_id
    ? await dedup.eq("listing_id", listing_id).maybeSingle()
    : await dedup.is("listing_id", null).eq("etsy_shop_id", etsy_shop_id ?? "").maybeSingle();
  if (existing.data) return null;

  let proposed: unknown = null;
  let rationale = check.rationale;
  let guided_payload: unknown = null;
  let mode = factor.mode;

  if (factor.generateFix) {
    try {
      const fix = await factor.generateFix(ctx as never, aiGateway());
      if (!fix) return null;
      proposed = fix.proposed_value;
      rationale = fix.rationale || rationale;
      if (fix.guided_payload) {
        guided_payload = fix.guided_payload;
        mode = "guided";
      }
    } catch (e) {
      console.error(`generateFix failed for ${factor.key}`, e);
      mode = "inform";
    }
  }

  const { error } = await supabase.from("fix_actions").insert({
    user_id: userId,
    listing_id,
    etsy_shop_id,
    factor_key: factor.key,
    dimension: factor.dimension,
    mode,
    severity: check.severity,
    current_value: check.current_value as object | null,
    proposed_value: proposed as object | null,
    rationale,
    evidence: check.evidence ?? null,
    guided_payload: guided_payload as object | null,
    source,
    status: "pending",
  });
  if (error) {
    console.error("insert action failed", error);
    return null;
  }
  return { mode };
}

// ── Own-data trend scan (Section 4, compliance-first) ───────────────────────
// Early-warning traction decline + renewal-timing advice, computed purely from
// the seller's own listing_snapshots (cumulative views/favorites recorded
// daily). Inserts inform-mode fix_actions with the real numbers in the
// rationale, phrased as a helpful nudge, never a scorecard.
async function scanOwnDataTrends(
  supabase: ReturnType<typeof makeServiceClient>,
  userId: string,
  source: string,
): Promise<number> {
  const DAY = 86_400_000;
  const now = Date.now();
  const since = new Date(now - 29 * DAY).toISOString().slice(0, 10);

  const [{ data: listings }, { data: snaps }] = await Promise.all([
    supabase.from("listings")
      .select("id, title, ending_at, views")
      .eq("user_id", userId).eq("state", "active"),
    supabase.from("listing_snapshots")
      .select("listing_id, recorded_on, views, favorites")
      .eq("user_id", userId).gte("recorded_on", since)
      .order("recorded_on", { ascending: true }),
  ]);
  if (!listings?.length || !snaps?.length) return 0;

  // Group snapshots per listing (cumulative counters, oldest → newest).
  const byListing = new Map<string, { recorded_on: string; views: number }[]>();
  for (const s of snaps as { listing_id: string; recorded_on: string; views: number | null }[]) {
    if (s.views == null) continue;
    const arr = byListing.get(s.listing_id) ?? [];
    arr.push({ recorded_on: s.recorded_on, views: Number(s.views) });
    byListing.set(s.listing_id, arr);
  }

  let inserted = 0;
  const midDate = new Date(now - 14 * DAY).toISOString().slice(0, 10);

  // Expire stale pending trend actions so they resolve themselves:
  // renewal_timing past its window, traction_decline where traffic recovered.
  const { data: pendingTrend } = await supabase.from("fix_actions")
    .select("id, factor_key, listing_id")
    .eq("user_id", userId).eq("status", "pending")
    .in("factor_key", ["traction_decline", "renewal_timing"]);
  const listingById = new Map(
    (listings as { id: string; ending_at: string | null }[]).map((l) => [l.id, l]),
  );
  for (const p of pendingTrend ?? []) {
    const l = p.listing_id ? listingById.get(p.listing_id) : null;
    let stale = !l; // listing gone/inactive
    if (l && p.factor_key === "renewal_timing") {
      const endingAt = l.ending_at ? new Date(l.ending_at).getTime() : null;
      stale = !endingAt || endingAt <= now || endingAt - now > 30 * DAY;
    }
    if (l && p.factor_key === "traction_decline") {
      const series = byListing.get(l.id) ?? [];
      if (series.length >= 10) {
        const first = series[0];
        const last = series[series.length - 1];
        let mid = series[0];
        for (const s of series) {
          if (s.recorded_on <= midDate) mid = s;
          else break;
        }
        const priorViews = Math.max(0, mid.views - first.views);
        const recentViews = Math.max(0, last.views - mid.views);
        stale = !(priorViews >= 30 && recentViews < priorViews * 0.7); // recovered
      }
    }
    if (stale) {
      await supabase.from("fix_actions")
        .update({ status: "superseded", superseded_reason: "resolved_externally" })
        .eq("id", p.id);
    }
  }

  for (const l of listings as { id: string; title: string | null; ending_at: string | null; views: number | null }[]) {
    const series = byListing.get(l.id) ?? [];
    if (series.length < 10) continue; // not enough own history to trend honestly

    const first = series[0];
    const last = series[series.length - 1];
    // Closest snapshot to the 14-day midpoint splits the window.
    let mid = series[0];
    for (const s of series) {
      if (s.recorded_on <= midDate) mid = s;
      else break;
    }
    const priorViews = Math.max(0, mid.views - first.views);
    const recentViews = Math.max(0, last.views - mid.views);

    const declining = priorViews >= 30 && recentViews < priorViews * 0.7;
    const rising = priorViews >= 10 && recentViews > priorViews * 1.2;
    const dropPct = priorViews > 0 ? Math.round((1 - recentViews / priorViews) * 100) : 0;

    const title = (l.title ?? "this listing").slice(0, 60);

    // Traction decline early warning
    if (declining) {
      const recent = await supabase.from("fix_actions").select("id")
        .eq("user_id", userId).eq("listing_id", l.id)
        .eq("factor_key", "traction_decline")
        .gte("created_at", new Date(now - 14 * DAY).toISOString())
        .limit(1).maybeSingle();
      if (!recent.data) {
        const { error } = await supabase.from("fix_actions").insert({
          user_id: userId,
          listing_id: l.id,
          factor_key: "traction_decline",
          dimension: "content",
          mode: "inform",
          severity: dropPct >= 50 ? "high" : "medium",
          current_value: { recent_14d_views: recentViews, prior_14d_views: priorViews },
          rationale: `"${title}" caught ${recentViews} views these past two weeks, down from ${priorViews} the two weeks before. Worth a look before it shows up in sales — a title or photo refresh usually turns this around.`,
          evidence: { drop_pct: dropPct, window_days: 14, data_source: "own_listing_snapshots" },
          source,
          status: "pending",
        });
        if (!error) inserted++;
      }
    }

    // Renewal timing: renewal window opening within 30 days
    const endingAt = l.ending_at ? new Date(l.ending_at).getTime() : null;
    if (endingAt && endingAt > now && endingAt - now <= 30 * DAY) {
      const daysLeft = Math.max(1, Math.round((endingAt - now) / DAY));
      const recent = await supabase.from("fix_actions").select("id")
        .eq("user_id", userId).eq("listing_id", l.id)
        .eq("factor_key", "renewal_timing")
        .gte("created_at", new Date(now - 30 * DAY).toISOString())
        .limit(1).maybeSingle();
      if (!recent.data) {
        const rationale = rising
          ? `"${title}" renews in about ${daysLeft} day${daysLeft === 1 ? "" : "s"}, and its traffic is climbing (${recentViews} views vs ${priorViews} the previous two weeks). Renewing now keeps that momentum going.`
          : declining
          ? `"${title}" renews in about ${daysLeft} day${daysLeft === 1 ? "" : "s"}, but views have been sliding (${recentViews} vs ${priorViews}). A quick title/tag refresh before it renews gets more out of the renewal fee.`
          : `"${title}" renews in about ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Traffic's been steady — no action needed unless you want to freshen it up first.`;
        const { error } = await supabase.from("fix_actions").insert({
          user_id: userId,
          listing_id: l.id,
          factor_key: "renewal_timing",
          dimension: "content",
          mode: "inform",
          severity: declining ? "medium" : "low",
          current_value: { days_until_renewal: daysLeft, recent_14d_views: recentViews, prior_14d_views: priorViews },
          rationale,
          evidence: { trend: rising ? "rising" : declining ? "declining" : "steady", data_source: "own_listing_snapshots" },
          source,
          status: "pending",
        });
        if (!error) inserted++;
      }
    }
  }
  return inserted;
}

// ── Extension C helper ────────────────────────────────────────────────────────
// Re-checks fix_actions that have been in 'applied' or 'tracking' status for
// 7+ days. If the factor now passes → 'resolved'. If still failing → 'needs_attention'.
// score_delta is 0 because we have no score_at_application baseline stored.
async function resolveMaturedActions(
  supabase: ReturnType<typeof makeServiceClient>,
  userId: string,
): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  const { data: matured } = await supabase
    .from("fix_actions")
    .select("id, factor_key, listing_id, etsy_shop_id, applied_at, score_at_application")
    .eq("user_id", userId)
    .in("status", ["applied", "tracking"])
    .lte("applied_at", sevenDaysAgo);

  if (!matured || matured.length === 0) return;

  console.log(`resolveMaturedActions: ${matured.length} action(s) to evaluate for ${userId}`);

  for (const fa of matured) {
    try {
      const factor = getFactor(fa.factor_key);
      if (!factor) continue;

      const ctx = factor.scope === "listing"
        ? (fa.listing_id ? await loadListingCtx(supabase, userId, fa.listing_id) : null)
        : await loadShopCtx(supabase, userId, fa.etsy_shop_id ?? undefined);
      if (!ctx) continue;

      const check: CheckResult = await factor.check(ctx);
      const resolvedAt = new Date().toISOString();

      // Compute real score_delta when we have a listing baseline.
      let scoreDelta = 0;
      if (fa.listing_id) {
        const { data: lr } = await supabase
          .from("listings").select("score").eq("id", fa.listing_id).maybeSingle();
        const currentScore = typeof lr?.score === "number" ? lr.score : null;
        scoreDelta = (currentScore !== null && fa.score_at_application !== null && fa.score_at_application !== undefined)
          ? currentScore - fa.score_at_application
          : 0;
      }

      if (check.passes) {
        await supabase
          .from("fix_actions")
          .update({ status: "resolved", resolved_at: resolvedAt, score_delta: scoreDelta })
          .eq("id", fa.id);
        console.log(`fix_action ${fa.id} resolved — factor ${fa.factor_key} now passes (Δ=${scoreDelta})`);
      } else {
        await supabase
          .from("fix_actions")
          .update({
            status: "needs_attention",
            resolved_at: resolvedAt,
            score_delta: scoreDelta,
            resolution_note: "No improvement detected after 7 days",
          })
          .eq("id", fa.id);
        console.log(`fix_action ${fa.id} needs_attention — factor ${fa.factor_key} still failing (Δ=${scoreDelta})`);
      }

    } catch (e) {
      console.error(`resolveMaturedActions error for fix_action ${fa.id}`, e);
    }
  }
}
