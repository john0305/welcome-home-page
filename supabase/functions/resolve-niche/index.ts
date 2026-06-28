/**
 * resolve-niche — Niche Resolution Waterfall
 *
 * For a given listing, walks down this chain and returns the first hit:
 *
 *   1.  Listing-level cache         (listings.niche)
 *   1.5 Backfill from prior scan    (listing_market_scores.keyword_cluster)
 *   2.  Cross-user shared cache     (niche_cache by tag fingerprint)
 *   3.  Shop-level fallback         (user_niche_profiles.primary_niche)
 *   4.  Trigger an AI scan          (calls onboarding-pipeline; status='scanning')
 *   5.  Needs input                 (no tags / nothing resolvable)
 *
 * Writes the resolved niche back to listings.* so future lookups hit level 1.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildTagFingerprint } from "../_shared/niche-fingerprint.ts";

type Source =
  | "listing_cache"
  | "shared_cache"
  | "shop_niche"
  | "ai_scan"
  | "keyword_cluster_backfill"
  | "needs_input";

interface ResolveResult {
  niche: string | null;
  source: Source;
  confidence: number | null;
  status: "resolved" | "scanning" | "needs_input";
  cache_hit: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Identify the calling user from their JWT
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const listingId = body?.listing_id as string | undefined;
    const forceRescan = body?.force === true;
    if (!listingId) return json({ error: "listing_id required" }, 400);

    // Load the listing (and assert ownership)
    const { data: listing, error: listingErr } = await supabase
      .from("listings")
      .select("id, user_id, etsy_listing_id, tags, niche, niche_source, niche_confidence, niche_status, niche_tag_fingerprint")
      .eq("id", listingId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (listingErr) throw listingErr;
    if (!listing) return json({ error: "Listing not found" }, 404);

    // ── Level 1: per-listing cache ─────────────────────────────────────────
    if (!forceRescan && listing.niche && listing.niche_status === "resolved") {
      return json(<ResolveResult>{
        niche: listing.niche,
        source: (listing.niche_source as Source) ?? "listing_cache",
        confidence: listing.niche_confidence ?? null,
        status: "resolved",
        cache_hit: true,
      });
    }

    // ── Level 1.5: backfill from listing_market_scores.keyword_cluster ────
    if (!forceRescan) {
      const { data: score } = await supabase
        .from("listing_market_scores")
        .select("keyword_cluster, scored_at")
        .eq("user_id", user.id)
        .eq("listing_id", listing.etsy_listing_id)
        .order("scored_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (score?.keyword_cluster) {
        await writeListingNiche(supabase, listingId, {
          niche: score.keyword_cluster,
          source: "keyword_cluster_backfill",
          confidence: 0.7,
          fingerprint: buildTagFingerprint(listing.tags),
        });
        // Also seed the shared cache so other users benefit
        await upsertSharedCache(supabase, listing.tags, score.keyword_cluster, 0.7);
        return json(<ResolveResult>{
          niche: score.keyword_cluster,
          source: "keyword_cluster_backfill",
          confidence: 0.7,
          status: "resolved",
          cache_hit: true,
        });
      }
    }

    // ── Level 2: cross-user shared cache ──────────────────────────────────
    const fingerprint = buildTagFingerprint(listing.tags);
    if (fingerprint) {
      const { data: cached } = await supabase
        .from("niche_cache")
        .select("niche, confidence, hit_count")
        .eq("tag_fingerprint", fingerprint)
        .maybeSingle();

      if (cached?.niche) {
        // bump hit counter
        await supabase
          .from("niche_cache")
          .update({
            hit_count: (cached.hit_count ?? 1) + 1,
            last_hit_at: new Date().toISOString(),
          })
          .eq("tag_fingerprint", fingerprint);

        await writeListingNiche(supabase, listingId, {
          niche: cached.niche,
          source: "shared_cache",
          confidence: cached.confidence,
          fingerprint,
        });

        return json(<ResolveResult>{
          niche: cached.niche,
          source: "shared_cache",
          confidence: cached.confidence,
          status: "resolved",
          cache_hit: true,
        });
      }
    }

    // ── Level 3: shop-level (user_niche_profiles.primary_niche) ───────────
    const { data: profile } = await supabase
      .from("user_niche_profiles")
      .select("primary_niche, niche_confidence")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.primary_niche && profile.primary_niche !== "unknown") {
      await writeListingNiche(supabase, listingId, {
        niche: profile.primary_niche,
        source: "shop_niche",
        confidence: profile.niche_confidence ?? 0.5,
        fingerprint,
      });
      // Seed shared cache if we have a fingerprint
      if (fingerprint) {
        await upsertSharedCache(supabase, listing.tags, profile.primary_niche, profile.niche_confidence ?? 0.5);
      }
      return json(<ResolveResult>{
        niche: profile.primary_niche,
        source: "shop_niche",
        confidence: profile.niche_confidence ?? 0.5,
        status: "resolved",
        cache_hit: true,
      });
    }

    // ── Level 4: trigger AI scan (delegated to onboarding-pipeline) ──────
    if (listing.tags && listing.tags.length > 0) {
      try {
        await supabase
          .from("listings")
          .update({ niche_status: "scanning", niche_tag_fingerprint: fingerprint })
          .eq("id", listingId);

        // Fire-and-forget — pipeline writes user_niche_profiles + scores.
        // If the invoke itself throws synchronously, fall through to the
        // catch below so we flip to needs_input instead of leaving the row
        // stuck in 'scanning' forever.
        const pipelinePromise = supabase.functions.invoke("onboarding-pipeline", {
          body: { run_type: "on_demand", trigger_reason: "niche_resolve_miss" },
          headers: { Authorization: authHeader },
        });
        pipelinePromise.catch((e) => {
          console.error("[resolve-niche] pipeline invoke failed:", e, { listingId });
          // Best-effort: flip to needs_input so the UI exits its spinner
          supabase
            .from("listings")
            .update({ niche_status: "needs_input", niche_source: "needs_input" })
            .eq("id", listingId)
            .then(() => {});
        });

        return json(<ResolveResult>{
          niche: null,
          source: "ai_scan",
          confidence: null,
          status: "scanning",
          cache_hit: false,
        });
      } catch (scanErr) {
        console.error("[resolve-niche] AI scan trigger failed:", scanErr, { listingId });
        await supabase
          .from("listings")
          .update({ niche_status: "needs_input", niche_source: "needs_input" })
          .eq("id", listingId);
        return json(<ResolveResult>{
          niche: null,
          source: "needs_input",
          confidence: null,
          status: "needs_input",
          cache_hit: false,
        });
      }
    }

    // ── Level 5: needs input ──────────────────────────────────────────────
    await supabase
      .from("listings")
      .update({ niche_status: "needs_input", niche_source: "needs_input" })
      .eq("id", listingId);

    return json(<ResolveResult>{
      niche: null,
      source: "needs_input",
      confidence: null,
      status: "needs_input",
      cache_hit: false,
    });
  } catch (err) {
    console.error("[resolve-niche] error:", err, { });
    // On any unexpected error try to mark the listing so the UI exits its
    // spinner; ignore failure since we've already lost the request context.
    try {
      const body = await req.clone().json().catch(() => ({}));
      const listingId = body?.listing_id;
      if (listingId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabase
          .from("listings")
          .update({ niche_status: "needs_input", niche_source: "needs_input" })
          .eq("id", listingId);
      }
    } catch { /* noop */ }
    return json({ error: (err as Error).message ?? "Unknown error", status: "needs_input" }, 200);
  }
});

// ─── helpers ───────────────────────────────────────────────────────────────

async function writeListingNiche(
  supabase: ReturnType<typeof createClient>,
  listingId: string,
  args: { niche: string; source: Source; confidence: number | null; fingerprint: string | null },
) {
  await supabase
    .from("listings")
    .update({
      niche: args.niche,
      niche_source: args.source,
      niche_confidence: args.confidence,
      niche_detected_at: new Date().toISOString(),
      niche_status: "resolved",
      niche_tag_fingerprint: args.fingerprint,
    })
    .eq("id", listingId);
}

async function upsertSharedCache(
  supabase: ReturnType<typeof createClient>,
  tags: string[] | null,
  niche: string,
  confidence: number | null,
) {
  const fingerprint = buildTagFingerprint(tags);
  if (!fingerprint) return;
  await supabase.from("niche_cache").upsert(
    {
      tag_fingerprint: fingerprint,
      niche,
      confidence,
      source: "ai_scan",
      sample_tags: tags?.slice(0, 5) ?? [],
      last_hit_at: new Date().toISOString(),
    },
    { onConflict: "tag_fingerprint" },
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
