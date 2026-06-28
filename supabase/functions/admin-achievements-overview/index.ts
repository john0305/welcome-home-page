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
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user?.id) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: isAdmin, error: roleError } = await admin.rpc("has_role", {
    _user_id: authData.user.id,
    _role: "admin",
  });
  if (roleError) return json({ error: roleError.message }, 500);
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  const [aRes, eRes, cRes, sRes, lRes] = await Promise.all([
    admin.from("achievements").select("*").order("category").order("points"),
    admin
      .from("user_achievements")
      .select("id,user_id,achievement_id,awarded_at,award_method,is_valid,hidden_from_user,admin_reason")
      .order("awarded_at", { ascending: false })
      .limit(500),
    admin.from("user_achievements").select("achievement_id"),
    admin.from("system_settings").select("value").eq("key", "achievements_enabled").maybeSingle(),
    admin.from("achievement_audit_log").select("*").order("created_at", { ascending: false }).limit(200),
  ]);

  if (aRes.error) return json({ error: aRes.error.message }, 500);
  if (eRes.error) return json({ error: eRes.error.message }, 500);
  if (cRes.error) return json({ error: cRes.error.message }, 500);
  if (sRes.error) return json({ error: sRes.error.message }, 500);
  if (lRes.error) return json({ error: lRes.error.message }, 500);

  const earnedCounts: Record<string, number> = {};
  for (const row of cRes.data ?? []) {
    earnedCounts[row.achievement_id] = (earnedCounts[row.achievement_id] ?? 0) + 1;
  }

  const rows = eRes.data ?? [];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
  let profiles: Array<{ id: string; email: string | null; username: string | null }> = [];
  if (userIds.length > 0) {
    const { data, error } = await admin.from("user_profiles").select("id,email,username").in("id", userIds);
    if (error) return json({ error: error.message }, 500);
    profiles = data ?? [];
  }

  return json({
    achievements: aRes.data ?? [],
    earnedCounts,
    earnedRows: rows,
    profiles,
    systemSetting: sRes.data ?? null,
    auditLog: lRes.data ?? [],
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}