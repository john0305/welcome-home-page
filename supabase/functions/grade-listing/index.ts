// Hybrid grader: deterministic rules + Gemini 2.5 Flash multimodal review of listing photos. [keep-alive]
// Free tier: up to 5 photos analyzed. Paid tier: up to 10.
// Returns 0-2 clarifying questions the AI would need answered to grade more accurately.
// Required env: LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Etsy allows up to 10 photos per listing. Analyze them all so coverage/quality
// reflects the full media set instead of an arbitrary slice.
const FREE_PHOTO_CAP = 10;
const PAID_PHOTO_CAP = 10;

function ruleScores(listing: Record<string, unknown>) {
  const title = String(listing.title ?? "");
  const description = String(listing.description ?? "");
  const tags = (listing.tags as string[] | null) ?? [];
  const materials = (listing.materials as string[] | null) ?? [];
  const photoCount = Number(listing.photo_count ?? (listing.image_urls as string[] | null)?.length ?? 0);
  const videoCount = Number(listing.video_count ?? 0);

  const titleLen = title.length;
  const titleRule = titleLen >= 100 && titleLen <= 140 ? 10 : titleLen >= 70 ? 7 : titleLen >= 40 ? 4 : 1;
  const tagsRule = tags.length >= 13 ? 10 : Math.round((tags.length / 13) * 10);
  const photoRule = photoCount >= 10 ? 15 : photoCount >= 5 ? 10 : photoCount >= 1 ? 5 : 0;
  const descRule = description.length >= 600 ? 10 : description.length >= 200 ? 6 : description.length >= 50 ? 3 : 0;
  const matRule = materials.length >= 3 ? 8 : materials.length >= 1 ? 4 : 0;
  const videoRule = videoCount > 0 ? 7 : 0;

  return {
    title_rule: titleRule, tags_rule: tagsRule, photos_rule: photoRule,
    description_rule: descRule, materials_rule: matRule, video_rule: videoRule,
    rules_total: titleRule + tagsRule + photoRule + descRule + matRule + videoRule,
  };
}

function letterGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B+";
  if (score >= 70) return "B";
  if (score >= 60) return "C+";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function normalizeQuestion(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function questionTokens(value: string): Set<string> {
  const stop = new Set(["what", "which", "can", "you", "provide", "the", "a", "an", "of", "or", "is", "it", "this", "that", "for", "to", "in", "on", "does", "do", "please"]);
  return new Set(normalizeQuestion(value).split(" ").filter(t => t.length > 2 && !stop.has(t)));
}

function isAlreadyAnsweredQuestion(question: string, answered: Set<string>, answeredTokens: Set<string>[]): boolean {
  const normalized = normalizeQuestion(question);
  if (answered.has(normalized)) return true;
  const tokens = questionTokens(question);
  if (tokens.size === 0) return false;
  for (const prior of answeredTokens) {
    const shared = [...tokens].filter(t => prior.has(t)).length;
    if (shared >= Math.min(3, tokens.size) || shared / Math.max(tokens.size, prior.size) >= 0.6) return true;
  }
  return false;
}

function isPhotoRequest(value: string): boolean {
  const q = normalizeQuestion(value);
  return /\b(provide|upload|add|show|include|send)\b/.test(q) && /\b(photo|photos|image|images|picture|pictures|close up|closeup)\b/.test(q);
}

// Explain exactly why this listing isn't a perfect 100.
type AiScores = {
  title_quality: number; description_alignment: number; tags_relevance: number;
  materials_completeness: number; photo_quality: number; photo_coverage: number;
  price_reasonableness: number;
};

const DIM_LABELS: Record<keyof AiScores, string> = {
  title_quality: "Title keyword quality",
  description_alignment: "Description matches photos",
  tags_relevance: "Tag relevance",
  materials_completeness: "Materials match photos",
  photo_quality: "Photo quality",
  photo_coverage: "Photo coverage (angles, detail, lifestyle)",
  price_reasonableness: "Price reasonableness",
};

function buildDeductions(
  listing: Record<string, unknown>,
  rules: ReturnType<typeof ruleScores>,
  ai: AiScores,
  guidance: Record<string, string>,
): string[] {
  const out: string[] = [];
  const title = String(listing.title ?? "");
  const description = String(listing.description ?? "");
  const tags = (listing.tags as string[] | null) ?? [];
  const materials = (listing.materials as string[] | null) ?? [];
  const photoCount = Number(listing.photo_count ?? (listing.image_urls as string[] | null)?.length ?? 0);

  if (rules.title_rule < 10) out.push(`Title is ${title.length} chars — aim for 100–140 (losing ${10 - rules.title_rule} pts).`);
  if (rules.tags_rule < 10) out.push(`Using ${tags.length}/13 tags — fill all 13 slots (losing ${10 - rules.tags_rule} pts).`);
  if (rules.photos_rule < 15) out.push(`Only ${photoCount} photo${photoCount === 1 ? "" : "s"} — 10 earns full marks (losing ${15 - rules.photos_rule} pts).`);
  if (rules.description_rule < 10) out.push(`Description is ${description.length} chars — aim for 600+ (losing ${10 - rules.description_rule} pts).`);
  if (rules.materials_rule < 8) out.push(`Listed ${materials.length} material${materials.length === 1 ? "" : "s"} — add at least 3 (losing ${8 - rules.materials_rule} pts).`);
  if (rules.video_rule < 7) out.push(`No video — adding one earns 7 pts and lifts conversion.`);

  for (const key of Object.keys(DIM_LABELS) as (keyof AiScores)[]) {
    const score = ai[key];
    if (score >= 9) continue;
    const lost = Math.round(((10 - score) / 70) * 40);
    if (lost <= 0) continue;
    const tip = guidance[key]?.trim();
    const base = `${DIM_LABELS[key]}: ${score}/10 (~${lost} pts lost).`;
    out.push(tip ? `${base} To reach 10/10: ${tip}` : base);
  }

  return out;
}

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

    const body = await req.json().catch(() => ({}));
    const { listing_id, personalization, etsy_shop_id, mode: rawMode } = body as {
      listing_id?: string;
      personalization?: Record<string, unknown> | null;
      etsy_shop_id?: string | null;
      mode?: string;
    };
    // Default to 'shop' for any missing/unknown mode. Only the literal
    // 'personal' triggers the Personal Workspace branch — existing callers
    // (which pass no `mode`) keep working exactly as before.
    const mode: 'shop' | 'personal' = rawMode === 'personal' ? 'personal' : 'shop';

    if (mode === 'personal') {
      return await handlePersonalGrade(req, body as Record<string, unknown>, userId, SUPABASE_URL, SERVICE_KEY, LOVABLE_KEY!);
    }

    if (!listing_id) return json({ error: "Missing listing_id" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Tier-gated photo cap so free users don't blow through AI credits.
    const { data: profile } = await supabase
      .from("user_profiles").select("tier").eq("id", userId).maybeSingle();
    const tier = (profile?.tier as string | undefined) ?? "free";
    const photoCap = tier === "free" ? FREE_PHOTO_CAP : PAID_PHOTO_CAP;

    // Free-tier monthly grading cap (50 / month). Paid: unlimited.
    const { data: gate, error: gateErr } = await supabase.rpc("consume_grade", {
      _user_id: userId, _free_limit: 50,
    });
    if (gateErr) return json({ error: gateErr.message }, 500);
    if (!gate?.allowed) {
      return json({
        error: "grade_limit_reached",
        upgrade_required: true,
        used: gate?.used,
        limit: gate?.limit,
      }, 429);
    }

    const { data: listing, error: lErr } = await supabase
      .from("listings").select("*").eq("id", listing_id).eq("user_id", userId).maybeSingle();
    if (lErr || !listing) return json({ error: "Listing not found" }, 404);

    const rules = ruleScores(listing);

    const allPhotos: string[] = ((listing.image_urls as string[] | null) ?? []);
    const photos = allPhotos.slice(0, photoCap);
    if (photos.length === 0 && listing.thumbnail_url) photos.push(String(listing.thumbnail_url));
    const totalPhotos = allPhotos.length;
    const analyzedPhotos = photos.length;

    // Existing clarifying answers help the AI grade more accurately on this pass.
    const existingAnswers = (listing.clarifying_answers as Record<string, string> | null) ?? null;
    // Full history of every clarifying question we've ever asked for this listing
    // (answered, skipped, or still open). Used to prevent the model from re-asking.
    type HistoryEntry = { question: string; answer: string | null; asked_at?: string; answered_at?: string | null; updated_at?: string | null; skipped_at?: string | null };
    const existingHistory = Array.isArray(listing.clarifying_history) ? (listing.clarifying_history as HistoryEntry[]) : [];
    const previouslyAskedQuestions = [
      ...Object.keys(existingAnswers ?? {}),
      ...existingHistory.map(h => h.question).filter(q => typeof q === "string" && q.length > 0),
    ];
    const askedQuestionKeys = new Set(previouslyAskedQuestions.map(normalizeQuestion).filter(Boolean));
    const askedQuestionTokens = previouslyAskedQuestions.map(questionTokens);
    const answersBlock = existingAnswers && Object.keys(existingAnswers).length
      ? "\n\nSeller-provided answers to previous questions:\n" +
        Object.entries(existingAnswers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n")
      : "";
    const previouslyAskedBlock = existingHistory.length
      ? "\n\nQuestions you have ALREADY asked for this listing (do NOT repeat or rephrase these — pick something else, or return []):\n" +
        existingHistory.map(h => `- ${h.question}`).join("\n")
      : "";


    const optimizationCount = Number((listing as { optimization_count?: number }).optimization_count ?? 0);
    const optimizedNote = optimizationCount > 0
      ? `\n\nNOTE: This listing's title, description, and tags have already been AI-optimized ${optimizationCount} time(s). Do NOT flag generic "could use better keywords" or "improve description" feedback. Only deduct on the copy dimensions if you can point to a SPECIFIC, concrete problem you can see (e.g. "title omits 'oak' which is clearly visible in photos", "description claims 'handmade' but photos show machine-stitched seams"). If the copy is solid given the photos, score the copy dimensions 9-10.`
      : "";

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Grade this Etsy listing's quality using the photos as ground truth.
Title: ${listing.title}
Tags (${(listing.tags as string[] | null)?.length ?? 0}/13): ${JSON.stringify(listing.tags ?? [])}
Materials: ${JSON.stringify(listing.materials ?? [])}
Description (first 800 chars): ${(listing.description ?? "").slice(0, 800)}
Price: $${listing.price ?? 0}
Photos analyzed: ${analyzedPhotos} of ${totalPhotos} total${analyzedPhotos < totalPhotos ? ` (capped at ${photoCap} on ${tier} tier)` : ""}${answersBlock}${previouslyAskedBlock}${optimizedNote}

CRITICAL — PHOTO INSPECTION RULES (read before scoring or recommending anything photo-related):
1. ${analyzedPhotos} photo(s) are attached below in order (photo 1 through photo ${analyzedPhotos}). You MUST visually inspect EVERY one before drawing any conclusion about photo coverage or what is "missing". Do not stop at the first 1-2 photos.
2. Before suggesting the seller "add a photo of X" (back of box, scale shot, packaging, label, close-up, lifestyle, underside, in-use, etc.), scan all ${analyzedPhotos} attached photos for X first. If ANY attached photo already shows X — even partially, even as a secondary subject, even in the background — DO NOT recommend adding it. If the existing shot of X is weak (blurry, dark, cropped, glare), recommend improving that specific photo instead of adding a new one.
3. Never claim a view/angle/detail is missing without having checked each photo for it. Photo coverage gaps are real only when none of the ${analyzedPhotos} photos contain that view.
4. When you do flag a missing shot, briefly note which views you DID see (e.g. "you've got front, top, and a lifestyle shot — a back/underside view would round it out") so the seller can trust you actually looked at everything.

Score each dimension 0-10:
- title_quality: keyword strength, matches what's actually shown in photos
- description_alignment: does the copy match what's pictured, is it persuasive
- tags_relevance: are tags actually relevant to the pictured product
- materials_completeness: do listed materials match visible materials in photos. If a material is listed but not visible (e.g. "thread", "glue"), that's FINE — only deduct if a listed material clearly contradicts what's pictured, OR a clearly-visible material is missing from the list. If you deduct, the fix is usually "add a close-up photo showing the material" rather than changing the materials list.
- photo_quality: composition, lighting, clarity (per-image quality)
- photo_coverage: variety/completeness — angles, scale shots, detail close-ups, lifestyle/in-use, consistency
- price_reasonableness: does the price look fair vs apparent quality. Also set price_direction: "fair", "too_low" (underpriced — leaving money on the table), or "too_high" (overpriced for what's shown). Do NOT suggest a specific new price.

For EVERY dimension you score below 10, you MUST add an entry to improvement_guidance with a CONCRETE action the seller can take to reach 10/10. Write it like a friend giving a tip ("Try adding a scale shot — a hand or a coin next to it does wonders"), not a teacher correcting homework. No vague advice.

Also produce prioritized_recommendations: an ordered list (most impactful first) of the 3-6 specific things you'd suggest next to lift this listing. Order by expected revenue impact. Phrase each as a friendly nudge, not a command.

Also: if there is genuine uncertainty about the product blocking a better grade (e.g. "is this solid wood or veneer?", "what dimensions?"), provide 1-2 short clarifying_questions. Only ask NEW factual questions that the seller can answer in text. Never ask for information already answered above, even if you would phrase it differently. Never use clarifying_questions to request more photos/close-ups/images; put photo needs in improvement_guidance or prioritized_recommendations instead. If everything is clear or already answered, return [].

Also produce suggested_actions: 0-4 concrete, physical next-steps the seller can do RIGHT NOW with what they already have. CRITICAL: mine the "Seller-provided answers" above for tools, equipment, conditions, or details the seller mentioned (e.g. "I have a jeweler's loupe", "there's a faint stamp", "I own a macro lens", "measured with calipers"), and turn each into a specific action that uses that asset. Examples: if they mention a magnifier/loupe and a stamp/hallmark → "Grab your loupe and shoot a sharp macro of the hallmark on the inner band — fill the frame, even lighting, no glare." If they mention dimensions → "Pop a coin or ruler next to it for a scale shot so buyers can size it at a glance." Each item: {action: short friendly imperative, reason: 1 short clause tying it to the seller's answer or a scoring gap}. Skip generic advice already covered by improvement_guidance.`,
      },
      ...photos.map(url => ({ type: "image_url", image_url: { url } })),
    ];

    const resolved = await resolveShopContext(supabase, userId, personalization, etsy_shop_id);
    const systemPrompt =
      resolved.prefix + "\n\n" +
      "You are an expert Etsy SEO specialist AND a warm, encouraging friend helping this seller grow their shop. The seller is the lead — you are the supportive co-pilot riding shotgun. Tone: friendly, specific, encouraging, never preachy or robotic. Celebrate what's working ('love that you...', 'this is already strong because...'), then gently point out patterns and opportunities like a friend who genuinely wants their shop to win. Use 'you' and 'your', avoid corporate jargon, no scolding, no hype. When you flag a gap, frame it as an opportunity, not a failure. Use the photos to ground your judgment." +
      " Quietly honor the SHOP CONTEXT above — reward copy that fits the seller's voice/audience, gently nudge when it drifts (don't lecture)." +
      " Return scores via the provided tool.";
    const personalizationPrompt = resolved.usedCustomContext ? resolved.prefix : "";

    const aiBody = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [{
        type: "function",
        function: {
          name: "submit_grade",
          description: "Submit AI grading scores for the listing",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              title_quality: { type: "number" },
              description_alignment: { type: "number" },
              tags_relevance: { type: "number" },
              materials_completeness: { type: "number" },
              photo_quality: { type: "number" },
              photo_coverage: { type: "number" },
              price_reasonableness: { type: "number" },
              price_direction: { type: "string", enum: ["fair", "too_low", "too_high"] },
              price_reasoning: { type: "string" },
              improvement_guidance: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title_quality: { type: "string" },
                  description_alignment: { type: "string" },
                  tags_relevance: { type: "string" },
                  materials_completeness: { type: "string" },
                  photo_quality: { type: "string" },
                  photo_coverage: { type: "string" },
                  price_reasonableness: { type: "string" },
                },
                required: ["title_quality", "description_alignment", "tags_relevance", "materials_completeness", "photo_quality", "photo_coverage", "price_reasonableness"],
              },
              prioritized_recommendations: { type: "array", items: { type: "string" }, maxItems: 6 },
              top_issues: { type: "array", items: { type: "string" }, maxItems: 3 },
              quick_win: { type: "string" },
              clarifying_questions: { type: "array", items: { type: "string" }, maxItems: 2 },
              suggested_actions: {
                type: "array",
                maxItems: 4,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    action: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["action", "reason"],
                },
              },
              summary: { type: "string" },
            },
            required: ["title_quality", "description_alignment", "tags_relevance", "materials_completeness", "photo_quality", "photo_coverage", "price_reasonableness", "price_direction", "price_reasoning", "improvement_guidance", "prioritized_recommendations", "top_issues", "quick_win", "clarifying_questions", "suggested_actions", "summary"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "submit_grade" } },
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(aiBody),
    });
    // AI fallback (Section 12a): when a fresh grade can't be computed, return
    // the last successfully computed one clearly marked stale ("as of <date>")
    // instead of an error or blank state. consume_grade charges grades_used
    // upfront, so refund it here — a failed grade must not cost the seller
    // one of their monthly allowance.
    if (!aiRes.ok) {
      const status = aiRes.status;
      const detail = (await aiRes.text().catch(() => "")).slice(0, 200);
      console.error("grade-listing AI gateway failure", status, detail);
      await supabase.rpc("refund_grade", { _user_id: userId });
      if (listing.score != null && listing.grade != null) {
        return json({
          stale: true,
          graded_at: listing.last_graded ?? null,
          score: listing.score,
          grade: listing.grade,
          score_breakdown: listing.score_breakdown ?? null,
          notice: "We couldn't refresh this grade just now, so you're seeing the last saved one. We'll retry automatically.",
        });
      }
      if (status === 429) return json({ error: "Rate limited, please try again shortly." }, 429);
      if (status === 402) return json({ error: "AI credits exhausted. Please add credits in workspace settings.", upgrade_required: true }, 402);
      return json({ error: "We couldn't grade this listing just now — please try again in a moment." }, 502);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let ai: Record<string, unknown> = {};
    try { ai = JSON.parse(toolCall?.function?.arguments ?? "{}"); } catch { /* ignore */ }

    const clamp = (v: unknown) => Math.max(0, Math.min(10, Number(v) || 0));
    const ai_title = clamp(ai.title_quality);
    const ai_desc = clamp(ai.description_alignment);
    const ai_tags = clamp(ai.tags_relevance);
    const ai_materials = clamp(ai.materials_completeness);
    const ai_photos = clamp(ai.photo_quality);
    const ai_coverage = clamp(ai.photo_coverage);
    const ai_price = clamp(ai.price_reasonableness);
    // 7 dims × 10 = 70 max → scale to 40 pts of total grade
    const ai_total = ai_title + ai_desc + ai_tags + ai_materials + ai_photos + ai_coverage + ai_price;
    const ai_scaled = Math.round((ai_total / 70) * 40);

    const overall = Math.min(100, rules.rules_total + ai_scaled);
    const grade = letterGrade(overall);

    const rawQuestions = Array.isArray(ai.clarifying_questions) ? (ai.clarifying_questions as unknown[]) : [];
    const clarifyingQuestions = rawQuestions
      .map(q => String(q).trim())
      .filter(q => q.length > 0)
      .filter(q => !isAlreadyAnsweredQuestion(q, askedQuestionKeys, askedQuestionTokens))
      .filter(q => !isPhotoRequest(q))
      .slice(0, 2);

    // Append any truly-new questions to the history log so future grades won't re-ask.
    const nowIso = new Date().toISOString();
    const newHistoryEntries: HistoryEntry[] = clarifyingQuestions.map(q => ({
      question: q,
      answer: null,
      asked_at: nowIso,
      answered_at: null,
      updated_at: null,
      skipped_at: null,
    }));
    const updatedHistory = [...existingHistory, ...newHistoryEntries];


    const guidanceRaw = (ai.improvement_guidance && typeof ai.improvement_guidance === "object")
      ? ai.improvement_guidance as Record<string, unknown>
      : {};
    const guidance: Record<string, string> = {};
    for (const k of Object.keys(DIM_LABELS)) {
      const v = guidanceRaw[k];
      if (typeof v === "string" && v.trim()) guidance[k] = v.trim();
    }

    const aiScores: AiScores = {
      title_quality: ai_title,
      description_alignment: ai_desc,
      tags_relevance: ai_tags,
      materials_completeness: ai_materials,
      photo_quality: ai_photos,
      photo_coverage: ai_coverage,
      price_reasonableness: ai_price,
    };
    const deductions = buildDeductions(listing, rules, aiScores, guidance);

    const priceDirRaw = typeof ai.price_direction === "string" ? ai.price_direction : "fair";
    const priceDirection = (["fair", "too_low", "too_high"] as const).includes(priceDirRaw as "fair") ? priceDirRaw as "fair" | "too_low" | "too_high" : "fair";
    const priceReasoning = typeof ai.price_reasoning === "string" ? ai.price_reasoning.trim() : "";

    const aiIssues = Array.isArray(ai.top_issues) ? (ai.top_issues as unknown[]).map(s => String(s)) : [];
    const combinedIssues = [...deductions, ...aiIssues].slice(0, 12);

    const prioritized = Array.isArray(ai.prioritized_recommendations)
      ? (ai.prioritized_recommendations as unknown[]).map(s => String(s).trim()).filter(Boolean).slice(0, 6)
      : [];
    // Fallback: if AI returned none, synthesize from deductions.
    const recommendations = prioritized.length > 0 ? prioritized : deductions.slice(0, 6);

    const suggestedActions = Array.isArray(ai.suggested_actions)
      ? (ai.suggested_actions as unknown[])
          .map(s => (s && typeof s === "object") ? s as Record<string, unknown> : null)
          .filter((s): s is Record<string, unknown> => !!s)
          .map(s => ({
            action: String(s.action ?? "").trim(),
            reason: String(s.reason ?? "").trim(),
          }))
          .filter(s => s.action.length > 0)
          .slice(0, 4)
      : [];

    const breakdown = {
      overall,
      grade,
      rules,
      ai: {
        ...aiScores,
        price_direction: priceDirection,
        price_reasoning: priceReasoning,
        improvement_guidance: guidance,
        top_issues: combinedIssues,
        quick_win: ai.quick_win ?? "",
        prioritized_recommendations: recommendations,
        suggested_actions: suggestedActions,
      },
      suggested_actions: suggestedActions,
      score_deductions: deductions,
      recommendations,
      summary: ai.summary ?? "",
      model: "google/gemini-2.5-flash",
      graded_at: new Date().toISOString(),
      personalization_used: !!personalizationPrompt,
      photos_analyzed: analyzedPhotos,
      photos_total: totalPhotos,
      photo_cap: photoCap,
      tier,
    };

    // A re-grade resets the decay (listing has been refreshed/examined).
    await supabase.from("listings").update({
      score: overall,
      grade,
      score_breakdown: breakdown,
      last_graded: new Date().toISOString(),
      clarifying_questions: clarifyingQuestions.length > 0 ? clarifyingQuestions : null,
      clarifying_history: updatedHistory,

      decay_points: 0,
      decay_started_at: null,
      needs_attention: false,
    }).eq("id", listing_id).eq("user_id", userId);

    // Stamp the latest grade onto every approved optimization for this listing
    // so the History tab can show how the listing has evolved post-acceptance.
    await supabase.from("optimizations").update({
      latest_grade: overall,
      latest_grade_at: new Date().toISOString(),
    }).eq("listing_id", listing_id).eq("user_id", userId).eq("status", "approved");

    return json(breakdown);
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

function buildPersonalizationPrompt(p?: Record<string, unknown> | null): string {
  if (!p || typeof p !== "object") return "";
  const desc = typeof p.store_description === "string" ? p.store_description.trim() : "";
  if (!desc) return "";
  const lines: string[] = [
    "SHOP CONTEXT (always keep this in mind when grading):",
    `Store description: ${desc}`,
  ];
  const push = (label: string, val: unknown) => {
    if (typeof val === "string" && val.trim()) lines.push(`${label}: ${val.trim()}`);
  };
  const pushArr = (label: string, val: unknown) => {
    if (Array.isArray(val) && val.length) lines.push(`${label}: ${val.join(", ")}`);
  };
  push("Primary product categories", p.product_categories);
  push("Era focus (only reference when verified)", p.era_focus);
  push("Target audience", p.target_audience);
  push("Brand voice", p.brand_voice);
  push("Tone", p.tone);
  push("Price positioning", p.price_positioning);
  push("What makes this shop unique", p.unique_selling_points);
  pushArr("Preferred keywords/phrases", p.style_keywords);
  if (Array.isArray(p.avoid_keywords) && p.avoid_keywords.length) {
    lines.push(`Penalize use of: ${p.avoid_keywords.join(", ")}`);
  }
  push("Claims/topics to avoid", p.avoid_claims);
  push("Emoji usage", p.emoji_usage);
  push("Description style", p.description_style);
  if (typeof p.shop_values === "string" && p.shop_values.trim()) {
    lines.push(`Shop values — weave the matching phrasing naturally when applicable:\n${p.shop_values.trim()}`);
  }
  return lines.join("\n");
}

const GENERIC_ETSY_CONTEXT = [
  "SHOP CONTEXT (default — seller hasn't fully personalized yet):",
  "Treat this as a small Etsy shop (handmade, vintage, digital, or supplies). Stay neutral until told otherwise.",
  "Voice: warm, friendly, specific. Avoid corporate or salesy language.",
  "Follow Etsy's title/tag/material/photo conventions.",
  "NEVER invent measurements, materials, era, provenance, designer, or maker claims.",
  "When the seller fills out Personalize AI, this context tightens automatically.",
].join("\n");

/**
 * Resolve the SHOP CONTEXT prefix using this precedence:
 *   1. store_personalization.custom_prompt_override (admin-set, e.g. filesca3)
 *   2. answers from request body (legacy / mid-migration)
 *   3. answers from store_personalization.answers in DB
 *   4. generic Etsy fallback
 */
async function resolveShopContext(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  personalizationFromBody?: Record<string, unknown> | null,
  etsyShopId?: string | null,
): Promise<{ prefix: string; usedCustomContext: boolean }> {
  // Resolve the active shop: prefer what the client sent; fall back to the
  // user's most recently connected shop so single-shop users keep working
  // even if the client didn't include etsy_shop_id in the body.
  let shopId = etsyShopId?.toString().trim() || null;
  if (!shopId) {
    const { data: store } = await supabase
      .from("stores")
      .select("etsy_shop_id")
      .eq("user_id", userId)
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    shopId = (store as { etsy_shop_id?: string } | null)?.etsy_shop_id ?? null;
  }

  let row: { custom_prompt_override?: string | null; answers?: unknown } | null = null;
  if (shopId) {
    const { data } = await supabase
      .from("store_personalization")
      .select("custom_prompt_override, answers")
      .eq("user_id", userId)
      .eq("etsy_shop_id", shopId)
      .maybeSingle();
    row = data;
  }

  if (row?.custom_prompt_override && String(row.custom_prompt_override).trim()) {
    return { prefix: String(row.custom_prompt_override).trim(), usedCustomContext: true };
  }
  const bodyPrompt = buildPersonalizationPrompt(personalizationFromBody);
  if (bodyPrompt) return { prefix: bodyPrompt, usedCustomContext: true };

  const dbPrompt = buildPersonalizationPrompt(row?.answers as Record<string, unknown> | null);
  if (dbPrompt) return { prefix: dbPrompt, usedCustomContext: true };

  return { prefix: GENERIC_ETSY_CONTEXT, usedCustomContext: false };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Personal Workspace branch — ad-hoc grading of any URL or pasted listing.
// URLs are resolved through the Etsy public API using RadarIQ's own
// server-side Etsy app credentials. We NEVER scrape the listing page directly.
// Writes to grade_runs + grade_dimension_scores. NEVER touches `listings`,
// `optimizations`, `monthly_usage`, or the shop quota RPC.
// ---------------------------------------------------------------------------

// Common RadarIQ seller categories. Unknown taxonomy IDs fall back to 'General'.
const ETSY_TAXONOMY: Record<number, string> = {
  // Jewelry
  68: 'Jewelry',
  69: 'Rings',
  70: 'Necklaces',
  71: 'Bracelets',
  72: 'Earrings',
  73: 'Brooches & Pins',
  74: 'Body Jewelry',
  75: 'Jewelry Sets',
  // Clothing
  891: 'Clothing',
  892: 'Tops & Tees',
  893: 'Dresses',
  894: 'Sweaters',
  // Accessories
  1: 'Accessories',
  // Home & Living
  68887597: 'Home & Living',
  68887598: 'Home Decor',
  // Craft Supplies
  10: 'Craft Supplies',
  // Art
  11: 'Art & Collectibles',
};

function extractEtsyListingId(url: string): string | null {
  const match = url.match(/etsy\.com\/listing\/(\d+)/);
  return match ? match[1] : null;
}

type PersonalListingData = {
  source: 'etsy_api' | 'manual';
  listing_id: string | null;
  url: string | null;
  title: string;
  description: string;
  tags: string[];
  materials: string[];
  image_count: number;
  primary_image_url: string | null;
  price: string | null;
  views: number | null;
  favorites: number | null;
  is_digital: boolean;
  taxonomy_id: number | null;
  category: string;
};

async function fetchEtsyListing(
  listingId: string,
  apiKeyHeader: string,
): Promise<{ ok: true; listing: Record<string, unknown>; images: Array<Record<string, unknown>> } | { ok: false; status: number; message: string }> {
  const headers = { 'x-api-key': apiKeyHeader };
  const base = 'https://openapi.etsy.com/v3/application/listings';
  const [listingRes, imagesRes] = await Promise.all([
    fetch(`${base}/${listingId}`, { headers }),
    fetch(`${base}/${listingId}/images`, { headers }),
  ]);

  const worstStatus = !listingRes.ok ? listingRes.status : (!imagesRes.ok ? imagesRes.status : 200);
  if (worstStatus !== 200) {
    if (worstStatus === 404) {
      return { ok: false, status: 404, message: "This listing wasn't found. It may be sold out, deactivated, or the URL may be incorrect." };
    }
    if (worstStatus === 401 || worstStatus === 403) {
      return { ok: false, status: worstStatus, message: "Couldn't access this listing. Make sure it's a public active listing." };
    }
    return { ok: false, status: worstStatus, message: "Something went wrong fetching this listing. Try again in a moment." };
  }

  const listingJson = await listingRes.json();
  const imagesJson = await imagesRes.json();
  const images = Array.isArray(imagesJson?.results) ? imagesJson.results as Array<Record<string, unknown>> : [];
  return { ok: true, listing: listingJson as Record<string, unknown>, images };
}

function mapEtsyListing(
  listingId: string,
  url: string,
  listing: Record<string, unknown>,
  images: Array<Record<string, unknown>>,
): PersonalListingData {
  const price = listing.price as { amount?: number; divisor?: number; currency_code?: string } | undefined;
  const taxonomyId = typeof listing.taxonomy_id === 'number' ? listing.taxonomy_id : null;
  return {
    source: 'etsy_api',
    listing_id: listingId,
    url,
    title: String(listing.title ?? ''),
    description: String(listing.description ?? ''),
    tags: Array.isArray(listing.tags) ? (listing.tags as unknown[]).map(t => String(t)) : [],
    materials: Array.isArray(listing.materials) ? (listing.materials as unknown[]).map(m => String(m)) : [],
    image_count: images.length,
    primary_image_url: (images[0]?.url_fullxfull as string | undefined) ?? null,
    price: price?.amount != null && price.divisor
      ? `${(price.amount / price.divisor).toFixed(2)} ${price.currency_code ?? ''}`.trim()
      : null,
    views: typeof listing.views === 'number' ? listing.views : null,
    favorites: typeof listing.num_favorers === 'number' ? listing.num_favorers : null,
    is_digital: Boolean(listing.is_digital ?? false),
    taxonomy_id: taxonomyId,
    category: (taxonomyId != null && ETSY_TAXONOMY[taxonomyId]) || 'General',
  };
}

function buildPersonalSystemPrompt(): string {
  return `You are a senior Etsy listing analyst with deep knowledge of Etsy search (SEO), buyer psychology, and conversion optimization. You are reviewing a listing on behalf of a RadarIQ user who wants an honest, expert assessment.

Your job is NOT to produce a checklist of fixes. Your job is to give the user a clear picture of where this listing stands, what is genuinely working, what is holding it back, and what the highest-leverage move would be to improve it.

You score five dimensions on a 0-100 scale:
- Title: keyword clarity, search intent match, character usage, specificity
- Tags: count, relevance, long-tail coverage, redundancy with title
- Images: count relative to Etsy's 10-slot maximum, variety (product, lifestyle, detail, scale), first-image strength
- Description: hook strength, detail depth, materials/dimensions mentioned, buyer questions answered, formatting readability
- Materials: completeness, specificity, accuracy relative to title and description

Scoring calibration:
90-100: Best in class. Hard to improve meaningfully.
75-89: Strong. Minor gaps but competitive.
60-74: Decent foundation with clear gaps dragging performance.
45-59: Significant weaknesses affecting search or conversion.
0-44: Fundamental issues that need to be addressed before other optimizations matter.

Hard caps:
- If tags array is empty, tags score is automatically capped at 20.
- If image_count is 0 or 1, images score is automatically capped at 15.
- If image_count is 2-3, images score is capped at 45.
- If description is under 100 characters, description score is automatically capped at 25.
- If is_digital is true, REMOVE the images dimension from scoring entirely and redistribute its weight equally across the other four dimensions.

Overall score = weighted average (when not digital):
- Title: 25%
- Tags: 25%
- Images: 20%
- Description: 20%
- Materials: 10%

Letter grade mapping:
90-100: A+ | 85-89: A | 80-84: A- | 75-79: B+ | 70-74: B | 65-69: B-
60-64: C+ | 55-59: C | 50-54: C- | 45-49: D+ | 40-44: D | 35-39: D- | 0-34: F

Tone rules (strictly enforced):
- what_is_working items start with the specific element, not "The listing"
- what_needs_attention items never open with a verb command
- priority_action explains the why before the what
- verdict and detail fields read like an expert talking to a peer, not a teacher marking homework
- Never use the phrases: "you should", "make sure to", "don't forget", "it is important to", "consider adding"

Return JSON only — no markdown, no preamble.`;
}

function buildPersonalUserPrompt(d: PersonalListingData): string {
  return `Review this Etsy listing and return a JSON object only. No markdown, no preamble, no explanation outside the JSON.

Listing data:
Title: ${d.title}
Description: ${d.description || 'Not provided'}
Tags: ${d.tags.length > 0 ? d.tags.join(', ') : 'None'}
Materials: ${d.materials.length > 0 ? d.materials.join(', ') : 'None provided'}
Image count: ${d.image_count}
Price: ${d.price ?? 'Unknown'}
Category: ${d.category}
Is digital product: ${d.is_digital}
${d.views != null ? `Views: ${d.views}` : ''}
${d.favorites != null ? `Favorites: ${d.favorites}` : ''}

Return exactly this JSON shape:
{
  "overall_score": <0-100 integer>,
  "letter_grade": "<A+|A|A-|B+|B|B-|C+|C|C-|D+|D|D-|F>",
  "headline": "<one sentence summary of where this listing stands>",
  "dimensions": {
    "title":       { "score": <0-100>, "verdict": "<short>", "detail": "<1-3 sentences>" },
    "tags":        { "score": <0-100>, "verdict": "<short>", "detail": "<1-3 sentences>" },
    "images":      { "score": <0-100>, "verdict": "<short>", "detail": "<1-3 sentences>" },
    "description": { "score": <0-100>, "verdict": "<short>", "detail": "<1-3 sentences>" },
    "materials":   { "score": <0-100>, "verdict": "<short>", "detail": "<1-3 sentences>" }
  },
  "what_is_working": ["<insight>", "<insight>"],
  "what_needs_attention": ["<insight>", "<insight>"],
  "priority_action": "<the single highest-impact move, explaining the why before the what>",
  "competitive_context": "<short context vs typical ${d.category} listings, or null>"
}`;
}

async function handlePersonalGrade(
  _req: Request,
  body: Record<string, unknown>,
  userId: string,
  SUPABASE_URL: string,
  SERVICE_KEY: string,
  LOVABLE_KEY: string,
): Promise<Response> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const SERVER_MODEL_VERSION = Deno.env.get("MODEL_VERSION") ?? "v1.0";
  const clientModelVersion = typeof body.model_version === "string" && body.model_version.trim()
    ? String(body.model_version).trim()
    : null;
  const modelVersion = clientModelVersion ?? SERVER_MODEL_VERSION;

  const listingUrl = typeof body.listing_url === "string" ? body.listing_url.trim() : null;
  const inline = (body.listing && typeof body.listing === "object") ? body.listing as Record<string, unknown> : null;

  let listingData: PersonalListingData | null = null;
  let rawListingData: Record<string, unknown> | null = null;

  if (listingUrl) {
    const listingId = extractEtsyListingId(listingUrl);
    if (!listingId) {
      return json({ error: "That doesn't look like a valid Etsy listing URL. Paste the full URL from your browser address bar." }, 400);
    }

    // RadarIQ-owned Etsy app credentials from server secrets.
    const etsyKey = String(Deno.env.get("ETSY_API_KEY") ?? "").trim();
    const etsySecret = String(Deno.env.get("ETSY_SHARED_SECRET") ?? "").trim();
    if (!etsyKey || !etsySecret) {
      return json({ error: "Etsy API key not configured on the server." }, 500);
    }
    void userId;
    const apiKeyHeader = `${etsyKey}:${etsySecret}`;

    const result = await fetchEtsyListing(listingId, apiKeyHeader);
    if (!result.ok) return json({ error: result.message }, result.status === 404 ? 404 : 400);

    listingData = mapEtsyListing(listingId, listingUrl, result.listing, result.images);
    rawListingData = { listing: result.listing, images: result.images };
  } else if (inline) {
    listingData = {
      source: 'manual',
      listing_id: null,
      url: null,
      title: String(inline.title ?? ''),
      description: String(inline.description ?? ''),
      tags: Array.isArray(inline.tags) ? (inline.tags as unknown[]).map(t => String(t)) : [],
      materials: Array.isArray(inline.materials) ? (inline.materials as unknown[]).map(m => String(m)) : [],
      image_count: Array.isArray(inline.image_urls) ? (inline.image_urls as unknown[]).length : 0,
      primary_image_url: null,
      price: null,
      views: null,
      favorites: null,
      is_digital: false,
      taxonomy_id: null,
      category: 'General',
    };
  } else {
    return json({ error: "Provide either listing_url or listing payload" }, 400);
  }

  if (!listingData.title.trim()) {
    return json({ error: "Add at least a title to grade." }, 400);
  }

  // Daily quota gate — only after we have a usable listing so failed lookups
  // don't burn a daily slot.
  const { data: gate, error: gateErr } = await supabase.rpc("consume_personal_quota", {
    _user_id: userId, _kind: "grade",
  });
  if (gateErr) return json({ error: gateErr.message }, 500);
  if (!gate?.allowed) {
    return json({
      error: "grade_limit_reached",
      upgrade_required: true,
      used: gate?.used,
      limit: gate?.limit,
      tier: gate?.tier,
    }, 429);
  }
  const planTier = String(gate?.tier ?? "free");

  // Balanced, insight-led grading.
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: buildPersonalSystemPrompt() },
        { role: "user", content: buildPersonalUserPrompt(listingData) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!aiRes.ok) return json({ error: `AI gateway ${aiRes.status}` }, 502);
  const aiJson = await aiRes.json();
  const rawContent = aiJson?.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(rawContent); } catch { /* ignore */ }

  const overall = Math.max(0, Math.min(100, Math.round(Number(parsed.overall_score) || 0)));
  const letter = typeof parsed.letter_grade === 'string' ? parsed.letter_grade : letterGrade(overall);
  const dims = (parsed.dimensions ?? {}) as Record<string, { score?: unknown }>;
  const dimScore = (k: string) => Math.max(0, Math.min(100, Math.round(Number(dims[k]?.score) || 0)));

  // Persist
  const { data: runRow, error: runErr } = await supabase
    .from("grade_runs")
    .insert({
      user_id: userId,
      listing_url: listingData.url,
      usage_type: "personal",
      category: listingData.category,
      plan_tier: planTier,
      model_version: modelVersion,
      overall_score: overall,
      is_own_listing: false,
      input_title: listingData.title,
      input_description: listingData.description,
      input_tags: listingData.tags,
      result: parsed,
      etsy_listing_id: listingData.listing_id,
      listing_views: listingData.views,
      listing_favorites: listingData.favorites,
      listing_price_string: listingData.price,
      is_digital: listingData.is_digital,
      data_source: listingData.source,
      raw_listing_data: rawListingData,
    })
    .select()
    .single();
  if (runErr) return json({ error: `Could not save grade: ${runErr.message}` }, 500);

  const dimRows = [
    { dimension: "title", score: dimScore('title') },
    { dimension: "description", score: dimScore('description') },
    { dimension: "tags", score: dimScore('tags') },
    { dimension: "images", score: dimScore('images') },
    { dimension: "materials", score: dimScore('materials') },
  ].map(d => ({ grade_run_id: runRow.id, dimension: d.dimension, score: d.score, flags: {}, suggestions_shown: [] }));
  await supabase.from("grade_dimension_scores").insert(dimRows);

  return json({
    grade_run_id: runRow.id,
    overall_score: overall,
    letter_grade: letter,
    headline: parsed.headline ?? null,
    dimensions: parsed.dimensions ?? {},
    what_is_working: parsed.what_is_working ?? [],
    what_needs_attention: parsed.what_needs_attention ?? [],
    priority_action: parsed.priority_action ?? null,
    competitive_context: parsed.competitive_context ?? null,
    listing: {
      source: listingData.source,
      listing_id: listingData.listing_id,
      primary_image_url: listingData.primary_image_url,
      price: listingData.price,
      category: listingData.category,
      is_digital: listingData.is_digital,
      views: listingData.views,
      favorites: listingData.favorites,
    },
    quota: { used: gate?.used, limit: gate?.limit, tier: planTier },
    model_version: modelVersion,
  });
}

async function extractFromUrl(url: string): Promise<{ title: string; description: string; image_urls: string[] }> {
  try {
    const res = await fetch(url, {
      headers: {
        // Realistic browser UA — Etsy returns 403 to most non-browser agents.
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
      redirect: "follow",
    });
    if (!res.ok) return { title: "", description: "", image_urls: [] };
    const html = await res.text();
    const og = (prop: string) => {
      const re = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
      const m = html.match(re);
      return m ? decodeEntities(m[1]) : "";
    };
    const metaName = (name: string) => {
      const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
      const m = html.match(re);
      return m ? decodeEntities(m[1]) : "";
    };

    let title = og("og:title") || decodeEntities(html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "");
    let description = og("og:description") || metaName("description") || "";
    const imageMatches = [...html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi)];
    let image_urls = imageMatches.map(m => decodeEntities(m[1])).slice(0, 10);

    // JSON-LD fallback (Etsy embeds Product schema).
    if (!title || !description || image_urls.length === 0) {
      const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      for (const m of ldMatches) {
        try {
          const ld = JSON.parse(m[1].trim());
          const items = Array.isArray(ld) ? ld : [ld];
          for (const item of items) {
            if (item && (item["@type"] === "Product" || item["@type"] === "Listing")) {
              if (!title && typeof item.name === "string") title = item.name;
              if (!description && typeof item.description === "string") description = item.description;
              if (image_urls.length === 0 && item.image) {
                image_urls = (Array.isArray(item.image) ? item.image : [item.image])
                  .filter((v: unknown) => typeof v === "string").slice(0, 10);
              }
            }
          }
        } catch { /* ignore */ }
      }
    }

    return { title: title.trim(), description: description.trim(), image_urls };
  } catch {
    return { title: "", description: "", image_urls: [] };
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}


