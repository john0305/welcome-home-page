// Generate a fully optimized Etsy listing from a draft using Claude.
// Required env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { findPlaceholders, NO_PLACEHOLDER_PROMPT_RULES } from "../_shared/placeholders.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userRes } = await supabaseAuth.auth.getUser(token);
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    if (!ANTHROPIC_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Invalid body" }, 400);

    const title = String(body.title ?? "").slice(0, 500);
    const description = String(body.description ?? "").slice(0, 5000);
    const tags = Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t: unknown) => String(t).slice(0, 40)) : [];
    const materials = Array.isArray(body.materials) ? body.materials.slice(0, 20).map((m: unknown) => String(m).slice(0, 60)) : [];
    const category = String(body.category ?? "").slice(0, 120);
    const price = Number(body.price ?? 0);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: gate, error: gateErr } = await supabase.rpc("consume_optimization", {
      _user_id: userId,
      _free_limit: 5,
    });
    if (gateErr) return json({ error: gateErr.message }, 500);
    if (!gate?.allowed) {
      return json({ error: "limit_reached", upgrade_required: true, used: gate?.used, limit: gate?.limit }, 402);
    }

    const prompt = `You are an expert Etsy SEO specialist AND a warm, encouraging friend co-piloting this seller's shop. The seller is the lead — match their voice, don't replace it. Tone: friendly, human, specific, never robotic or hypey. Take this draft listing and create a fully SEO-optimized version that still sounds like a real person who cares about the piece.

DRAFT:
Title: "${title}"
Description: "${description}"
Tags: ${tags.join(", ")}
Materials: ${materials.join(", ")}
Category: ${category}
Price: $${price}

REQUIREMENTS:
- Title: 100-140 characters, keyword-rich, natural
- Description: under 1,500 characters, Etsy-formatted per the structure below, scannable on mobile
- Tags: Exactly 13 tags, varied phrase lengths
- Materials: Only list materials the seller actually provided in the draft above — do not add new ones

DESCRIPTION FORMAT (Etsy does NOT render markdown):
- No #, **, *, _, or markdown.
- Never output the literal characters \\n or \\n\\n. In the JSON string use real newline escapes (\\n) so the rendered text contains real line breaks — never the literal two-character sequence backslash-n shown to the buyer.
- Section headers ALL CAPS + colon (e.g. CONDITION:). Bullets start with "- ". Blank line between sections.

REQUIRED STRUCTURE (omit any section with no data):
[One hook sentence — specific, vivid, names the item and its strongest selling point.]

DETAILS:
- Material / construction
- Key feature
- Additional feature

CONDITION:
- Honest rating + any wear/flaws/patina with exact location
(Condition MUST be in the top half — never buried at the bottom.)

MEASUREMENTS:
- All relevant dimensions

THE STORY:
2–3 sentences max of brand/cultural/historical context.

WHAT'S INCLUDED:
- Everything in the package

ABSOLUTE ANTI-FABRICATION RULES:
- NEVER invent measurements, dimensions, weights, lengths, widths, sizes, or any numeric spec. Only repeat numbers that already appear in the seller's draft title/description above. If a spec isn't provided, omit it — do not estimate or make one up.
- NEVER invent era, origin, provenance, brand, designer, maker, or historical claims that aren't already in the draft.
- NEVER add materials, gemstones, or components that aren't in the draft's materials list or description.
- Avoid clichés like "one of a kind," "rare find," "perfect gift" unless verifiable. End on the item, not a sales pitch.

${NO_PLACEHOLDER_PROMPT_RULES}

Respond with ONLY valid JSON:
{
  "title": "<optimized title>",
  "description": "<Etsy-formatted description with real newline escapes>",
  "tags": ["tag1", ..., "tag13"],
  "materials": ["material1"],
  "optimization_notes": "<brief explanation>",
  "expected_grade_improvement": 0
}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!claudeRes.ok) {
      const txt = await claudeRes.text();
      return json({ error: `Claude ${claudeRes.status}: ${txt.slice(0, 300)}` }, 502);
    }
    const claudeJson = await claudeRes.json();
    const text = String(claudeJson?.content?.[0]?.text ?? "")
      .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: "Invalid AI response" }, 502);
    }

    // Reject placeholder/fill-in text — sellers approve or reject, they don't edit.
    const placeholderHits = findPlaceholders({
      title: String(parsed.title ?? ""),
      description: String(parsed.description ?? ""),
      tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]) : [],
      materials: Array.isArray(parsed.materials) ? (parsed.materials as string[]) : [],
    });
    if (placeholderHits.length) {
      return json({
        error: "AI couldn't produce a publish-ready listing (it left placeholder text for you to fill in). Please try again.",
        placeholder_hits: placeholderHits,
      }, 502);
    }

    return json(parsed);
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
