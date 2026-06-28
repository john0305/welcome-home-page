// Snapshots per-listing + shop-wide performance into listing_snapshots,
// shop_snapshots, and shop_reviews. Designed to be invoked either by a
// signed-in user (manual) or by the nightly cron job (via service-role auth).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ETSY = "https://openapi.etsy.com/v3/application";
const TOKEN_URL = "https://openapi.etsy.com/v3/public/oauth/token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Mode 1: cron — invoked with service-role key + { run_all: true }
    // Mode 2: user — invoked with a user JWT
    let targetUserIds: string[] = [];
    const results: Array<{ user_id: string; ok: boolean; counts?: unknown; error?: string }> = [];
    let bodyJson: { run_all?: boolean; user_id?: string } = {};
    try { bodyJson = await req.json(); } catch { /* ignore */ }

    const authHeader = req.headers.get("Authorization") || "";

    if (bodyJson.run_all) {
      // Cron / batch mode — require service-role bearer or vault-stored cron secret.
      const cronSecret = req.headers.get("x-cron-secret");
      let authorized = authHeader === `Bearer ${SERVICE_KEY}`;
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
      if (!authorized) return json({ error: "Unauthorized" }, 401);
      const { data } = await supabase.from("etsy_tokens").select("user_id");
      targetUserIds = (data ?? []).map((r: { user_id: string }) => r.user_id);
    } else if (bodyJson.user_id && authHeader.includes(SERVICE_KEY)) {
      targetUserIds = [bodyJson.user_id];
    } else {
      const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes } = await supabaseAuth.auth.getUser();
      if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
      targetUserIds = [userRes.user.id];
    }
    for (const userId of targetUserIds) {
      try {
        const counts = await snapshotUser(supabase, userId);
        results.push({ user_id: userId, ok: true, counts });
      } catch (e) {
        console.error("snapshot failed", userId, e);
        results.push({ user_id: userId, ok: false, error: String(e) });
      }
    }

    return json({ ran: targetUserIds.length, results });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

async function snapshotUser(supabase: ReturnType<typeof createClient>, userId: string) {
  // RadarIQ-owned Etsy app credentials from server secrets.
  const clientId = String(Deno.env.get("ETSY_API_KEY") ?? "").trim();
  const clientSecret = String(Deno.env.get("ETSY_SHARED_SECRET") ?? "").trim();
  if (!clientId || !clientSecret) throw new Error("Etsy API key not configured on the server");
  const apiKeyHeader = `${clientId}:${clientSecret}`;


  const { data: tokenRow } = await supabase.from("etsy_tokens")
    .select("id, access_token, refresh_token, expires_at, shop_id, shop_name")
    .eq("user_id", userId).maybeSingle();
  if (!tokenRow) throw new Error("no etsy token");

  let access_token = tokenRow.access_token as string;
  const refresh_token = tokenRow.refresh_token as string;
  const tokenId = tokenRow.id as string;
  const shop_id = tokenRow.shop_id as string;

  if (new Date(tokenRow.expires_at as string).getTime() < Date.now() + 2 * 60 * 1000) {
    const body = new URLSearchParams({
      grant_type: "refresh_token", client_id: clientId, refresh_token,
    });
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await r.json();
    if (!r.ok || !data.access_token) throw new Error("token refresh failed");
    access_token = data.access_token;
    await supabase.from("etsy_tokens").update({
      access_token,
      refresh_token: data.refresh_token ?? refresh_token,
      expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
    }).eq("id", tokenId);
  }

  const apiHeaders = { Authorization: `Bearer ${access_token}`, "x-api-key": apiKeyHeader };
  const today = new Date().toISOString().slice(0, 10);

  // ── Check vacation mode FIRST. While the shop is on vacation, Etsy hides
  // listings from the public catalog and activity goes to zero — recording a
  // snapshot would create a false 100% drop in views/sales/orders the next
  // time we compute deltas. We skip the day's snapshot entirely so trends
  // freeze at their last real value until the shop reopens. The stores.is_vacation
  // flag is still refreshed so UI chips/banners stay accurate.
  let isVacation = false;
  try {
    const vRes = await fetch(`${ETSY}/shops/${shop_id}`, { headers: apiHeaders });
    if (vRes.ok) {
      const vs = await vRes.json();
      isVacation = !!vs?.is_vacation;
    }
  } catch (e) { console.error("vacation pre-check", e); }

  if (isVacation) {
    await supabase.from("stores")
      .update({ is_vacation: true, status_synced_at: new Date().toISOString() })
      .eq("user_id", userId).eq("etsy_shop_id", shop_id);
    return { vacation: true, skipped: true };
  }

  // store row
  const { data: storeRow } = await supabase.from("stores")
    .select("id").eq("user_id", userId).eq("etsy_shop_id", shop_id).maybeSingle();
  const storeUuid = storeRow?.id as string | undefined;

  // ---- Pull all active listings (with views/favorites + images/tags/description) ----
  type EL = {
    listing_id: number; title?: string; description?: string; state?: string;
    views?: number; num_favorers?: number; quantity?: number;
    ending_timestamp?: number; last_modified_timestamp?: number; original_creation_timestamp?: number;
    tags?: string[]; processing_min?: number; processing_max?: number;
    price?: { amount?: number; divisor?: number };
    images?: Array<{ url_fullxfull?: string }>;
  };
  const all: EL[] = [];
  let offset = 0;
  while (true) {
    const r = await fetch(`${ETSY}/shops/${shop_id}/listings?state=active&includes=Images&limit=100&offset=${offset}`, { headers: apiHeaders });
    if (!r.ok) break;
    const data = await r.json();
    const results: EL[] = data.results ?? [];
    if (!results.length) break;
    all.push(...results);
    if (results.length < 100) break;
    offset += 100;
  }

  // Map etsy_listing_id -> internal uuid
  const { data: localListings } = await supabase.from("listings")
    .select("id, etsy_listing_id, title, thumbnail_url, etsy_created_at").eq("user_id", userId);
  const byEtsyId = new Map<string, string>(
    (localListings ?? []).map((r: { id: string; etsy_listing_id: string }) => [r.etsy_listing_id, r.id])
  );
  const listingDetailsByEtsyId = new Map<string, { title: string | null; thumbnail_url: string | null; etsy_created_at: string | null }>(
    (localListings ?? []).map((r: { etsy_listing_id: string; title?: string | null; thumbnail_url?: string | null; etsy_created_at?: string | null }) => [
      r.etsy_listing_id,
      { title: r.title ?? null, thumbnail_url: r.thumbnail_url ?? null, etsy_created_at: r.etsy_created_at ?? null },
    ])
  );

  let listingSnaps = 0;
  let sumListingViews = 0;
  let sumListingFavorites = 0;
  const tractionEvents: Array<Record<string, unknown>> = [];

  for (const e of all) {
    const internalId = byEtsyId.get(String(e.listing_id));
    const price = e.price ? Number(e.price.amount ?? 0) / Number(e.price.divisor ?? 100) : null;
    const views = Number(e.views ?? 0);
    const favs = Number(e.num_favorers ?? 0);
    const qty = Number(e.quantity ?? 0);
    const endingAt = e.ending_timestamp ? new Date(e.ending_timestamp * 1000).toISOString() : null;

    // Always count toward shop totals — even if we don't have a local listing row yet
    sumListingViews += views;
    sumListingFavorites += favs;

    if (!internalId) continue;

    // Also keep the listings row hot
    await supabase.from("listings").update({
      views, favorites: favs, quantity: qty, ending_at: endingAt, state: e.state ?? "active",
    }).eq("id", internalId);

    // Reconcile fix_lifecycle: confirm monitoring, flag regressions.
    try {
      const { reconcileFixLifecycle } = await import("../_shared/fix-lifecycle.ts");
      const tagsStr = Array.isArray(e.tags) ? JSON.stringify(e.tags) : null;
      const priceStr = e.price ? String(Number(e.price.amount ?? 0) / Number(e.price.divisor ?? 100)) : null;
      const photoCountStr = Array.isArray(e.images) ? String(e.images.length) : null;
      await reconcileFixLifecycle(supabase, {
        listing_id: internalId,
        listing_title: e.title ?? null,
        user_id: userId,
        getFieldValue: (field) => {
          switch (field) {
            case "title": return e.title ?? null;
            case "tags": return tagsStr;
            case "description": return e.description ?? null;
            case "price": return priceStr;
            case "quantity": return String(qty);
            case "photos": return photoCountStr;
            default: return null;
          }
        },
      });
    } catch (err) {
      console.warn("reconcileFixLifecycle failed", err);
    }

    // Richer snapshot fields
    const title = e.title ?? null;
    const tags = Array.isArray(e.tags) ? e.tags : [];
    const titleCharCount = title ? title.length : null;
    const firstTitleKeyword = title
      ? (title.match(/[A-Za-z0-9][A-Za-z0-9'-]{2,}/)?.[0] ?? null)
      : null;
    const photoCount = Array.isArray(e.images) ? e.images.length : null;
    const lastModifiedTsz = e.last_modified_timestamp ? new Date(e.last_modified_timestamp * 1000).toISOString() : null;
    const originalCreationTsz = e.original_creation_timestamp ? new Date(e.original_creation_timestamp * 1000).toISOString() : null;

    // Fetch most recent prior snapshot for diffing
    const { data: priorRows } = await supabase
      .from("listing_snapshots")
      .select("recorded_on, views, favorites, quantity, state, price, tags, tag_count, title, photo_count, last_modified_tsz")
      .eq("listing_id", internalId)
      .lt("recorded_on", today)
      .order("recorded_on", { ascending: false })
      .limit(1);
    const prior = (priorRows ?? [])[0] as Record<string, unknown> | undefined;

    const changed: string[] = [];
    const isFirst = !prior;

    if (prior) {
      const pf = Number(prior.favorites ?? 0);
      if (favs !== pf) {
        changed.push("favorites");
        if (favs > pf) {
          tractionEvents.push({
            listing_id: String(e.listing_id), internal_listing_id: internalId, shop_id, user_id: userId,
            event_type: "favorite_gained", previous_value: String(pf), new_value: String(favs), delta: favs - pf,
          });
        }
      }
      const pp = prior.price !== null && prior.price !== undefined ? Number(prior.price) : null;
      if (price !== null && pp !== null && Math.abs(price - pp) > 0.001) {
        changed.push("price");
        tractionEvents.push({
          listing_id: String(e.listing_id), internal_listing_id: internalId, shop_id, user_id: userId,
          event_type: "price_changed", previous_value: pp.toFixed(2), new_value: price.toFixed(2), delta: price - pp,
        });
      }
      const ptc = Number(prior.tag_count ?? (Array.isArray(prior.tags) ? (prior.tags as string[]).length : 13));
      if (tags.length !== ptc) {
        changed.push("tag_count");
        if (tags.length < 13 && ptc >= 13) {
          tractionEvents.push({
            listing_id: String(e.listing_id), internal_listing_id: internalId, shop_id, user_id: userId,
            event_type: "tag_dropped", previous_value: String(ptc), new_value: String(tags.length), delta: tags.length - ptc,
          });
        }
      }
      const ps = (prior.state as string | null) ?? null;
      const ns = e.state ?? null;
      if (ps !== ns) {
        changed.push("state");
        if (ns && ns !== "active" && (ps === "active" || !ps)) {
          tractionEvents.push({
            listing_id: String(e.listing_id), internal_listing_id: internalId, shop_id, user_id: userId,
            event_type: "went_inactive", previous_value: ps, new_value: ns, delta: null,
          });
        }
      }
      const pq = Number(prior.quantity ?? 0);
      if (qty !== pq) {
        changed.push("quantity");
        if (qty > 0 && qty <= 2 && pq > 2) {
          tractionEvents.push({
            listing_id: String(e.listing_id), internal_listing_id: internalId, shop_id, user_id: userId,
            event_type: "quantity_low", previous_value: String(pq), new_value: String(qty), delta: qty - pq,
          });
        }
      }
      const pv = Number(prior.views ?? 0);
      if (views !== pv) {
        changed.push("views");
        if (pv > 0 && views >= pv * 1.2) {
          tractionEvents.push({
            listing_id: String(e.listing_id), internal_listing_id: internalId, shop_id, user_id: userId,
            event_type: "views_spike", previous_value: String(pv), new_value: String(views), delta: views - pv,
          });
        }
      }
      if (prior.title && title && prior.title !== title) changed.push("title");
      if (prior.photo_count !== null && prior.photo_count !== undefined && photoCount !== null && Number(prior.photo_count) !== photoCount) changed.push("photo_count");
      const plmRaw = (prior.last_modified_tsz as string | null) ?? null;
      // Normalize both timestamps to canonical ISO before comparing — PostgREST
      // returns timestamptz as "...+00:00" while lastModifiedTsz is built via
      // toISOString() (".000Z"), so a raw string compare always reports a diff.
      const plmNorm = plmRaw ? new Date(plmRaw).toISOString() : null;
      if (plmNorm && lastModifiedTsz && plmNorm !== lastModifiedTsz) {
        changed.push("last_modified_tsz");
        tractionEvents.push({
          listing_id: String(e.listing_id), internal_listing_id: internalId, shop_id, user_id: userId,
          event_type: "external_edit", previous_value: plmNorm, new_value: lastModifiedTsz, delta: null,
        });
      }
    }

    const { error } = await supabase.from("listing_snapshots").upsert({
      listing_id: internalId,
      user_id: userId,
      recorded_on: today,
      views, favorites: favs, quantity: qty,
      state: e.state ?? null,
      price,
      shop_id,
      title,
      description_length: e.description ? e.description.length : null,
      tag_count: tags.length,
      tags,
      photo_count: photoCount,
      title_char_count: titleCharCount,
      first_tag: tags[0] ?? null,
      first_title_keyword: firstTitleKeyword,
      last_modified_tsz: lastModifiedTsz,
      original_creation_tsz: originalCreationTsz,
      changed_fields: changed,
      is_first_snapshot: isFirst,
    }, { onConflict: "listing_id,recorded_on" });
    if (!error) listingSnaps++;
  }

  // Bulk insert traction events (best-effort — don't fail snapshot on this)
  if (tractionEvents.length) {
    try {
      await supabase.from("listing_traction_events").insert(tractionEvents);
    } catch (e) { console.warn("traction events insert failed", e); }
  }

  // ---- Shop snapshot ----
  // Shop endpoint gives us followers + reviews + (sometimes) lifetime sales.
  // Listing views/favorites must be summed from active listings — Etsy has no
  // shop-level views field.
  let shopFollowers = 0, totalSales = 0, reviewCount = 0, avgRating: number | null = null;
  try {
    const shopRes = await fetch(`${ETSY}/shops/${shop_id}`, { headers: apiHeaders });
    if (shopRes.ok) {
      const s = await shopRes.json();
      shopFollowers = Number(s.num_favorers ?? 0);
      totalSales = Number(s.transaction_sold_count ?? 0);
      reviewCount = Number(s.review_count ?? 0);
      avgRating = typeof s.review_average === "number" ? s.review_average : null;
    }
  } catch (e) { console.error("shop fetch", e); }

  const activeCount = all.length;
  const soldOutCount = all.filter(l => (l.quantity ?? 0) === 0).length;
  const now = Date.now();
  const sevenDays = 7 * 86400 * 1000;
  const expiringSoonCount = all.filter(l => l.ending_timestamp && l.ending_timestamp * 1000 - now < sevenDays).length;

  // Recent receipts (last 30 days) — paginated so we don't undercount busy shops.
  // We also walk each receipt's transactions to build receipt-sourced rows in
  // listing_sales_events (authoritative attribution per-listing, vs snapshot
  // quantity-diffing which can't tie digital/made-to-order sales to a listing).
  let orders30d = 0, revenue30d = 0;
  const salesRows: Array<{
    listing_id: string; user_id: string; sold_on: string; units: number;
    listing_type: string; source: string; etsy_receipt_id: string; etsy_transaction_id: string;
    was_first_sale?: boolean; days_to_first_sale?: number | null;
  }> = [];
  const orderLineRows: Array<Record<string, unknown>> = [];
  try {
    const since = Math.floor((Date.now() - 30 * 86400 * 1000) / 1000);
    let rOffset = 0;
    while (true) {
      const rcp = await fetch(`${ETSY}/shops/${shop_id}/receipts?min_created=${since}&limit=100&offset=${rOffset}&includes=Transactions`, { headers: apiHeaders });
      if (!rcp.ok) break;
      const rd = await rcp.json();
      const rows = rd.results ?? [];
      if (!rows.length) break;
      orders30d += rows.length;
      revenue30d += rows.reduce((sum: number, r: { grandtotal?: { amount?: number; divisor?: number } }) => {
        const a = Number(r.grandtotal?.amount ?? 0);
        const d = Number(r.grandtotal?.divisor ?? 100);
        return sum + a / d;
      }, 0);
      for (const r of rows as Array<Record<string, unknown> & { receipt_id?: number; created_timestamp?: number; transactions?: Array<Record<string, unknown>> }>) {
        const receiptId = String(r.receipt_id ?? "");
        const soldOn = r.created_timestamp
          ? new Date(r.created_timestamp * 1000).toISOString().slice(0, 10)
          : today;
        let txns = Array.isArray(r.transactions) ? r.transactions : [];
        if (!txns.length && receiptId) {
          const txnRes = await fetch(`${ETSY}/shops/${shop_id}/receipts/${receiptId}/transactions?limit=100`, { headers: apiHeaders });
          if (txnRes.ok) {
            const txnJson = await txnRes.json();
            txns = Array.isArray(txnJson.results) ? txnJson.results : [];
          }
        }
        for (const t of txns) {
          const etsyListingId = String(t.listing_id ?? (t.listing as { listing_id?: number } | undefined)?.listing_id ?? "");
          if (!etsyListingId) continue;
          const internal = byEtsyId.get(etsyListingId) ?? null;
          const receiptTxnId = String(t.transaction_id ?? `${receiptId}-${etsyListingId}`);
          const priceObj = t.price as { amount?: number; divisor?: number; currency_code?: string } | undefined;
          const unitPrice = priceObj
            ? Number(priceObj.amount ?? 0) / Number(priceObj.divisor ?? 100)
            : null;
          const listingDetails = listingDetailsByEtsyId.get(etsyListingId);
          const txnTitle = typeof t.title === "string"
            ? t.title
            : (typeof t.listing_title === "string" ? t.listing_title : listingDetails?.title ?? null);
          orderLineRows.push({
            user_id: userId,
            store_id: storeUuid ?? null,
            etsy_shop_id: shop_id,
            etsy_receipt_id: receiptId,
            etsy_transaction_id: receiptTxnId,
            etsy_listing_id: etsyListingId,
            listing_id: internal,
            title: txnTitle,
            thumbnail_url: listingDetails?.thumbnail_url ?? null,
            sold_on: soldOn,
            units: Number(t.quantity ?? 1),
            unit_price: unitPrice,
            currency_code: priceObj?.currency_code ?? null,
            raw: t,
          });
          if (!internal) continue;
          const daysToFirstSale = listingDetails?.etsy_created_at
            ? Math.max(0, Math.floor((new Date(soldOn).getTime() - new Date(listingDetails.etsy_created_at).getTime()) / 86_400_000))
            : null;
          salesRows.push({
            listing_id: internal,
            user_id: userId,
            sold_on: soldOn,
            units: Number(t.quantity ?? 1),
            listing_type: "type_fixed_qty",
            source: "receipt",
            etsy_receipt_id: receiptId,
            etsy_transaction_id: receiptTxnId,
            was_first_sale: true,
            days_to_first_sale: daysToFirstSale,
          });
        }
      }
      if (rows.length < 100) break;
      rOffset += 100;
    }
  } catch (e) { console.error("receipts fetch", e); }

  if (orderLineRows.length) {
    try {
      await supabase
        .from("order_line_items")
        .upsert(orderLineRows, { onConflict: "user_id,etsy_transaction_id" });
    } catch (e) { console.warn("order_line_items upsert", e); }
  }

  if (salesRows.length) {
    const firstByListing = new Map<string, string>();
    for (const row of [...salesRows].sort((a, b) => a.sold_on.localeCompare(b.sold_on))) {
      if (!firstByListing.has(row.listing_id)) firstByListing.set(row.listing_id, row.etsy_transaction_id);
    }
    for (const row of salesRows) row.was_first_sale = firstByListing.get(row.listing_id) === row.etsy_transaction_id;
    try {
      await supabase
        .from("listing_sales_events")
        .upsert(salesRows, { onConflict: "user_id,etsy_transaction_id" });
    } catch (e) { console.warn("listing_sales_events upsert", e); }
    // Refresh velocity stats so per-listing sales reflect the new receipts.
    try { await supabase.rpc("refresh_store_velocity", { _user_id: userId }); }
    catch (e) { console.warn("refresh_store_velocity", e); }
  }

  // Fallback: if Etsy didn't give us lifetime sales, infer at least 30d count
  if (!totalSales && orders30d) totalSales = orders30d;

  if (storeUuid) {
    await supabase.from("shop_snapshots").upsert({
      store_id: storeUuid,
      user_id: userId,
      recorded_on: today,
      total_views: sumListingViews,
      total_favorites: sumListingFavorites,
      shop_followers: shopFollowers,
      total_sales: totalSales,
      active_count: activeCount,
      sold_out_count: soldOutCount,
      expiring_soon_count: expiringSoonCount,
      review_count: reviewCount,
      avg_rating: avgRating,
      orders_30d: orders30d,
      revenue_30d: revenue30d,
    }, { onConflict: "store_id,recorded_on" });


    // ---- Recent reviews (best-effort) ----
    try {
      const rv = await fetch(`${ETSY}/shops/${shop_id}/reviews?limit=25`, { headers: apiHeaders });
      if (rv.ok) {
        const rj = await rv.json();
        const rows = rj.results ?? [];
        for (const r of rows) {
          const reviewId = String(r.transaction_id ?? r.review_id ?? `${r.shop_id}-${r.create_timestamp}`);
          const internal = r.listing_id ? byEtsyId.get(String(r.listing_id)) ?? null : null;
          await supabase.from("shop_reviews").upsert({
            store_id: storeUuid,
            user_id: userId,
            etsy_review_id: reviewId,
            rating: Number(r.rating ?? 5),
            review_text: r.review ?? null,
            listing_id: internal,
            buyer_country: r.language ?? null,
            etsy_created_at: r.create_timestamp ? new Date(r.create_timestamp * 1000).toISOString() : null,
          }, { onConflict: "user_id,etsy_review_id" });
        }
      }
    } catch (e) { console.error("reviews fetch", e); }
  }

  return { listingSnaps, activeCount, orders30d };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
