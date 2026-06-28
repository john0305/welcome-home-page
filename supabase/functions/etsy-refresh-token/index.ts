// Refresh Etsy OAuth access token for the calling user, using their stored Etsy app credentials.
// Refreshes if the token expires within 10 minutes (or `force: true`).
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ETSY_TOKEN_URL = "https://openapi.etsy.com/v3/public/oauth/token";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY;

  try {
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Missing auth" }, 401);

    const sbVerify = createClient(SUPABASE_URL, ANON_KEY);
    const { data: claimsData, error: vErr } = await sbVerify.auth.getClaims(jwt);
    if (vErr || !claimsData?.claims?.sub) {
      console.error("getClaims failed", vErr);
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    let force = false;
    try { const b = await req.json(); force = !!b?.force; } catch { /* no body */ }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tokenRow, error: tokenErr } = await supabase
      .from("etsy_tokens")
      .select("id, shop_id, access_token, refresh_token, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (tokenErr) return json({ error: tokenErr.message }, 500);
    if (!tokenRow) return json({ refreshed: false, connected: false });

    const expiresAt = new Date(tokenRow.expires_at).getTime();
    const tenMinFromNow = Date.now() + 10 * 60 * 1000;
    if (!force && expiresAt > tenMinFromNow) {
      return json({ refreshed: false, expires_at: tokenRow.expires_at });
    }

    const ETSY_API_KEY = Deno.env.get("ETSY_API_KEY");
    if (!ETSY_API_KEY) return json({ error: "Etsy API key not configured on the server" }, 500);

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ETSY_API_KEY,
      refresh_token: tokenRow.refresh_token,
    });
    const r = await fetch(ETSY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await r.json();
    if (!r.ok || !data.access_token) {
      console.error("Etsy refresh failed", data);
      return json({ error: "Etsy refresh failed", details: data }, 502);
    }

    const newExpires = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
    const { error: upErr } = await supabase
      .from("etsy_tokens")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? tokenRow.refresh_token,
        expires_at: newExpires,
      })
      .eq("id", tokenRow.id);
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ refreshed: true, expires_at: newExpires });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
