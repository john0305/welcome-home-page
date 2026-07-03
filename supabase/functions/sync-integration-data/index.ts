// Pull metrics from a connected third-party data integration and feed them
// into the SAME insight pipeline as native Etsy data (Section 10):
// integration_metrics rows for charts, and inform-mode fix_actions (through
// the standard dedupe) for anything the connector's mapToInsights flags.
//
// Callers: the user (their own connections only), service role (pipeline /
// first-sync chain), or cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getIntegration, INTEGRATIONS } from "../_shared/data-integrations.ts";
import { callerUserId, isServiceOrCronCall } from "../_shared/service-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const service = isServiceOrCronCall(req);
    let userId: string | null = service ? (body.user_id ?? null) : await callerUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    // Cron mode without user_id: sync every connected integration.
    if (service && !body.user_id) {
      const { data: conns } = await supabase
        .from("integration_connections")
        .select("user_id, provider")
        .eq("status", "connected");
      let ok = 0, failed = 0;
      for (const c of conns ?? []) {
        try {
          await syncOne(supabase, c.user_id, c.provider);
          ok++;
        } catch (e) {
          console.error(`integration sync failed for ${c.user_id}/${c.provider}`, e);
          failed++;
        }
      }
      return json({ ok: true, synced: ok, failed });
    }

    const providers: string[] = body.provider ? [body.provider] : Object.keys(INTEGRATIONS);
    const results: Record<string, unknown> = {};
    for (const p of providers) {
      try {
        results[p] = await syncOne(supabase, userId, p);
      } catch (e) {
        results[p] = { error: String(e) };
      }
    }
    return json({ ok: true, results });
  } catch (e) {
    console.error("sync-integration-data error", e);
    return json({ error: String(e) }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function syncOne(supabase: any, userId: string, provider: string) {
  const integration = getIntegration(provider);
  if (!integration) return { skipped: "unknown_provider" };

  const { data: conn } = await supabase
    .from("integration_connections")
    .select("id, access_token, refresh_token, expires_at, external_account_id, metadata")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("status", "connected")
    .maybeSingle();
  if (!conn) return { skipped: "not_connected" };

  // Refresh the access token when it expires within 5 minutes.
  let accessToken: string = conn.access_token;
  const expMs = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  if (expMs && expMs < Date.now() + 300_000 && conn.refresh_token) {
    const fresh = await integration.refreshToken(conn.refresh_token);
    accessToken = fresh.access_token;
    await supabase.from("integration_connections").update({
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token ?? conn.refresh_token,
      expires_at: fresh.expires_in
        ? new Date(Date.now() + fresh.expires_in * 1000).toISOString()
        : conn.expires_at,
      updated_at: new Date().toISOString(),
    }).eq("id", conn.id);
  }

  const { daily, metadata } = await integration.fetchMetrics(
    accessToken,
    conn.external_account_id ?? null,
    28,
  );

  // Persist discovered account id/metadata on first sync.
  if (metadata && (!conn.external_account_id || Object.keys(metadata).length > 0)) {
    await supabase.from("integration_connections").update({
      external_account_id: (metadata.property as string) ?? conn.external_account_id,
      metadata: { ...(conn.metadata ?? {}), ...metadata },
      updated_at: new Date().toISOString(),
    }).eq("id", conn.id);
  }

  let daysWritten = 0;
  for (const [date, metrics] of Object.entries(daily)) {
    const { error } = await supabase.from("integration_metrics").upsert({
      user_id: userId,
      provider,
      metric_date: date,
      metrics,
    }, { onConflict: "user_id,provider,metric_date" });
    if (!error) daysWritten++;
  }

  // Feed the shared insight pipeline (standard 14-day dedupe per factor).
  let insights = 0;
  for (const cand of integration.mapToInsights(daily)) {
    const { data: recent } = await supabase.from("fix_actions").select("id")
      .eq("user_id", userId)
      .eq("factor_key", cand.factor_key)
      .gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
      .limit(1).maybeSingle();
    if (recent) continue;
    const { error } = await supabase.from("fix_actions").insert({
      user_id: userId,
      listing_id: null,
      factor_key: cand.factor_key,
      dimension: "shop",
      mode: "inform",
      severity: cand.severity,
      current_value: null,
      rationale: cand.rationale,
      evidence: cand.evidence,
      source: `integration_${provider}`,
      status: "pending",
    });
    if (!error) insights++;
  }

  return { days_written: daysWritten, insights_created: insights };
}
