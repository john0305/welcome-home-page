// Recommends concrete improvements for a listing using its semantic peers.
//
// Approach: find the caller's most similar listings via pgvector, identify
// which of those peers actually performed best (from performance_attribution),
// then diff their tags / materials / title patterns against the current
// listing and let Gemini turn that into prioritized, listing-specific
// recommendations grounded only in observed peer patterns.
//
// POST body: { listing_id: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await supabaseAuth.auth.getUser();
  if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
  const userId = userRes.user.id;

  let body: { listing_id?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!body.listing_id) return json({ error: "listing_id required" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 0. Cache check — peer recs are stable for ~7 days. Skip the AI round-trip
  //    when a fresh cache exists (unless caller passes force:true).
  if (!body.force) {
    const { data: cached } = await supabase
      .from("peer_rec_cache")
      .select("recommendations, peer_count, top_peer_count, tag_gaps, material_gaps, generated_at, expires_at")
      .eq("listing_id", body.listing_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (cached && new Date(cached.expires_at as string).getTime() > Date.now()) {
      return json({
        listing_id: body.listing_id,
        peer_count: cached.peer_count,
        top_peer_count: cached.top_peer_count,
        tag_gaps: cached.tag_gaps ?? [],
        material_gaps: cached.material_gaps ?? [],
        recommendations: cached.recommendations ?? [],
        cached: true,
        generated_at: cached.generated_at,
        expires_at: cached.expires_at,
      });
    }
  }

  // 1. Current listing
  const { data: current, error: curErr } = await supabase.from("listings")
    .select("id, user_id, title, description, tags, materials, score, views, favorites")
    .eq("id", body.listing_id).eq("user_id", userId).maybeSingle();
  if (curErr || !current) return json({ error: "Listing not found" }, 404);

  // 2. Semantic peers via RPC (RLS-scoped to caller's listings)
  const { data: peerIdsRaw, error: simErr } = await supabaseAuth.rpc(
    "match_similar_listings", { _listing_id: body.listing_id, _match_count: 8 },
  );
  if (simErr) return json({ error: simErr.message }, 500);

  const peerIds: Array<{ listing_id: string; similarity: number }> = peerIdsRaw ?? [];
  if (peerIds.length === 0) {
    return json({
      recommendations: [],
      message: "Not enough embedded peers yet. Run embed-listing with backfill:true first.",
      peer_count: 0,
    });
  }

  // 3. Hydrate peer listings + their attribution lift
  const { data: peers } = await supabase.from("listings")
    .select("id, title, tags, materials, score, views, favorites")
    .in("id", peerIds.map((p) => p.listing_id));

  const { data: attribution } = await supabase.from("performance_attribution")
    .select("listing_id, views_pct, favorites_pct, sales_pct, window_days")
    .in("listing_id", peerIds.map((p) => p.listing_id))
    .eq("window_days", 30)
    .eq("is_sufficient_data", true)
    .eq("is_anomaly", false);

  const liftByListing = new Map<string, { views_pct: number; sales_pct: number }>();
  for (const a of attribution ?? []) {
    liftByListing.set(a.listing_id, {
      views_pct: Number(a.views_pct ?? 0),
      sales_pct: Number(a.sales_pct ?? 0),
    });
  }

  // 4. Identify "top performers" among peers (top half by views or sales lift,
  //    or by score if attribution missing)
  const enriched = (peers ?? []).map((p) => {
    const sim = peerIds.find((x) => x.listing_id === p.id)?.similarity ?? 0;
    const lift = liftByListing.get(p.id);
    return { ...p, similarity: sim, lift };
  }).sort((a, b) => {
    const aScore = (a.lift?.views_pct ?? 0) + (a.lift?.sales_pct ?? 0) * 2 + (a.score ?? 0) * 0.5;
    const bScore = (b.lift?.views_pct ?? 0) + (b.lift?.sales_pct ?? 0) * 2 + (b.score ?? 0) * 0.5;
    return bScore - aScore;
  });

  const top = enriched.slice(0, Math.max(3, Math.ceil(enriched.length / 2)));

  // 5. Compute tag/material patterns: which appear in top peers but NOT in current?
  const currentTags = new Set((current.tags ?? []).map((t: string) => t.toLowerCase()));
  const currentMats = new Set((current.materials ?? []).map((m: string) => m.toLowerCase()));
  const tagCounts = new Map<string, number>();
  const matCounts = new Map<string, number>();
  for (const p of top) {
    for (const t of (p.tags ?? [])) {
      const k = t.toLowerCase();
      if (!currentTags.has(k)) tagCounts.set(k, (tagCounts.get(k) ?? 0) + 1);
    }
    for (const m of (p.materials ?? [])) {
      const k = m.toLowerCase();
      if (!currentMats.has(k)) matCounts.set(k, (matCounts.get(k) ?? 0) + 1);
    }
  }
  const tagGaps = [...tagCounts.entries()]
    .filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])
    .slice(0, 10).map(([tag, count]) => ({ tag, peers_using: count, of_top: top.length }));
  const materialGaps = [...matCounts.entries()]
    .filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])
    .slice(0, 5).map(([material, count]) => ({ material, peers_using: count, of_top: top.length }));

  // 6. Have the AI turn these observations into ranked, listing-specific recs
  const peerSummary = top.map((p, i) => {
    const liftStr = p.lift
      ? ` (30d: ${fmt(p.lift.views_pct)} views, ${fmt(p.lift.sales_pct)} sales)`
      : "";
    return `${i + 1}. "${p.title}" — score ${p.score ?? "?"} / ${p.views ?? 0} views${liftStr}\n   tags: ${(p.tags ?? []).join(", ")}\n   materials: ${(p.materials ?? []).join(", ")}`;
  }).join("\n\n");

  const sys = `You are a warm, encouraging friend helping an Etsy seller spot patterns in their own shop. The seller is the lead — you're the supportive co-pilot pointing out what's working and where small tweaks could help. Tone: friendly, specific, never preachy. Frame every recommendation as an opportunity, not a failure.
You ONLY use the patterns observed in their own top-performing peer listings. Never invent facts.
Never claim materials/dimensions/attributes that aren't already in the seller's listing.
Output 3–6 recommendations, ordered most-impactful first. Each must:
- State the concrete change as a friendly nudge (not a command)
- Cite the peer evidence like a friend showing them a pattern ("3 of your 5 best-performing similar listings use X — worth a try here")
- Estimate impact category: "high" | "medium" | "low"
- Use category "tags" | "title" | "description" | "materials" | "photos" | "pricing"
If there is no strong peer pattern, return fewer recommendations rather than padding.`;

  const userPrompt = `CURRENT LISTING:
Title: ${current.title}
Tags: ${(current.tags ?? []).join(", ")}
Materials: ${(current.materials ?? []).join(", ")}
Score: ${current.score ?? "?"} / Views: ${current.views ?? 0} / Favorites: ${current.favorites ?? 0}

TOP-PERFORMING SEMANTIC PEERS (from this seller's own shop):
${peerSummary}

OBSERVED GAPS (tags/materials in ≥2 top peers but missing from current):
Tag gaps: ${JSON.stringify(tagGaps)}
Material gaps: ${JSON.stringify(materialGaps)}`;

  const aiResp = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "emit_recommendations",
          description: "Return prioritized improvement recommendations",
          parameters: {
            type: "object",
            properties: {
              recommendations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: { type: "string", enum: ["tags", "title", "description", "materials", "photos", "pricing"] },
                    impact: { type: "string", enum: ["high", "medium", "low"] },
                    change: { type: "string" },
                    evidence: { type: "string" },
                  },
                  required: ["category", "impact", "change", "evidence"],
                  additionalProperties: false,
                },
              },
            },
            required: ["recommendations"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "emit_recommendations" } },
    }),
  });

  if (!aiResp.ok) {
    const t = await aiResp.text();
    if (aiResp.status === 429) return json({ error: "Rate limited, try again shortly." }, 429);
    if (aiResp.status === 402) return json({ error: "AI credits exhausted." }, 402);
    return json({ error: `Gateway ${aiResp.status}: ${t}` }, 500);
  }
  const aiJson = await aiResp.json();
  const args = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  const parsed = args ? JSON.parse(args) : { recommendations: [] };

  const recommendations = parsed.recommendations ?? [];

  // Upsert into the 7-day peer rec cache so subsequent calls (and the Optimize
  // pre-flight) skip the AI round-trip.
  try {
    await supabase.from("peer_rec_cache").upsert({
      listing_id: current.id,
      user_id: userId,
      recommendations,
      peer_count: enriched.length,
      top_peer_count: top.length,
      tag_gaps: tagGaps,
      material_gaps: materialGaps,
      generated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "listing_id" });
  } catch (e) {
    console.warn("peer_rec_cache upsert failed:", e);
  }

  return json({
    listing_id: current.id,
    peer_count: enriched.length,
    top_peer_count: top.length,
    tag_gaps: tagGaps,
    material_gaps: materialGaps,
    recommendations,
    cached: false,
  });
});

function fmt(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n)}%`;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
