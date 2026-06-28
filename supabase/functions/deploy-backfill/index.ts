/**
 * deploy-backfill
 *
 * One-time function: run after deploy to initialize market intelligence
 * for all existing connected users who haven't been processed yet.
 *
 * Invoke via Supabase dashboard or CLI with service-role credentials.
 * Staggers calls by 30 seconds per user to protect Etsy API quota.
 *
 * POST body (optional): { dry_run?: boolean, user_id?: string }
 *   dry_run: log what would run without invoking the pipeline
 *   user_id: process only a single user (for testing)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json, makeServiceClient } from "../_shared/action-engine.ts";

const STAGGER_MS = 30_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Service-role only
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isServiceCall = !!token && !!SERVICE_KEY && token === SERVICE_KEY;
  if (!isServiceCall) return json({ error: "Service role required" }, 403);

  const supabase = makeServiceClient();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const dryRun = Boolean(body.dry_run ?? false);
  const targetUserId = body.user_id ? String(body.user_id) : null;

  // Find users with connected shops who haven't been initialized
  const query = supabase
    .from("user_profiles")
    .select("id, email")
    .eq("market_intelligence_initialized", false);

  if (targetUserId) query.eq("id", targetUserId);

  const { data: users, error } = await query.limit(500);
  if (error) return json({ error: error.message }, 500);

  // Filter to those who actually have connected stores
  const userIds = (users ?? []).map((u: { id: string }) => u.id);
  const { data: connectedStores } = await supabase
    .from("stores")
    .select("user_id")
    .in("user_id", userIds);

  const connectedUserIds = new Set((connectedStores ?? []).map((s: { user_id: string }) => s.user_id));
  const eligible = (users ?? []).filter((u: { id: string }) => connectedUserIds.has(u.id));

  console.log(`[deploy-backfill] Found ${eligible.length} users needing backfill${dryRun ? " (DRY RUN)" : ""}`);

  if (dryRun) {
    return json({
      dry_run: true,
      eligible_count: eligible.length,
      users: eligible.map((u: { id: string; email?: string }) => ({ id: u.id, email: u.email })),
    });
  }

  const results: Array<{ user_id: string; status: string; error?: string }> = [];

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  for (const [index, user] of eligible.entries()) {
    if (index > 0) {
      await new Promise((r) => setTimeout(r, STAGGER_MS));
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/onboarding-pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.id,
          run_type: "backfill",
          trigger_reason: "deploy",
          force: false,
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`[deploy-backfill] ✅ ${user.id} — niche: ${data.niche ?? "unknown"}, listings: ${data.listings_processed ?? 0}`);
        results.push({ user_id: user.id, status: "success" });
      } else {
        const errText = await res.text().catch(() => "");
        console.error(`[deploy-backfill] ❌ ${user.id} — ${res.status}: ${errText.slice(0, 200)}`);
        results.push({ user_id: user.id, status: "failed", error: `HTTP ${res.status}` });
      }
    } catch (err) {
      console.error(`[deploy-backfill] ❌ ${user.id} — exception: ${err}`);
      results.push({ user_id: user.id, status: "failed", error: String(err) });
    }
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return json({
    total: eligible.length,
    succeeded,
    failed,
    results,
  });
});
