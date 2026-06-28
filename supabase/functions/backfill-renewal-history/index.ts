// backfill-renewal-history
// One-off (and re-runnable) seeding of inferred renewal history from
// Etsy's listing creation timestamp. Idempotent: skips listings that already
// have a row in listing_renewal_events.
//
// POST body: { user_id?: string, etsy_shop_id?: string }
// If neither is provided, every connected shop is backfilled (admin/cron use).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recomputeSummary } from "../_shared/recomputeSummary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
  const ETSY_API_KEY = Deno.env.get("ETSY_API_KEY")!;
  const ETSY_SHARED_SECRET = String(Deno.env.get("ETSY_SHARED_SECRET") ?? "").trim();
  const apiKeyHeader = ETSY_SHARED_SECRET ? `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}` : ETSY_API_KEY;

  const auth = req.headers.get("Authorization") ?? "";
  const isCron = auth === `Bearer ${CRON_SECRET}` || auth === `Bearer ${SERVICE_KEY}`;

  let scopeUserId: string | null = null;
  let scopeShopId: string | null = null;
  try {
    const body = await req.json();
    if (body?.user_id) scopeUserId = String(body.user_id);
    if (body?.etsy_shop_id) scopeShopId = String(body.etsy_shop_id);
  } catch { /* no body */ }

  // If not cron/service, accept a JWT — but lock scope to the caller's own user_id.
  if (!isCron) {
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = auth.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = userData.user.id;
    if (scopeUserId && scopeUserId !== callerId) {
      return json({ error: "Forbidden: can only backfill your own shops" }, 403);
    }
    scopeUserId = callerId;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Find connected stores with valid tokens.
  let tq = supabase
    .from("etsy_tokens")
    .select("id, user_id, shop_id, access_token, refresh_token, expires_at")
    .not("shop_id", "is", null);
  if (scopeUserId) tq = tq.eq("user_id", scopeUserId);
  if (scopeShopId) tq = tq.eq("shop_id", scopeShopId);
  const { data: tokens, error: tokErr } = await tq;
  if (tokErr) return json({ error: tokErr.message }, 500);

  const today = new Date().toISOString().slice(0, 10);
  const todayUnix = Math.floor(Date.now() / 1000);
  const results: Array<Record<string, unknown>> = [];

  for (const tok of (tokens ?? []) as Array<{ id: string; user_id: string; shop_id: string; access_token: string; refresh_token: string; expires_at: string }>) {
    const { shop_id } = tok;
    let access_token = tok.access_token;

    // Refresh if expiring within 2 minutes
    if (new Date(tok.expires_at).getTime() < Date.now() + 2 * 60 * 1000) {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ETSY_API_KEY,
        refresh_token: tok.refresh_token,
      });
      const r = await fetch("https://openapi.etsy.com/v3/public/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await r.json();
      if (r.ok && data.access_token) {
        access_token = data.access_token;
        const newExpires = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
        await supabase.from("etsy_tokens").update({
          access_token,
          refresh_token: data.refresh_token ?? tok.refresh_token,
          expires_at: newExpires,
        }).eq("id", tok.id);
      } else {
        console.error("backfill-renewal-history refresh failed", shop_id, data);
      }
    }

    const headers = { Authorization: `Bearer ${access_token}`, "x-api-key": apiKeyHeader };


    // Page through active listings
    const listings: Array<{
      listing_id: number; quantity: number; state: string;
      original_creation_timestamp: number; ending_timestamp: number;
      price?: { amount?: number; divisor?: number };
    }> = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const r = await fetch(
        `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings?state=active&limit=${limit}&offset=${offset}`,
        { headers },
      );
      if (!r.ok) {
        console.error("Etsy listings fetch failed", shop_id, r.status);
        break;
      }
      const j = await r.json();
      const rows = (j.results ?? []) as typeof listings;
      if (rows.length === 0) break;
      listings.push(...rows);
      if (rows.length < limit) break;
      offset += limit;
    }

    let seeded = 0;
    let skipped = 0;
    let sampleListingId: string | null = null;
    let sampleInferredCount = 0;

    for (const listing of listings) {
      const etsy_listing_id = String(listing.listing_id);

      // Idempotency: skip if any real or inferred event already exists.
      const { data: existing } = await supabase
        .from("listing_renewal_events")
        .select("id")
        .eq("etsy_listing_id", etsy_listing_id)
        .limit(1);
      if (existing && existing.length > 0) { skipped++; continue; }

      const createdAt = Number(listing.original_creation_timestamp ?? 0);
      const endingAt = Number(listing.ending_timestamp ?? 0);
      const quantity = Number(listing.quantity ?? 0);
      const price = listing.price?.amount != null && listing.price?.divisor
        ? Number(listing.price.amount) / Number(listing.price.divisor)
        : 0;

      if (!createdAt || !endingAt) {
        // Can't infer — write a baseline snapshot so the detector has something
        // to diff against next run.
        await writeBaselineSnapshot(supabase, {
          etsy_listing_id, etsy_shop_id: shop_id, today, state: listing.state,
          quantity, price, ending_timestamp: endingAt, last_modified: 0,
        });
        await recomputeSummary(supabase, etsy_listing_id);
        continue;
      }

      const totalDaysAlive = Math.floor((todayUnix - createdAt) / 86400);
      const estimatedRenewals = Math.max(0, Math.floor(totalDaysAlive / 120) - 1);

      // Always write today's baseline snapshot so the diff detector has prior data.
      await writeBaselineSnapshot(supabase, {
        etsy_listing_id, etsy_shop_id: shop_id, today, state: listing.state,
        quantity, price, ending_timestamp: endingAt, last_modified: 0,
      });

      if (estimatedRenewals === 0) {
        await recomputeSummary(supabase, etsy_listing_id);
        continue;
      }

      const inferredEvents: Array<Record<string, unknown>> = [];
      for (let i = estimatedRenewals; i >= 1; i--) {
        // Walk backward from current endingAt in 120-day chunks.
        const inferredNewEnding = endingAt - ((estimatedRenewals - i) * 120 * 86400);
        const inferredPrevEnding = inferredNewEnding - (120 * 86400);
        const inferredDetectedAt = new Date((inferredNewEnding - 120 * 86400) * 1000)
          .toISOString()
          .slice(0, 10);
        inferredEvents.push({
          etsy_listing_id,
          etsy_shop_id: shop_id,
          detected_at: inferredDetectedAt,
          previous_ending_timestamp: inferredPrevEnding,
          new_ending_timestamp: inferredNewEnding,
          renewal_type: "auto",
          state_at_renewal: "active",
          shop_on_vacation_at_renewal: false,
          quantity_at_renewal: quantity,
          price_at_renewal: price,
          renewal_fee_usd: 0.20,
          notes: "inferred_backfill",
        });
      }

      const { error: insErr } = await supabase
        .from("listing_renewal_events")
        .insert(inferredEvents);
      if (insErr) { console.error("inferred insert err", insErr); continue; }

      await recomputeSummary(supabase, etsy_listing_id);
      seeded++;
      if (!sampleListingId) {
        sampleListingId = etsy_listing_id;
        sampleInferredCount = inferredEvents.length;
      }
    }

    const summary = {
      shop_id, user_id: tok.user_id, processed: listings.length,
      seeded, skipped, sample_listing_id: sampleListingId, sample_inferred_count: sampleInferredCount,
    };
    console.log("backfill-renewal-history shop summary:", JSON.stringify(summary));
    results.push(summary);
  }

  return json({ results });
});

async function writeBaselineSnapshot(
  supabase: ReturnType<typeof createClient>,
  args: {
    etsy_listing_id: string; etsy_shop_id: string; today: string;
    state: string; quantity: number; price: number;
    ending_timestamp: number; last_modified: number;
  },
) {
  await supabase.from("listing_renewal_snapshots").upsert({
    etsy_listing_id: args.etsy_listing_id,
    etsy_shop_id: args.etsy_shop_id,
    snapshot_date: args.today,
    state: args.state,
    quantity: args.quantity,
    price: args.price,
    ending_timestamp: args.ending_timestamp,
    last_modified_timestamp: args.last_modified,
    is_digital: false,
    shop_on_vacation: false,
  }, { onConflict: "etsy_listing_id,snapshot_date" });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
