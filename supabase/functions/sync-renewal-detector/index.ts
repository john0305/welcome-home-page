// sync-renewal-detector
// Diffs today's renewal snapshots vs the prior snapshot per listing and writes
// detected renewal events. Chained from sync-listings; CRON_SECRET guarded.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recomputeSummary } from "../_shared/recomputeSummary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RENEWAL_THRESHOLD_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

  // Accept either CRON_SECRET bearer or service-role bearer.
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${CRON_SECRET}` && auth !== `Bearer ${SERVICE_KEY}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Optional body: { etsy_shop_id?: string } to scope to a single shop.
  let scopeShopId: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.etsy_shop_id === "string") scopeShopId = body.etsy_shop_id;
  } catch { /* no body */ }

  const today = new Date().toISOString().slice(0, 10);

  let q = supabase
    .from("listing_renewal_snapshots")
    .select("etsy_listing_id, etsy_shop_id, state, quantity, price, ending_timestamp, shop_on_vacation")
    .eq("snapshot_date", today);
  if (scopeShopId) q = q.eq("etsy_shop_id", scopeShopId);

  const { data: todaySnaps, error: todayErr } = await q;
  if (todayErr) return json({ error: todayErr.message }, 500);
  if (!todaySnaps || todaySnaps.length === 0) {
    return json({ message: "No snapshots for today", renewals_detected: 0 });
  }

  const renewalEvents: Array<Record<string, unknown>> = [];

  for (const snap of todaySnaps as Array<{
    etsy_listing_id: string; etsy_shop_id: string; state: string;
    quantity: number; price: number; ending_timestamp: number; shop_on_vacation: boolean;
  }>) {
    // Skip listings where we can't reason about renewals.
    if (!snap.ending_timestamp || snap.ending_timestamp === 0) continue;

    const { data: priorSnaps } = await supabase
      .from("listing_renewal_snapshots")
      .select("snapshot_date, state, ending_timestamp")
      .eq("etsy_listing_id", snap.etsy_listing_id)
      .lt("snapshot_date", today)
      .order("snapshot_date", { ascending: false })
      .limit(1);

    const prior = priorSnaps?.[0] as
      | { snapshot_date: string; state: string; ending_timestamp: number }
      | undefined;
    if (!prior || !prior.ending_timestamp) continue;

    const endingDelta = (snap.ending_timestamp - prior.ending_timestamp) / 86400;

    if (endingDelta >= RENEWAL_THRESHOLD_DAYS) {
      let renewal_type: "auto" | "manual" | "relist" | "unknown" = "unknown";
      if (endingDelta >= 115 && endingDelta <= 125) {
        renewal_type = prior.state === "active" ? "auto" : "relist";
      } else if (endingDelta > 0 && endingDelta < 115) {
        renewal_type = "manual";
      } else if (prior.state !== "active" && snap.state === "active") {
        renewal_type = "relist";
      }

      renewalEvents.push({
        etsy_listing_id: snap.etsy_listing_id,
        etsy_shop_id: snap.etsy_shop_id,
        detected_at: today,
        previous_ending_timestamp: prior.ending_timestamp,
        new_ending_timestamp: snap.ending_timestamp,
        renewal_type,
        state_at_renewal: snap.state,
        shop_on_vacation_at_renewal: snap.shop_on_vacation,
        quantity_at_renewal: snap.quantity,
        price_at_renewal: snap.price,
        renewal_fee_usd: 0.20,
      });
    }
  }

  if (renewalEvents.length > 0) {
    const { error: insErr } = await supabase.from("listing_renewal_events").insert(renewalEvents);
    if (insErr) console.error("renewal events insert error", insErr);
  }

  // Always recompute the summary for every listing snapshotted today so confidence
  // can promote from inferred → partial → observed as real events accumulate.
  const allTodayListingIds = Array.from(
    new Set((todaySnaps as Array<{ etsy_listing_id: string }>).map((s) => s.etsy_listing_id)),
  );

  let updated = 0;
  for (const lid of allTodayListingIds) {
    try {
      await recomputeSummary(supabase, lid);
      updated++;
    } catch (e) {
      console.error("recomputeSummary failed", lid, e);
    }
  }

  return json({
    renewals_detected: renewalEvents.length,
    listings_updated: updated,
    scoped_shop: scopeShopId,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
