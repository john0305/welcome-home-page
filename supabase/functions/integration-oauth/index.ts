// Generic OAuth start/callback for third-party DATA integrations (Section 10).
// Provider-agnostic: dispatches to the DataIntegration registry — adding a
// provider requires no new endpoint. Mirrors the etsy-oauth flow and token
// model: state rows in oauth_states, tokens stored server-side only in
// integration_connections, never returned to the browser.
//
// authorize: POST ?action=authorize&provider=X  (user JWT) → { url }
// callback:  GET  ?code=...&state=...           (no JWT — arrives from provider)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getIntegration } from "../_shared/data-integrations.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function redirectHtml(to: string) {
  return new Response(
    `<!doctype html><meta http-equiv="refresh" content="0;url=${to}"><a href="${to}">Continue</a>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY;
  const APP_URL = Deno.env.get("APP_URL") ?? "https://radariq.app";
  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/integration-oauth`;

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    if (action === "authorize") {
      const providerKey = url.searchParams.get("provider") ?? "";
      const integration = getIntegration(providerKey);
      if (!integration) return json({ error: `Unknown provider '${providerKey}'` }, 400);

      const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ error: "Missing auth" }, 401);
      const sbVerify = createClient(SUPABASE_URL, ANON_KEY);
      const { data: claimsData, error: vErr } = await sbVerify.auth.getClaims(jwt);
      if (vErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
      const userId = claimsData.claims.sub as string;

      const stateBytes = new Uint8Array(32);
      crypto.getRandomValues(stateBytes);
      const state = Array.from(stateBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

      const returnUrlParam = url.searchParams.get("return_url");
      let returnUrl: string | null = null;
      if (returnUrlParam) {
        try {
          const u = new URL(returnUrlParam);
          if (
            ["radariq.app", "www.radariq.app"].includes(u.hostname) ||
            u.hostname.endsWith(".lovable.app") ||
            u.hostname.endsWith(".lovableproject.com")
          ) returnUrl = `${u.protocol}//${u.host}`;
        } catch { /* ignore */ }
      }

      const { error: insErr } = await supabase.from("oauth_states").insert({
        state,
        user_id: userId,
        code_verifier: "", // providers here use client_secret, not PKCE
        provider: providerKey,
        return_url: returnUrl,
      });
      if (insErr) return json({ error: "Failed to start OAuth" }, 500);

      return json({ url: integration.buildAuthUrl(state, REDIRECT_URI) });
    }

    // ── Callback (GET from the provider — no JWT present) ────────────────────
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthErr = url.searchParams.get("error");

    let appBase = APP_URL;
    let stateRow: { user_id: string; provider: string; expires_at: string; return_url: string | null } | null = null;
    if (state) {
      const { data } = await supabase
        .from("oauth_states")
        .select("user_id, provider, expires_at, return_url")
        .eq("state", state)
        .maybeSingle();
      if (data) {
        stateRow = data as typeof stateRow;
        if (stateRow?.return_url) appBase = stateRow.return_url;
      }
    }
    const settingsUrl = `${appBase}/app/settings`;

    if (oauthErr) return redirectHtml(`${settingsUrl}?integration_error=${encodeURIComponent(oauthErr)}`);
    if (!code || !state || !stateRow) return redirectHtml(`${settingsUrl}?integration_error=invalid_state`);
    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      await supabase.from("oauth_states").delete().eq("state", state);
      return redirectHtml(`${settingsUrl}?integration_error=state_expired`);
    }
    await supabase.from("oauth_states").delete().eq("state", state);

    const integration = getIntegration(stateRow.provider);
    if (!integration) return redirectHtml(`${settingsUrl}?integration_error=unknown_provider`);

    const tokens = await integration.exchangeCode(code, REDIRECT_URI);
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const { error: upErr } = await supabase.from("integration_connections").upsert({
      user_id: stateRow.user_id,
      provider: integration.provider,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expiresAt,
      scopes: integration.scopes,
      status: "connected",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });
    if (upErr) {
      console.error("integration_connections upsert failed", upErr);
      return redirectHtml(`${settingsUrl}?integration_error=storage_failed`);
    }

    // First sync in the background so data is there when they land.
    try {
      const p = fetch(`${SUPABASE_URL}/functions/v1/sync-integration-data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ user_id: stateRow.user_id, provider: integration.provider }),
      }).catch((e) => console.error("first integration sync failed", e));
      // @ts-ignore EdgeRuntime is available in Supabase edge runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(p);
      }
    } catch { /* first sync is best-effort */ }

    return redirectHtml(`${settingsUrl}?integration_connected=${integration.provider}`);
  } catch (e) {
    console.error("integration-oauth error", e);
    return json({ error: String(e) }, 500);
  }
});
