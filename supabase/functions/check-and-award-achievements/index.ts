// Nightly achievement evaluator. Called by sync-all-stores per user, or by
// admin backfill. Auth via CRON_SECRET or service-role JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Stats { [k: string]: number }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET");

  const auth = req.headers.get("authorization") ?? "";
  const isService =
    auth === `Bearer ${SERVICE_KEY}` ||
    (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`);

  let body: { userId?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  let userId = body.userId;

  // Allow a logged-in user to self-evaluate (no userId or matching userId).
  if (!isService) {
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user?.id) return json({ error: "Unauthorized" }, 401);
    if (userId && userId !== u.user.id) return json({ error: "Forbidden" }, 403);
    userId = u.user.id;
  }
  if (!userId || typeof userId !== "string") return json({ error: "userId required" }, 400);


  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Feature flag
  const { data: flagRow } = await supabase
    .from("system_settings").select("value").eq("key", "achievements_enabled").maybeSingle();
  const enabled = flagRow ? (flagRow.value === true || flagRow.value === "true") : true;
  if (!enabled) return json({ skipped: "achievements_disabled" });

  // Record today as active
  await supabase.from("user_activity_days").upsert(
    { user_id: userId, day: new Date().toISOString().slice(0, 10) },
    { onConflict: "user_id,day" }
  );

  const stats = await getUserStats(supabase, userId);

  const { data: achievements } = await supabase
    .from("achievements").select("*")
    .eq("is_active", true).eq("trigger_type", "organic");
  if (!achievements?.length) return json({ awarded: 0 });

  const { data: earned } = await supabase
    .from("user_achievements").select("achievement_id")
    .eq("user_id", userId).eq("is_valid", true);
  const earnedIds = new Set((earned ?? []).map((e: { achievement_id: string }) => e.achievement_id));

  const newAwards: Array<Record<string, unknown>> = [];
  const auditRows: Array<Record<string, unknown>> = [];

  for (const a of achievements as Array<{ id: string; trigger_condition: { metric: string; threshold: number } }>) {
    if (earnedIds.has(a.id)) continue;
    const { metric, threshold } = a.trigger_condition;
    const v = stats[metric] ?? 0;
    if (v < threshold) continue;

    newAwards.push({
      user_id: userId,
      achievement_id: a.id,
      award_method: "organic",
      toast_delivered: false,
      trigger_snapshot: {
        metric, threshold, value_at_trigger: v,
        evaluated_at: new Date().toISOString(),
      },
    });
    auditRows.push({
      event_type: "earned",
      achievement_id: a.id,
      user_id: userId,
      performed_by: userId,
      metadata: { metric, value_at_trigger: v },
    });
  }

  if (newAwards.length > 0) {
    const { error } = await supabase.from("user_achievements").insert(newAwards);
    if (error) return json({ error: error.message }, 500);
    await supabase.from("achievement_audit_log").insert(auditRows);
  }

  return json({ awarded: newAwards.length });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
async function getUserStats(supabase: any, userId: string): Promise<Stats> {
  const stats: Stats = { account_created: 1 };

  const head = (q: any) => q.select("*", { count: "exact", head: true });

  const [
    storesRes, syncsRes, listingsRes, optsRes, optimizedDistinctRes,
    gradedARes, attrRes, pinsRes, profileRes, activityRes, countersRes
  ] = await Promise.all([
    head(supabase.from("etsy_tokens")).eq("user_id", userId),
    head(supabase.from("snapshot_runs")).eq("user_id", userId),
    head(supabase.from("listings")).eq("user_id", userId).eq("state", "active"),
    head(supabase.from("optimizations")).eq("user_id", userId).neq("status", "superseded"),
    supabase.from("optimizations").select("listing_id").eq("user_id", userId),
    head(supabase.from("grade_runs")).eq("user_id", userId).gte("overall_score", 90),
    supabase.from("performance_attribution").select("post_sales, post_revenue, optimized_at").eq("user_id", userId),
    head(supabase.from("pinterest_posts")).eq("user_id", userId).is("removed_at", null),
    supabase.from("stores").select("has_banner, has_shop_icon, return_policy, shipping_policy").eq("user_id", userId).limit(1),
    supabase.from("user_activity_days").select("day").eq("user_id", userId)
      .gte("day", new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)),
    supabase.from("user_event_counters").select("metric, value").eq("user_id", userId),
  ]);

  stats.connected_stores = storesRes.count ?? 0;
  stats.syncs_completed = syncsRes.count ?? 0;
  stats.active_listings = listingsRes.count ?? 0;
  stats.optimizations_run = optsRes.count ?? 0;
  stats.listings_graded_a_or_above = gradedARes.count ?? 0;
  stats.pinterest_spotlights_posted = pinsRes.count ?? 0;

  const distinctOptimized = new Set(
    ((optimizedDistinctRes.data ?? []) as Array<{ listing_id: string }>).map(r => r.listing_id)
  ).size;
  stats.pct_listings_optimized = stats.active_listings > 0
    ? Math.floor((distinctOptimized / stats.active_listings) * 100) : 0;

  const attr = (attrRes.data ?? []) as Array<{ post_sales: number | null; post_revenue: number | null; optimized_at: string }>;
  stats.total_sales = attr.reduce((s, r) => s + (r.post_sales ?? 0), 0);
  stats.total_revenue_usd = attr.reduce((s, r) => s + (Number(r.post_revenue) || 0), 0);
  // single_day_sales: highest post_sales count on any optimized_at day
  const dayMap: Record<string, number> = {};
  for (const r of attr) {
    const d = r.optimized_at?.slice(0, 10);
    if (!d) continue;
    dayMap[d] = (dayMap[d] ?? 0) + (r.post_sales ?? 0);
  }
  stats.single_day_sales = Object.values(dayMap).reduce((m, v) => Math.max(m, v), 0);
  // repeat_buyers not tracked yet
  stats.repeat_buyers = 0;

  // observed renewal events — via shop_id join
  const { data: shops } = await supabase
    .from("stores").select("etsy_shop_id").eq("user_id", userId);
  const shopIds = (shops ?? []).map((s: { etsy_shop_id: string }) => s.etsy_shop_id);
  if (shopIds.length > 0) {
    const { count } = await supabase
      .from("listing_renewal_events").select("*", { count: "exact", head: true })
      .in("etsy_shop_id", shopIds);
    stats.observed_renewal_events = count ?? 0;
  } else {
    stats.observed_renewal_events = 0;
  }

  // profile_complete
  const p = (profileRes.data ?? [])[0] as
    | { has_banner: boolean; has_shop_icon: boolean; return_policy: string | null; shipping_policy: string | null }
    | undefined;
  stats.profile_complete = (p?.has_banner && p?.has_shop_icon && p?.return_policy && p?.shipping_policy) ? 1 : 0;

  stats.rolling_active_days = (activityRes.data ?? []).length;

  for (const c of (countersRes.data ?? []) as Array<{ metric: string; value: number }>) {
    stats[c.metric] = c.value;
  }

  return stats;
}
