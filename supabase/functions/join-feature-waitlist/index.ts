// Join a feature waitlist. Accepts anonymous email signups and authenticated
// (user_id + email) signups. Idempotent — duplicate signups return success.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  let body: { email?: string; feature_key?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const feature_key = (body.feature_key ?? "").trim();
  if (!feature_key || feature_key.length > 64) {
    return json(400, { error: "invalid_feature_key" });
  }

  // Try to resolve an authenticated user from the bearer token
  const authHeader = req.headers.get("Authorization") ?? "";
  let user_id: string | null = null;
  let user_email: string | null = null;
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data } = await userClient.auth.getUser();
      if (data.user) {
        user_id = data.user.id;
        user_email = data.user.email ?? null;
      }
    } catch { /* ignore — treat as anon */ }
  }

  let email = user_email ?? (body.email ?? "").trim().toLowerCase() ?? null;
  if (!user_id) {
    if (!email || !EMAIL_RE.test(email) || email.length > 255) {
      return json(400, { error: "invalid_email" });
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    if (user_id) {
      // Authenticated: upsert by (user_id, feature_key)
      const { data: existing } = await admin
        .from("feature_waitlist")
        .select("id")
        .eq("user_id", user_id)
        .eq("feature_key", feature_key)
        .maybeSingle();
      if (existing) return json(200, { ok: true, already: true });
      const { error } = await admin
        .from("feature_waitlist")
        .insert({ user_id, email, feature_key });
      if (error) throw error;
      return json(200, { ok: true });
    } else {
      // Anon: upsert by (email, feature_key)
      const { data: existing } = await admin
        .from("feature_waitlist")
        .select("id")
        .eq("email", email!)
        .eq("feature_key", feature_key)
        .maybeSingle();
      if (existing) return json(200, { ok: true, already: true });
      const { error } = await admin
        .from("feature_waitlist")
        .insert({ user_id: null, email, feature_key });
      if (error) throw error;
      return json(200, { ok: true });
    }
  } catch (e) {
    console.error("join-feature-waitlist error", e);
    return json(500, { error: "internal_error" });
  }
});
