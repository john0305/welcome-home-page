// Lightweight refresh of just the Etsy shop status (vacation mode, currency,
// listing_count) without running a full listings sync.
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
    if (!jwt) return json({ error: "Unauthorized" }, 401);

    const sbVerify = createClient(SUPABASE_URL, ANON_KEY);
    const { data: claimsData, error: vErr } = await sbVerify.auth.getClaims(jwt);
    if (vErr || !claimsData?.claims?.sub) {
      console.error("getClaims failed", vErr);
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const ETSY_API_KEY = Deno.env.get("ETSY_API_KEY");
    const ETSY_SHARED_SECRET = Deno.env.get("ETSY_SHARED_SECRET");
    if (!ETSY_API_KEY) return json({ error: "Etsy credentials not configured" }, 500);
    const apiKeyHeader = ETSY_SHARED_SECRET ? `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}` : ETSY_API_KEY;

    const { data: tokenRow, error: tokenErr } = await supabase
      .from("etsy_tokens")
      .select("id, access_token, refresh_token, expires_at, shop_id, shop_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (tokenErr || !tokenRow) {
      return json({ error: "no_store", message: "No Etsy store connected" }, 200);
    }

    let access_token = tokenRow.access_token as string;
    const { refresh_token, expires_at, id: tokenId, shop_id } = tokenRow as {
      refresh_token: string; expires_at: string; id: string; shop_id: string;
    };
    if (!shop_id) return json({ error: "no_shop", message: "Shop not resolved yet" }, 200);

    // Refresh token if expiring soon
    if (new Date(expires_at).getTime() < Date.now() + 2 * 60 * 1000) {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ETSY_API_KEY,
        refresh_token,
      });
      const r = await fetch(ETSY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await r.json();
      if (!r.ok || !data.access_token) {
        console.error("Etsy refresh failed", data);
        // Soft-fail so the UI doesn't force a reconnect on a transient hiccup
        return json({ error: "refresh_failed", message: "Could not refresh Etsy token", details: data }, 200);
      }
      access_token = data.access_token;
      await supabase.from("etsy_tokens").update({
        access_token,
        refresh_token: data.refresh_token ?? refresh_token,
        expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
      }).eq("id", tokenId);
    }

    const apiHeaders = { Authorization: `Bearer ${access_token}`, "x-api-key": apiKeyHeader };
    const sRes = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}`, { headers: apiHeaders });
    if (!sRes.ok) {
      const txt = await sRes.text();
      console.error("Etsy shop fetch failed", sRes.status, txt);
      return json({ error: "etsy_api_error", status: sRes.status, message: txt.slice(0, 200) }, 200);
    }
    const sJson = await sRes.json();
    const status = {
      is_vacation: !!sJson?.is_vacation,
      vacation_message: sJson?.vacation_message ?? null,
      vacation_autoreply: sJson?.vacation_autoreply ?? null,
      currency_code: sJson?.currency_code ?? null,
      shop_name: sJson?.shop_name ?? null,
      listing_active_count: sJson?.listing_active_count ?? null,
    };

    await supabase.from("stores").update({
      is_vacation: status.is_vacation,
      vacation_message: status.vacation_message,
      vacation_autoreply: status.vacation_autoreply,
      currency_code: status.currency_code,
      status_synced_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("etsy_shop_id", shop_id);

    return json({ ok: true, status });
  } catch (e) {
    console.error("refresh-shop-status error", e);
    return json({ error: "internal", message: String(e) }, 200);
  }
});
