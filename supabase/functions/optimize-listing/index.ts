// Optimize an existing listing: AI-generated title/description/tags/materials, grounded in photos.
// Multimodal: photos go to the model (tier-gated cap). Reads any stored
// clarifying_answers off the listing so the rewrite uses them as extra context.
// Required env: LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { findPlaceholders, NO_PLACEHOLDER_PROMPT_RULES } from "../_shared/placeholders.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FREE_LIMIT = 5;
const FREE_PHOTO_CAP = 5;
const PAID_PHOTO_CAP = 10;

const SHOP_VALUES_FRAMING_GUARDRAIL = `IMPORTANT FRAMING for the Shop values block above: These phrases describe the SHOP'S general practice and brand identity — they are NOT verified facts about this specific item's individual history, materials, provenance, or sourcing. Use a shop-values phrase only when THIS item's verified details support it, and frame general values as collection/shop practice rather than item-specific biography.

Explicit shop-value checks:
- recycled / "sustainably sourced from estate sales and carefully curated": Do NOT write that THIS item came from an estate sale, was sustainably sourced, or was carefully curated unless the seller's own listing/answer says that for this specific item. If used, frame only as shop-wide practice, e.g. "part of our curated vintage collection" — never as individual provenance.
- aesthetic / "carefully selected for its unique beauty and charm": Do NOT state that THIS item was carefully selected unless the seller says so for this specific item. Prefer describing visible design details instead. If unsupported, omit this value-phrase entirely.
- vintage / "each piece carries its own story and history": Use only as broad vintage/collection framing. Do NOT invent a specific story, age, past owner, origin, designer, or history for THIS item. If no verified history exists, say nothing beyond visible vintage character or seller-provided facts.
- earth / "celebrating natural materials and sustainable fashion": Only use "natural materials" language if the item's actual materials are natural as stated by the seller or verified in photos. If materials are unverified, empty, synthetic, plastic, faux, mixed, or unclear, omit this value-phrase for this item rather than using it generically.

Before finalizing THE STORY section, verify every shop-values phrase used is consistent with this item's verified materials/details elsewhere in your own output (DETAILS, materials, condition). If a shop-values phrase contradicts or is unsupported by those sections, remove it.`;

const MULTI_COMPONENT_SYSTEM_RULES = `MULTI-COMPONENT DETECTION STEP — run this before drafting title, description, tags, or materials:
- First, examine ALL provided photos and identify each DISTINCT physical component visible (for example: chain, pendant 1, pendant 2, charm, clasp). For each component, note its visible shape, color, and material if verified.
- Then, for each noun phrase in the seller's original title and description (for example: "leaf," "acorn," "pearl," "rock charm"), determine which SINGLE distinct component it most plausibly refers to.
- A multi-pendant or multi-component listing has MULTIPLE distinct components. Do NOT collapse two separate components into one combined description unless the photos show they are physically attached as one unit.
- Treat the seller's original component words as ground truth when plausible. If a word can plausibly refer to a visible component, preserve that mapping rather than replacing it with a new invented identification.

LOW-CONFIDENCE COMPONENT MAPPING:
- If a description term cannot be confidently mapped to a SINGLE distinct component, do NOT guess, rename, or merge components.
- Instead, return clarifying_question with the specific ambiguity, e.g. "Your listing describes a leaf and acorn pendant, but the photos show two separate charms — an oval stone pendant and a gold flower-shaped charm with a bead drop. Which one is the acorn?"
- Use the seller's original wording for that detail in this draft until the question is answered.

PERSISTED COMPONENT MAPPING:
- If a previously confirmed component mapping is provided in the user message, use it exactly. Do not re-derive or change it unless the seller's listing text or photos have changed materially.
- If this is a multi-component listing and you can confidently map the seller's nouns to distinct visible components, return component_mapping as structured JSON so future runs can reuse it.`;

function ruleScoreTotal(o: { title?: string; description?: string; tags?: string[]; materials?: string[]; photo_count?: number; image_urls?: string[]; video_count?: number }) {
  const title = String(o.title ?? "");
  const description = String(o.description ?? "");
  const tags = o.tags ?? [];
  const materials = o.materials ?? [];
  const photoCount = Number(o.photo_count ?? o.image_urls?.length ?? 0);
  const videoCount = Number(o.video_count ?? 0);
  const titleLen = title.length;
  const titleRule = titleLen >= 100 && titleLen <= 140 ? 10 : titleLen >= 70 ? 7 : titleLen >= 40 ? 4 : 1;
  const tagsRule = tags.length >= 13 ? 10 : Math.round((tags.length / 13) * 10);
  const photoRule = photoCount >= 10 ? 15 : photoCount >= 5 ? 10 : photoCount >= 1 ? 5 : 0;
  const descRule = description.length >= 600 ? 10 : description.length >= 200 ? 6 : description.length >= 50 ? 3 : 0;
  const matRule = materials.length >= 3 ? 8 : materials.length >= 1 ? 4 : 0;
  const videoRule = videoCount > 0 ? 7 : 0;
  return titleRule + tagsRule + photoRule + descRule + matRule + videoRule;
}

export function validateEtsy(opt: { title?: string; description?: string; tags?: string[]; materials?: string[] }) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!opt.title || opt.title.length === 0) errors.push("Title is required.");
  if (opt.title && opt.title.length > 140) errors.push(`Title is ${opt.title.length} chars (Etsy max 140).`);
  if (opt.title && opt.title.length < 20) warnings.push("Title is shorter than 20 chars.");
  if (!opt.description || opt.description.trim().length === 0) errors.push("Description is required.");
  if (opt.tags) {
    if (opt.tags.length > 13) errors.push(`Too many tags: ${opt.tags.length} (Etsy max 13).`);
    opt.tags.forEach(t => {
      if (t.length > 20) errors.push(`Tag "${t}" exceeds 20 chars.`);
      if (/[^a-zA-Z0-9\s\-']/.test(t)) errors.push(`Tag "${t}" contains invalid characters.`);
    });
  }
  if (opt.materials && opt.materials.length > 13) errors.push(`Too many materials: ${opt.materials.length} (Etsy max 13).`);
  return { errors, warnings, valid: errors.length === 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

  let consumed: { userId: string } | null = null;
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
  const refundQuota = async (uid: string) => {
    const month = new Date().toISOString().slice(0, 7);
    const { data: row } = await adminClient.from("monthly_usage")
      .select("optimizations_used").eq("user_id", uid).eq("month", month).maybeSingle();
    const used = Number(row?.optimizations_used ?? 0);
    if (used > 0) {
      await adminClient.from("monthly_usage")
        .update({ optimizations_used: used - 1, updated_at: new Date().toISOString() })
        .eq("user_id", uid).eq("month", month);
    }
  };

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
    const {
      listing_id,
      personalization,
      etsy_shop_id,
      mode: rawMode,
      rewrite_instructions,
      market_context,
      phase,
      session_answers,
      skipped_questions,
    } = body as {
      listing_id?: string;
      personalization?: Record<string, unknown> | null;
      etsy_shop_id?: string | null;
      mode?: string;
      rewrite_instructions?: string | null;
      market_context?: {
        missing_tags?: string[];
        missing_tags_detail?: Array<{ tag: string; pct: number }>;
        niche_avg_price?: number | null;
        price_score?: number | null;
        tag_score?: number | null;
        listing_price?: number | null;
      } | null;
      /** "preflight" → return peer recs + up to 3 open clarifying questions
       *  without consuming an optimization credit. Anything else → normal
       *  generation flow (back-compat with all existing callers). */
      phase?: 'preflight' | 'generate';
      /** Seller-provided answers collected by the pre-flight modal, keyed by
       *  question text. Merged into listings.clarifying_answers + history
       *  before generation. */
      session_answers?: Record<string, string> | null;
      /** Questions the seller dismissed in the pre-flight modal. Stamped
       *  with surfaced_in_optimization_at so they won't re-prompt for 7 days. */
      skipped_questions?: string[] | null;
    };

    const mode: 'shop' | 'personal' = rawMode === 'personal' ? 'personal' : 'shop';

    if (mode === 'personal') {
      return await handlePersonalOptimize(body as Record<string, unknown>, userId, SUPABASE_URL, SERVICE_KEY, LOVABLE_KEY!);
    }

    if (!listing_id) return json({ error: "Missing listing_id" }, 400);

    const supabase = adminClient;

    // ─────────────────────────────────────────────────────────────────────────
    // PRE-FLIGHT PHASE
    // Returns peer recommendations (cached or freshly computed) + up to 3
    // open clarifying questions that haven't been surfaced in the last 7
    // days. Does NOT consume an optimization credit. Callers (the Optimize
    // button) use this to decide whether to show the questions modal before
    // calling back in with phase: 'generate'.
    // ─────────────────────────────────────────────────────────────────────────
    if (phase === 'preflight') {
      const { data: l, error: lErr } = await supabase
        .from("listings")
        .select("id, user_id, clarifying_questions, clarifying_answers, clarifying_history")
        .eq("id", listing_id).eq("user_id", userId).maybeSingle();
      if (lErr || !l) return json({ error: "Listing not found" }, 404);

      // Peer recs — prefer fresh cache, otherwise call recommend-improvements
      // so the cache is warm by the time the user clicks through.
      let peer: {
        recommendations?: unknown[];
        peer_count?: number;
        top_peer_count?: number;
        tag_gaps?: unknown[];
        material_gaps?: unknown[];
      } | null = null;
      const { data: cache } = await supabase.from("peer_rec_cache")
        .select("recommendations, peer_count, top_peer_count, tag_gaps, material_gaps, expires_at")
        .eq("listing_id", listing_id).eq("user_id", userId).maybeSingle();
      if (cache && new Date(cache.expires_at as string).getTime() > Date.now()) {
        peer = cache as unknown as NonNullable<typeof peer>;
      } else {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/recommend-improvements`, {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
              apikey: Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY,
            },
            body: JSON.stringify({ listing_id }),
          });
          if (r.ok) peer = await r.json();
        } catch (e) {
          console.warn("preflight peer fetch failed:", e);
        }
      }

      const pendingQs: string[] = Array.isArray(l.clarifying_questions)
        ? (l.clarifying_questions as string[]) : [];
      const answersMap = (l.clarifying_answers as Record<string, string> | null) ?? {};
      const history = Array.isArray(l.clarifying_history)
        ? (l.clarifying_history as Array<Record<string, unknown>>) : [];
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const open = pendingQs.filter(q => {
        if ((answersMap[q] ?? "").trim()) return false;
        const h = history.find((x) => x.question === q);
        const surfaced = h?.surfaced_in_optimization_at
          ? new Date(h.surfaced_in_optimization_at as string).getTime() : 0;
        return surfaced < sevenDaysAgo;
      }).slice(0, 3);

      return json({
        phase: "preflight",
        peer_recommendations: peer?.recommendations ?? [],
        peer_count: peer?.peer_count ?? 0,
        top_peer_count: peer?.top_peer_count ?? 0,
        tag_gaps: peer?.tag_gaps ?? [],
        material_gaps: peer?.material_gaps ?? [],
        open_questions: open.map(q => ({ question: q })),
      });
    }



    const { data: gate, error: gateErr } = await supabase.rpc("consume_optimization", {
      _user_id: userId, _free_limit: FREE_LIMIT,
    });
    if (gateErr) return json({ error: gateErr.message }, 500);
    if (!gate?.allowed) {
      return json({ error: "limit_reached", upgrade_required: true, used: gate?.used, limit: gate?.limit }, 402);
    }
    consumed = { userId };

    const refund = async () => { await refundQuota(userId); consumed = null; };


    const { data: profile } = await supabase
      .from("user_profiles").select("tier").eq("id", userId).maybeSingle();
    const tier = (profile?.tier as string | undefined) ?? "free";
    const photoCap = tier === "free" ? FREE_PHOTO_CAP : PAID_PHOTO_CAP;

    let { data: listing } = await supabase
      .from("listings").select("*").eq("id", listing_id).eq("user_id", userId).maybeSingle();
    if (!listing) { await refund(); return json({ error: "Listing not found" }, 404); }

    // If the listing has never been graded, run a grade pass first so the
    // user still gets the before/after insight even if they jumped straight
    // to Optimize. Best-effort — failures don't block the optimization.
    if (listing.score == null) {
      try {
        const gradeRes = await fetch(`${SUPABASE_URL}/functions/v1/grade-listing`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            apikey: Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY,
          },
          body: JSON.stringify({ listing_id }),
        });
        if (gradeRes.ok) {
          const refetched = await supabase
            .from("listings").select("*").eq("id", listing_id).eq("user_id", userId).maybeSingle();
          if (refetched.data) listing = refetched.data;
        } else {
          console.warn(`pre-optimize grade failed: ${gradeRes.status}`);
        }
      } catch (e) {
        console.warn("pre-optimize grade error:", e);
      }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // Pre-flight session answers / skips
    // If the caller (Optimize button) collected answers in the lightweight
    // modal before invoking us, merge them into clarifying_answers + history
    // so they're treated like any other seller answer. Skipped questions are
    // stamped with surfaced_in_optimization_at so they won't re-prompt for 7
    // days (matching the preflight filter).
    // ─────────────────────────────────────────────────────────────────────────
    const incomingAnswers = (session_answers && typeof session_answers === 'object') ? session_answers : null;
    const incomingSkips = Array.isArray(skipped_questions) ? skipped_questions.filter(s => typeof s === 'string') : [];
    if ((incomingAnswers && Object.keys(incomingAnswers).length) || incomingSkips.length) {
      const nowIso = new Date().toISOString();
      const existingAnswers = (listing.clarifying_answers as Record<string, string> | null) ?? {};
      const existingHistory = Array.isArray(listing.clarifying_history)
        ? (listing.clarifying_history as Array<Record<string, unknown>>) : [];
      const nextAnswers: Record<string, string> = { ...existingAnswers };
      if (incomingAnswers) {
        for (const [q, a] of Object.entries(incomingAnswers)) {
          const v = String(a ?? "").trim();
          if (v) nextAnswers[q] = v;
        }
      }
      const touched = new Set<string>([
        ...Object.keys(incomingAnswers ?? {}),
        ...incomingSkips,
      ]);
      const nextHistory = existingHistory.map(h => {
        const q = String(h.question ?? "");
        if (!touched.has(q)) return h;
        const answered = (incomingAnswers && (incomingAnswers[q] ?? "").trim())
          ? { answer: (incomingAnswers[q] ?? "").trim(), answered_at: h.answered_at ?? nowIso, updated_at: nowIso }
          : {};
        return { ...h, ...answered, surfaced_in_optimization_at: nowIso };
      });
      for (const q of touched) {
        if (!nextHistory.some(h => h.question === q)) {
          const isAnswered = !!(incomingAnswers && (incomingAnswers[q] ?? "").trim());
          nextHistory.push({
            question: q,
            answer: isAnswered ? (incomingAnswers![q] ?? "").trim() : null,
            asked_at: nowIso,
            answered_at: isAnswered ? nowIso : null,
            updated_at: nowIso,
            surfaced_in_optimization_at: nowIso,
          });
        }
      }
      const { error: updErr } = await supabase
        .from("listings")
        .update({
          clarifying_answers: nextAnswers,
          clarifying_history: nextHistory as never,
        })
        .eq("id", listing_id)
        .eq("user_id", userId);
      if (updErr) console.warn("preflight session-answer merge failed:", updErr.message);
      else listing = { ...listing, clarifying_answers: nextAnswers, clarifying_history: nextHistory };
    }

    // Pull seller-provided clarifying answers from the listing so the AI can
    // use them when rewriting. These now include any answers collected in the
    // pre-flight modal during this Optimize click.
    const answers = (listing.clarifying_answers as Record<string, string> | null) ?? null;
    const answersBlock = answers && Object.keys(answers).length
      ? "\n\nSeller answers to the AI's clarifying questions — treat as authoritative FACTS, but ONLY incorporate an answer if it materially improves the listing (adds a verifiable detail, resolves ambiguity, or strengthens SEO). If an answer doesn't help, ignore it rather than padding the description with it:\n" +
        Object.entries(answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n")
      : "";

    // Pull a small sample of the seller's other listings so the AI mimics
    // their real voice instead of defaulting to generic "AI-sounding" copy.
    // Voice cues are reference-only — never copy phrasing wholesale or carry
    // over facts from the sample to this item.
    let voiceSampleBlock = "";
    try {
      const { data: voiceSamples } = await supabase
        .from("listings")
        .select("title, description")
        .eq("user_id", userId)
        .eq("state", "active")
        .neq("id", listing_id)
        .not("description", "is", null)
        .order("updated_at", { ascending: false })
        .limit(5);
      const samples = (voiceSamples ?? [])
        .filter((s) => typeof s.description === "string" && s.description.trim().length > 80)
        .slice(0, 4);
      if (samples.length) {
        voiceSampleBlock = "\n\nSELLER VOICE SAMPLE — these are the seller's own existing listings. Match their tone, sentence rhythm, and vocabulary so the rewrite sounds like the same human wrote it. DO NOT copy phrases verbatim, and DO NOT pull facts (materials, era, measurements, brand) from these samples — they're about DIFFERENT items. Voice cues only:\n" +
          samples.map((s, i) => `--- Sample ${i + 1} ---\nTitle: ${String(s.title ?? "").slice(0, 140)}\nDescription excerpt: ${String(s.description ?? "").slice(0, 500)}`).join("\n\n");
      }
    } catch { /* non-fatal — voice sample is best-effort */ }

    // ─────────────────────────────────────────────────────────────────────────
    // Peer recommendations (from 7-day cache)
    // Attached to the generation context so the AI can decide which peer
    // suggestions are valid for THIS listing. Verdicts come back via the
    // peer_rec_verdicts field in the tool schema and get logged into
    // peer_rec_applications below.
    // ─────────────────────────────────────────────────────────────────────────
    type PeerRec = { category?: string; impact?: 'high'|'medium'|'low'; change?: string; evidence?: string };
    let peerRecs: PeerRec[] = [];
    try {
      const { data: cache } = await supabase.from("peer_rec_cache")
        .select("recommendations, expires_at")
        .eq("listing_id", listing_id).eq("user_id", userId).maybeSingle();
      if (cache && new Date(cache.expires_at as string).getTime() > Date.now()) {
        peerRecs = Array.isArray(cache.recommendations) ? (cache.recommendations as PeerRec[]) : [];
      }
    } catch (e) { console.warn("peer rec cache read failed:", e); }
    const peerBlock = peerRecs.length
      ? `\n\nPEER-DRIVEN RECOMMENDATIONS — patterns from this seller's own top-performing similar listings. Decide which apply to THIS item's actual attributes; do NOT force a recommendation that doesn't fit. For each one return a verdict in peer_rec_verdicts (status: applied | rejected | partial, plus a short reason).\n` +
        peerRecs.map((r, i) => `${i + 1}. [${r.impact ?? 'medium'} · ${r.category ?? 'general'}] ${r.change ?? ''} — evidence: ${r.evidence ?? ''}`).join("\n")
      : "";


    // ── Seller rewrite instructions (from "reject & re-optimize" flow) ─────────
    // These are hard constraints supplied by the seller after reviewing a draft
    // they rejected. They take full precedence over every other instruction and
    // must be applied to ALL fields: title, description, tags, AND materials.
    const rewriteBlock = rewrite_instructions?.trim()
      ? `\n\n⚠️ SELLER REWRITE INSTRUCTIONS — NON-NEGOTIABLE, APPLY TO ALL FIELDS ⚠️
The seller reviewed the previous optimization and provided these specific requirements.
You MUST follow every instruction below, even if they appear to conflict with general
SEO or copywriting advice. These are facts about the product that the previous AI got wrong.

${rewrite_instructions.trim()}

Apply these constraints throughout: title, description, tags, AND materials.
If an instruction says to remove a word or material, remove it from every field.
If an instruction says to avoid a topic, avoid it entirely — do not mention it once.
The previous version violated these requirements, which is why it was rejected.`
      : "";

    // Feedback loop: pull recent rejection reasons from this user so the AI
    // learns from past mistakes. Prefer rejections on this exact listing first.
    // Skip soft feedback when we have explicit rewrite_instructions (they supersede it).
    const { data: rejections } = await supabase
      .from("optimizations")
      .select("listing_id, reject_reason, rejected_at")
      .eq("user_id", userId)
      .eq("status", "rejected")
      .not("reject_reason", "is", null)
      .order("rejected_at", { ascending: false })
      .limit(20);
    const rejList = (rejections ?? []) as Array<{ listing_id: string; reject_reason: string | null }>;
    const thisListing = rejList
      .filter(r => r.listing_id === listing_id && !String(r.reject_reason ?? "").startsWith("rewrite_instructions:"))
      .slice(0, 5);
    const otherListings = rejList
      .filter(r => r.listing_id !== listing_id && !String(r.reject_reason ?? "").startsWith("rewrite_instructions:"))
      .slice(0, 5);
    const feedbackItems = rewriteBlock
      ? [] // suppress soft feedback when hard instructions are present — don't dilute
      : [...thisListing, ...otherListings].map(r => `- ${String(r.reject_reason).slice(0, 240)}`);
    const feedbackBlock = feedbackItems.length
      ? `\n\nPAST REJECTION FEEDBACK FROM THIS SELLER — do NOT repeat these mistakes:\n${feedbackItems.join("\n")}`
      : "";

    const origTitle = String(listing.title ?? "");
    const origDesc = String(listing.description ?? "");
    const origTags = Array.isArray(listing.tags) ? (listing.tags as string[]) : [];
    const origMaterials = Array.isArray(listing.materials) ? (listing.materials as string[]) : [];

    // ── Market Score gaps (passed from the client when available) ─────────────
    // The Market Score card already told the seller *what* is broken. Hand the
    // same intel to the optimizer so its tag/price suggestions line up with
    // what they just saw — "Optimize All" = "fix what the score found".
    const ctx = market_context ?? null;
    const missingDetail = (ctx?.missing_tags_detail ?? [])
      .filter((t) => t && t.tag)
      .slice(0, 8);
    const missingTagsFromCtx = missingDetail.length
      ? missingDetail
      : (ctx?.missing_tags ?? []).slice(0, 8).map((tag) => ({ tag, pct: 0 }));
    const tagGapBlock = missingTagsFromCtx.length
      ? `\n\nMARKET SCORE — HIGH-TRAFFIC TAGS YOUR TOP COMPETITORS USE THAT YOU DON'T (prioritise fitting these into your 13 tags when they're genuinely relevant to this product — only skip a tag if it would misrepresent the item):\n${missingTagsFromCtx.map((t) => `- ${t.tag}${t.pct ? ` (used by ${t.pct}% of top competitors)` : ""}`).join("\n")}`
      : "";
    const priceBlock =
      ctx && ctx.niche_avg_price != null && ctx.listing_price != null && (ctx.price_score ?? 100) < 70
        ? `\n\nMARKET SCORE — PRICE NUDGE: Top competitors in this niche average $${Number(ctx.niche_avg_price).toFixed(2)}; this listing is at $${Number(ctx.listing_price).toFixed(2)}. Do not change the price (you never set price), but if the listing is well outside the niche average you may briefly emphasise quality/uniqueness in the description to justify it.`
        : "";
    const marketScoreBlock = `${tagGapBlock}${priceBlock}`;

    const photos: string[] = ((listing.image_urls as string[] | null) ?? []).slice(0, photoCap);
    if (photos.length === 0 && listing.thumbnail_url) photos.push(String(listing.thumbnail_url));

    const storedComponentMapping = normalizeJsonObject((listing as Record<string, unknown>).component_mapping);
    const mappingUpdatedAt = Date.parse(String((listing as Record<string, unknown>).component_mapping_updated_at ?? ""));
    const contentUpdatedAt = Date.parse(String((listing as Record<string, unknown>).content_updated_at ?? (listing as Record<string, unknown>).updated_at ?? ""));
    const storedMappingFresh = Boolean(storedComponentMapping) && (!Number.isFinite(contentUpdatedAt) || (Number.isFinite(mappingUpdatedAt) && mappingUpdatedAt >= contentUpdatedAt));
    const componentMappingBlock = storedComponentMapping && storedMappingFresh
      ? `\n\nPreviously confirmed component mapping for this listing: ${JSON.stringify(storedComponentMapping)}\nUse this mapping — do not re-derive or change it unless the seller's listing text or photos have changed materially since it was recorded.`
      : "";

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Optimize this Etsy listing for SEO. Use the photos as ground truth — only describe what you actually see.${rewriteBlock}${marketScoreBlock}${peerBlock}${answersBlock}${voiceSampleBlock}${componentMappingBlock}${feedbackBlock}

Current title (${origTitle.length} chars): ${origTitle}
Current description (${origDesc.length} chars, first 1200 shown): ${origDesc.slice(0, 1200)}

Current tags (${origTags.length}/13): ${JSON.stringify(origTags)}
Current materials (${origMaterials.length}): ${JSON.stringify(origMaterials)}
Price: $${listing.price ?? 0}

Requirements:
- title: 100-140 chars, keyword-rich, accurate to photos
- description: under 1,500 characters total, Etsy-formatted (see structure in system prompt), scannable on mobile, accurate to photos
- tags: exactly 13 tags, ≤20 chars each, only letters/numbers/spaces/hyphens/apostrophes, mix of long-tail and broad
- TAG ACCURACY RULES (non-negotiable):
  * Every tag MUST describe THIS specific item. If this is a shoe clip, never use "earrings", "necklace", "brooch", or any other item-type tag. Match the seller's product noun exactly.
  * Do NOT use generic shape words alone ("rectangle", "square", "round", "oval") unless the shape is the item's defining feature AND it's paired with the item noun (e.g. "rectangle gold pendant"). Avoid bare shape tags.
  * Do NOT use generic gift-recipient filler like "gift for her", "for her", "for him", "gift idea", "perfect gift", "unique gift" unless the original listing or seller answers explicitly position this as a gift for that recipient.
  * PRESERVE compound color/finish descriptors exactly as written: "gold tone", "silver tone", "rose gold", "antique brass", "matte black". Never strip the qualifier word ("tone", "plated", "antique", "matte") — "gold tone" and "gold" are NOT interchangeable and removing "tone" misrepresents costume jewelry as solid gold.
- materials: Only list materials you can either (a) clearly see in the photos, or (b) verify from the seller's original listing / clarifying answers. Use specific names ("solid copper", "sterling silver clasp", "waxed cotton cord"). DO NOT list multiple similar-looking metals (e.g. copper + bronze + brass) unless distinct components of each are visibly different in the photos OR the seller confirmed it. It is better to return 1-2 accurate materials than 3+ guessed ones. Etsy rewards 3+ materials, but fabricating them hurts the seller more than missing the bonus does.
- Do NOT suggest a price.

ABSOLUTE ANTI-FABRICATION RULES:
- Treat the seller's original title, description, and attribute claims as accurate by default. Only override a claim if no photo across the FULL image set supports it AND no plausible alternative interpretation exists (e.g. the claim may refer to a different component in a multi-pendant/multi-item listing).
- If a listing's photos show multiple distinct items or components, map each description detail to the most plausible matching component before concluding any detail is unsupported.
- Never invent specific material, color, or condition details not stated by the seller and not clearly visible in photos. If uncertain, preserve the seller's original wording for that detail rather than substituting a guess.
- If genuinely unable to verify or reconcile a description detail after considering all components and photos, generate a clarifying_question instead of rewriting — do not silently resolve ambiguity by guessing.
- NEVER invent measurements, dimensions, weights, lengths, widths, opening sizes, or any numeric spec. Only repeat numbers that already appear in the original title/description or in a seller clarifying answer. If a spec isn't provided, omit it — do not estimate from photos.
- NEVER invent era, origin, provenance, brand, designer, maker, or historical claims. Only state these when verified by the original listing or a seller answer.
- If the original listing claims a material/feature you cannot see in any photo, add that material/feature to "missing_photo_flags" so we can tell the seller to upload a photo that shows it. Still include it in the output (the seller said it's there), but flag it.
- Every non-obvious factual claim you ADD (material, measurement, era, origin, technique) must be recorded in "fact_sources" with where it came from: "photo" | "original_listing" | "seller_answer". This is internal only — do not put it in the listing copy itself.

CRITICAL — do not regress:
- If a field is already strong, RETURN IT UNCHANGED. Do not paraphrase or shuffle words just to make a change.
- NEVER return a shorter title than the original when the original is already 100–140 chars.
- NEVER return fewer than 13 tags. Keep the original tags that already work and only swap out weak ones.
- NEVER drop materials that are present in the original unless they are demonstrably wrong.
- It IS okay (and encouraged) to tighten a bloated description into the new Etsy-formatted structure under 1,500 chars — preserve all facts, just reformat.
- If overall the listing is already excellent and you cannot confidently improve it, return every field exactly as-is and set expected_grade_improvement to 0.

Submit via the tool.`,
      },
      ...photos.map(url => ({ type: "image_url", image_url: { url } })),
    ];

    const resolved = await resolveShopContext(supabase, userId, personalization, etsy_shop_id);
    const personalizationPrompt = resolved.usedCustomContext ? resolved.prefix : "";
    const systemPrompt =
      resolved.prefix + "\n\n" +
`You are an expert Etsy listing copywriter specializing in vintage and secondhand items. Your job is to write compelling, scannable product descriptions optimized for Etsy's mobile app. The seller is the lead — match their voice, don't replace it. Use the photos as ground truth; never fabricate features or speculate about era/origin/materials you cannot verify.

${MULTI_COMPONENT_SYSTEM_RULES}

LANGUAGE RULES:
- Respond in English only, always and without exception.
- Never output characters, words, or phrases from any other language.
- If your training data suggests a non-English phrase, rewrite it entirely in English before outputting.

CRITICAL FORMATTING RULES:
- Etsy does not render markdown. Never use #, **, *, _, or any markdown syntax.
- Never output literal \\n or \\n\\n as characters. Use real line breaks only.
- Section headers must be ALL CAPS followed by a colon (example: CONDITION:).
- Bullet points must use a dash and space at the start of each line (example: - Black leather upper).
- Every section must be separated by a blank line.
- Total description must stay under 1,500 characters.
- Write for a skimmer — someone scrolling on their phone who spends 8 seconds deciding.

REQUIRED STRUCTURE (use this exact order every time; OMIT any section with no data rather than leaving it blank):

[One hook sentence — specific, vivid, no generic filler. Name the item and its strongest selling point.]

THE STORY:
2–3 sentences max. Brand history, cultural relevance, or why this item matters. Keep it tight. Lead with desire before the buyer can scroll away.

DETAILS:
- Material or construction detail
- Key feature
- Additional feature
- Any notable hardware, closures, labels, or markings

CONDITION:
- Honest, specific condition rating — Good / Very Good / Excellent Vintage
- Describe any wear, flaws, or patina with exact location
- Call out anything repaired, replaced, or added

MEASUREMENTS:
- Include all relevant dimensions

WHAT'S INCLUDED:
- List everything in the package

CONTENT RULES:
- Respond in English only — no exceptions.
- Condition notes must appear in the top half — never buried at the bottom.
- Never invent measurements or condition details — use only what is provided.
- If a section has no applicable data, omit it entirely rather than leaving it blank.
- Do not use phrases like "one of a kind," "rare find," or "perfect gift" unless specifically true and verifiable.
- End on the item, not on a sales pitch.
- Never use filler phrases, AI-sounding language, or generic marketing copy.

${NO_PLACEHOLDER_PROMPT_RULES}` +
      " Honor the SHOP CONTEXT above only when it is consistent with this item's verified facts. The shop-values framing guardrail is non-negotiable: unsupported values language must be omitted, especially in THE STORY. Match the seller's voice; don't replace it.";

    console.info("optimize-listing prompt guardrails", {
      listing_id,
      shop_values_guardrail_present: systemPrompt.includes(SHOP_VALUES_FRAMING_GUARDRAIL),
      multi_component_rules_present: systemPrompt.includes(MULTI_COMPONENT_SYSTEM_RULES),
      component_mapping_injected: Boolean(storedComponentMapping && storedMappingFresh),
    });


    const aiBody = (extraMessages: Array<Record<string, unknown>> = []) => ({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
        ...extraMessages,
      ],
      tools: [{
        type: "function",
        function: {
          name: "submit_optimization",
          description: "Submit the optimized listing fields",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              tags: { type: "array", items: { type: "string" }, minItems: 13, maxItems: 13 },
              materials: { type: "array", items: { type: "string" } },
              optimization_notes: { type: "string" },
              expected_grade_improvement: { type: "number" },
              fact_sources: {
                type: "array",
                description: "Provenance for non-obvious factual claims added (materials, measurements, era, origin, technique). Internal — not shown in the listing.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    claim: { type: "string" },
                    source: { type: "string", enum: ["photo", "original_listing", "seller_answer"] },
                    detail: { type: "string", description: "Brief justification (e.g. 'visible green patina on clasp', 'seller answered: bracelet is 7.5 inches')." },
                  },
                  required: ["claim", "source", "detail"],
                },
              },
              missing_photo_flags: {
                type: "array",
                description: "Materials/features stated in the original listing or seller answers that you CANNOT confirm from any photo. Surfaced to the seller as a prompt to upload a clearer photo.",
                items: { type: "string" },
              },
              clarifying_question: {
                type: "string",
                description: "If component identity or another factual detail is ambiguous, ask one specific seller question instead of guessing. Omit when no question is needed.",
              },
              component_mapping: {
                type: "object",
                description: "For multi-component listings, map seller noun phrases to distinct visible components. Include only when mapping is high-confidence or based on seller answers.",
                additionalProperties: true,
              },
              peer_rec_verdicts: {
                type: "array",
                description: "Verdict on each peer recommendation that was provided in the prompt. Include one entry per recommendation. Omit entirely if no peer recommendations were provided.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    peer_rec_summary: { type: "string", description: "Short restatement of the peer rec (the 'change' field)." },
                    peer_rec_category: { type: "string" },
                    peer_rec_impact: { type: "string", enum: ["high", "medium", "low"] },
                    status: { type: "string", enum: ["applied", "rejected", "partial"] },
                    reason: { type: "string", description: "One sentence: why this verdict for THIS listing." },
                  },
                  required: ["peer_rec_summary", "status", "reason"],
                },
              },
            },
            required: ["title", "description", "tags", "materials", "optimization_notes", "expected_grade_improvement"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "submit_optimization" } },
    });

    const callAi = async (extraMessages: Array<Record<string, unknown>> = []) => {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(aiBody(extraMessages)),
      });
      return res;
    };

    let aiRes = await callAi();
    if (aiRes.status === 429) { await refund(); return json({ error: "Rate limited, please try again shortly." }, 429); }
    if (aiRes.status === 402) { await refund(); return json({ error: "AI credits exhausted.", upgrade_required: true }, 402); }
    if (!aiRes.ok) { await refund(); return json({ error: `AI gateway ${aiRes.status}: ${(await aiRes.text()).slice(0, 300)}` }, 502); }

    let aiJson = await aiRes.json();
    let toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let optimized: Record<string, unknown> = {};
    try { optimized = JSON.parse(toolCall?.function?.arguments ?? "{}"); } catch {
      await refund();
      return json({ error: "AI returned invalid response" }, 502);
    }

    let proposed = {
      title: String(optimized.title ?? "").slice(0, 140),
      description: String(optimized.description ?? ""),
      tags: Array.isArray(optimized.tags) ? (optimized.tags as string[]).slice(0, 13).map(t => String(t).slice(0, 20)) : [],
      materials: Array.isArray(optimized.materials) ? (optimized.materials as string[]).slice(0, 13).map(m => String(m).slice(0, 60)) : [],
    };

    // Hard guard: reject any output that contains placeholder/fill-in-later text.
    // Sellers don't edit before publishing — they only approve or reject — so any
    // unfinished slot kills the optimization. Give the model one corrective retry.
    let placeholderHits = findPlaceholders(proposed);
    if (placeholderHits.length) {
      const summary = placeholderHits.map(h => `${h.field}: "${h.sample}" (${h.pattern})`).join("; ");
      const correction = {
        role: "user",
        content: `Your previous response contained placeholder/fill-in text that the seller would have to complete manually: ${summary}. The seller will NOT edit your output — they will only accept or reject it. Resubmit the tool call with FINAL, publishable text in every field. Remove every bracket, brace, angle-bracket, TBD/TODO/N/A, and every "insert/add/your X here" instruction. If you do not have a specific fact, OMIT that line or section entirely.`,
      };
      aiRes = await callAi([correction]);
      if (!aiRes.ok) { await refund(); return json({ error: `AI gateway ${aiRes.status} on placeholder-retry: ${(await aiRes.text()).slice(0, 300)}` }, 502); }
      aiJson = await aiRes.json();
      toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
      try { optimized = JSON.parse(toolCall?.function?.arguments ?? "{}"); } catch {
        await refund();
        return json({ error: "AI returned invalid response on placeholder-retry" }, 502);
      }
      proposed = {
        title: String(optimized.title ?? "").slice(0, 140),
        description: String(optimized.description ?? ""),
        tags: Array.isArray(optimized.tags) ? (optimized.tags as string[]).slice(0, 13).map(t => String(t).slice(0, 20)) : [],
        materials: Array.isArray(optimized.materials) ? (optimized.materials as string[]).slice(0, 13).map(m => String(m).slice(0, 60)) : [],
      };
      placeholderHits = findPlaceholders(proposed);
      if (placeholderHits.length) {
        await refund();
        return json({
          error: "AI couldn't produce a publish-ready rewrite (kept inserting placeholder text). No optimization was saved and your credit was refunded. Please try again.",
          placeholder_hits: placeholderHits,
        }, 502);
      }
    }

    const returnedQuestion = typeof optimized.clarifying_question === "string"
      ? optimized.clarifying_question.trim()
      : "";
    const returnedComponentMapping = normalizeJsonObject(optimized.component_mapping);
    const listingPatch: Record<string, unknown> = {};
    const nowIsoForListing = new Date().toISOString();
    if (returnedQuestion) {
      const existingQuestions = Array.isArray(listing.clarifying_questions)
        ? (listing.clarifying_questions as string[]).filter(q => typeof q === "string" && q.trim())
        : [];
      const hasQuestion = existingQuestions.some(q => q.trim().toLowerCase() === returnedQuestion.toLowerCase());
      if (!hasQuestion) listingPatch.clarifying_questions = [...existingQuestions, returnedQuestion];

      const existingHistory = Array.isArray(listing.clarifying_history)
        ? (listing.clarifying_history as Array<Record<string, unknown>>)
        : [];
      if (!existingHistory.some(h => String(h.question ?? "").trim().toLowerCase() === returnedQuestion.toLowerCase())) {
        listingPatch.clarifying_history = [
          ...existingHistory,
          { question: returnedQuestion, answer: null, asked_at: nowIsoForListing, answered_at: null, updated_at: nowIsoForListing },
        ];
      }
    }
    if (returnedComponentMapping && !storedMappingFresh) {
      listingPatch.component_mapping = returnedComponentMapping;
      listingPatch.component_mapping_updated_at = nowIsoForListing;
    }
    if (Object.keys(listingPatch).length) {
      const { error: mappingErr } = await supabase
        .from("listings")
        .update(listingPatch)
        .eq("id", listing_id)
        .eq("user_id", userId);
      if (mappingErr) console.warn("component/question persistence failed:", mappingErr.message);
      else listing = { ...listing, ...listingPatch };
    }

    if (!proposed.title || !proposed.description) {
      await refund();
      return json({ error: "AI returned empty title or description" }, 502);
    }

    // No-regression guard: if the AI returned something clearly worse on a
    // simple measurable dimension, keep the original for that field instead.
    const regressionNotes: string[] = [];
    if (origTitle.length >= 100 && origTitle.length <= 140 && proposed.title.length < origTitle.length) {
      regressionNotes.push("Kept original title — AI version was shorter than the already-optimal original.");
      proposed.title = origTitle;
    }
    if (origTags.length === 13 && proposed.tags.length < 13) {
      regressionNotes.push("Kept original tags — AI returned fewer than 13.");
      proposed.tags = origTags.slice(0, 13);
    } else if (proposed.tags.length < origTags.length) {
      regressionNotes.push("Kept original tags — AI returned fewer tags than the original.");
      proposed.tags = origTags.slice(0, 13);
    }
    if (proposed.materials.length < origMaterials.length) {
      regressionNotes.push("Kept original materials — AI dropped some.");
      proposed.materials = origMaterials.slice(0, 13);
    }
    // Note: do NOT guard against shorter descriptions — the new Etsy-formatted
    // output is intentionally tighter (<1,500 chars) and scannable on mobile.


    // If the AI didn't meaningfully change anything, don't burn an optimization.
    const sameTitle = proposed.title.trim() === origTitle.trim();
    const sameDesc = proposed.description.trim() === origDesc.trim();
    const tagsEqual = proposed.tags.length === origTags.length &&
      proposed.tags.every((t, i) => t.toLowerCase() === (origTags[i] ?? "").toLowerCase());
    const matsEqual = proposed.materials.length === origMaterials.length &&
      proposed.materials.every((m, i) => m.toLowerCase() === (origMaterials[i] ?? "").toLowerCase());
    if (sameTitle && sameDesc && tagsEqual && matsEqual) {
      await refund();
      return json({
        no_changes: true,
        message: "Your listing already looks great — the AI couldn't find a confident improvement, so no changes were suggested and your optimization credit was refunded.",
      });
    }

    const validation = validateEtsy(proposed);
    if (regressionNotes.length) validation.warnings.push(...regressionNotes);

    const { data: version, error: vErr } = await supabase.from("listing_versions").insert({
      listing_id, user_id: userId, source: "ai", reason: "optimize",
      title: listing.title, description: listing.description,
      tags: listing.tags ?? [], materials: listing.materials ?? [], price: listing.price,
    }).select().single();
    if (vErr) { await refund(); return json({ error: `Failed to save version: ${vErr.message}` }, 500); }

    // Estimated new_grade so the user can see impact before approval.
    // We re-run the deterministic rule scoring on the proposed text (title len,
    // tag count, materials, description length) and apply the delta to the
    // current overall score. Photo/AI dimensions are unchanged (same media),
    // so a rules-only delta is a fair proxy without burning another AI call.
    const originalScore = listing.score ?? null;
    let estimatedNewGrade: number | null = null;
    let estimatedImprovement: number = Math.round(Number(optimized.expected_grade_improvement ?? 0)) || 0;
    if (originalScore != null) {
      const beforeRules = ruleScoreTotal({
        title: listing.title as string, description: listing.description as string,
        tags: (listing.tags as string[]) ?? [], materials: (listing.materials as string[]) ?? [],
        photo_count: Number((listing as any).photo_count ?? 0),
        image_urls: (listing.image_urls as string[]) ?? [],
        video_count: Number((listing as any).video_count ?? 0),
      });
      const afterRules = ruleScoreTotal({
        title: proposed.title, description: proposed.description,
        tags: proposed.tags, materials: proposed.materials,
        photo_count: Number((listing as any).photo_count ?? 0),
        image_urls: (listing.image_urls as string[]) ?? [],
        video_count: Number((listing as any).video_count ?? 0),
      });
      const ruleDelta = afterRules - beforeRules;
      estimatedNewGrade = Math.max(0, Math.min(100, Number(originalScore) + ruleDelta));
      estimatedImprovement = estimatedNewGrade - Number(originalScore);
    }

    // Supersede any prior pending optimization for this listing so we never
    // pile up duplicate "pending review" rows (e.g. user clicks Bulk Optimize
    // twice after a page refresh). Status 'superseded' is excluded from the
    // pending-review badge and from admin counts.
    await supabase.from("optimizations")
      .update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("listing_id", listing_id)
      .eq("status", "pending");

    const { data: optRow, error: oErr } = await supabase.from("optimizations").insert({
      listing_id, user_id: userId, status: "pending", type: "full",
      original_title: listing.title, original_description: listing.description,
      original_tags: listing.tags ?? [], original_materials: listing.materials ?? [],
      optimized_title: proposed.title, optimized_description: proposed.description,
      optimized_tags: proposed.tags, optimized_materials: proposed.materials,
      original_grade: originalScore,
      new_grade: estimatedNewGrade,
      grade_improvement: estimatedImprovement,
      model_used: "google/gemini-2.5-flash",
      version_id: version.id,
      validation_warnings: {
        ...validation,
        personalization_used: !!personalizationPrompt,
        clarifying_answers_used: !!answers,
        fact_sources: Array.isArray(optimized.fact_sources) ? optimized.fact_sources : [],
        missing_photo_flags: Array.isArray(optimized.missing_photo_flags) ? optimized.missing_photo_flags : [],
        clarifying_question: returnedQuestion || null,
        component_mapping: returnedComponentMapping ?? (storedMappingFresh ? storedComponentMapping : null) ?? null,
      },
    }).select().single();
    if (oErr) { await refund(); return json({ error: `Failed to save optimization: ${oErr.message}` }, 500); }

    // Success — keep the consumed quota.
    consumed = null;

    // Persist peer-rec verdicts so the Review screen can show what influenced
    // this optimization. Best-effort — never block the response.
    const verdictsRaw = Array.isArray((optimized as Record<string, unknown>).peer_rec_verdicts)
      ? ((optimized as Record<string, unknown>).peer_rec_verdicts as Array<Record<string, unknown>>)
      : [];
    const allowedStatus = new Set(['applied', 'rejected', 'partial']);
    const allowedImpact = new Set(['high', 'medium', 'low']);
    const verdictRows = verdictsRaw
      .filter(v => allowedStatus.has(String(v.status)))
      .map(v => ({
        listing_id,
        user_id: userId,
        optimization_run_id: optRow.id,
        peer_rec_summary: String(v.peer_rec_summary ?? '').slice(0, 1000),
        peer_rec_category: v.peer_rec_category ? String(v.peer_rec_category).slice(0, 60) : null,
        peer_rec_impact: allowedImpact.has(String(v.peer_rec_impact)) ? String(v.peer_rec_impact) : null,
        status: String(v.status),
        reason: v.reason ? String(v.reason).slice(0, 1000) : null,
      }))
      .filter(r => r.peer_rec_summary.length > 0);
    if (verdictRows.length) {
      const { error: prErr } = await supabase.from("peer_rec_applications").insert(verdictRows);
      if (prErr) console.warn("peer_rec_applications insert failed:", prErr.message);
    }

    // Track effort: bump optimization_count and clear decay since the listing
    // has just been actively refreshed.
    const currentCount = Number((listing as { optimization_count?: number }).optimization_count ?? 0);
    await supabase.from("listings").update({
      optimization_count: currentCount + 1,
      decay_points: 0,
      decay_started_at: null,
      needs_attention: false,
    }).eq("id", listing_id).eq("user_id", userId);

    return json({
      optimization_id: optRow.id,
      version_id: version.id,
      optimized: proposed,
      notes: optimized.optimization_notes,
      fact_sources: Array.isArray(optimized.fact_sources) ? optimized.fact_sources : [],
      missing_photo_flags: Array.isArray(optimized.missing_photo_flags) ? optimized.missing_photo_flags : [],
      clarifying_question: returnedQuestion || null,
      component_mapping: returnedComponentMapping ?? (storedMappingFresh ? storedComponentMapping : null) ?? null,
      peer_rec_verdicts: verdictRows.map(v => ({
        peer_rec_summary: v.peer_rec_summary,
        peer_rec_category: v.peer_rec_category,
        peer_rec_impact: v.peer_rec_impact,
        status: v.status,
        reason: v.reason,
      })),
      validation,
    });
  } catch (err) {
    console.error(err);
    if (consumed) { try { await refundQuota(consumed.userId); } catch { /* best-effort */ } }
    return json({ error: String(err) }, 500);
  }
});

function buildPersonalizationPrompt(p?: Record<string, unknown> | null): string {
  if (!p || typeof p !== "object") return "";
  const desc = typeof p.store_description === "string" ? p.store_description.trim() : "";
  if (!desc) return "";
  const lines: string[] = [
    "SHOP CONTEXT (always keep this in mind when optimizing):",
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
    lines.push(`NEVER use these words/phrases: ${p.avoid_keywords.join(", ")}`);
  }
  push("Claims/topics to avoid", p.avoid_claims);
  push("Emoji usage", p.emoji_usage);
  push("Description style", p.description_style);
  if (typeof p.shop_values === "string" && p.shop_values.trim()) {
    // NOTE: The framing guardrail below (shop-wide vs item-specific) is the CANONICAL
    // source for shop-values phrasing instructions. Any custom_prompt_override that
    // embeds its own copy of a shop-values block (e.g. user bcc1fd79-... shop 80092482)
    // MUST stay in sync with this guidance until those overrides are refactored to
    // compose from this shared source instead of embedding a full copy.
    lines.push(
      `Shop values — when a product genuinely embodies one of these values, weave the matching phrasing naturally into the description (do NOT force it if it doesn't apply):\n${p.shop_values.trim()}\n\n${SHOP_VALUES_FRAMING_GUARDRAIL}`
    );
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
 * Resolve the SHOP CONTEXT prefix. Precedence:
 *   1. store_personalization.custom_prompt_override (admin-set per-user prompt)
 *   2. answers from request body (legacy/mid-migration)
 *   3. answers from store_personalization.answers in DB
 *   4. generic Etsy fallback
 */
async function resolveShopContext(
  supabase: ReturnType<typeof createClient<any, "public", any>>,
  userId: string,
  personalizationFromBody?: Record<string, unknown> | null,
  etsyShopId?: string | null,
): Promise<{ prefix: string; usedCustomContext: boolean }> {
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
    row = data as { custom_prompt_override?: string | null; answers?: unknown } | null;
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

function normalizeJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const normalized = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    return Object.keys(normalized).length ? normalized : null;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Personal Workspace branch — ad-hoc text optimization. Writes to
// personal_optimization_runs only; never touches the shop `optimizations`
// table or `monthly_usage`.
// ---------------------------------------------------------------------------
async function handlePersonalOptimize(
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
  // model_version is NOT NULL on personal_optimization_runs — always populate.
  const modelVersion = clientModelVersion ?? SERVER_MODEL_VERSION;

  const rawType = typeof body.optimization_type === "string" ? body.optimization_type : "title";
  const optType = (["title", "tags", "description", "full"].includes(rawType) ? rawType : "title") as "title" | "tags" | "description" | "full";
  const inputText = typeof body.input_text === "string" ? body.input_text.trim() : "";
  if (!inputText) return json({ error: "Missing input_text" }, 400);
  const category = typeof body.category === "string" ? body.category.trim() || null : null;
  const gradeRunId = typeof body.grade_run_id === "string" ? body.grade_run_id : null;

  // Daily quota gate.
  const { data: gate, error: gateErr } = await supabase.rpc("consume_personal_quota", {
    _user_id: userId, _kind: "optimization",
  });
  if (gateErr) return json({ error: gateErr.message }, 500);
  if (!gate?.allowed) {
    return json({
      error: "limit_reached",
      upgrade_required: true,
      used: gate?.used,
      limit: gate?.limit,
      tier: gate?.tier,
    }, 402);
  }

  const promptByType: Record<typeof optType, string> = {
    title: `Rewrite this Etsy listing title for SEO. 100-140 chars, keyword-rich, accurate. Return ONLY the rewritten title (no quotes, no commentary).`,
    tags: `Produce exactly 13 strong Etsy tags for this listing concept. Each ≤20 chars, only letters/numbers/spaces/hyphens/apostrophes. Mix long-tail and broad. Return ONLY a comma-separated list.`,
    description: `Rewrite this Etsy listing description: 600-1500 words, structured, warm, persuasive, accurate. Never fabricate measurements or materials. Return ONLY the rewritten description.`,
    full: `Rewrite this listing copy keeping the structure but improving SEO and clarity. Return ONLY the rewritten text.`,
  };

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are an expert Etsy SEO copywriter. Warm, specific, never fabricate facts." },
        { role: "user", content: `${promptByType[optType]}${category ? `\n\nCategory: ${category}` : ""}\n\nInput:\n${inputText}` },
      ],
    }),
  });
  if (!aiRes.ok) return json({ error: `AI gateway ${aiRes.status}` }, 502);
  const aiJson = await aiRes.json();
  const outputText = String(aiJson?.choices?.[0]?.message?.content ?? "").trim();
  if (!outputText) return json({ error: "AI returned empty response" }, 502);

  const { data: row, error: insertErr } = await supabase
    .from("personal_optimization_runs")
    .insert({
      user_id: userId,
      grade_run_id: gradeRunId,
      optimization_type: optType,
      usage_type: "personal",
      input_text: inputText,
      output_text: outputText,
      category,
      model_version: modelVersion,
    })
    .select()
    .single();
  if (insertErr) return json({ error: `Could not save optimization: ${insertErr.message}` }, 500);

  return json({
    optimization_id: row.id,
    output_text: outputText,
    quota: { used: gate?.used, limit: gate?.limit, tier: gate?.tier },
    model_version: modelVersion,
  });
}

