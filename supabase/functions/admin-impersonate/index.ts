// Admin-only: generates a magic link for a target user so an admin can sign in as them.
// Authorization: caller must have the 'admin' role in user_roles (checked via has_role RPC).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: userRes } = await sb.auth.getUser(token);
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin, error: roleErr } = await sb.rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const targetUserId = body?.user_id as string | undefined;
    const redirectTo = (body?.redirect_to as string | undefined) ?? undefined;
    if (!targetUserId) return json({ error: "Missing user_id" }, 400);

    // Look up target email
    const { data: profile, error: pErr } = await sb
      .from("user_profiles")
      .select("email")
      .eq("id", targetUserId)
      .maybeSingle();

    if (pErr || !profile?.email) return json({ error: "Target user not found or has no email" }, 404);

    const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
      options: redirectTo ? { redirectTo } : undefined,
    });

    if (linkErr || !link?.properties?.action_link) {
      return json({ error: linkErr?.message ?? "Failed to generate link" }, 500);
    }

    return json({
      action_link: link.properties.action_link,
      email: profile.email,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
