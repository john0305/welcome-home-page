// Analyze listing photos with Claude vision.
// POST { listing_id }
// Consumes 1 optimization credit per analysis. Stores result in photo_analyses.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VISION_MODEL = "claude-sonnet-4-5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");

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

    if (!ANTHROPIC_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

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
      .select("id, user_id, title, description, tags, materials, image_urls, score_breakdown")
      .eq("id", listing_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!listing) return json({ error: "Listing not found" }, 404);

    const photoUrls = (Array.isArray(listing.image_urls) ? listing.image_urls : []).slice(0, 10) as string[];
    if (photoUrls.length === 0) {
      return json({ error: "This listing has no photos to analyze." }, 400);
    }

    const photoCount = photoUrls.length;
    const tagsStr = JSON.stringify(Array.isArray(listing.tags) ? listing.tags : []);
    const matsStr = JSON.stringify(Array.isArray(listing.materials) ? listing.materials : []);
    const descStr = String(listing.description ?? "").slice(0, 1200);

    const promptText = `You are an Etsy product photography expert AND a listing-accuracy auditor.
Analyze these ${photoCount} photos for the listing.

LISTING METADATA (verify the photos actually support this — flag any mismatch):
Title: ${listing.title}
Description: ${descStr}
Tags: ${tagsStr}
Materials: ${matsStr}

Grade each photo 0-100 and return ONLY this JSON, no other text:
{
  "overall_score": number,
  "photo_count": number,
  "max_photos": 10,
  "photos": [
    {
      "index": 1,
      "score": number,
      "grade": "A"|"B"|"C"|"D"|"F",
      "issues": [string],
      "suggestions": [string]
    }
  ],
  "missing_shots": [string],
  "metadata_mismatches": [
    { "field": "title"|"description"|"tags"|"materials", "claim": string, "issue": string }
  ],
  "metadata_gaps": [
    { "field": "title"|"description"|"tags"|"materials", "visible_in_photos": string, "suggestion": string }
  ],
  "top_recommendations": [string, string, string],
  "cover_photo_feedback": string
}

Grade on: lighting, background, focus/clarity, lifestyle vs product balance, cover photo appeal, variety of angles, size reference, text overlay readability.

metadata_mismatches: things the listing CLAIMS but the photos don't support (e.g. "title says 'set of 3' but only 1 visible", "materials lists 'sterling silver' but photo shows brass tone").

metadata_gaps: things VISIBLE in the photos that the listing text is missing — opportunities to improve title/description/tags/materials (e.g. "photos show gift box but description doesn't mention it", "visible engraving not in tags").

missing_shots: photo types that would help (e.g. "Close-up of texture", "Size comparison", "Packaging", "Lifestyle in use").

top_recommendations: the 3 highest-impact changes the seller should make first — these can mix photo improvements AND metadata fixes.`;


    const content: unknown[] = photoUrls.map((url) => ({
      type: "image",
      source: { type: "url", url },
    }));
    content.push({ type: "text", text: promptText });

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 2500,
        messages: [{ role: "user", content }],
      }),
    });

    if (!claudeRes.ok) {
      const txt = await claudeRes.text();
      console.error("Claude vision error", claudeRes.status, txt.slice(0, 400));
      return json({ error: `Photo analysis failed (${claudeRes.status})` }, 502);
    }

    const claudeJson = await claudeRes.json();
    const rawText = String(claudeJson?.content?.[0]?.text ?? "")
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(rawText);
    } catch {
      console.error("Failed to parse vision JSON", rawText.slice(0, 400));
      return json({ error: "AI returned an invalid response. Please try again." }, 502);
    }

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
