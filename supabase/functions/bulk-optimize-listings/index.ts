// Bulk optimize: enqueue AI optimization for up to 25 listings with tier-aware
// concurrency. Pro = 3 in flight, Agency = 5, free/starter = 1 (sequential).
// Per-item 429 retry with 800ms/1600ms backoff. Stops accepting new work on 402.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BATCH = 25;

const BATCH_SIZE_FREE = 1;
const BATCH_SIZE_STARTER = 1;
const BATCH_SIZE_PRO = 3;
const BATCH_SIZE_AGENCY = 5;

function batchSizeForTier(tier?: string | null): number {
  switch (tier) {
    case "agency": return BATCH_SIZE_AGENCY;
    case "admin":  return BATCH_SIZE_AGENCY;
    case "pro":    return BATCH_SIZE_PRO;
    default:       return BATCH_SIZE_FREE;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabaseAuth.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const ids: string[] = Array.isArray(body?.listing_ids) ? body.listing_ids : [];
    const personalization = body?.personalization ?? null;
    const etsy_shop_id = body?.etsy_shop_id ?? null;
    if (ids.length === 0) return json({ error: "No listing_ids" }, 400);
    if (ids.length > MAX_BATCH) return json({ error: `Batch limited to ${MAX_BATCH} listings.` }, 400);

    // Read tier once.
    const { data: profile } = await supabaseAuth
      .from("user_profiles")
      .select("tier")
      .eq("id", userRes.user.id)
      .maybeSingle();
    const concurrency = batchSizeForTier(profile?.tier as string | undefined);

    const created: Array<{ listing_id: string; optimization_id: string }> = [];
    const failed: Array<{ listing_id: string; error: string }> = [];
    let stop = false; // set on 402 (credit exhaustion)

    const base = `${SUPABASE_URL}/functions/v1/optimize-listing`;
    const queue = [...ids];

    const callOnce = async (id: string) => {
      const r = await fetch(base, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: id, personalization, etsy_shop_id }),
      });
      let data: { error?: string; optimization_id?: string } = {};
      try { data = await r.json(); } catch { /* ignore */ }
      return { status: r.status, data };
    };

    const callWithRetry = async (id: string) => {
      const backoffs = [800, 1600];
      let last: { status: number; data: { error?: string; optimization_id?: string } } | null = null;
      for (let attempt = 0; attempt <= backoffs.length; attempt++) {
        last = await callOnce(id);
        if (last.status !== 429 || attempt >= backoffs.length) return last;
        await new Promise(r => setTimeout(r, backoffs[attempt]));
      }
      return last!;
    };

    const worker = async () => {
      while (!stop && queue.length > 0) {
        const id = queue.shift();
        if (id === undefined) return;
        try {
          const { status, data } = await callWithRetry(id);
          if (status === 402) {
            failed.push({ listing_id: id, error: data?.error ?? "Credits exhausted" });
            stop = true; // drain other workers without starting new items
            return;
          }
          if (status < 200 || status >= 300) {
            failed.push({ listing_id: id, error: data?.error ?? `HTTP ${status}` });
          } else if (data?.optimization_id) {
            created.push({ listing_id: id, optimization_id: data.optimization_id });
          } else {
            failed.push({ listing_id: id, error: "Missing optimization_id in response" });
          }
        } catch (err) {
          failed.push({ listing_id: id, error: String(err) });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.max(1, concurrency) }, () => worker())
    );

    return json({ created, failed, total: ids.length });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
