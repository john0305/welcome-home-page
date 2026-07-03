// Photo intelligence: per-photo keep/edit/retake calls, reorder recommendation,
// niche photo-count benchmarking, and metadata cross-checks — branched by
// listing/shop type (a digital listing gets preview-quality guidance, not
// lighting advice; made-to-order gets variation-coverage guidance, etc.).
//
// POST { listing_id }
// Consumes 1 optimization credit per analysis. Stores result in photo_analyses.
// AI calls go through the Lovable AI Gateway like the rest of the platform
// (previously this function alone called the Anthropic API directly).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { classifyListing, type ListingKind, type TypedListing } from "../_shared/shop-type.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Type-specific grading lens injected into the prompt (Section 3 × Section 9).
const KIND_GUIDANCE: Record<ListingKind, string> = {
  digital: `This is a DIGITAL DOWNLOAD listing. The "photos" are preview/mockup images, not product photography.
Judge: preview readability at thumbnail size, whether the previews show what's included (page counts, sizes, formats), mockup realism, text legibility, and watermark tastefulness.
NEVER suggest retaking a photo with better lighting/staging — there is no physical item. "retake" here means "recreate this preview/mockup". Missing shots should be things like "a preview showing all included pages" or "a size/format guide graphic".`,
  made_to_order: `This is a MADE-TO-ORDER listing — the item photographed is a sample; each order is produced fresh.
Judge: whether photos show the range of what buyers can order (variations, colors, sizes), consistency between sample photos, and process/materials shots that build trust.
Do not treat "only one item shown" as a flaw if variations are covered elsewhere; do suggest showing popular variations. Retake advice is fine (there is a physical sample), but frame it around the sample.`,
  personalized: `This is a PERSONALIZED/CUSTOM listing — buyers order their own version.
Judge: whether photos show clear personalization examples (names/dates/photos on the product), a range of what's possible, and legibility of personalized elements.
Strongly recommend a photo showing the personalization interface or a before/after example if absent.`,
  vintage: `This is a VINTAGE/PRE-LOVED listing. Condition honesty sells.
Judge: whether flaws/wear are clearly documented (close-ups of any damage), scale reference, maker's marks/hallmarks/labels close-ups, and era-appropriate styling.
A "flaw close-up" photo is a POSITIVE for vintage, not a defect. Missing shots should prioritize condition documentation and marks.`,
  supplies: `This is a CRAFT SUPPLIES listing. Buyers need accuracy, not lifestyle glamour.
Judge: color accuracy cues, quantity/scale reference (what exactly do you get), texture close-ups, and packaging/measurement clarity.
Lifestyle shots matter less; a clear "what's included" flat lay matters more.`,
  one_of_a_kind: `This is a ONE-OF-A-KIND piece — when it sells, it's gone.
Judge: full coverage of this exact item (all angles, details, flaws if any, scale), since the buyer can only ever see these photos of this piece.`,
  inventory: `This is a restockable physical product.
Judge: standard product photography — lighting, background, focus, lifestyle/in-use balance, scale reference, angle variety, cover-photo thumbnail appeal.`,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await supabaseAuth.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    if (!LOVABLE_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => null);
    const listing_id = body?.listing_id;
    if (!listing_id || typeof listing_id !== "string") return json({ error: "listing_id required" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Reserve a credit (same gating as rewrites/optimize).
    const { data: gate, error: gateErr } = await supabase.rpc("consume_optimization", {
      _user_id: userId,
      _free_limit: 5,
    });
    if (gateErr) return json({ error: gateErr.message }, 500);
    if (!gate?.allowed) {
      return json({ error: "limit_reached", upgrade_required: true, used: gate?.used, limit: gate?.limit }, 402);
    }

    const { data: listing } = await supabase
      .from("listings")
      .select("id, user_id, title, description, tags, materials, image_urls, score_breakdown, listing_type, when_made, who_made, is_supply, is_personalizable, quantity, state, niche")
      .eq("id", listing_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!listing) return json({ error: "Listing not found" }, 404);

    const photoUrls = (Array.isArray(listing.image_urls) ? listing.image_urls : []).slice(0, 10) as string[];
    if (photoUrls.length === 0) {
      return json({ error: "This listing has no photos to analyze." }, 400);
    }

    // ── Type branch (Section 9): listing-level kind, seller override wins ──
    let kind: ListingKind = classifyListing(listing as TypedListing);
    const { data: profile } = await supabase
      .from("user_niche_profiles")
      .select("shop_type, shop_type_override")
      .eq("user_id", userId)
      .maybeSingle();
    const overrideType = profile?.shop_type_override as ListingKind | null;
    // A shop-level override only reclassifies listings whose own fields are
    // ambiguous (heuristic kinds); deterministic listing fields stay authoritative.
    const deterministic = listing.listing_type === "download" || listing.is_supply === true ||
      listing.when_made != null;
    if (overrideType && !deterministic) kind = overrideType;

    // ── Benchmark: photo count vs niche peers (aggregate, own pipeline data) ──
    let benchmark: { peer_median_photos: number; peer_top_quartile_photos: number; sample_size: number } | null = null;
    const { data: peers } = await supabase
      .from("competitor_snapshots")
      .select("photo_count")
      .eq("user_id", userId)
      .not("photo_count", "is", null)
      .order("captured_at", { ascending: false })
      .limit(200);
    const counts = ((peers ?? []) as { photo_count: number | null }[])
      .map((p) => Number(p.photo_count))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    if (counts.length >= 8) {
      benchmark = {
        peer_median_photos: counts[Math.floor(counts.length / 2)],
        peer_top_quartile_photos: counts[Math.floor(counts.length * 0.75)],
        sample_size: counts.length,
      };
    }

    const photoCount = photoUrls.length;
    const tagsStr = JSON.stringify(Array.isArray(listing.tags) ? listing.tags : []);
    const matsStr = JSON.stringify(Array.isArray(listing.materials) ? listing.materials : []);
    const descStr = String(listing.description ?? "").slice(0, 1200);

    const benchmarkStr = benchmark
      ? `\nNICHE BENCHMARK (aggregate of ${benchmark.sample_size} listings in this seller's niche — never name specific competitors): median photo count ${benchmark.peer_median_photos}, top quartile ${benchmark.peer_top_quartile_photos}. This listing has ${photoCount}. If below median, say so plainly as an aggregate pattern.`
      : "";

    const promptText = `You are an Etsy product-photography expert AND a listing-accuracy auditor, writing as a warm, encouraging friend — specific, honest, never scolding. Analyze these ${photoCount} photos.

${KIND_GUIDANCE[kind]}

LISTING METADATA (verify the photos actually support this — flag any mismatch):
Title: ${listing.title}
Description: ${descStr}
Tags: ${tagsStr}
Materials: ${matsStr}
${benchmarkStr}

For EVERY photo decide ONE action:
- "keep": genuinely working — say what it does well
- "edit": the shot is fine but fixable in software (crop, brightness, white balance, background cleanup) — give exact edit_guidance
- "retake": the underlying shot can't be saved by editing (blur, hopeless lighting, clutter, wrong angle)${kind === "digital" ? " — for this digital listing, 'retake' means recreate the preview/mockup" : ""}
Every action needs action_reason in plain language a non-photographer understands (the WHY, not just the what).

Also produce recommended_order: the photo indexes (1-based) in the order they should appear, best conversion-driver first. Only reorder when it genuinely helps; explain the single most important swap in reorder_reason (e.g. "Photo 4 shows the whole product clearly — shoppers scrolling search results should see it first, so swap it with photo 1"). If the current order is already right, return the current order and say so.`;

    const userContent: unknown[] = [
      { type: "text", text: promptText },
      ...photoUrls.map((url) => ({ type: "image_url", image_url: { url } })),
    ];

    const aiBody = {
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: userContent }],
      tools: [{
        type: "function",
        function: {
          name: "submit_photo_analysis",
          description: "Submit the structured photo analysis",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              overall_score: { type: "number" },
              photos: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    index: { type: "number" },
                    score: { type: "number" },
                    grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
                    action: { type: "string", enum: ["keep", "edit", "retake"] },
                    action_reason: { type: "string" },
                    edit_guidance: { type: "string" },
                    issues: { type: "array", items: { type: "string" } },
                    suggestions: { type: "array", items: { type: "string" } },
                  },
                  required: ["index", "score", "grade", "action", "action_reason", "issues", "suggestions"],
                },
              },
              recommended_order: { type: "array", items: { type: "number" } },
              reorder_reason: { type: "string" },
              missing_shots: { type: "array", items: { type: "string" } },
              metadata_mismatches: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    field: { type: "string", enum: ["title", "description", "tags", "materials"] },
                    claim: { type: "string" },
                    issue: { type: "string" },
                  },
                  required: ["field", "claim", "issue"],
                },
              },
              metadata_gaps: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    field: { type: "string", enum: ["title", "description", "tags", "materials"] },
                    visible_in_photos: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["field", "visible_in_photos", "suggestion"],
                },
              },
              top_recommendations: { type: "array", items: { type: "string" }, maxItems: 3 },
              cover_photo_feedback: { type: "string" },
            },
            required: ["overall_score", "photos", "recommended_order", "reorder_reason", "missing_shots", "metadata_mismatches", "metadata_gaps", "top_recommendations", "cover_photo_feedback"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "submit_photo_analysis" } },
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(aiBody),
    });
    if (aiRes.status === 429) return json({ error: "Rate limited, please try again shortly." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted.", upgrade_required: true }, 402);
    if (!aiRes.ok) {
      console.error("AI gateway error", aiRes.status, (await aiRes.text()).slice(0, 400));
      return json({ error: `Photo analysis failed (${aiRes.status})` }, 502);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let analysis: Record<string, unknown> = {};
    try {
      analysis = JSON.parse(toolCall?.function?.arguments ?? "{}");
    } catch {
      console.error("Failed to parse photo analysis tool call");
      return json({ error: "AI returned an invalid response. Please try again." }, 502);
    }
    if (!Array.isArray(analysis.photos) || analysis.photos.length === 0) {
      return json({ error: "AI returned an empty analysis. Please try again." }, 502);
    }

    // Attach context the UI needs alongside the AI output.
    analysis.photo_count = photoCount;
    analysis.max_photos = 10;
    analysis.listing_kind = kind;
    if (benchmark) analysis.benchmark = benchmark;

    const overall = Number(analysis.overall_score ?? 0);

    const { data: row, error: insertErr } = await supabase
      .from("photo_analyses")
      .insert({
        listing_id,
        user_id: userId,
        overall_score: Math.round(overall),
        analysis_json: analysis,
      })
      .select("id, created_at")
      .single();
    if (insertErr) {
      console.error("photo_analyses insert failed", insertErr);
      return json({ error: insertErr.message }, 500);
    }

    return json({ id: row.id, created_at: row.created_at, analysis });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
