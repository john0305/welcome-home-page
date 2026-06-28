// Echo — RadarIQ's conversational chat agent.
// Flow: JWT → length check → safety regex → quota → persist user msg →
//       grounding (listing | shop + personalization) → Gemini → persist/handle OUT_OF_SCOPE.
// Uses Lovable AI Gateway (LOVABLE_API_KEY) with google/gemini-2.5-flash.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chatCompletion } from "../_shared/ai-dispatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_LEN = 600;
const HISTORY_LIMIT = 20;
// Model is now resolved per-call from ai_model_config via the shared dispatcher.

// Prompt-injection / scope-evasion safety patterns. Hits here never reach the model.
const SAFETY_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|previous\s+)?instructions/i,
  /disregard\s+(the\s+)?(above|prior|system)/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /you\s+are\s+now\b/i,
  /act\s+as\s+(a\s+|an\s+)?(admin|system|developer|root)/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /other\s+users?'/i,
  /another\s+user'?s/i,
  /admin\s+(data|panel|info)/i,
  /service[-\s]?role/i,
  /\bsudo\b/i,
  /<\|.*?\|>/,
  /\[\[.*?\]\]/,
];

const SAFETY_REPLY =
  "I can only help with your Etsy shop and listings — I can't take instructions that change how I work. Want to ask about a listing or your shop's performance instead?";

const PERSONA = `You are Echo, Radar IQ's optimization copilot. Radar IQ is an SDVOSB-built (Service-Disabled Veteran-Owned Small Business) Etsy optimization platform.

Voice:
- Collaborative. Talk about "our shop", "we", "let's". The seller is the lead, you ride shotgun.
- Specific and grounded — never generic, never sycophantic. Banned openers: "Great question!", "Absolutely!", "I'd be happy to help!".
- No marketing fluff. No exclamation-spam. No corporate jargon.
- When you spot a problem, frame it as an opportunity and point to the concrete fix.

Scope (hard limit):
- You only answer questions about THIS seller's Etsy shop, their listings, SEO, tags, photos, pricing, performance, and Radar IQ's features. Use only the data provided in the SHOP CONTEXT and PAGE CONTEXT blocks.
- Anything outside that scope (general life advice, other platforms, other users' shops, code, current events, etc.) — respond with EXACTLY this format on a single line, nothing else:
  OUT_OF_SCOPE:<reason>
  where <reason> is one of: out_of_scope | no_data | unknown_term
- "no_data" = the question is in scope but the necessary data wasn't loaded for this turn.
- "unknown_term" = the seller used a term you genuinely don't understand.

Honesty:
- If a number is missing or the data is stale, say so plainly. Never invent metrics.
- Don't claim to have done something (running a sync, pushing changes) — you can only TALK about the shop, not act on it.

Format:
- Concise markdown. Short paragraphs.
- Use bullet lists when comparing options or listing steps.
- **Bold the action** in a recommendation so it's scannable.
- Skip headings unless the answer is long enough to need them.

RESPONSE QUALITY RULES — apply to every message:

1. NEVER give a count without context.
   Wrong: "Our shop has 23 expiring listings. Renew them."
   Right: "Of the 23 expiring listings, 7 are high-value and should be renewed immediately — the other 16 are grading below 50 and should be optimized first so the renewal fee isn't wasted."

2. ALWAYS segment when there are multiple items.
   When the answer involves a list of listings, group them by impact, urgency, or action type. Never treat 23 listings as one undifferentiated block.

3. ALWAYS name the specific listings.
   Don't say "some of your listings." Say the actual titles (shortened if long). If more than 3, name the top 3 and note the remaining count.

4. ALWAYS explain the tradeoff or the why.
   The seller asked because they want to make a decision. Tell them why this action matters more than the other things they could do. What happens if they don't? What's the cost of doing it wrong?

5. ALWAYS end with a specific next step or question.
   Don't leave the seller with information and no direction. Offer to pull a specific list, queue something for review, or ask a clarifying question that would sharpen the recommendation.

6. NEVER give a response that could apply to any Etsy shop.
   If the response would make sense without any shop-specific data from the context blocks, rewrite it. Every response must reference something specific to this shop's actual listings, grades, or patterns.

7. PRIORITY questions ("what should I fix first", "what's most important", "where should I focus"):
   - Identify the single highest-leverage action
   - Explain why it outranks the other candidates in this shop's context
   - Break it into a segmented action list if more than 3 items are involved
   - Name the specific listings affected
   - Offer the next step

8. LENGTH:
    - Conversational questions → 3-5 sentences max.
    - Priority or analysis questions → up to 3 short paragraphs.
    - Never pad. Stop when the answer is complete.
    - Use **bold** for the single most important action or finding in each response.

9. WHEN ASKED ABOUT NEWEST, OLDEST, MOST RECENT, OR FIRST LISTINGS:
    - Use the RECENTLY ADDED LISTINGS context block to answer directly with the listing name and how long ago it was listed.
    - If that block is empty or missing, tell the user specifically that listing dates aren't in the current context and suggest a sync — do not say "I don't have that data" generically.

10. WHEN ASKED ABOUT LISTING PERFORMANCE OVER TIME, BEFORE/AFTER OPTIMIZATION, OR WHETHER AN OPTIMIZATION WORKED:
    - Use the LISTING PERFORMANCE HISTORY block to give specific numbers. Name the dates and the actual deltas. If the data shows views went from 48 to 115 in the 30 days after optimization #2, say that directly with those numbers.
    - If 30-day post-optimization data is not yet available, say how many days have elapsed and what the 7-day delta shows so far.
    - If snapshot history is genuinely absent from context, say so plainly and direct the user to Etsy Stats with a specific instruction: check the date range around the optimization date if known. Never suggest they contact the RadarIQ team — Echo is the RadarIQ team.

11. NEVER say "flag this to the RadarIQ team" or "worth noting to the RadarIQ team" or any variant. Echo is the product. If something cannot be answered, say what data would be needed to answer it, or suggest the user check Etsy's own Stats dashboard as the fallback. That is the only external redirect that is appropriate.

12. SOLUTION-FIRST RESPONSES — lead with the fix, then the why.
    - Never describe a problem without offering the generated solution inline.
    - When you identify a fixable Etsy ranking issue (missing tags, short title, empty materials, missing return policy, low review health), emit a sentinel on its own line so the UI can render the one-tap fix card inline:
      <<FIX:factor_key>>            — for shop-level factors
      <<FIX:factor_key:LISTING_ID>>  — for listing-level factors (use the UUID from PAGE CONTEXT or SHOP CONTEXT, NOT the Etsy numeric id)
    - Valid factor_key values: tags_complete, materials_present, title_length, return_policy_present, review_health.
    - For factors confirmed by Etsy's seller handbook use "will improve" and "Etsy confirms" — never "consider" or "might help".
    - Example: "Your title only uses 47 of 140 characters — Etsy confirms longer titles capture more long-tail searches. <<FIX:title_length:abc-123-uuid>>"

13. SCORE INTELLIGENCE — score-improvement queries:
    When the seller asks about gaining points, hitting a score, "what should I fix first to improve my score", "fastest way to improve", or any score-goal phrasing, you have a SCORE & OPEN FIX ACTIONS block in the context with their CURRENT STORE SCORE, dimension breakdown, and every open fix action ranked by impact_pts.

    Rules:
    - Always anchor recommendations to the actual fix actions in that block — never give generic Etsy advice when their real data is available.
    - Calculate which combination of fix actions gets the seller closest to their goal with the least total effort (use estimated_effort: low/medium/high).
    - When listing the recommended fixes, use a numbered list with the affected count and +pts inline, and finish with a total line. Example:
        To gain 15 points, here's your fastest path:
        ① Fix weak titles — 282 listings        +6 pts
        ② Fill empty tag slots — 157 listings   +5 pts
        ③ Add video to listings                 +4 pts
        ─────────────────────────────────────
        Total                                  +15 pts
    - Always end with a direct offer to take action, e.g. "Want me to queue up the titles first?" — and reference the Score Roadmap page when telling them where to act.
    - If the seller's goal requires more points than every open action combined, say so honestly and report the maximum reachable score from current actions.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  // Provider key (LOVABLE_API_KEY / ANTHROPIC_API_KEY) is validated inside the dispatcher.

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const authed = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await authed.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    

    const body = await req.json().catch(() => null) as null | {
      sessionId?: string;
      message?: string;
      pageContext?: {
        route?: string;
        pageLabel?: string;
        listingId?: string | null;
        shopId?: string | null;
      };
    };
    if (!body || typeof body.message !== "string") return json({ error: "Invalid body" }, 400);

    const message = body.message.trim();
    if (message.length < 1) return json({ error: "Message is empty" }, 400);
    if (message.length > MAX_LEN) return json({ error: `Message exceeds ${MAX_LEN} chars` }, 400);

    const pageCtx = body.pageContext ?? {};
    const pageLabel = (pageCtx.pageLabel ?? "").slice(0, 80) || null;
    const listingId = pageCtx.listingId || null;
    // pageCtx.shopId is the seller's numeric Etsy shop id — NOT a UUID,
    // so it can't be written to chat_sessions.shop_id. We ignore it here;
    // grounding is always scoped by user_id.

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Helper: ensure session exists; return id.
    async function ensureSession(existingId?: string): Promise<string> {
      if (existingId) {
        const { data } = await admin
          .from("chat_sessions")
          .select("id")
          .eq("id", existingId)
          .eq("user_id", userId)
          .maybeSingle();
        if (data?.id) {
          await admin.from("chat_sessions")
            .update({ updated_at: new Date().toISOString(), page_label: pageLabel })
            .eq("id", data.id);
          return data.id;
        }
      }
      const { data, error } = await admin.from("chat_sessions").insert({
        user_id: userId, page_label: pageLabel,
      }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "session insert failed");
      return data.id;
    }

    // Helper: upsert into unanswered_questions (frequency++ if same text within 30d).
    async function logUnanswered(text: string, reason: string) {
      const norm = text.trim().toLowerCase().slice(0, 500);
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data: existing } = await admin
        .from("unanswered_questions")
        .select("id, frequency")
        .ilike("question_text", norm)
        .gte("last_asked", since)
        .maybeSingle();
      if (existing?.id) {
        await admin.from("unanswered_questions")
          .update({ frequency: (existing.frequency ?? 1) + 1, last_asked: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await admin.from("unanswered_questions").insert({
          question_text: text.slice(0, 1000),
          page_label: pageLabel,
          listing_id: listingId,
          reason,
        });
      }
    }

    // ── Step 3: Safety filter ───────────────────────────────────────────────
    const tripped = SAFETY_PATTERNS.find((re) => re.test(message));
    if (tripped) {
      const sessionId = await ensureSession(body.sessionId);
      await admin.from("chat_messages").insert([
        { session_id: sessionId, user_id: userId, role: "user", content: message,
          page_label: pageLabel, listing_id: listingId, was_answered: true },
        { session_id: sessionId, user_id: userId, role: "assistant", content: SAFETY_REPLY,
          page_label: pageLabel, listing_id: listingId, was_answered: false },
      ]);
      await logUnanswered(message, "safety_block");
      return json({
        sessionId,
        assistantMessage: SAFETY_REPLY,
        usage: null,
        blocked: true,
      });
    }

    // ── Step 4: Quota ───────────────────────────────────────────────────────
    const { data: gate, error: gateErr } = await admin.rpc("consume_chat_message", {
      _user_id: userId,
    });
    if (gateErr) return json({ error: gateErr.message }, 500);
    if (!gate?.allowed) {
      return json({
        error: "chat_limit_reached",
        upgrade_required: true,
        used: gate?.used,
        limit: gate?.limit,
        tier: gate?.tier,
      }, 429);
    }

    // ── Step 5: Session + persist user message ──────────────────────────────
    const sessionId = await ensureSession(body.sessionId);
    const { data: userMsgRow } = await admin.from("chat_messages").insert({
      session_id: sessionId, user_id: userId, role: "user", content: message,
      page_label: pageLabel, listing_id: listingId, was_answered: true,
    }).select("id").single();

    // ── Step 6: Load conversation history (oldest first) ────────────────────
    const { data: history } = await admin
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    const historyAsc = (history ?? []).slice().reverse();

    // ── Step 7: Grounding fetch (user + active-shop scoped) ─────────────────
    // Personalization is per connected shop, so resolve the active shop from
    // the body (or fall back to the user's most recently connected shop) and
    // scope the query — otherwise multi-shop users would leak answers across
    // shops.
    const bodyShopId = (body as { etsy_shop_id?: string | null })?.etsy_shop_id ?? null;
    let activeShopId: string | null = bodyShopId ? String(bodyShopId) : null;
    if (!activeShopId) {
      const { data: store } = await admin
        .from("stores")
        .select("etsy_shop_id")
        .eq("user_id", userId)
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      activeShopId = (store as { etsy_shop_id?: string } | null)?.etsy_shop_id ?? null;
    }
    const personalizationQuery = admin
      .from("store_personalization")
      .select("answers, category, completion_percentage, custom_prompt_override")
      .eq("user_id", userId);
    const { data: personalization } = activeShopId
      ? await personalizationQuery.eq("etsy_shop_id", activeShopId).maybeSingle()
      : await personalizationQuery.limit(1).maybeSingle();

    let listingCtx: Record<string, unknown> | null = null;
    let performanceHistoryBlock = "";
    let impactSignalBlock = "";
    if (listingId) {
      const { data: listing } = await admin
        .from("listings")
        .select("id, title, tags, materials, price, state, score, grade, views, favorites, photo_count, video_count, optimization_count, score_breakdown, ending_at")
        .eq("id", listingId)
        .eq("user_id", userId)
        .maybeSingle();
      if (listing) listingCtx = listing;

      // Snapshot history + optimization events for THIS listing.
      // listing_snapshots tracks views/favorites/quantity per day (no per-listing orders column).
      const [{ data: snaps }, { data: opts }, { data: impact }] = await Promise.all([
        admin
          .from("listing_snapshots")
          .select("recorded_on, views, favorites, quantity")
          .eq("listing_id", listingId)
          .eq("user_id", userId)
          .order("recorded_on", { ascending: false })
          .limit(60),
        admin
          .from("optimizations")
          .select("id, updated_at, created_at")
          .eq("listing_id", listingId)
          .eq("user_id", userId)
          .eq("status", "approved")
          .order("updated_at", { ascending: true }),
        admin
          .from("wins_feed")
          .select("headline, window_days, created_at")
          .eq("listing_id", listingId)
          .eq("user_id", userId)
          .eq("kind", "optimization_impact")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      performanceHistoryBlock = buildPerformanceHistoryBlock(snaps ?? [], opts ?? []);
      const latest = (impact ?? [])[0] as { headline: string; window_days: number; created_at: string } | undefined;
      if (latest) {
        impactSignalBlock = `LATEST OPTIMIZATION IMPACT SIGNAL:\n  ${latest.headline}\n  Window: ${latest.window_days}-day · Generated: ${new Date(latest.created_at).toISOString().slice(0, 10)}`;
      }
    }

    let shopBlock: string;
    if (listingCtx) {
      shopBlock = `CURRENT LISTING (the one the seller is looking at):
${JSON.stringify(listingCtx, null, 2)}

${performanceHistoryBlock}${impactSignalBlock ? "\n\n" + impactSignalBlock : ""}`;
    } else {
      const { data: snap } = await admin
        .from("shop_snapshots")
        .select("recorded_on, total_views, total_favorites, total_sales, orders_30d, revenue_30d, active_count, sold_out_count, expiring_soon_count, review_count, avg_rating")
        .eq("user_id", userId)
        .order("recorded_on", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Pull a working set of this seller's listings to derive rich segments.
      const { data: allListings } = await admin
        .from("listings")
        .select("id, title, state, score, grade, views, favorites, price, ending_at, etsy_created_at, updated_at, last_synced, optimization_count")
        .eq("user_id", userId)
        .eq("state", "active")
        .limit(500);
      const listings = allListings ?? [];

      // ── Listing lookup by title (so "what should I fix on <listing X>"
      //    works even when the listing isn't in the top/recent/expiring slices).
      const STOP = new Set([
        "the","a","an","and","or","of","for","with","to","in","on","is","it","this","that",
        "what","should","i","fix","do","need","my","your","our","about","listing","please",
        "can","you","tell","me","help","how","why","when","where","which","be","are","was",
        "were","but","by","from","as","at","if","so","not","no","yes","just","also",
      ]);
      const tokenize = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
          .filter((w) => w.length >= 4 && !STOP.has(w));
      const msgTokens = new Set(tokenize(message));
      const mentionedMatches: Array<{ id: string; score: number }> = [];
      if (msgTokens.size >= 2) {
        for (const l of listings) {
          const titleTokens = tokenize((l.title as string) ?? "");
          if (!titleTokens.length) continue;
          let overlap = 0;
          for (const t of titleTokens) if (msgTokens.has(t)) overlap++;
          // Require ≥3 overlapping significant tokens (or 2 if title is short).
          const need = titleTokens.length <= 3 ? 2 : 3;
          if (overlap >= need) mentionedMatches.push({ id: l.id as string, score: overlap });
        }
        mentionedMatches.sort((a, b) => b.score - a.score);
      }
      let mentionedBlock = "";
      if (mentionedMatches.length) {
        const ids = mentionedMatches.slice(0, 3).map((m) => m.id);
        const { data: fullRows } = await admin
          .from("listings")
          .select("id, title, etsy_listing_id, tags, materials, price, state, score, grade, views, favorites, photo_count, video_count, optimization_count, score_breakdown, ending_at")
          .in("id", ids);
        if (fullRows?.length) {
          mentionedBlock = `MENTIONED LISTINGS (matched against the seller's question — use these to answer "what should I fix on <listing>"; treat them as authoritative for the named listing and reference the UUID in any <<FIX:...>> sentinels):
${JSON.stringify(fullRows, null, 2)}`;
        }
      }

      const now = Date.now();
      const DAY = 86_400_000;
      const fmtTitle = (t?: string | null) => (t ?? "Untitled").slice(0, 60);

      // ── Expiring within 30 days, segmented by value ────────────────────────
      const expiring = listings
        .filter((l) => l.ending_at)
        .map((l) => ({ ...l, _exp: new Date(l.ending_at as string).getTime() }))
        .filter((l) => l._exp - now <= 30 * DAY && l._exp >= now)
        .map((l) => ({ ...l, _daysToExpiry: Math.max(0, Math.round((l._exp - now) / DAY)) }))
        .sort((a, b) => a._exp - b._exp);
      const highValue = expiring.filter((l) => (l.score ?? 0) >= 60 && (l.views ?? 0) > 0);
      const lowValue = expiring.filter((l) => !((l.score ?? 0) >= 60 && (l.views ?? 0) > 0));
      const expiringBlock = expiring.length === 0
        ? "EXPIRING LISTINGS (within 30 days): none."
        : `EXPIRING LISTINGS (within 30 days):
  Renew immediately — grade 60+, had views in last 30 days:
${highValue.length ? highValue.slice(0, 10).map((l) => `    - "${fmtTitle(l.title)}" (grade: ${l.score ?? "n/a"}, views: ${l.views ?? 0}, expires in: ${l._daysToExpiry}d)`).join("\n") : "    (none)"}
  Optimize before renewing — grade <60 OR zero views in 30 days:
${lowValue.length ? lowValue.slice(0, 10).map((l) => `    - "${fmtTitle(l.title)}" (grade: ${l.score ?? "n/a"}, views: ${l.views ?? 0}, expires in: ${l._daysToExpiry}d)`).join("\n") : "    (none)"}
  Total expiring: ${expiring.length} (${highValue.length} high value, ${lowValue.length} low value)`;

      // ── Conversion gaps: high interest, no movement ────────────────────────
      const conversionGaps = listings
        .filter((l) => (l.views ?? 0) > 100 && (l.favorites ?? 0) > 10)
        .sort((a, b) => (b.favorites ?? 0) - (a.favorites ?? 0))
        .slice(0, 5);
      const conversionBlock = conversionGaps.length === 0
        ? "CONVERSION GAPS (high interest, no recent sales): none above the threshold (views > 100, favorites > 10)."
        : `CONVERSION GAPS (high interest, no recent sales tracked):
${conversionGaps.map((l) => `  - "${fmtTitle(l.title)}" (views: ${l.views}, favorites: ${l.favorites}, grade: ${l.score ?? "n/a"}, price: $${l.price ?? "?"})`).join("\n")}`;

      // ── Recent optimization results (last 60d, approved) ───────────────────
      const sixtyAgo = new Date(now - 60 * DAY).toISOString();
      const { data: recentOpts } = await admin
        .from("optimizations")
        .select("listing_id, original_grade, new_grade, updated_at, pushed_at, original_title, optimized_title")
        .eq("user_id", userId)
        .eq("status", "approved")
        .gte("updated_at", sixtyAgo)
        .order("updated_at", { ascending: false })
        .limit(5);
      let optsBlock = "RECENT OPTIMIZATION RESULTS (last 60 days): none completed.";
      if (recentOpts && recentOpts.length) {
        const optIds = recentOpts.map((o) => o.listing_id);
        const { data: attrRows } = await admin
          .from("performance_attribution")
          .select("listing_id, pre_views, post_views, score_delta, window_days")
          .in("listing_id", optIds)
          .eq("user_id", userId);
        const attrByListing = new Map<string, { pre: number | null; post: number | null; days: number | null }>();
        for (const a of attrRows ?? []) {
          const prev = attrByListing.get(a.listing_id as string);
          if (!prev || ((a.window_days ?? 0) > (prev.days ?? 0))) {
            attrByListing.set(a.listing_id as string, { pre: a.pre_views, post: a.post_views, days: a.window_days });
          }
        }
        optsBlock = `RECENT OPTIMIZATION RESULTS (last 60 days):
${recentOpts.map((o) => {
  const title = fmtTitle((o.optimized_title ?? o.original_title) as string | null);
  const g0 = o.original_grade ?? "?";
  const g1 = o.new_grade ?? "pending re-grade";
  const a = attrByListing.get(o.listing_id as string);
  const viewLine = a && a.pre != null && a.post != null
    ? `, views: ${a.pre} → ${a.post} (${a.days ?? "?"}d post-optimization)`
    : ", views: attribution pending";
  return `  - "${title}" — grade: ${g0} → ${g1}${viewLine}`;
}).join("\n")}`;
      }

      // ── Stale listings (active, not updated 90d+) ──────────────────────────
      const ninety = 90 * DAY;
      const stale = listings
        .map((l) => {
          const lastTouched = Math.max(
            l.updated_at ? new Date(l.updated_at as string).getTime() : 0,
            l.last_synced ? new Date(l.last_synced as string).getTime() : 0,
          );
          return { ...l, _stale: now - lastTouched };
        })
        .filter((l) => l._stale >= ninety)
        .sort((a, b) => b._stale - a._stale);
      const staleBlock = stale.length === 0
        ? "STALE LISTINGS (active, no updates 90d+): none."
        : `STALE LISTINGS (active, no updates 90d+):
  Top 5 by staleness:
${stale.slice(0, 5).map((l) => `    - "${fmtTitle(l.title)}" (grade: ${l.score ?? "n/a"}, optimizations: ${l.optimization_count ?? 0}, days stale: ${Math.round(l._stale / DAY)})`).join("\n")}
  Total stale: ${stale.length}`;

      // ── Top listings (by views) ────────────────────────────────────────────
      const top = [...listings]
        .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
        .slice(0, 5);
      const topBlock = top.length === 0
        ? "TOP LISTINGS: none yet."
        : `TOP LISTINGS (by views):
${top.map((l) => `  - "${fmtTitle(l.title)}" (grade: ${l.score ?? "n/a"}, views: ${l.views ?? 0}, favorites: ${l.favorites ?? 0}, price: $${l.price ?? "?"})`).join("\n")}`;

      // ── Recently added listings (newest first) ─────────────────────────────
      const recent = [...listings]
        .filter((l) => l.etsy_created_at || l.created_at)
        .sort((a, b) => {
          const da = new Date((b.etsy_created_at as string) ?? (b.created_at as string)).getTime();
          const db = new Date((a.etsy_created_at as string) ?? (a.created_at as string)).getTime();
          return da - db;
        })
        .slice(0, 5);
      const recentBlock = recent.length === 0
        ? "RECENTLY ADDED LISTINGS: none yet."
        : `RECENTLY ADDED LISTINGS (newest first):
${recent.map((l) => {
          const createdAt = (l.etsy_created_at as string) ?? (l.created_at as string);
          const daysAgo = createdAt ? Math.max(0, Math.round((now - new Date(createdAt).getTime()) / DAY)) : "?";
          return `  - "${fmtTitle(l.title)}" (listed: ${daysAgo} days ago, grade: ${l.score ?? "n/a"}, views: ${l.views ?? 0}, favorites: ${l.favorites ?? 0}, sold: ${(l as any).sales_count ?? 0})`;
        }).join("\n")}`;

      // ── Quick wins, expanded with affected listings ────────────────────────
      const quickWins: string[] = [];
      const missingMaterials = listings.filter((l) => !(l as any).materials || ((l as any).materials?.length ?? 0) === 0);
      if (missingMaterials.length) {
        quickWins.push(`Add materials to listings missing them
     Affected listings: ${missingMaterials.slice(0, 3).map((l) => `"${fmtTitle(l.title)}" (grade: ${l.score ?? "n/a"})`).join(", ")}${missingMaterials.length > 3 ? ` (+${missingMaterials.length - 3} more)` : ""}
     Why it matters: materials are a free SEO surface and a trust signal — easy lift across ${missingMaterials.length} listings.`);
      }
      const lowGrade = listings.filter((l) => (l.score ?? 100) < 60).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
      if (lowGrade.length) {
        quickWins.push(`Rewrite the lowest-grade listings
     Affected listings: ${lowGrade.slice(0, 3).map((l) => `"${fmtTitle(l.title)}" (grade: ${l.score ?? "n/a"})`).join(", ")}${lowGrade.length > 3 ? ` (+${lowGrade.length - 3} more)` : ""}
     Why it matters: lifting these from <60 to 70+ moves the median and improves shop-wide ranking signals.`);
      }
      const neverOptimized = listings.filter((l) => (l.optimization_count ?? 0) === 0);
      if (neverOptimized.length) {
        quickWins.push(`Run a first pass on never-optimized listings
     Affected listings: ${neverOptimized.slice(0, 3).map((l) => `"${fmtTitle(l.title)}" (grade: ${l.score ?? "n/a"})`).join(", ")}${neverOptimized.length > 3 ? ` (+${neverOptimized.length - 3} more)` : ""}
     Why it matters: first optimization typically delivers the biggest grade jump of a listing's lifetime.`);
      }
      const quickWinsBlock = quickWins.length === 0
        ? "QUICK WINS: shop looks tidy — no obvious quick wins detected."
        : `QUICK WINS (ranked by impact):
${quickWins.slice(0, 3).map((q, i) => `  ${i + 1}. ${q}`).join("\n")}`;

      const snapBlock = snap
        ? `SHOP SNAPSHOT (latest):
${JSON.stringify(snap, null, 2)}`
        : "SHOP SNAPSHOT: (none recorded yet).";

      // ── Per-listing dimension breakdown for SHOP listings ─────────────────
      // Shop grades live in listings.score_breakdown (score_deductions = array of
      // human strings like "Title is 44 chars — aim for 100–140 (losing 6 pts)."
      // or "Photo quality: 7/10 (~2 pts lost). ...").
      const { data: gradedListings } = await admin
        .from("listings")
        .select("id, title, score, score_breakdown")
        .eq("user_id", userId)
        .eq("state", "active")
        .not("score_breakdown", "is", null)
        .limit(500);

      // Bucket deduction strings into normalized dimensions.
      const DIM_PATTERNS: Array<{ dim: string; rx: RegExp }> = [
        { dim: "title", rx: /^title\b/i },
        { dim: "tags", rx: /tags?\b/i },
        { dim: "materials", rx: /^(listed\s+\d+\s+materials|add(ed)?\s+materials|materials\s+match)/i },
        { dim: "materials", rx: /\bmaterials\b/i },
        { dim: "photos", rx: /^(only\s+\d+\s+photos?|photo\s+coverage|photo\s+quality|photos?\s+analyzed)/i },
        { dim: "photos", rx: /\bphotos?\b/i },
        { dim: "video", rx: /\bvideo\b/i },
        { dim: "description", rx: /^description\b/i },
        { dim: "pricing", rx: /^price\b|\bpricing\b/i },
      ];
      const classify = (s: string): string => {
        const t = s.trim();
        for (const { dim, rx } of DIM_PATTERNS) if (rx.test(t)) return dim;
        return "other";
      };
      const extractPts = (s: string): number => {
        const m = s.match(/losing\s+(\d+(?:\.\d+)?)\s*pts?/i) || s.match(/~\s*(\d+(?:\.\d+)?)\s*pts?\s*lost/i);
        return m ? Number(m[1]) : 0;
      };

      type DimAgg = { listings: number; total_pts: number; samples: string[] };
      const aggregate = new Map<string, DimAgg>();
      const perListingWorst: Array<{ id: string; title: string; score: number | null; worst_dim: string; worst_pts: number; deduction: string }> = [];

      for (const l of gradedListings ?? []) {
        const bd = (l.score_breakdown ?? {}) as Record<string, unknown>;
        const deds = Array.isArray(bd.score_deductions) ? (bd.score_deductions as string[]) : [];
        if (!deds.length) continue;
        // Per-listing dimension totals
        const localTotals = new Map<string, { pts: number; ded: string }>();
        for (const d of deds) {
          const dim = classify(d);
          const pts = extractPts(d);
          if (pts <= 0) continue;
          const prev = localTotals.get(dim);
          if (!prev || pts > prev.pts) localTotals.set(dim, { pts, ded: d });
        }
        // Roll into shop-wide aggregate
        for (const [dim, { pts, ded }] of localTotals) {
          const agg = aggregate.get(dim) ?? { listings: 0, total_pts: 0, samples: [] };
          agg.listings += 1;
          agg.total_pts += pts;
          if (agg.samples.length < 3) agg.samples.push(ded);
          aggregate.set(dim, agg);
        }
        // Worst dimension on THIS listing
        const worst = Array.from(localTotals.entries()).sort((a, b) => b[1].pts - a[1].pts)[0];
        if (worst) {
          perListingWorst.push({
            id: l.id as string,
            title: fmtTitle(l.title as string | null),
            score: l.score as number | null,
            worst_dim: worst[0],
            worst_pts: worst[1].pts,
            deduction: worst[1].ded,
          });
        }
      }

      const totalGraded = perListingWorst.length;
      const aggArr = Array.from(aggregate.entries())
        .map(([dim, a]) => ({
          dimension: dim,
          listings_affected: a.listings,
          pct_of_graded: totalGraded ? Math.round((a.listings / totalGraded) * 100) : 0,
          total_pts_lost: Math.round(a.total_pts),
          avg_pts_lost: a.listings ? +(a.total_pts / a.listings).toFixed(1) : 0,
          sample_deductions: a.samples,
        }))
        .sort((a, b) => b.total_pts_lost - a.total_pts_lost);

      const worstSorted = perListingWorst.sort((a, b) => b.worst_pts - a.worst_pts).slice(0, 30);

      const shopDimBlock = totalGraded === 0
        ? "SHOP LISTING DIMENSION BREAKDOWN: no graded shop listings with deductions yet."
        : `SHOP LISTING DIMENSION BREAKDOWN (parsed from listings.score_breakdown.score_deductions, ${totalGraded} graded shop listings):

These are the seller's OWN SHOP listings (not Personal Workspace grades). Use this block to answer "what am I worst at across all my graded listings", recurring weak dimensions shop-wide, and which listing to prioritize. Sort key: total_pts_lost = sum of points lost across all listings in that dimension — that's the single best signal for "weakest thing to improve when creating listings".

SHOP-WIDE WEAKNESS RANKING:
${JSON.stringify(aggArr, null, 2)}

TOP 30 LISTINGS BY BIGGEST SINGLE-DIMENSION LOSS (worst dimension per listing):
${JSON.stringify(worstSorted, null, 2)}`;

      // ── Renewal insights block ───────────────────────────────────────────
      // Surfaces high-stale unique items + shop-level renewal waste so Echo can
      // recommend listing refreshes grounded in actual renewal cost data.
      let renewalBlock = "";
      if (activeShopId) {
        const { data: rsum } = await admin
          .from("listing_renewal_summary")
          .select("etsy_listing_id, total_renewals, relist_renewals, total_renewal_cost_usd, is_unique_item, vacation_adjusted_days, estimated_stale_score, data_confidence")
          .eq("etsy_shop_id", activeShopId)
          .order("estimated_stale_score", { ascending: false })
          .limit(200);
        const rrows = (rsum ?? []) as Array<{
          etsy_listing_id: string; total_renewals: number; relist_renewals: number;
          total_renewal_cost_usd: number; is_unique_item: boolean;
          vacation_adjusted_days: number | null; estimated_stale_score: number;
          data_confidence: "inferred" | "partial" | "observed";
        }>;
        if (rrows.length > 0) {
          const insights: Array<{ kind: string; severity: "low" | "medium" | "high"; message: string; confidence: string }> = [];
          const dropSeverity = (s: "low" | "medium" | "high"): "low" | "medium" | "high" =>
            s === "high" ? "medium" : s === "medium" ? "low" : "low";
          const fmtMsg = (raw: string, conf: string) =>
            conf === "inferred" ? `Based on estimated renewal history — ${raw}` : raw;
          const adjustSev = (sev: "low" | "medium" | "high", conf: string) =>
            conf === "inferred" ? dropSeverity(sev) : sev;

          for (const r of rrows) {
            const days = r.vacation_adjusted_days ?? 0;
            const cost = Number(r.total_renewal_cost_usd ?? 0).toFixed(2);
            if (r.is_unique_item && r.estimated_stale_score >= 80) {
              insights.push({
                kind: "stale_unique_high",
                severity: adjustSev("high", r.data_confidence),
                message: fmtMsg(`Listing ${r.etsy_listing_id} (one-of-a-kind) has been listed for ${days} days across ${r.total_renewals} renewals, costing $${cost} in fees without a sale. Strong candidate for a full refresh — new photos, revised tags, or price adjustment.`, r.data_confidence),
                confidence: r.data_confidence,
              });
            } else if (r.is_unique_item && r.estimated_stale_score >= 50) {
              insights.push({
                kind: "stale_unique_medium",
                severity: adjustSev("medium", r.data_confidence),
                message: fmtMsg(`Listing ${r.etsy_listing_id} (unique) has renewed ${r.total_renewals} times ($${cost} in fees). Unsold after ${days} days — a fresh title/tags pass could help.`, r.data_confidence),
                confidence: r.data_confidence,
              });
            }
            if (r.relist_renewals >= 2) {
              insights.push({
                kind: "relist_pattern",
                severity: adjustSev("medium", r.data_confidence),
                message: fmtMsg(`Listing ${r.etsy_listing_id} has been relisted ${r.relist_renewals} times. Repeated expiry before sale suggests it needs more than a renewal — consider a deeper refresh.`, r.data_confidence),
                confidence: r.data_confidence,
              });
            }
          }
          const staleUnique = rrows.filter(r => r.is_unique_item && r.estimated_stale_score >= 60);
          if (staleUnique.length >= 5) {
            const totalUniqueSpend = staleUnique.reduce((s, r) => s + Number(r.total_renewal_cost_usd ?? 0), 0).toFixed(2);
            const worstConfidence = staleUnique.some(r => r.data_confidence === "inferred") ? "inferred"
              : staleUnique.some(r => r.data_confidence === "partial") ? "partial" : "observed";
            insights.push({
              kind: "shop_renewal_waste",
              severity: adjustSev("high", worstConfidence),
              message: fmtMsg(`${staleUnique.length} one-of-a-kind listings have collectively spent $${totalUniqueSpend} in renewal fees without selling. These are top candidates for review.`, worstConfidence),
              confidence: worstConfidence,
            });
          }

          if (insights.length > 0) {
            renewalBlock = `RENEWAL INSIGHTS (from listing_renewal_summary): use these to ground recommendations about which listings are wasting renewal fees. Severity reflects confidence — 'inferred' means historical data is estimated from listing age (not observed sync deltas) and has already been softened. Do not double-discount.
${JSON.stringify(insights.slice(0, 25), null, 2)}`;
          }
        }
      }

      shopBlock = [snapBlock, mentionedBlock, topBlock, recentBlock, expiringBlock, conversionBlock, optsBlock, staleBlock, shopDimBlock, quickWinsBlock, renewalBlock].filter(Boolean).join("\n\n");

    }

    const personalizationBlock = personalization
      ? `STORE PERSONALIZATION (use this to match brand voice & target customer):
${JSON.stringify({
  category: personalization.category,
  completion: personalization.completion_percentage,
  answers: personalization.answers,
  custom: personalization.custom_prompt_override,
}, null, 2)}`
      : "STORE PERSONALIZATION: (not filled out yet — encourage the seller to complete it on the Personalize AI page when relevant).";

    // ── Personal grade history (Personal Workspace grader, last 10) ─────────
    const { data: personalGrades } = await admin
      .from("grade_runs")
      .select("id, listing_url, etsy_listing_id, input_title, overall_score, category, result, created_at")
      .eq("user_id", userId)
      .eq("usage_type", "personal")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(10);

    let personalGradesBlock = "PERSONAL-WORKSPACE GRADES (any-Etsy-URL grader, NOT shop listings): none yet.";
    if (personalGrades && personalGrades.length) {
      const rows = personalGrades.map((g) => {
        const r = (g.result ?? {}) as Record<string, unknown>;
        const dims = (r.dimensions ?? {}) as Record<string, { score?: number; verdict?: string }>;
        const dimSummary = Object.entries(dims)
          .map(([k, v]) => `${k}:${v?.score ?? "?"}`)
          .join(" ");
        return {
          source: "personal_workspace",
          id: g.id,
          title: (g.input_title ?? "").slice(0, 80) || null,
          external_listing_id: g.etsy_listing_id ?? null,
          url: g.listing_url ?? null,
          category: g.category ?? null,
          overall: g.overall_score ?? null,
          letter: r.letter_grade ?? null,
          dims: dimSummary || null,
          working: Array.isArray(r.what_is_working) ? (r.what_is_working as string[]).slice(0, 3) : [],
          needs: Array.isArray(r.what_needs_attention) ? (r.what_needs_attention as string[]).slice(0, 3) : [],
          priority: r.priority_action ?? null,
          dated: new Date(g.created_at as string).toISOString().slice(0, 10),
        };
      });
      const avg = Math.round(
        rows.filter((r) => typeof r.overall === "number").reduce((s, r) => s + (r.overall as number), 0) /
          Math.max(1, rows.filter((r) => typeof r.overall === "number").length),
      );
      personalGradesBlock = `PERSONAL-WORKSPACE GRADES — IMPORTANT: these are listings the seller graded via the Personal Workspace tool (any Etsy URL or manual paste). They are NOT part of the seller's own shop. Do NOT mix them with shop listings or shop dimension breakdowns above. When referring to them, say "the listings you graded in your Personal Workspace" (or similar) — never "your listings".
Count: ${rows.length} · avg overall: ${avg}
Use these only to reason about the seller's grading history, competitor research, or patterns in what they're studying.
${JSON.stringify(rows, null, 2)}`;
    }

    const pageBlock = `PAGE CONTEXT:
- Route: ${pageCtx.route ?? "(unknown)"}
- Page: ${pageLabel ?? "(unknown)"}
${listingId ? `- Listing ID in view: ${listingId}` : ""}`;

    // ── SCORE INTELLIGENCE: current store score + open fix actions ─────────
    // Echo uses this to answer "how do I gain X points / what's worth fixing
    // first / fastest way to improve". impact_pts is computed with the same
    // formula the Score Roadmap uses client-side: base_weight × coverage
    // multiplier × (dimension_weight / 100).
    const [scoreIntelligenceBlock, { block: shopIntelligenceBlock, alertIds }] = await Promise.all([
      buildScoreIntelligenceBlock(admin, userId),
      loadShopIntelligenceContext(admin, userId),
    ]);

    // System prompt: static identity/rules first, then the DYNAMIC_CONTEXT marker
    // so the dispatcher can ephemeral-cache the static prefix on Anthropic.
    const systemPrompt = `${PERSONA}

<<<DYNAMIC_CONTEXT>>>

${pageBlock}
${shopIntelligenceBlock ? shopIntelligenceBlock + "\n\n" : ""}
${scoreIntelligenceBlock}

${shopBlock}

${personalizationBlock}

${personalGradesBlock}`;

    // ── Step 9: Call AI via shared dispatcher (routed per ai_model_config) ──
    const ai = await chatCompletion({
      taskKey: "echo_chat",
      system: systemPrompt,
      cacheSystem: true,
      messages: historyAsc.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      })),
      maxTokens: 1024,
      userId,
    });

    if (ai.error) {
      if (ai.error.status === 429) return json({ error: "rate_limited" }, 429);
      if (ai.error.status === 402) return json({ error: "ai_credits_exhausted" }, 402);
      return json({ error: `AI error: ${ai.error.message}` }, 502);
    }
    if (ai.usage?.cache_read_input_tokens) {
      console.log(`[echo-chat] cache_read=${ai.usage.cache_read_input_tokens} cache_create=${ai.usage.cache_creation_input_tokens ?? 0} provider=${ai.provider}`);
    }
    const raw: string = ai.content ?? "";

    // ── Step 10: OUT_OF_SCOPE sentinel ──────────────────────────────────────
    const oosMatch = raw.trim().match(/^OUT_OF_SCOPE:\s*(out_of_scope|no_data|unknown_term)/i);
    let assistantText: string;
    let wasAnswered = true;
    if (oosMatch) {
      const reason = oosMatch[1].toLowerCase();
      wasAnswered = false;
      assistantText =
        reason === "no_data"
          ? "I don't have that data loaded yet for our shop — try syncing on the Dashboard, or ask me about something I can see (listings, recent performance, the page you're on)."
          : reason === "unknown_term"
            ? "I'm not sure I follow that term — can you describe what you mean, or point me at a specific listing or metric?"
            : "That's outside what I can help with. I stick to your Etsy shop, listings, SEO, photos, pricing, and performance — what would you like to dig into there?";
      await logUnanswered(message, reason);
    } else {
      assistantText = raw.trim() || "Hmm — I came back empty on that one. Want to rephrase?";
    }

    // ── Step 11: Persist assistant message ──────────────────────────────────
    await admin.from("chat_messages").insert({
      session_id: sessionId, user_id: userId, role: "assistant", content: assistantText,
      page_label: pageLabel, listing_id: listingId, was_answered: wasAnswered,
    });

    // Mark competitor alerts that were included in this turn as surfaced.
    if (alertIds.length > 0) {
      await admin
        .from("competitor_alerts")
        .update({ surfaced_to_user: true, surfaced_at: new Date().toISOString() })
        .in("id", alertIds);
    }

    return json({
      sessionId,
      assistantMessage: assistantText,
      usage: { used: gate.used, limit: gate.limit, tier: gate.tier },
      context_loaded: shopIntelligenceBlock.length > 0,
      alerts_surfaced: alertIds.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});

// ── Helper: build LISTING PERFORMANCE HISTORY block ─────────────────────
type Snap = { recorded_on: string; views: number | null; favorites: number | null; quantity: number | null };
type Opt = { id: string; updated_at: string | null; created_at: string | null };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function trendLabel(curr: number, prev: number): string {
  const diff = curr - prev;
  const absPct = prev === 0 ? (curr === 0 ? 0 : 100) : Math.abs(diff / prev) * 100;
  // "flat" = less than 5% AND less than 3 absolute units
  if (Math.abs(diff) < 3 && absPct < 5) return "flat";
  const pct = Math.round(absPct);
  return diff > 0 ? `up ${pct}%` : `down ${pct}%`;
}

function trendAbs(curr: number, prev: number): string {
  const diff = curr - prev;
  if (Math.abs(diff) < 3) return "flat";
  return diff > 0 ? `up ${diff}` : `down ${Math.abs(diff)}`;
}

// snaps are DESC by recorded_on. Pick snapshot closest to N days before a target date.
function closestSnapOnOrBefore(snapsAsc: Snap[], targetMs: number): Snap | null {
  // return the latest snap whose recorded_on <= targetMs
  let best: Snap | null = null;
  for (const s of snapsAsc) {
    const t = new Date(s.recorded_on + "T00:00:00Z").getTime();
    if (t <= targetMs) best = s;
    else break;
  }
  return best;
}

function closestSnapAfter(snapsAsc: Snap[], targetMs: number, withinMs: number): Snap | null {
  let best: Snap | null = null;
  let bestDiff = Infinity;
  for (const s of snapsAsc) {
    const t = new Date(s.recorded_on + "T00:00:00Z").getTime();
    const diff = Math.abs(t - targetMs);
    if (t >= targetMs - withinMs && diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  return best;
}

function buildPerformanceHistoryBlock(snapsDesc: Snap[], opts: Opt[]): string {
  if (!snapsDesc.length && !opts.length) {
    return `LISTING PERFORMANCE HISTORY:
No snapshot history available for this listing yet.`;
  }

  const snapsAsc = [...snapsDesc].slice().reverse();
  const DAY = 86_400_000;
  const now = Date.now();

  const lines: string[] = ["LISTING PERFORMANCE HISTORY (last 60 days of daily snapshots):"];

  if (snapsDesc.length === 0) {
    lines.push("", "No snapshot history available for this listing yet.");
  } else {
    const latest = snapsDesc[0];
    lines.push(
      "",
      `Current snapshot: views ${latest.views ?? 0}, favorites ${latest.favorites ?? 0}, quantity ${latest.quantity ?? 0} as of ${latest.recorded_on}`,
    );

    // 30-day trend — find snap closest to 30 days ago
    const thirtyAgoMs = now - 30 * DAY;
    const baseline = closestSnapOnOrBefore(snapsAsc, thirtyAgoMs)
      ?? snapsAsc[0]; // fallback: oldest available
    if (baseline && baseline !== latest) {
      lines.push(
        "",
        `30-day trend (baseline: ${baseline.recorded_on}):`,
        `  Views:     ${trendLabel(latest.views ?? 0, baseline.views ?? 0)} vs ${baseline.views ?? 0}`,
        `  Favorites: ${trendLabel(latest.favorites ?? 0, baseline.favorites ?? 0)} vs ${baseline.favorites ?? 0}`,
        `  Quantity:  ${trendAbs(latest.quantity ?? 0, baseline.quantity ?? 0)} vs ${baseline.quantity ?? 0}`,
      );
    } else {
      lines.push("", "30-day trend: not enough history yet to compute a baseline.");
    }
  }

  if (opts.length === 0) {
    lines.push("", "No optimizations have been applied to this listing yet.");
  } else {
    opts.forEach((opt, i) => {
      const approvedIso = opt.updated_at ?? opt.created_at;
      if (!approvedIso) return;
      const approvedMs = new Date(approvedIso).getTime();
      const before = closestSnapOnOrBefore(snapsAsc, approvedMs);
      const seven = closestSnapAfter(snapsAsc, approvedMs + 7 * DAY, 3 * DAY);
      const thirty = closestSnapAfter(snapsAsc, approvedMs + 30 * DAY, 5 * DAY);
      const daysSince = Math.max(0, Math.round((now - approvedMs) / DAY));

      lines.push("", `Optimization #${i + 1} — approved ${fmtDate(approvedIso)}:`);
      if (before) {
        lines.push(`  Before (snapshot ${before.recorded_on}):`);
        lines.push(`    views: ${before.views ?? 0}, favorites: ${before.favorites ?? 0}, quantity: ${before.quantity ?? 0}`);
      } else {
        lines.push("  Before: no snapshot available on or before approval date.");
      }
      if (seven) {
        lines.push(`  7 days after (snapshot ${seven.recorded_on}):`);
        lines.push(`    views: ${seven.views ?? 0}, favorites: ${seven.favorites ?? 0}, quantity: ${seven.quantity ?? 0}`);
        if (before) {
          lines.push(`    delta: views ${(seven.views ?? 0) - (before.views ?? 0) >= 0 ? "+" : ""}${(seven.views ?? 0) - (before.views ?? 0)}, favorites ${(seven.favorites ?? 0) - (before.favorites ?? 0) >= 0 ? "+" : ""}${(seven.favorites ?? 0) - (before.favorites ?? 0)}`);
        }
      } else if (daysSince < 7) {
        lines.push(`  7-day data not yet available — ${daysSince} days since optimization.`);
      }
      if (daysSince >= 30) {
        if (thirty) {
          lines.push(`  30 days after (snapshot ${thirty.recorded_on}):`);
          lines.push(`    views: ${thirty.views ?? 0}, favorites: ${thirty.favorites ?? 0}, quantity: ${thirty.quantity ?? 0}`);
          if (before) {
            lines.push(`    delta: views ${(thirty.views ?? 0) - (before.views ?? 0) >= 0 ? "+" : ""}${(thirty.views ?? 0) - (before.views ?? 0)}, favorites ${(thirty.favorites ?? 0) - (before.favorites ?? 0) >= 0 ? "+" : ""}${(thirty.favorites ?? 0) - (before.favorites ?? 0)}`);
          }
        }
      } else {
        lines.push(`  30-day data not yet available — ${daysSince} days since optimization.`);
      }
    });
  }

  return lines.join("\n");
}

// ── SCORE INTELLIGENCE helpers ─────────────────────────────────────────────
// Mirror of the Score Roadmap's coverage curve. Keep in sync with
// `coverageMultiplier()` in src/pages/ScoreRoadmap.tsx.
function coverageMultiplier(pct: number): number {
  if (pct < 0.05) return 0.3;
  if (pct < 0.15) return 0.6;
  if (pct < 0.30) return 1.0;
  if (pct < 0.50) return 1.4;
  if (pct < 0.70) return 1.8;
  return 2.2;
}

// Factor -> { dimension key, base_weight, human label } table. Mirrors
// DEFAULT_ACTIONS in ScoreRoadmap.tsx — single-source-of-truth would be
// nicer but Echo runs in Deno so we duplicate the small constant here.
const FACTOR_TABLE: Record<string, { dimension: "content" | "media" | "tags" | "freshness"; base_weight: number; label: string }> = {
  title_strength:       { dimension: "content", base_weight: 8, label: "Fix weak titles" },
  title_length:         { dimension: "content", base_weight: 8, label: "Lengthen short titles" },
  description_quality:  { dimension: "content", base_weight: 6, label: "Improve thin descriptions" },
  description_length:   { dimension: "content", base_weight: 6, label: "Lengthen thin descriptions" },
  photo_count:          { dimension: "media",   base_weight: 4, label: "Add photos to low-image listings" },
  video_present:        { dimension: "media",   base_weight: 6, label: "Add video to listings" },
  tag_coverage:         { dimension: "tags",    base_weight: 5, label: "Fill empty tag slots" },
  tags_complete:        { dimension: "tags",    base_weight: 5, label: "Fill empty tag slots" },
  materials_present:    { dimension: "tags",    base_weight: 4, label: "Add materials to listings" },
};
const DIMENSION_WEIGHT: Record<string, number> = { content: 35, media: 25, tags: 20, freshness: 20 };

async function buildScoreIntelligenceBlock(admin: ReturnType<typeof createClient>, userId: string): Promise<string> {
  // Total active listings for coverage math.
  const { count: activeCount } = await admin
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("state", "active");
  const totalActive = activeCount ?? 0;

  // Evaluated = listings that have at least one completed grade run.
  // Used to surface "unevaluated" context so Echo never claims a factor
  // is clean when most listings have never been graded.
  const { count: evaluatedCount } = await admin
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("state", "active")
    .not("current_grade", "is", null);
  const evaluated = evaluatedCount ?? 0;
  const unevaluated = Math.max(0, totalActive - evaluated);

  // Latest store_health snapshot — fall back gracefully when missing.
  const { data: shopRow } = await admin
    .from("stores")
    .select("store_health_score")
    .eq("user_id", userId)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currentScore = (shopRow?.store_health_score as number | null) ?? null;


  // Pending fix actions grouped by factor + estimated effort.
  const { data: fixes } = await admin
    .from("fix_actions")
    .select("id, factor_key, dimension, estimated_effort, listing_id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .limit(5000);
  const rows = (fixes ?? []) as Array<{ id: string; factor_key: string; dimension: string; estimated_effort: string | null; listing_id: string | null }>;

  type Agg = { factor: string; dimension: string; affected: number; impact_pts: number; effort: string; label: string };
  const grouped = new Map<string, Agg>();
  for (const r of rows) {
    const meta = FACTOR_TABLE[r.factor_key];
    if (!meta) continue;
    const key = r.factor_key;
    const prev = grouped.get(key);
    const next: Agg = prev ?? {
      factor: r.factor_key,
      dimension: meta.dimension,
      affected: 0,
      impact_pts: 0,
      effort: r.estimated_effort ?? "medium",
      label: meta.label,
    };
    next.affected += 1;
    grouped.set(key, next);
  }
  // Compute impact_pts after counts are known.
  for (const agg of grouped.values()) {
    const meta = FACTOR_TABLE[agg.factor];
    const dimW = (DIMENSION_WEIGHT[meta.dimension] ?? 20) / 100;
    const mult = totalActive > 0 ? coverageMultiplier(agg.affected / totalActive) : 1.0;
    agg.impact_pts = Math.round(meta.base_weight * mult * dimW);
  }
  const ranked = Array.from(grouped.values()).sort((a, b) => b.impact_pts - a.impact_pts);
  const maxReachable = ranked.reduce((s, a) => s + a.impact_pts, 0);

  if (ranked.length === 0 && currentScore == null) {
    return "SCORE & OPEN FIX ACTIONS: no graded listings or open fix actions yet — encourage the seller to run a grading pass first.";
  }

  return `SCORE & OPEN FIX ACTIONS (use this for score-improvement questions):
CURRENT STORE SCORE: ${currentScore ?? "(not graded yet)"}
TOTAL ACTIVE LISTINGS: ${totalActive}
EVALUATED LISTINGS: ${evaluated} (${totalActive > 0 ? Math.round((evaluated / totalActive) * 100) : 0}% coverage)
UNEVALUATED LISTINGS: ${unevaluated} — these listings have never been through optimization or a full grade run and cannot be fully scored yet. When the seller asks about their score or why certain fix actions show "no issues", factor in that these ${unevaluated} listings may be hiding additional weak titles, thin descriptions, or low photo counts that will only surface after grading. Never tell a seller a factor "looks good" if a meaningful number of their listings are unevaluated.
MAX REACHABLE FROM OPEN ACTIONS: +${maxReachable} pts

OPEN FIX ACTIONS (ranked by impact_pts DESC):
${ranked.length === 0
  ? "  (no open fix actions — store looks tidy, but check unevaluated count above before claiming the store is clean)"
  : ranked.map((a, i) =>
      `  ${i + 1}. ${a.label} — ${a.affected} listings, +${a.impact_pts} pts (dimension: ${a.dimension}, effort: ${a.effort})`,
    ).join("\n")
}

When answering, group by impact and effort. If unevaluated > 0, proactively recommend grading those listings first so hidden issues surface. Always end with a direct offer to navigate to the Score Roadmap and start the highest-impact action.`;
}

// ── Shop Intelligence context loader ──────────────────────────────────────────
// Loads shop_intelligence (pre-aggregated nightly), unsurfaced competitor_alerts,
// and needs_attention fix_actions, then formats them into a grounding block.
async function loadShopIntelligenceContext(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ block: string; alertIds: string[] }> {
  const [siRes, alertsRes, needsAttnRes] = await Promise.all([
    admin
      .from("shop_intelligence")
      .select("overall_market_score, score_delta_7d, score_delta_30d, score_trend, open_fix_count, tracked_fix_count, resolved_fix_count, total_points_available, total_points_gained, top_opportunities, total_listings, analyzed_listings, listings_needing_attention, last_fix_applied_at, last_fix_category, active_strategy, rebuilt_at")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("competitor_alerts")
      .select("id, search_term, competitor_title, change_type, severity, detected_at")
      .eq("user_id", userId)
      .eq("surfaced_to_user", false)
      .eq("dismissed_by_user", false)
      .order("severity", { ascending: false })
      .order("detected_at", { ascending: false })
      .limit(5),
    admin
      .from("fix_actions")
      .select("id, factor_key, listing_id, applied_at, dimension")
      .eq("user_id", userId)
      .eq("status", "needs_attention")
      .limit(3),
  ]);

  const si = siRes.data;
  if (!si) return { block: "", alertIds: [] };

  const competitorAlerts = (alertsRes.data ?? []) as Array<{
    id: string; search_term: string; competitor_title: string | null;
    change_type: string; severity: string; detected_at: string;
  }>;
  const alertIds = competitorAlerts.map((a) => a.id);
  const needsAttnFixes = (needsAttnRes.data ?? []) as Array<{
    id: string; factor_key: string; listing_id: string | null; applied_at: string | null; dimension: string;
  }>;

  // Resolve listing titles for needs_attention fixes.
  const fixListingIds = needsAttnFixes.filter((f) => f.listing_id).map((f) => f.listing_id as string);
  const titleMap = new Map<string, string>();
  if (fixListingIds.length > 0) {
    const { data: listingRows } = await admin
      .from("listings")
      .select("id, title")
      .in("id", fixListingIds);
    for (const l of (listingRows ?? [])) titleMap.set(l.id as string, (l.title as string) ?? "Unknown");
  }

  const sign = (n: number) => n > 0 ? "+" : "";
  const topOpps = ((si.top_opportunities ?? []) as Array<{
    dimension: string; issue: string; impact_points: number; listing_title: string;
  }>).slice(0, 3);

  const competitorAlertsStr = competitorAlerts.length > 0
    ? `Competitor Alerts (unsurfaced):\n${competitorAlerts.map((a) =>
        `- [${a.severity.toUpperCase()}] ${a.change_type} detected for "${a.competitor_title ?? "unknown"}" on search: "${a.search_term}"`
      ).join("\n")}`
    : "No new competitor alerts.";

  const needsAttnStr = needsAttnFixes.length > 0
    ? `\nFixes That Didn't Work (needs new approach):\n${needsAttnFixes.map((f) => {
        const title = f.listing_id ? (titleMap.get(f.listing_id) ?? "unknown listing") : "shop-level";
        const date = f.applied_at ? new Date(f.applied_at).toISOString().slice(0, 10) : "unknown date";
        return `- ${f.factor_key} fix on "${title}" — applied ${date}, no improvement detected`;
      }).join("\n")}`
    : "";

  const block = `SHOP INTELLIGENCE CONTEXT (updated: ${si.rebuilt_at}):

Market Score: ${si.overall_market_score ?? "not yet calculated"}/100
Score trend (7 days): ${sign(si.score_delta_7d ?? 0)}${si.score_delta_7d ?? 0} points (${si.score_trend ?? "stable"})
Score trend (30 days): ${sign(si.score_delta_30d ?? 0)}${si.score_delta_30d ?? 0} points

Fix Actions:
- Open fixes: ${si.open_fix_count ?? 0} (${si.total_points_available ?? 0} points available)
- Applied & tracking: ${si.tracked_fix_count ?? 0}
- Resolved this month: ${si.resolved_fix_count ?? 0}
- Total points gained: ${si.total_points_gained ?? 0}

Shop Health:
- Total active listings: ${si.total_listings ?? 0}
- Listings analyzed: ${si.analyzed_listings ?? 0}
- Listings needing attention: ${si.listings_needing_attention ?? 0}

Top 3 Opportunities Right Now:
${topOpps.length > 0
  ? topOpps.map((o, i) => `${i + 1}. [${o.dimension}] ${o.issue} — worth +${o.impact_points} pts (listing: "${o.listing_title}")`).join("\n")
  : "None available yet — run a nightly scan to populate."}

${competitorAlertsStr}${needsAttnStr}

Last fix applied: ${si.last_fix_applied_at
  ? `${si.last_fix_category ?? "unknown category"} on ${new Date(si.last_fix_applied_at).toISOString().slice(0, 10)}`
  : "None yet"}
Active strategy: ${si.active_strategy ?? "echo"}`;

  return { block, alertIds };
}

