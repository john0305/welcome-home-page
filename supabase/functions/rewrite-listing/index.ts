// Generate an AI rewrite for a listing (title | tags | description | materials).
// Multimodal: feeds the listing photos to the model so the rewrite is
// verified against what's actually in the images and missing details are
// surfaced. Uses the Lovable AI Gateway (Gemini 2.5 Flash — vision-capable).
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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabaseAuth.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;


    const { listing_id, type } = await req.json();
    if (!listing_id || !["title", "tags", "description", "materials"].includes(type)) {
      return json({ error: "Invalid params" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Atomically check + reserve a usage slot (server-enforced limit)
    const { data: gate, error: gateErr } = await supabase.rpc("consume_optimization", {
      _user_id: userId,
      _free_limit: 5,
    });
    if (gateErr) return json({ error: gateErr.message }, 500);
    if (!gate?.allowed) {
      return json({ error: "limit_reached", upgrade_required: true, used: gate?.used, limit: gate?.limit }, 402);
    }

    const { data: listing } = await supabase
      .from("listings").select("*").eq("id", listing_id).eq("user_id", userId).maybeSingle();
    if (!listing) return json({ error: "Listing not found" }, 404);

    const breakdown = (listing.score_breakdown ?? {}) as { factors?: Record<string, { score?: number; issue?: string }> };
    const factor = breakdown.factors?.[type];

    const answers = (listing.clarifying_answers as Record<string, string> | null) ?? null;
    const answersBlock = answers && Object.keys(answers).length
      ? "\nSeller clarifying answers (authoritative facts):\n" +
        Object.entries(answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n") + "\n"
      : "";

    // Pull a small voice sample from the seller's other listings so the
    // rewrite matches their real tone instead of sounding AI-generated.
    // Reference-only — never copy phrasing or carry over facts.
    let voiceSampleBlock = "";
    if (type === "title" || type === "description") {
      try {
        const { data: voiceSamples } = await supabase
          .from("listings")
          .select("title, description")
          .eq("user_id", userId)
          .eq("state", "active")
          .neq("id", listing_id)
          .not("description", "is", null)
          .order("updated_at", { ascending: false })
          .limit(4);
        const samples = (voiceSamples ?? [])
          .filter((s) => typeof s.description === "string" && s.description.trim().length > 80)
          .slice(0, 3);
        if (samples.length) {
          voiceSampleBlock = "\nSELLER VOICE SAMPLE — match the tone, rhythm, and vocabulary of these other listings the seller wrote themselves. DO NOT copy phrases verbatim or pull facts from them (different items):\n" +
            samples.map((s, i) => `--- Sample ${i + 1} ---\nTitle: ${String(s.title ?? "").slice(0, 140)}\nExcerpt: ${String(s.description ?? "").slice(0, 400)}`).join("\n\n") + "\n";
        }
      } catch { /* best-effort */ }
    }

    // Tier-aware photo cap (mirrors optimize-listing). Photos are sent to the
    // model so the rewrite can be verified against what's actually shown.
    const { data: profile } = await supabase
      .from("user_profiles").select("tier").eq("id", userId).maybeSingle();
    const tier = (profile?.tier as string | undefined) ?? "free";
    const photoCap = tier === "free" ? 5 : 10;
    const photos: string[] = ((listing.image_urls as string[] | null) ?? []).slice(0, photoCap);
    if (photos.length === 0 && listing.thumbnail_url) photos.push(String(listing.thumbnail_url));

    const photoContextBlock = photos.length
      ? `\nThe attached ${photos.length} photo(s) are GROUND TRUTH. Cross-check the current ${type} against the photos: surface anything visible that's missing, correct anything contradicted, and never describe something not actually shown.`
      : "\n(No photos available — work from the text only.)";

    const antiFab = `\nABSOLUTE ANTI-FABRICATION RULES:
- NEVER invent measurements, dimensions, weights, lengths, widths, sizes, or any numeric spec. Only repeat numbers that already appear in the seller's original title/description or in a clarifying answer above.
- NEVER invent era, origin, provenance, brand, designer, maker, or historical claims that aren't already in the original or seller answers.
- For materials/colors/features: only state what you can verify from the photos OR the seller's original text/answers.

${NO_PLACEHOLDER_PROMPT_RULES}`;

    let promptText = "";
    let original = "";
    if (type === "title") {
      original = listing.title ?? "";
      promptText = `Rewrite this Etsy listing title for maximum SEO.
Current title: ${original}
Current description (context, do not invent from): ${(listing.description ?? "").slice(0, 600)}
Current tags: ${JSON.stringify(listing.tags ?? [])}
Current score: ${factor?.score ?? "?"}/20
Issue: ${factor?.issue ?? "n/a"}
${answersBlock}${voiceSampleBlock}${photoContextBlock}
Rules: 120-140 characters, primary keyword first, natural language. If the photos reveal a key descriptor missing from the title (color, style, material, occasion), include it.${antiFab}
Return ONLY the new title, no quotes, no explanation.`;
    } else if (type === "tags") {
      original = JSON.stringify(listing.tags ?? []);
      promptText = `Generate 13 Etsy tags for this listing.
Title: ${listing.title}
Description: ${(listing.description ?? "").slice(0, 600)}
Current tags: ${original}
Current score: ${factor?.score ?? "?"}/20
${answersBlock}${voiceSampleBlock}${photoContextBlock}
Rules: mix long-tail (3-4 words) and broad terms, all 13 slots, max 20 chars each, no duplicate words across tags. Use the photos to surface visual descriptors buyers search for (color, style, occasion).
TAG ACCURACY RULES (non-negotiable):
- Every tag MUST describe THIS specific item. If this is a shoe clip, never use "earrings", "necklace", "brooch", or any other item-type tag. Match the seller's product noun.
- Do NOT use bare shape words ("rectangle", "square", "round", "oval") unless paired with the item noun.
- Do NOT use generic gift-recipient filler ("gift for her", "for her", "for him", "gift idea", "perfect gift", "unique gift") unless the original listing or seller answers explicitly position this as a gift for that recipient.
- PRESERVE compound color/finish descriptors exactly: "gold tone", "silver tone", "rose gold", "antique brass", "matte black". Never strip the qualifier word — "gold tone" and "gold" are NOT interchangeable.${antiFab}
Return ONLY a JSON array of 13 strings.`;
    } else if (type === "description") {
      original = listing.description ?? "";
      promptText = `Rewrite this Etsy listing description in the Etsy-formatted structure below.
Current description: ${original.slice(0, 1200)}
Title: ${listing.title}
Tags: ${JSON.stringify(listing.tags ?? [])}
Current score: ${factor?.score ?? "?"}/15
${answersBlock}${voiceSampleBlock}${photoContextBlock}

CRITICAL FORMATTING (Etsy does NOT render markdown):
- No #, **, *, _, or markdown of any kind.
- Never output the literal characters \\n or \\n\\n — use real line breaks only.
- Section headers ALL CAPS followed by a colon (e.g. CONDITION:).
- Bullets start with "- " on their own line.
- Blank line between every section. No paragraph walls.
- Total under 1,500 characters. Written for a mobile skimmer.

REQUIRED STRUCTURE (omit any section with no data — never leave it blank):

[One hook sentence — specific, vivid, names the item and its strongest selling point.]

DETAILS:
- Material / construction
- Key feature
- Additional feature
- Hardware, closures, labels, markings

CONDITION:
- Honest rating + any wear/flaws/patina with exact location
- Anything repaired, replaced, or added
(Condition MUST be in the top half — never buried at the bottom.)

MEASUREMENTS:
- All relevant dimensions

THE STORY:
2–3 sentences max of brand/cultural/historical context.

WHAT'S INCLUDED:
- Everything in the package

Preserve the seller's voice. Surface visible details from the photos that the current description misses. End on the item, not a sales pitch.${antiFab}
Return ONLY the rewritten description text.`;
    } else {
      const currentMaterials = Array.isArray(listing.materials) ? (listing.materials as string[]) : [];
      original = JSON.stringify(currentMaterials);
      const category = (listing as { category?: string | null }).category ?? "";
      promptText = `You are an Etsy SEO expert. Suggest the best materials to list for this Etsy product.
Title: ${listing.title}
Description: ${(listing.description ?? "").slice(0, 600)}
Category: ${category}
Current materials: ${currentMaterials.length ? JSON.stringify(currentMaterials) : "none listed"}
${answersBlock}${voiceSampleBlock}${photoContextBlock}
Rules: Etsy allows up to 13 materials. Only list materials you can either (a) clearly see in the photos, or (b) verify from the seller's original listing / clarifying answers. Include primary material and finish/texture variants where relevant. Each material max 45 characters.${antiFab}
Return ONLY a JSON array of strings, no explanation.
Example: ["sterling silver", "cubic zirconia", "rhodium plated"]`;
    }

    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: promptText },
      ...photos.map(url => ({ type: "image_url", image_url: { url } })),
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: userContent }],
        max_tokens: 1500,
      }),
    });
    // Failed generations must not charge quota (Section 12a).
    const refund = () => supabase.rpc("refund_optimization", { _user_id: userId });
    if (aiRes.status === 429) { await refund(); return json({ error: "Rate limited, please try again shortly. This attempt wasn't counted against your quota." }, 429); }
    if (aiRes.status === 402) { await refund(); return json({ error: "AI credits exhausted.", upgrade_required: true }, 402); }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      await refund();
      return json({ error: `The AI service had trouble just now — your quota wasn't charged. Please try again. (gateway ${aiRes.status}: ${txt.slice(0, 200)})` }, 502);
    }
    const aiJson = await aiRes.json();
    let suggested = String(aiJson?.choices?.[0]?.message?.content ?? "").trim();
    // Strip ```json ... ``` or ``` ... ``` fences the model sometimes adds,
    // especially for tags/materials which we expect to be a raw JSON array.
    if (suggested.startsWith("```")) {
      suggested = suggested.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    }

    // Reject placeholder/fill-in text — sellers approve or reject, they don't edit.
    const placeholderHits = findPlaceholders({ [type]: suggested });
    if (placeholderHits.length) {
      await refund();
      return json({
        error: "AI couldn't produce a publish-ready rewrite (it left placeholder text for you to fill in). Your quota wasn't charged — please try again.",
        placeholder_hits: placeholderHits,
      }, 502);
    }



    const { data: opt, error: optErr } = await supabase.from("optimizations").insert({
      user_id: userId,
      listing_id,
      type,
      original_text: original,
      suggested_text: suggested,
      status: "pending",
      original_grade: (listing as { score?: number | null }).score ?? null,
    }).select().single();
    if (optErr) return json({ error: optErr.message }, 500);

    return json({ optimization_id: opt.id, suggested_text: suggested });
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
