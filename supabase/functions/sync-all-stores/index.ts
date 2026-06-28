// Nightly cron handler: iterates every connected Etsy store and triggers
// sync-listings per user with the cron bypass header.
// Called by pg_cron at 03:00 UTC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Accept any of: (a) CRON_SECRET via x-cron-trigger header (preferred),
  // (b) service-role bearer (manual admin invocation), or
  // (c) legacy vault-stored sync_cron_secret via x-cron-secret.
  const auth = req.headers.get("Authorization");
  const cronSecretEnv = Deno.env.get("CRON_SECRET");
  const incomingCronTrigger = req.headers.get("x-cron-trigger");
  const cronSecret = req.headers.get("x-cron-secret");
  let authorized = auth === `Bearer ${SERVICE_KEY}`;
  if (!authorized && cronSecretEnv && incomingCronTrigger === cronSecretEnv) authorized = true;
  if (!authorized && cronSecret) {
    const { data: vaultRow } = await supabase
      .schema("vault" as never)
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", "sync_cron_secret")
      .maybeSingle();
    const stored = (vaultRow as { decrypted_secret?: string } | null)?.decrypted_secret;
    if (stored && cronSecret === stored) authorized = true;
  }
  if (!authorized) return new Response("Unauthorized", { status: 401 });

  const { data: stores } = await supabase
    .from("etsy_tokens")
    .select("user_id")
    .limit(5000);

  const userIds = Array.from(new Set(((stores ?? []) as Array<{ user_id: string }>).map(r => r.user_id)));
  const results: Array<{ user_id: string; ok: boolean; error?: string }> = [];

  // Sequential with a short delay to be polite to Etsy's rate limits.
  for (const user_id of userIds) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/sync-listings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          "X-Sync-Source": "cron",
        },
        body: JSON.stringify({ user_id }),
      });
      results.push({ user_id, ok: r.ok, error: r.ok ? undefined : `${r.status}` });

      // After sync, evaluate achievements for this user. Best-effort.
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/check-and-award-achievements`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ userId: user_id }),
        });
      } catch (_e) { /* ignore — never block sync on achievements */ }
    } catch (e) {
      results.push({ user_id, ok: false, error: String(e) });
    }
    await new Promise(res => setTimeout(res, 500));
  }

  return json({ count: userIds.length, results });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
