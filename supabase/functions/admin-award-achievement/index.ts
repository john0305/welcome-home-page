// Admin-only: manually award an achievement to a user (single) or all users (bulk).
// Auth via signed-in admin user (validates has_role).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims } = await userClient.auth.getClaims(authHeader.slice(7));
  if (!claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const adminId = claims.claims.sub as string;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: adminId, _role: "admin" });
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  let body: { achievementId?: string; mode?: "single" | "bulk"; userEmail?: string; reason?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { achievementId, mode, userEmail, reason } = body;
  if (!achievementId || !mode || !reason) return json({ error: "Missing fields" }, 400);

  let targetIds: string[] = [];
  if (mode === "single") {
    if (!userEmail) return json({ error: "userEmail required" }, 400);
    const { data: prof } = await admin.from("user_profiles").select("id").eq("email", userEmail).maybeSingle();
    if (!prof) return json({ error: "User not found" }, 404);
    targetIds = [prof.id as string];
  } else {
    const { data: all } = await admin.from("user_profiles").select("id");
    targetIds = (all ?? []).map((r: { id: string }) => r.id as string);
  }

  const awardMethod = mode === "single" ? "admin_single" : "admin_bulk";
  const rows = targetIds.map(uid => ({
    user_id: uid,
    achievement_id: achievementId,
    award_method: awardMethod,
    awarded_by_admin: adminId,
    admin_reason: reason,
    toast_delivered: false,
    trigger_snapshot: { manual: true, reason, awarded_by: adminId, awarded_at: new Date().toISOString() },
  }));

  // Insert in chunks; ignore conflicts (already earned).
  const chunkSize = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from("user_achievements")
      .upsert(chunk, { onConflict: "user_id,achievement_id", ignoreDuplicates: true })
      .select("id");
    if (!error && data) inserted += data.length;
  }

  await admin.from("achievement_audit_log").insert({
    event_type: "admin_awarded",
    achievement_id: achievementId,
    performed_by: adminId,
    metadata: { mode, reason, target_count: targetIds.length, inserted },
  });

  return json({ target_count: targetIds.length, inserted });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
