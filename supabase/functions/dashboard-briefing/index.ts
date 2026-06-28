// Dashboard Briefing — generates a 2-3 sentence personalized daily summary
// for the seller's dashboard. Cached on the client for 24h; this function
// is called at most once per store per day.
//
// Flow: JWT auth → load store context (score, listings, movers, fixes) → Haiku → return briefing
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

const SYSTEM_PROMPT = `You are a daily briefing writer for RadarIQ, an Etsy seller optimization tool.

Write 2-3 short sentences that feel like a smart assistant who studied the seller's shop overnight.

Rules:
- Be specific: use the real numbers and listing names from the data provided.
- End with one clear, actionable recommendation.
- Do NOT use generic openers like "Great news!", "Keep it up!", or "Your shop is doing well."
- Do NOT mention RadarIQ by name — just write as if you're talking directly to the seller.
- Tone: direct, warm, confident. Like a trusted advisor, not a cheerleader.
- Length: 2-3 sentences maximum. No bullet points. Plain prose only.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // 1. Find the user's connected store
    const { data: storeRow } = await admin
      .from("stores")
      .select("id, shop_name, store_health_score, last_synced_at")
      .eq("user_id", user.id)
      .eq("connected", true)
      .maybeSingle();

    if (!storeRow) return json({ error: "No connected store" }, 404);

    const storeId = storeRow.id as string;
    const shopName = (storeRow.shop_name as string | null) ?? "your shop";
    const healthScore = (storeRow.store_health_score as number | null) ?? null;

    // 2. Active listing count + expiring soon (within 7 days)
    const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: listings } = await admin
      .from("listings")
      .select("id, title, state, ending_at, views, score")
      .eq("store_id", storeId)
      .eq("state", "active");

    const activeListings = listings ?? [];
    const activeCount = activeListings.length;
    const expiringSoon = activeListings.filter(
      (l) => l.ending_at && l.ending_at < sevenDaysOut,
    ).length;

    // 3. Pending fix actions count
    const { count: pendingFixCount } = await admin
      .from("fix_actions")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "pending");

    // 4. Biggest view mover from last 7 days (listing_performance_snapshots)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const { data: snapshots } = await admin
      .from("listing_snapshots")
      .select("listing_id, views, recorded_on")
      .eq("user_id", user.id)
      .gte("recorded_on", sevenDaysAgo)
      .order("recorded_on", { ascending: true });

    let biggestMover: { title: string; viewDelta: number } | null = null;
    if (snapshots && snapshots.length > 0) {
      const byListing = new Map<string, { first: number; last: number }>();
      for (const snap of snapshots) {
        const id = snap.listing_id as string;
        const views = snap.views as number ?? 0;
        const existing = byListing.get(id);
        if (!existing) {
          byListing.set(id, { first: views, last: views });
        } else {
          byListing.set(id, { first: existing.first, last: views });
        }
      }
      let maxDelta = 0;
      let maxId = "";
      for (const [id, { first, last }] of byListing.entries()) {
        const delta = last - first;
        if (delta > maxDelta) { maxDelta = delta; maxId = id; }
      }
      if (maxId && maxDelta > 0) {
        const listing = activeListings.find((l) => l.id === maxId);
        const title = listing?.title as string | null ?? null;
        if (title) {
          const shortTitle = title.length > 50 ? title.slice(0, 47) + "…" : title;
          biggestMover = { title: shortTitle, viewDelta: maxDelta };
        }
      }
    }

    // 5. Build the context block for the AI
    const lines: string[] = [`Shop: ${shopName}`];
    if (healthScore !== null) lines.push(`Store health score: ${healthScore}/100`);
    lines.push(`Active listings: ${activeCount}`);
    if (expiringSoon > 0) lines.push(`Expiring within 7 days: ${expiringSoon} listings`);
    if (pendingFixCount !== null && pendingFixCount > 0) lines.push(`Pending fix actions: ${pendingFixCount}`);
    if (biggestMover) lines.push(`Biggest mover this week: "${biggestMover.title}" (+${biggestMover.viewDelta} views)`);

    const contextBlock = lines.join("\n");

    // 6. Call Claude Haiku
    const result = await chatCompletion({
      taskKey: "dashboard_briefing",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Here is the seller's current shop data:\n\n${contextBlock}\n\nWrite the daily briefing now.` }],
      maxTokens: 200,
      temperature: 0.7,
      userId: user.id,
    });

    if (result.error) {
      console.error("[dashboard-briefing] AI error:", result.error);
      return json({ error: "AI unavailable" }, 503);
    }

    return json({
      briefing: result.content.trim(),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[dashboard-briefing] error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
