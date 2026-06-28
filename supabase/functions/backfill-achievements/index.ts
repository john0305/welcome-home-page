// Admin-only: re-evaluate organic achievements for all users (or a single user).
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
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user?.id) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  let body: { userEmail?: string } = {};
  try { body = await req.json(); } catch { /* empty body = all users */ }

  let targets: string[] = [];
  if (body.userEmail) {
    const { data: prof } = await admin.from("user_profiles").select("id").eq("email", body.userEmail).maybeSingle();
    if (!prof) return json({ error: "User not found" }, 404);
    targets = [prof.id as string];
  } else {
    const { data: all } = await admin.from("user_profiles").select("id");
    targets = (all ?? []).map((r: { id: string }) => r.id as string);
  }

  let processed = 0;
  let awarded = 0;
  const errors: string[] = [];

  for (const uid of targets) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/check-and-award-achievements`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: uid }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        processed++;
        awarded += (j as { awarded?: number })?.awarded ?? 0;
      } else {
        errors.push(`${uid}: ${(j as { error?: string })?.error ?? res.status}`);
      }
    } catch (e) {
      errors.push(`${uid}: ${(e as Error).message}`);
    }
  }

  await admin.from("achievement_audit_log").insert({
    event_type: "backfill_run",
    performed_by: u.user.id,
    metadata: { targets: targets.length, processed, awarded, errors: errors.slice(0, 20) },
  });

  return json({ targets: targets.length, processed, awarded, errors: errors.slice(0, 20) });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
