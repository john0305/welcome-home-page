// Sync active Etsy listings into Supabase using per-user Etsy app credentials
// Uses RadarIQ's own Etsy app credentials from server secrets. Auto-refreshes access token if needed.
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ETSY_TOKEN_URL = "https://openapi.etsy.com/v3/public/oauth/token";

// Etsy returns titles/descriptions with HTML entities (e.g. &#39; &amp; &quot;).
// Decode them before persisting so the UI doesn't render raw entity codes.
function decodeHtmlEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    // Cron bypass: nightly sync-all-stores invokes us with the service-role key
    // + X-Sync-Source: cron. We resolve userId from the body and skip rate limits.
    const isCron =
      req.headers.get("x-sync-source") === "cron" &&
      authHeader === `Bearer ${SERVICE_KEY}`;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    let userId: string;
    if (isCron) {
      const body = await req.json().catch(() => ({} as { user_id?: string }));
      if (!body?.user_id) return json({ error: "user_id required for cron" }, 400);
      userId = body.user_id;
    } else {
      const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes } = await supabaseAuth.auth.getUser();
      if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
      userId = userRes.user.id;
    }

    // ── Rate limit guard (skipped for cron) ──────────────────────────────────
    if (!isCron) {
      const { data: profile } = await supabase
        .from("user_profiles").select("tier").eq("id", userId).maybeSingle();
      const isPaid = (profile?.tier ?? "free") !== "free";
      const hourlyCap = isPaid ? 10 : 3;
      const baseCooldownMs = (isPaid ? 2 : 10) * 60_000;

      const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
      const { data: recent } = await supabase
        .from("sync_rate_limits")
        .select("started_at, outcome")
        .eq("user_id", userId)
        .gte("started_at", oneHourAgo)
        .order("started_at", { ascending: false });
      const recentRows = (recent ?? []) as Array<{ started_at: string; outcome: string }>;

      if (recentRows.length >= hourlyCap) {
        const oldest = recentRows[recentRows.length - 1];
        const retryAt = new Date(oldest.started_at).getTime() + 3_600_000;
        return json({
          error: "rate_limited",
          reason: "hourly_cap",
          message: `You've hit your hourly sync cap (${hourlyCap}/hr). Background sync keeps your data fresh — manual sync is rarely needed.`,
          retry_after_seconds: Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)),
        }, 429);
      }

      const last = recentRows[0];
      if (last) {
        // Double cooldown on consecutive no-change syncs, capped at 30 min.
        let consecutiveNoChange = 0;
        for (const r of recentRows) {
          if (r.outcome === "no_change") consecutiveNoChange++; else break;
        }
        const cooldownMs = consecutiveNoChange >= 2
          ? Math.min(30 * 60_000, baseCooldownMs * Math.pow(2, consecutiveNoChange - 1))
          : 0;
        const elapsed = Date.now() - new Date(last.started_at).getTime();
        if (cooldownMs > 0 && elapsed < cooldownMs) {
          return json({
            error: "rate_limited",
            reason: "no_change_cooldown",
            message: "Your last few syncs didn't pick up any changes. Wait a bit before retrying — your dashboard auto-refreshes when Etsy data updates.",
            retry_after_seconds: Math.ceil((cooldownMs - elapsed) / 1000),
          }, 429);
        }
      }
    }

    // Reserve a row up-front so concurrent calls can see this attempt in flight.
    const { data: limitRow } = await supabase
      .from("sync_rate_limits")
      .insert({ user_id: userId, outcome: "pending", source: isCron ? "cron" : "manual" })
      .select("id")
      .single();
    const limitRowId = (limitRow as { id?: string } | null)?.id ?? null;


    // RadarIQ's own Etsy app credentials, stored as server secrets.
    const clientId = String(Deno.env.get("ETSY_API_KEY") ?? "").trim();
    const clientSecret = String(Deno.env.get("ETSY_SHARED_SECRET") ?? "").trim();
    if (!clientId || !clientSecret) {
      return json({ error: "Etsy API key not configured on the server." }, 500);
    }
    // As of Feb 9, 2026, Etsy requires `keystring:shared_secret` in x-api-key.
    // https://github.com/etsy/open-api/discussions/1531
    const apiKeyHeader = `${clientId}:${clientSecret}`;

    // Token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("etsy_tokens")
      .select("id, access_token, refresh_token, expires_at, shop_id, shop_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (tokenErr || !tokenRow) return json({ error: "No Etsy store connected" }, 400);

    let { access_token } = tokenRow as { access_token: string };
    let { shop_id, shop_name } = tokenRow as { shop_id: string; shop_name: string | null };
    const { refresh_token, expires_at, id: tokenId } = tokenRow as {
      refresh_token: string; expires_at: string; id: string;
    };

    // Refresh if expiring within 2 minutes
    if (new Date(expires_at).getTime() < Date.now() + 2 * 60 * 1000) {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
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
        return json({ error: "Etsy refresh failed. Please reconnect your store.", details: data }, 502);
      }
      access_token = data.access_token;
      const newExpires = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
      await supabase.from("etsy_tokens").update({
        access_token,
        refresh_token: data.refresh_token ?? refresh_token,
        expires_at: newExpires,
      }).eq("id", tokenId);
    }

    const apiHeaders = { Authorization: `Bearer ${access_token}`, "x-api-key": apiKeyHeader };

    // Probe credentials against a no-auth endpoint for crystal-clear errors.
    // Etsy requires `keystring:shared_secret` in x-api-key as of Feb 9, 2026.
    {
      const ping = await fetch("https://openapi.etsy.com/v3/application/openapi-ping", {
        headers: { "x-api-key": apiKeyHeader },
      });
      if (!ping.ok) {
        const txt = await ping.text();
        console.error("Etsy credentials rejected", ping.status, txt.slice(0, 300));
        return json({
          error: "ETSY_BAD_CREDENTIALS",
          message: "Etsy rejected RadarIQ's API credentials. Please contact support.",
          etsy_status: ping.status,
          etsy_response: txt.slice(0, 300),
        }, 502);
      }
    }

    // Self-heal shop_id/shop_name if missing or appears to be the etsy user_id (no shop_name was stored).
    const tokenUserId = String(access_token).split(".")[0];
    if (!shop_name || !shop_id || shop_id === tokenUserId) {
      try {
        const shopRes = await fetch(`https://openapi.etsy.com/v3/application/users/${tokenUserId}/shops`, { headers: apiHeaders });
        const shopTxt = await shopRes.text();
        if (!shopRes.ok) {
          console.error("Resolve shop failed", shopRes.status, shopTxt.slice(0, 500));
          return json({ error: `Could not resolve your Etsy shop (${shopRes.status}). Make sure your Etsy account has an active shop.`, details: shopTxt.slice(0, 500) }, 502);
        }
        const shopJson = JSON.parse(shopTxt);
        const resolvedShopId = String(shopJson?.shop_id ?? shopJson?.results?.[0]?.shop_id ?? "");
        const resolvedShopName = shopJson?.shop_name ?? shopJson?.results?.[0]?.shop_name ?? null;
        if (!resolvedShopId) {
          return json({ error: "Etsy returned no shop for this account." }, 502);
        }
        shop_id = resolvedShopId;
        shop_name = resolvedShopName;
        await supabase.from("etsy_tokens").update({ shop_id, shop_name }).eq("id", tokenId);
      } catch (e) {
        console.error("shop resolve error", e);
        return json({ error: `Could not resolve shop: ${String(e)}` }, 500);
      }
    }

    let synced = 0;
    let offset = 0;
    const limit = 100;

    // Probe vacation mode early. While a shop is on vacation, Etsy hides
    // listings and zeroes out activity — so we skip writing daily snapshots
    // to avoid a false 100% drop in views/sales when the shop reopens.
    // (The listings.views/favorites columns are protected separately via
    // Math.max with prior values further below.)
    let isVacationSync = false;
    try {
      const vRes = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}`, { headers: apiHeaders });
      if (vRes.ok) {
        const vJson = await vRes.json();
        isVacationSync = !!vJson?.is_vacation;
      }
    } catch (e) { console.error("vacation pre-check (sync-listings)", e); }

    // ── Vacation period tracking ────────────────────────────────────────────
    // Open or close a shop_vacation_periods row so stale-day math in
    // recomputeSummary can subtract days the shop was hibernating.
    try {
      const todayDate = new Date().toISOString().slice(0, 10);
      const { data: openVac } = await supabase
        .from("shop_vacation_periods")
        .select("id")
        .eq("etsy_shop_id", shop_id)
        .is("ended_on", null)
        .maybeSingle();
      if (isVacationSync && !openVac) {
        await supabase.from("shop_vacation_periods").insert({
          etsy_shop_id: shop_id, started_on: todayDate,
        });
      } else if (!isVacationSync && openVac) {
        await supabase
          .from("shop_vacation_periods")
          .update({ ended_on: todayDate })
          .eq("id", (openVac as { id: string }).id);
      }
    } catch (e) { console.error("vacation period tracking failed (non-fatal)", e); }



    // The shop listings endpoint ignores includes=Images/Videos,
    // so collect listings here and batch-fetch media in a second pass.
    type EtsyListing = Record<string, unknown> & {
      listing_id: number;
      price?: { amount?: number; divisor?: number };
      images?: Array<unknown>;
      videos?: Array<unknown>;
      original_creation_timestamp?: number;
      creation_timestamp?: number;
    };
    const allListings: EtsyListing[] = [];

    while (true) {
      // Etsy's `/listings/active` route can return 404 for valid shops with no
      // active inventory. The filtered shop listings route returns a proper
      // `{ count: 0, results: [] }` response, so use it for sync stability.
      const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings?state=active&limit=${limit}&offset=${offset}`;
      const r = await fetch(url, { headers: apiHeaders });
      if (!r.ok) {
        const txt = await r.text();
        console.error("Etsy listings fetch failed", r.status, txt.slice(0, 500));
        return json({ error: `Etsy API ${r.status}: ${txt.slice(0, 300)}`, synced }, r.status);
      }
      const data = await r.json();
      const results: EtsyListing[] = data.results ?? [];
      if (results.length === 0) break;
      allListings.push(...results);
      if (results.length < limit) break;
      offset += limit;
    }

    // Batch-fetch images, videos & shipping profile in chunks of 100 ids.
    type EtsyImage = { url_fullxfull?: string; url_570xN?: string; url_170x135?: string; url_75x75?: string; rank?: number };
    type ShipEntry = { primary_cost?: { amount?: number; divisor?: number } };
    type ShipProfile = { shipping_profile_entries?: ShipEntry[] };
    const mediaById = new Map<number, { images: number; videos: number; thumbnail: string | null; image_urls: string[]; shipping_price_usd: number | null; views: number | null; favorites: number | null }>();
    for (let i = 0; i < allListings.length; i += 100) {
      const ids = allListings.slice(i, i + 100).map((l) => l.listing_id).join(",");
      // NOTE: Etsy's valid include name is `Shipping`, not `ShippingProfile`.
      // Passing an invalid include 400s the entire batch, which wipes images/
      // thumbnails for every listing on next upsert.
      const r = await fetch(
        `https://openapi.etsy.com/v3/application/listings/batch?listing_ids=${ids}&includes=Images,Videos,Shipping`,
        { headers: apiHeaders },
      );
      if (!r.ok) {
        console.error("Etsy batch fetch failed", r.status, (await r.text()).slice(0, 300));
        continue;
      }
      const data = await r.json();
      for (const row of (data.results ?? []) as EtsyListing[]) {
        const imgsRaw = (Array.isArray(row.images) ? row.images : []) as EtsyImage[];
        const imgs = [...imgsRaw].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
        const image_urls = imgs
          .map((img) => img.url_fullxfull ?? img.url_570xN ?? img.url_170x135 ?? img.url_75x75 ?? null)
          .filter((u): u is string => !!u);
        const first = imgs[0];
        const sp = (row as unknown as { shipping_profile?: ShipProfile }).shipping_profile;
        const entry = sp?.shipping_profile_entries?.[0]?.primary_cost;
        const shipping_price_usd = entry?.amount != null && entry?.divisor
          ? Number(entry.amount) / Number(entry.divisor)
          : null;
        // The shop listings endpoint omits views/num_favorers for many shops,
        // but the batch listings endpoint returns them reliably. Prefer batch.
        const bViews = (row as { views?: number }).views;
        const bFavs = (row as { num_favorers?: number }).num_favorers;
        mediaById.set(row.listing_id, {
          images: imgs.length,
          videos: Array.isArray(row.videos) ? row.videos.length : 0,
          thumbnail: first?.url_170x135 ?? first?.url_75x75 ?? first?.url_fullxfull ?? null,
          image_urls,
          shipping_price_usd,
          views: typeof bViews === "number" ? bViews : null,
          favorites: typeof bFavs === "number" ? bFavs : null,
        });
      }
    }

    const today = new Date().toISOString().slice(0, 10);

    // Fetch prior lifetime counters for all current etsy listing ids so an Etsy
    // response that omits metrics as zero does not wipe known shop history.
    const etsyIds = allListings.map((l) => String(l.listing_id));
    const priorById = new Map<string, { ending_at: string | null; views: number; favorites: number }>();
    if (etsyIds.length > 0) {
      const { data: prior } = await supabase
        .from("listings")
        .select("etsy_listing_id, ending_at, views, favorites")
        .eq("user_id", userId)
        .in("etsy_listing_id", etsyIds);
      for (const r of (prior ?? []) as { etsy_listing_id: string; ending_at: string | null; views: number | null; favorites: number | null }[]) {
        priorById.set(r.etsy_listing_id, {
          ending_at: r.ending_at,
          views: Number(r.views ?? 0),
          favorites: Number(r.favorites ?? 0),
        });
      }
    }

    for (const e of allListings) {
      const price = e.price ? Number(e.price.amount ?? 0) / Number(e.price.divisor ?? 100) : null;
      const media = mediaById.get(e.listing_id) ?? { images: 0, videos: 0, thumbnail: null, image_urls: [] as string[], shipping_price_usd: null, views: null, favorites: null };
      const shopViews = (e as { views?: number }).views;
      const shopFavs = (e as { num_favorers?: number }).num_favorers;
      // Prefer batch-listing values (more reliable) and fall back to shop-listing values.
      const incomingViews = Number(media.views ?? (typeof shopViews === "number" ? shopViews : 0));
      const incomingFavorites = Number(media.favorites ?? (typeof shopFavs === "number" ? shopFavs : 0));
      const quantity = Number((e as { quantity?: number }).quantity ?? 0);
      const endingTs = (e as { ending_timestamp?: number }).ending_timestamp;
      const newEndingAt = endingTs ? new Date(endingTs * 1000).toISOString() : null;
      const etsyIdStr = String(e.listing_id);
      const prior = priorById.get(etsyIdStr);
      const views = Math.max(incomingViews, prior?.views ?? 0);
      const favorites = Math.max(incomingFavorites, prior?.favorites ?? 0);
      const row = {
        user_id: userId,
        etsy_listing_id: etsyIdStr,
        title: decodeHtmlEntities(String(e.title ?? "")),
        description: decodeHtmlEntities(String(e.description ?? "")),
        tags: Array.isArray(e.tags) ? e.tags : [],
        photo_count: media.images,
        video_count: media.videos,
        thumbnail_url: media.thumbnail,
        image_urls: media.image_urls,
        price,
        shipping_price_usd: media.shipping_price_usd,
        state: String(e.state ?? "active"),
        views,
        favorites,
        quantity,
        ending_at: newEndingAt,
      };

      const { data: upRow, error: upErr } = await supabase
        .from("listings")
        .upsert(row, { onConflict: "user_id,etsy_listing_id" })
        .select("id")
        .single();
      if (upErr) {
        console.error("listing upsert error", upErr);
      } else {
        synced++;
        if (upRow?.id) {
          if (!isVacationSync) {
            await supabase.from("listing_snapshots").upsert({
              listing_id: upRow.id,
              user_id: userId,
              recorded_on: today,
              views,
              favorites,
              quantity,
              state: row.state,
              price,
            }, { onConflict: "listing_id,recorded_on" });
          }

          // Renewal-tracking snapshot. Distinct from the performance snapshot above:
          // this is the diff source for sync-renewal-detector. Always write it
          // (even on vacation syncs) so we don't lose continuity — `shop_on_vacation`
          // is recorded so downstream math can adjust. ending_timestamp falls back
          // to 0 when Etsy omits it; the detector skips 0 to avoid false renewals.
          const lastModTs = Number((e as { last_modified_timestamp?: number }).last_modified_timestamp ?? 0);
          const isDigital = !!(e as { is_digital?: boolean }).is_digital;
          await supabase.from("listing_renewal_snapshots").upsert({
            etsy_listing_id: etsyIdStr,
            etsy_shop_id: shop_id,
            snapshot_date: today,
            state: row.state,
            quantity,
            price: price ?? 0,
            ending_timestamp: endingTs ?? 0,
            last_modified_timestamp: lastModTs,
            is_digital: isDigital,
            shop_on_vacation: isVacationSync,
          }, { onConflict: "etsy_listing_id,snapshot_date" });


          // Detect renewal: ending_at jumped forward by >= 60 days vs what we last saw.
          const prevIso = prior?.ending_at ?? null;
          if (newEndingAt && prevIso) {
            const diffDays = (new Date(newEndingAt).getTime() - new Date(prevIso).getTime()) / 86400000;
            if (diffDays >= 60) {
              await supabase.from("listing_renewals").upsert({
                user_id: userId,
                listing_id: upRow.id,
                etsy_listing_id: etsyIdStr,
                previous_ending_at: prevIso,
                new_ending_at: newEndingAt,
                renewal_cost: 0.20,
              }, { onConflict: "listing_id,new_ending_at", ignoreDuplicates: true });
            }
          }
        }
      }
    }

    // Fetch shop status (vacation mode, currency, reviews, icon, banner) so we
    // can warn users before attempting to push updates AND power the action engine.
    let shopVacation: { is_vacation: boolean; vacation_message: string | null; vacation_autoreply: string | null; currency_code: string | null } = {
      is_vacation: false, vacation_message: null, vacation_autoreply: null, currency_code: null,
    };
    let shopExtras: { review_count: number | null; review_avg: number | null; has_shop_icon: boolean; has_banner: boolean } = {
      review_count: null, review_avg: null, has_shop_icon: false, has_banner: false,
    };
    try {
      const sRes = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}`, { headers: apiHeaders });
      if (sRes.ok) {
        const sJson = await sRes.json();
        shopVacation = {
          is_vacation: !!sJson?.is_vacation,
          vacation_message: sJson?.vacation_message ?? null,
          vacation_autoreply: sJson?.vacation_autoreply ?? null,
          currency_code: sJson?.currency_code ?? null,
        };
        shopExtras = {
          review_count: typeof sJson?.review_count === "number" ? sJson.review_count : null,
          review_avg: typeof sJson?.review_average === "number" ? sJson.review_average : null,
          has_shop_icon: !!(sJson?.icon_url_fullxfull),
          has_banner: !!(sJson?.image_url_760x100),
        };
        if (!shop_name && sJson?.shop_name) shop_name = sJson.shop_name;
      }
    } catch (e) {
      console.error("shop status fetch failed (non-fatal)", e);
    }

    // Shop policies live behind a separate endpoint. Pull return + shipping policy text.
    let shopPolicies: { return_policy: string | null; shipping_policy: string | null } = {
      return_policy: null, shipping_policy: null,
    };
    try {
      const pRes = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/policies`, { headers: apiHeaders });
      if (pRes.ok) {
        const pJson = await pRes.json();
        shopPolicies = {
          return_policy: typeof pJson?.return_policy === "string" ? pJson.return_policy : null,
          shipping_policy: typeof pJson?.shipping_policy === "string" ? pJson.shipping_policy : null,
        };
      }
    } catch (e) {
      console.error("shop policies fetch failed (non-fatal)", e);
    }

    const { data: storeRow } = await supabase.from("stores").upsert({
      user_id: userId,
      etsy_shop_id: shop_id,
      shop_name,
      last_synced: new Date().toISOString(),
      listing_count: synced,
      is_vacation: shopVacation.is_vacation,
      vacation_message: shopVacation.vacation_message,
      vacation_autoreply: shopVacation.vacation_autoreply,
      currency_code: shopVacation.currency_code,
      status_synced_at: new Date().toISOString(),
      review_count: shopExtras.review_count,
      review_avg: shopExtras.review_avg,
      has_shop_icon: shopExtras.has_shop_icon,
      has_banner: shopExtras.has_banner,
      return_policy: shopPolicies.return_policy,
      shipping_policy: shopPolicies.shipping_policy,
    }, { onConflict: "user_id,etsy_shop_id" }).select("id").maybeSingle();

    // Stamp store_id on any of this user's listings that are missing it (or all of them, idempotently).
    if (storeRow?.id) {
      await supabase
        .from("listings")
        .update({ store_id: storeRow.id })
        .eq("user_id", userId)
        .is("store_id", null);
    }

    // ── Record sync outcome on the rate-limit row ─────────────────────────────
    // "No-change" means Etsy's max last_modified_timestamp didn't advance past
    // the value we recorded on the previous successful sync.
    let etsyUpdatedMaxMs = 0;
    for (const e of allListings) {
      const ts = Number((e as { last_modified_timestamp?: number }).last_modified_timestamp ?? 0);
      if (ts > etsyUpdatedMaxMs) etsyUpdatedMaxMs = ts;
    }
    const etsyUpdatedMaxIso = etsyUpdatedMaxMs ? new Date(etsyUpdatedMaxMs * 1000).toISOString() : null;

    if (limitRowId) {
      const { data: prev } = await supabase
        .from("sync_rate_limits")
        .select("etsy_updated_max")
        .eq("user_id", userId)
        .in("outcome", ["changed", "no_change"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const prevMax = (prev as { etsy_updated_max?: string | null } | null)?.etsy_updated_max ?? null;
      const isNoChange = !!etsyUpdatedMaxIso && !!prevMax && etsyUpdatedMaxIso <= prevMax;
      await supabase
        .from("sync_rate_limits")
        .update({
          outcome: isNoChange ? "no_change" : "changed",
          etsy_updated_max: etsyUpdatedMaxIso,
        })
        .eq("id", limitRowId);
    }

    // Chain shop snapshot (orders_30d, revenue_30d, shop totals) so users never
    // see "0 orders" after a fresh sync. Fire-and-forget via EdgeRuntime.waitUntil
    // so we don't block the sync response.
    try {
      const snapshotPromise = fetch(`${SUPABASE_URL}/functions/v1/snapshot-performance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({ user_id: userId }),
      }).catch((e) => console.error("snapshot-performance chain failed", e));
      // @ts-ignore EdgeRuntime is available in Supabase edge runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(snapshotPromise);
      }
    } catch (e) {
      console.error("snapshot chain setup failed", e);
    }

    // Chain renewal detector — diffs today's renewal snapshots vs prior and writes
    // renewal events. Fire-and-forget.
    try {
      const renewalPromise = fetch(`${SUPABASE_URL}/functions/v1/sync-renewal-detector`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({ etsy_shop_id: shop_id }),
      }).catch((e) => console.error("sync-renewal-detector chain failed", e));
      // @ts-ignore EdgeRuntime is available in Supabase edge runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(renewalPromise);
      }
    } catch (e) {
      console.error("renewal detector chain setup failed", e);
    }

    // Fire-and-forget: refresh embeddings for any listings whose content changed.
    // embed-listing skips unchanged rows via content_hash, so this is cheap + idempotent.
    try {
      const embedPromise = fetch(`${SUPABASE_URL}/functions/v1/embed-listing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({ backfill: true, limit: 2000, user_id: userId }),
      }).catch((e) => console.error("embed-listing chain failed (non-fatal)", e));
      // @ts-ignore EdgeRuntime is available in Supabase edge runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(embedPromise);
      }
    } catch (e) {
      console.error("embed-listing chain setup failed (non-fatal)", e);
    }

    // Evaluate achievements at the end of a manual or scheduled sync so newly
    // qualifying awards appear on the user's next achievement-page refresh.
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/check-and-award-achievements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({ userId }),
      });
    } catch (e) {
      console.error("achievement evaluation after sync failed (non-fatal)", e);
    }

    return json({ synced, shop_name });

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
