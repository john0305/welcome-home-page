// Reports which backend secrets are configured. Admin-only.
// Authorization is enforced via the user_roles table (has_role), not by email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const sbService = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: userRes } = await sbService.auth.getUser(token);
  if (!userRes?.user) return json({ error: "Unauthorized" }, 401);

  const { data: isAdmin, error: roleErr } = await sbService.rpc("has_role", {
    _user_id: userRes.user.id,
    _role: "admin",
  });
  if (roleErr || !isAdmin) {
    return json({ error: "Forbidden" }, 403);
  }

  return json({
    anthropic: !!Deno.env.get("ANTHROPIC_API_KEY"),
    etsy_api_key: !!Deno.env.get("ETSY_API_KEY"),
    etsy_shared_secret: !!Deno.env.get("ETSY_SHARED_SECRET"),
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
