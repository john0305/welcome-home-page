/**
 * onboarding-pipeline
 *
 * The immediate-trigger pipeline fired when a user connects their Etsy shop.
 * Also callable manually (Refresh button, admin trigger).
 *
 * Flow:
 *   1. Auth + validate
 *   2. Log run start in pipeline_run_log
 *   3. Classify user niche
 *   4. For each keyword cluster: check cache → Etsy search → store cache
 *   5. For each active listing: calculate market score + missing tags
 *   6. Write listing_market_scores rows
 *   7. Create fix_actions for top-impact gaps (missing tags, title length)
 *   8. Mark user as initialized, update stores.market_context_score
 *   9. Log run complete
 *
 * Input (POST body):
 *   { user_id?, run_type?, trigger_reason?, force? }
 *   When called by a user, user_id is inferred from JWT.
 *   When called by service role, user_id must be in body.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { authedUserId, corsHeaders, json, makeServiceClient } from "../_shared/action-engine.ts";
import { classifyUserNiche, saveNicheProfile } from "../_shared/niche-classifier.ts";
import {
  buildMarketInsights,
  detectPhotoChanges,
  getOrRefreshCache,
  scoreListingVsMarket,
} from "../_shared/market-score.ts";
import { searchEtsy } from "../_shared/etsy-quota.ts";

const MAX_LISTINGS = 50; // cap per run to avoid quota burn during onboarding

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = makeServiceClient();
  let runId: string | null = null;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { run_type = "onboarding", trigger_reason = "shop_connect", force = false, user_id: bodyUserId } = body;

    // Resolve userId — service calls provide it in body, user calls from JWT
    const authHeader = req.headers.get("Authorization") || "";
    let userId: string | null = null;
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceCall = !!token && !!serviceKey && token === serviceKey;

    if (isServiceCall && bodyUserId) {
      userId = String(bodyUserId);
    } else {
      userId = await authedUserId(req);
    }
    if (!userId) return json({ error: "Unauthorized" }, 401);

    // Skip if already initialized (unless forced)
    if (!force) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("market_intelligence_initialized")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.market_intelligence_initialized) {
        return json({ ok: true, skipped: true, reason: "already_initialized" });
      }
    }

    // Log run start
    const { data: runRow } = await supabase
      .from("pipeline_run_log")
      .insert({
        user_id: userId,
        run_type: String(run_type),
        trigger_reason: String(trigger_reason),
        status: "running",
      })
      .select("id")
      .single();
    runId = runRow?.id ?? null;

    // ── Step 3: classify niche ───────────────────────────────────────────────
    const nicheProfile = await classifyUserNiche(supabase, userId);
    await saveNicheProfile(supabase, userId, nicheProfile);

    await supabase
      .from("user_profiles")
      .update({ niche_detected: nicheProfile.primary_niche !== "unknown" })
      .eq("id", userId);

    if (nicheProfile.primary_niche === "unknown" || nicheProfile.keyword_clusters.length === 0) {
      await finalizeRun(supabase, runId, userId, {
        status: "complete",
        listings_processed: 0,
        api_calls_made: 0,
        cache_hits: 0,
        note: "niche_unknown",
      });
      return json({ ok: true, niche: "unknown", message: "Niche could not be detected. Admin can assign manually." });
    }

    // ── Step 4: get competitor data for each keyword cluster ─────────────────
    let totalApiCalls = 0;
    let totalCacheHits = 0;
    const clusterInsights = new Map<string, ReturnType<typeof buildMarketInsights>>();
    const clusterCompCounts: Record<string, number> = {};

    for (const cluster of nicheProfile.keyword_clusters) {
      const { listings, from_cache } = await getOrRefreshCache(
        supabase,
        cluster,
        userId,
        async () => {
          const result = await searchEtsy(supabase, cluster, {
            limit: 100,
            user_id: userId,
            priority: 3,
          });
          totalApiCalls++;
          if (result.error) {
            console.warn(`[onboarding-pipeline] searchEtsy error for "${cluster}":`, result.error);
          }
          return result.listings;
        },
      );

      if (from_cache) totalCacheHits++;
      clusterCompCounts[cluster] = listings.length;
      clusterInsights.set(cluster, buildMarketInsights(listings));
    }

    // Pick the first cluster that actually returned competitor data.
    // (Previously we always used the primary, which produced 0/100 scores when
    // the primary cluster's Etsy search failed even if other clusters had data.)
    const primaryCluster =
      nicheProfile.keyword_clusters.find((c) => (clusterCompCounts[c] ?? 0) > 0)
        ?? nicheProfile.keyword_clusters[0];
    const baseInsights = clusterInsights.get(primaryCluster) ?? buildMarketInsights([]);

    // ── Multi-category tag-gap merge ─────────────────────────────────────────
    // Union top_tags_with_freq across every scanned cluster so the per-listing
    // gap analysis surfaces missing tags from all of the shop's categories,
    // not just whichever cluster happened to be "primary".
    const mergedFreq = new Map<string, number>();
    for (const ins of clusterInsights.values()) {
      for (const t of ins.top_tags_with_freq ?? []) {
        const prev = mergedFreq.get(t.tag) ?? 0;
        if (t.pct > prev) mergedFreq.set(t.tag, t.pct);
      }
    }
    const mergedRanked = [...mergedFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
    const primaryInsights = {
      ...baseInsights,
      top_tags: mergedRanked.map(([tag]) => tag),
      top_tags_with_freq: mergedRanked.map(([tag, pct]) => ({ tag, pct })),
    };
    const noCompData = baseInsights.competitor_count === 0;

    if (noCompData) {
      console.warn(
        `[onboarding-pipeline] No competitor data available for user ${userId}. ` +
        `Cluster counts: ${JSON.stringify(clusterCompCounts)}. ` +
        `Etsy API likely failing — check api_quota_log.`,
      );
    }


    // ── Step 5-6: score each active listing ──────────────────────────────────
    const { data: listings } = await supabase
      .from("listings")
      .select("id, etsy_listing_id, title, tags, price, photo_count, image_urls, favorites, description, state")
      .eq("user_id", userId)
      .eq("state", "active")
      .limit(MAX_LISTINGS);

    const activeListings = listings ?? [];
    const scoreRows = [];
    const fixActionInserts = [];

    for (const listing of activeListings) {
      const userListing = {
        etsy_listing_id: String(listing.etsy_listing_id),
        title: listing.title ?? "",
        tags: listing.tags ?? [],
        price: Number(listing.price ?? 0),
        photo_count: listing.photo_count ?? (listing.image_urls ?? []).length,
        image_urls: listing.image_urls ?? [],
        favorites: listing.favorites ?? 0,
        description: listing.description ?? "",
      };

      const scored = scoreListingVsMarket(userListing, primaryInsights);

      scoreRows.push({
        user_id: userId,
        listing_id: String(listing.etsy_listing_id),
        keyword_cluster: primaryCluster,
        market_score: scored.market_score,
        title_score: scored.title_score,
        tag_score: scored.tag_score,
        price_score: scored.price_score,
        photo_score: scored.photo_score,
        favorites_score: scored.favorites_score,
        description_score: scored.description_score,
        market_rank_estimate: scored.market_rank_estimate,
        missing_tags: scored.missing_tags,
        missing_tags_detail: scored.missing_tags_detail,
        missing_tag_count: scored.missing_tag_count,
        niche_avg_price: scored.niche_avg_price,
        favorites_count: userListing.favorites,
        photo_count: userListing.photo_count,
        image_urls: userListing.image_urls,
        primary_image_url: userListing.image_urls[0] ?? null,
      });


      // ── Step 7: create fix_actions for high-impact gaps ───────────────────

      // Skip generating gap-based fix actions when we have no comp data —
      // they'd be misleading (every listing would be flagged for nothing).
      if (noCompData) continue;

      // Tag gap action (all tiers)
      if (scored.missing_tags.length >= 2) {
        const slotsAvailable = 13 - (userListing.tags?.length ?? 0);
        const tagsToAdd = scored.missing_tags.slice(0, Math.min(scored.missing_tags.length, slotsAvailable));
        if (tagsToAdd.length > 0) {
          fixActionInserts.push({
            user_id: userId,
            listing_id: listing.id,
            factor_key: "market_tag_gap",
            dimension: "tags",
            mode: "guided",
            status: "pending",
            severity: (scored.missing_tag_count ?? 0) >= 5 ? "high" : "medium",
            current_value: userListing.tags,
            proposed_value: [...(userListing.tags ?? []), ...tagsToAdd],
            rationale: `Your top competitors use ${scored.missing_tag_count} tag${scored.missing_tag_count !== 1 ? "s" : ""} you don't. Adding them could improve your search visibility.`,
            evidence: {
              missing_tags: scored.missing_tags,
              competitor_count: primaryInsights.competitor_count,
              tag_score: scored.tag_score,
            },
            source: "onboarding_scan",
          });
        }
      }

      // Title length action (all tiers — they can see the issue, fix is pro-gated in UI)
      if (scored.title_score !== null && scored.title_score < 70) {
        const titleLen = userListing.title.length;
        const targetLen = primaryInsights.avg_title_length;
        if (targetLen > titleLen) {
          fixActionInserts.push({
            user_id: userId,
            listing_id: listing.id,
            factor_key: "market_title_length",
            dimension: "content",
            mode: "guided",
            status: "pending",
            severity: scored.title_score < 50 ? "high" : "medium",
            current_value: userListing.title,
            proposed_value: null, // generated on demand when user clicks Fix
            rationale: `Your title is ${titleLen} characters. Competitors average ${targetLen} characters. A longer, keyword-rich title improves search placement.`,
            evidence: {
              current_length: titleLen,
              avg_competitor_length: targetLen,
              title_score: scored.title_score,
            },
            source: "onboarding_scan",
          });
        }
      }
    }


    // Batch-write scores
    if (scoreRows.length > 0) {
      await supabase.from("listing_market_scores").insert(scoreRows);
    }

    // Batch-write fix actions (ignore conflicts — dedup index handles it)
    for (const action of fixActionInserts) {
      try {
        await supabase.from("fix_actions").insert(action);
      } catch (_e) {
        // ignore conflicts
      }
    }

    // ── Step 8: update user and store ────────────────────────────────────────
    const scoredRows = scoreRows.filter((r) => r.market_score !== null);
    const avgMarketScore = scoredRows.length > 0
      ? Math.round(scoredRows.reduce((s, r) => s + (r.market_score ?? 0), 0) / scoredRows.length)
      : null;

    await supabase.from("user_profiles").update({
      market_intelligence_initialized: true,
      last_pipeline_run: new Date().toISOString(),
      niche_detected: true,
    }).eq("id", userId);

    if (avgMarketScore !== null) {
      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (store) {
        await supabase.from("stores").update({
          market_context_score: avgMarketScore,
        }).eq("id", store.id);
      }
    }

    // ── Step 9: finalize run ─────────────────────────────────────────────────
    await finalizeRun(supabase, runId, userId, {
      status: noCompData ? "complete_no_comps" : "complete",
      listings_processed: activeListings.length,
      api_calls_made: totalApiCalls,
      cache_hits: totalCacheHits,
      note: noCompData
        ? `No competitor data returned for any cluster: ${JSON.stringify(clusterCompCounts)}`
        : undefined,
    });

    // Fire-and-forget initial sanity check scan — new shop, scan everything.
    try {
      const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sanity-check-scan`;
      fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ scope: "all", user_id: userId }),
      }).catch((e) => console.error("sanity-check-scan dispatch", e));
    } catch (e) { console.error("sanity-check-scan invoke", e); }


    return json({
      ok: true,
      niche: nicheProfile.primary_niche,
      niche_source: nicheProfile.niche_source,
      listings_processed: activeListings.length,
      avg_market_score: avgMarketScore,
      api_calls: totalApiCalls,
      cache_hits: totalCacheHits,
      cluster_comp_counts: clusterCompCounts,
      no_comp_data: noCompData,
      fix_actions_created: fixActionInserts.length,
    });


  } catch (err) {
    console.error("[onboarding-pipeline] error:", err);
    if (runId) {
      await makeServiceClient().from("pipeline_run_log").update({
        status: "failed",
        errors: [{ message: String(err) }],
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }
    return json({ error: String(err) }, 500);
  }
});

async function finalizeRun(
  supabase: ReturnType<typeof makeServiceClient>,
  runId: string | null,
  _userId: string,
  data: {
    status: string;
    listings_processed: number;
    api_calls_made: number;
    cache_hits: number;
    note?: string;
  },
) {
  if (!runId) return;
  await supabase.from("pipeline_run_log").update({
    status: data.status,
    listings_processed: data.listings_processed,
    api_calls_made: data.api_calls_made,
    cache_hits: data.cache_hits,
    errors: data.note ? [{ note: data.note }] : null,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);
}
