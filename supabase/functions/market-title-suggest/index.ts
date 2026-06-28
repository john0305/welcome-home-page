/**
 * market-title-suggest
 *
 * Generates a market-informed AI title suggestion for a listing.
 * Used by the guided fix flow for Pro users.
 *
 * POST body: { listing_id: string }
 * Returns: { suggested_title: string, char_count: number, rationale: string }
 */
import { corsHeaders, json, authedUserId, loadListingCtx, makeServiceClient } from "../_shared/action-engine.ts";
import { chatCompletion } from "../_shared/ai-dispatch.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const userId = await authedUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { listing_id } = body;
  if (!listing_id) return json({ error: "Missing listing_id" }, 400);

  const supabase = makeServiceClient();

  // Load listing context
  const listing = await loadListingCtx(supabase, userId, String(listing_id));
  if (!listing) return json({ error: "Listing not found" }, 404);

  // Load market score for context
  const { data: marketScore } = await supabase
    .from("listing_market_scores")
    .select("missing_tags, market_score, keyword_cluster, title_score")
    .eq("listing_id", String(listing.etsy_listing_id))
    .eq("user_id", userId)
    .order("scored_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Load competitor data for the keyword cluster
  let competitorContext = "";
  if (marketScore?.keyword_cluster) {
    const { data: cache } = await supabase
      .from("market_insight_cache")
      .select("insights")
      .eq("keyword_cluster", marketScore.keyword_cluster)
      .maybeSingle();

    if (cache?.insights) {
      const insights = cache.insights as Record<string, unknown>;
      competitorContext = `
MARKET CONTEXT for "${marketScore.keyword_cluster}":
- Competitor average title length: ${insights.avg_title_length ?? "unknown"} characters
- Your current title: ${(listing.title ?? "").length} characters
- Top competitor tags: ${(insights.top_tags as string[] ?? []).slice(0, 8).join(", ")}
- Missing high-traffic tags: ${(marketScore.missing_tags ?? []).slice(0, 5).join(", ")}
`;
    }
  }

  // Load personalization for brand voice
  const { data: personalization } = await supabase
    .from("store_personalization")
    .select("answers, category")
    .eq("user_id", userId)
    .order("completion_percentage", { ascending: false })
    .limit(1)
    .maybeSingle();

  const answers = (personalization?.answers ?? {}) as Record<string, unknown>;
  const brandContext = answers.brand_voice
    ? `Brand voice: ${answers.brand_voice}. Target audience: ${answers.target_audience ?? "general"}.`
    : "";

  const prompt = `You are a title optimizer for Etsy sellers. Your job is to write a SINGLE optimized title.
${competitorContext}
${brandContext}

CURRENT LISTING:
Title: "${listing.title}"
Tags: ${(listing.tags ?? []).join(", ")}
Price: $${listing.price ?? "unknown"}

RULES:
1. Target 90-120 characters (Etsy's optimal range, and what's winning in this market)
2. Lead with the most important keyword buyers search for
3. Include 2-3 natural keyword phrases from the competitor tags list if relevant
4. Keep it readable — not a raw keyword dump
5. Do NOT use ALL CAPS, excessive punctuation, or spammy patterns
6. Preserve the product's actual description — don't invent features
7. Stay true to the brand voice if specified

Return ONLY a JSON object:
{
  "suggested_title": "the full optimized title",
  "char_count": 97,
  "rationale": "One sentence explaining the key change and why it helps."
}`;

  const result = await chatCompletion({
    taskKey: "market_title_suggest",
    messages: [{ role: "user", content: prompt }],
    userId,
    maxTokens: 400,
  });

  if (result.error) {
    console.error("market-title-suggest AI error", result.error);
    return json({ error: `AI error: ${result.error.message}` }, 502);
  }

  // Robust JSON extraction — models sometimes wrap output in ```json fences or
  // include a brief preamble. Strip fences and grab the first {...} block.
  const extractJson = (raw: string): string | null => {
    if (!raw) return null;
    let s = raw.trim();
    // Strip markdown code fences
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    // If still not pure JSON, find the first balanced { ... }
    if (s.startsWith("{")) return s;
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return s.slice(start, end + 1);
  };

  const jsonText = extractJson(result.content ?? "");
  if (!jsonText) {
    console.error("market-title-suggest: no JSON in AI response", result.content);
    return json({ error: "Could not parse AI response" }, 502);
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      suggested_title?: string;
      char_count?: number;
      rationale?: string;
    };

    if (!parsed.suggested_title) {
      console.error("market-title-suggest: missing suggested_title", parsed);
      return json({ error: "No title generated" }, 502);
    }

    const title = String(parsed.suggested_title).trim();
    return json({
      suggested_title: title,
      char_count: title.length,
      rationale: parsed.rationale ?? "",
      current_title: listing.title,
      current_char_count: (listing.title ?? "").length,
    });
  } catch (e) {
    console.error("market-title-suggest: JSON.parse failed", e, jsonText);
    return json({ error: "Could not parse AI response" }, 502);
  }
});
