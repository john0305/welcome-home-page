// Suggest 2–3 follow-up personalization questions tailored to the seller's
// shop based on their existing answers, the shop's detected category, and a
// sample of their listings.
// Writes the result onto store_personalization.ai_followups and returns it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabaseAuth.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    if (!LOVABLE_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    let shopId: string | null = body?.etsy_shop_id ? String(body.etsy_shop_id) : null;
    if (!shopId) {
      // Fall back to the user's most recently connected shop so single-shop
      // users keep working even if the client didn't send a shop id.
      const { data: store } = await supabase
        .from("stores")
        .select("etsy_shop_id")
        .eq("user_id", userId)
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      shopId = (store as { etsy_shop_id?: string } | null)?.etsy_shop_id ?? null;
    }
    if (!shopId) return json({ error: "No connected shop." }, 400);

    const { data: row } = await supabase
      .from("store_personalization")
      .select("answers, category, custom_prompt_override")
      .eq("user_id", userId)
      .eq("etsy_shop_id", shopId)
      .maybeSingle();

    const answers = (row?.answers as Record<string, unknown> | null) ?? {};
    const storedCategory = (row?.category as string | null) ?? null;

    const { data: listings } = await supabase
      .from("listings")
      .select("title, tags, materials, price")
      .eq("user_id", userId)
      .limit(30);

    const listingSample = (listings ?? []).slice(0, 30).map(l => ({
      title: String(l.title ?? "").slice(0, 120),
      tags: Array.isArray(l.tags) ? (l.tags as string[]).slice(0, 13) : [],
      materials: Array.isArray(l.materials) ? (l.materials as string[]).slice(0, 5) : [],
      price: l.price,
    }));

    // Quick server-side category hint so the AI knows what the shop sells
    // even before the seller answers product_categories themselves.
    const detectedCategory = storedCategory ?? quickDetectCategory(listingSample);

    const userText = `Seller's connected shop category (detected): ${detectedCategory}

Seller's current personalization answers:
${JSON.stringify(answers, null, 2)}

Sample of up to 30 of their listings:
${JSON.stringify(listingSample, null, 2)}

Suggest 2–3 follow-up questions that would tighten the AI prompt for THIS specific shop. Questions MUST be:
- Specific to a ${detectedCategory} shop (no generic "what do you sell" — that's already covered).
- Concrete and answerable in 1–2 sentences (or a single select).
- About things the existing question set doesn't already cover.
- Grounded in what you observe in their listings (price tier, repeated tags, materials, etc.).

Bad example for an apparel shop: "What kind of jewelry do you make?"
Good example for an apparel shop: "Do you print on-demand or hold stock? This changes how the AI describes turnaround time."

Return via the tool.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You help Etsy sellers personalize an AI listing optimizer. You ALWAYS tailor follow-up questions to the specific category of shop the seller runs (apparel, jewelry, art prints, digital downloads, etc.). Never ask jewelry questions of an apparel shop or vice versa. Look at what they sell and what they've already told us, then propose 2–3 sharper follow-up questions that would meaningfully improve the AI's output for THIS shop. Avoid duplicating the existing questions.",
          },
          { role: "user", content: userText },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_followups",
            description: "Submit 2–3 follow-up personalization questions",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                followups: {
                  type: "array",
                  minItems: 2,
                  maxItems: 3,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      id: { type: "string", description: "snake_case identifier, e.g. delivery_format" },
                      question: { type: "string" },
                      type: { type: "string", enum: ["text", "textarea", "select"] },
                      options: { type: "array", items: { type: "string" } },
                      helpText: { type: "string" },
                      why: { type: "string", description: "1 sentence: why this question matters for this shop" },
                    },
                    required: ["id", "question", "type", "why"],
                  },
                },
              },
              required: ["followups"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_followups" } },
      }),
    });

    if (aiRes.status === 429) return json({ error: "Rate limited, please try again shortly." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted.", upgrade_required: true }, 402);
    if (!aiRes.ok) return json({ error: `AI gateway ${aiRes.status}: ${(await aiRes.text()).slice(0, 300)}` }, 502);

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: { followups?: unknown[] } = {};
    try { parsed = JSON.parse(toolCall?.function?.arguments ?? "{}"); } catch { /* ignore */ }
    const followups = Array.isArray(parsed.followups) ? parsed.followups.map(f => ({
      ...(f as Record<string, unknown>),
      source: "ai",
    })) : [];

    // Upsert into store_personalization for THIS shop (preserves override + answers).
    await supabase.from("store_personalization").upsert({
      user_id: userId,
      etsy_shop_id: shopId,
      ai_followups: followups,
      category: detectedCategory,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,etsy_shop_id" });

    return json({ followups });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

// Minimal category sniffer — mirrors the client helper but kept tiny so we
// don't have to bundle the full keyword table on the server. The client's
// detector is the authoritative one; this is just a fallback when the
// personalization row doesn't yet carry a category.
function quickDetectCategory(items: { title: string; tags: string[] }[]): string {
  const buckets: Record<string, string[]> = {
    apparel: ["shirt", "tee", "hoodie", "sweater", "dress", "apparel", "clothing", "unisex"],
    jewelry: ["necklace", "earring", "bracelet", "ring", "jewelry", "jewellery", "pendant"],
    home_decor: ["pillow", "candle", "mug", "decor", "tapestry", "wall hanging"],
    art_print: ["print", "poster", "wall art", "illustration", "giclee"],
    digital: ["digital download", "svg", "printable", "instant download", "cricut"],
    paper_goods: ["card", "invitation", "planner", "sticker", "stationery"],
  };
  const scores: Record<string, number> = {};
  for (const it of items) {
    const hay = (it.title + " " + (it.tags ?? []).join(" ")).toLowerCase();
    for (const [cat, words] of Object.entries(buckets)) {
      if (words.some(w => hay.includes(w))) scores[cat] = (scores[cat] ?? 0) + 1;
    }
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best?.[0] ?? "other";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
