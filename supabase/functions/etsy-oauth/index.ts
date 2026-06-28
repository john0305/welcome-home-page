// Etsy OAuth 2.0 with PKCE — uses RadarIQ's own Etsy app credentials, stored
// as Supabase secrets. Users never see or enter any Etsy keys.
//
// Required env:
//   ETSY_API_KEY         — RadarIQ's Etsy keystring
//   ETSY_SHARED_SECRET   — RadarIQ's Etsy shared secret (used only for the
//                          x-api-key `keystring:shared_secret` header on
//                          subsequent API calls, never for OAuth itself)
//   ETSY_REDIRECT_URI    — Public OAuth callback registered with Etsy. Must
//                          point at this function's `?action=callback` URL.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ETSY_AUTH_URL = "https://www.etsy.com/oauth/connect";
const ETSY_TOKEN_URL = "https://openapi.etsy.com/v3/public/oauth/token";
const SCOPES = "listings_r listings_w shops_r shops_w transactions_r";

const APP_URL = Deno.env.get("APP_URL") || "https://radariq.app";

function redirectHtml(target: string) {
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: target },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY;

  const ETSY_API_KEY = Deno.env.get("ETSY_API_KEY");
  const ETSY_SHARED_SECRET = Deno.env.get("ETSY_SHARED_SECRET");
  const ETSY_REDIRECT_URI =
    Deno.env.get("ETSY_REDIRECT_URI") ||
    `${SUPABASE_URL}/functions/v1/etsy-oauth?action=callback`;

  if (!ETSY_API_KEY) {
    return json({ error: "Etsy API key not configured on the server." }, 500);
  }

  try {
    if (action === "authorize") {
      const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ error: "Missing auth" }, 401);

      const sbVerify = createClient(SUPABASE_URL, ANON_KEY);
      const { data: claimsData, error: vErr } = await sbVerify.auth.getClaims(jwt);
      if (vErr || !claimsData?.claims?.sub) {
        console.error("authorize getClaims failed", vErr);
        return json({ error: "Unauthorized" }, 401);
      }
      const vUser = { user: { id: claimsData.claims.sub as string } };

      const sbService = createClient(SUPABASE_URL, SERVICE_KEY);

      const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
      const codeChallenge = await sha256Base64Url(codeVerifier);

      const stateBytes = new Uint8Array(32);
      crypto.getRandomValues(stateBytes);
      const state = Array.from(stateBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

      const returnUrlParam = url.searchParams.get("return_url");
      const allowedHosts = ["radariq.app", "www.radariq.app", "welcome-hello-hug-27.lovable.app"];
      let returnUrl: string | null = null;
      if (returnUrlParam) {
        try {
          const u = new URL(returnUrlParam);
          if (
            allowedHosts.includes(u.hostname) ||
            u.hostname.endsWith(".lovable.app") ||
            u.hostname.endsWith(".lovableproject.com")
          ) {
            returnUrl = `${u.protocol}//${u.host}`;
          }
        } catch { /* ignore */ }
      }

      const { error: insErr } = await sbService.from("oauth_states").insert({
        state,
        user_id: vUser.user.id,
        code_verifier: codeVerifier,
        provider: "etsy",
        return_url: returnUrl,
      });
      if (insErr) {
        console.error("oauth_states insert", insErr);
        return json({ error: "Failed to start OAuth" }, 500);
      }

      const authUrl = new URL(ETSY_AUTH_URL);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", ETSY_API_KEY);
      authUrl.searchParams.set("redirect_uri", ETSY_REDIRECT_URI);
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      return json({ url: authUrl.toString(), redirect_uri: ETSY_REDIRECT_URI });
    }

    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const oauthErr = url.searchParams.get("error");

      const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

      let appBase = APP_URL;
      let stateRow: { user_id: string; code_verifier: string; expires_at: string; return_url: string | null } | null = null;
      if (state) {
        const { data } = await supabase
          .from("oauth_states")
          .select("user_id, code_verifier, expires_at, return_url")
          .eq("state", state)
          .maybeSingle();
        if (data) {
          stateRow = data as typeof stateRow;
          if (stateRow?.return_url) appBase = stateRow.return_url;
        }
      }

      if (oauthErr) return redirectHtml(`${appBase}/app/connect-etsy?error=${encodeURIComponent(oauthErr)}`);
      if (!code || !state) return redirectHtml(`${appBase}/app/connect-etsy?error=missing_code`);
      if (!stateRow) return redirectHtml(`${appBase}/app/connect-etsy?error=invalid_state`);
      if (new Date(stateRow.expires_at).getTime() < Date.now()) {
        await supabase.from("oauth_states").delete().eq("state", state);
        return redirectHtml(`${appBase}/app/connect-etsy?error=state_expired`);
      }
      await supabase.from("oauth_states").delete().eq("state", state);

      const userId = stateRow.user_id;
      const codeVerifier = stateRow.code_verifier;

      // Exchange code for tokens — PKCE, no client_secret needed here.
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: ETSY_API_KEY,
        redirect_uri: ETSY_REDIRECT_URI,
        code,
        code_verifier: codeVerifier,
      });
      const tokenRes = await fetch(ETSY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const tokens = await tokenRes.json();
      if (!tokenRes.ok || !tokens.access_token) {
        console.error("Etsy token error", tokens);
        return redirectHtml(`${appBase}/app/connect-etsy?error=oauth_failed`);
      }

      // Etsy access tokens are prefixed "<user_id>.<token>"
      const shopUserId = String(tokens.access_token).split(".")[0];

      // x-api-key header — Etsy requires keystring:shared_secret as of Feb 9, 2026
      const apiKeyHeader = ETSY_SHARED_SECRET
        ? `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`
        : ETSY_API_KEY;

      // Fetch shop info
      let shopId: string = shopUserId;
      let shopName: string | null = null;
      try {
        const shopRes = await fetch(
          `https://openapi.etsy.com/v3/application/users/${shopUserId}/shops`,
          {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              "x-api-key": apiKeyHeader,
            },
          },
        );
        if (shopRes.ok) {
          const shopJson = await shopRes.json();
          shopId = String(shopJson?.shop_id ?? shopJson?.results?.[0]?.shop_id ?? shopUserId);
          shopName = shopJson?.shop_name ?? shopJson?.results?.[0]?.shop_name ?? null;
        }
      } catch (e) {
        console.error("shop fetch", e);
      }

      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

      await supabase.from("etsy_tokens").upsert({
        user_id: userId,
        shop_id: shopId,
        shop_name: shopName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
      }, { onConflict: "user_id,shop_id" });

      await supabase.from("stores").upsert({
        user_id: userId,
        etsy_shop_id: shopId,
        shop_name: shopName,
        connected_at: new Date().toISOString(),
      }, { onConflict: "user_id,etsy_shop_id" });

      return redirectHtml(`${appBase}/app/dashboard?connected=1`);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

async function sha256Base64Url(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
