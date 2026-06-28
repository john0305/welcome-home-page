/**
 * Shared adapters used by the action engine edge functions.
 * - aiGateway(): JSON-mode call to Lovable AI Gateway
 * - etsyApiFor(userId): PATCH a listing with auto-refresh of the access token
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { AiGateway, EtsyApi } from "./etsy-ranking-factors.ts";

const ETSY_TOKEN_URL = "https://openapi.etsy.com/v3/public/oauth/token";

export function aiGateway(model = "google/gemini-2.5-flash"): AiGateway {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  return {
    async json<T>(prompt: string, system?: string): Promise<T> {
      const messages: Array<{ role: string; content: string }> = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: prompt });
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: "json_object" },
        }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`AI gateway ${r.status}: ${text.slice(0, 300)}`);
      }
      const json = await r.json();
      const content = json?.choices?.[0]?.message?.content ?? "{}";
      return JSON.parse(content) as T;
    },
  };
}

export async function etsyApiFor(
  supabase: SupabaseClient,
  userId: string,
): Promise<EtsyApi> {
  const clientId = String(Deno.env.get("ETSY_API_KEY") ?? "").trim();
  const clientSecret = String(Deno.env.get("ETSY_SHARED_SECRET") ?? "").trim();
  if (!clientId || !clientSecret) throw new Error("Etsy API keys not configured");

  const { data: tokenRow } = await supabase
    .from("etsy_tokens")
    .select("id, shop_id, access_token, refresh_token, expires_at, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!tokenRow) throw new Error("No Etsy connection");

  // Honor connection status — never attempt a refresh on a flagged connection.
  const status = String(tokenRow.status ?? "active");
  if (status === "revoked" || status === "error") {
    throw new Error(`Etsy connection ${status} — reconnect required`);
  }

  let accessToken = String(tokenRow.access_token);
  if (new Date(tokenRow.expires_at).getTime() < Date.now() + 2 * 60 * 1000) {
    const refreshRes = await fetch(ETSY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: String(tokenRow.refresh_token),
      }),
    });
    const refreshJson = await refreshRes.json().catch(() => null);
    if (!refreshRes.ok || !refreshJson?.access_token) {
      // Flag the connection so subsequent calls fail fast without burning refresh attempts.
      await supabase.from("etsy_tokens").update({ status: "error" }).eq("id", tokenRow.id);
      throw new Error("Etsy session expired — reconnect required");
    }
    accessToken = refreshJson.access_token;
    await supabase.from("etsy_tokens").update({
      access_token: accessToken,
      refresh_token: refreshJson.refresh_token ?? tokenRow.refresh_token,
      expires_at: new Date(Date.now() + (refreshJson.expires_in ?? 3600) * 1000).toISOString(),
    }).eq("id", tokenRow.id);
  }

  const apiKeyHeader = `${clientId}:${clientSecret}`;

  return {
    async patchListing(listingId, _shopId, body) {
      const params = new URLSearchParams(
        Object.fromEntries(
          Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)]),
        ),
      );
      const r = await fetch(
        `https://openapi.etsy.com/v3/application/shops/${tokenRow.shop_id}/listings/${listingId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "x-api-key": apiKeyHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        },
      );
      let parsed: unknown = null;
      try { parsed = await r.json(); } catch { /* ignore */ }
      return { ok: r.ok, status: r.status, body: parsed };
    },
  };
}

export function makeServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function authedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data } = await supabaseAuth.auth.getUser();
  return data?.user?.id ?? null;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Context loaders ────────────────────────────────────────────────────────

import type { ListingCtx, ShopCtx } from "./etsy-ranking-factors.ts";

export async function loadListingCtx(
  supabase: SupabaseClient,
  userId: string,
  listingId: string,
): Promise<ListingCtx | null> {
  const { data: l, error } = await supabase
    .from("listings")
    .select(
      "id,user_id,etsy_listing_id,title,description,tags,materials,image_urls,price,shipping_price_usd,grade,store_id,video_count",
    )
    .eq("id", listingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("loadListingCtx select error", error);
    return null;
  }
  if (!l) return null;

  // Resolve shop id: prefer direct store_id link; fall back to the user's single store.
  let etsy_shop_id = "";
  if (l.store_id) {
    const { data: s } = await supabase
      .from("stores").select("etsy_shop_id").eq("id", l.store_id).maybeSingle();
    etsy_shop_id = String(s?.etsy_shop_id ?? "");
  }
  if (!etsy_shop_id) {
    const { data: s } = await supabase
      .from("stores").select("etsy_shop_id").eq("user_id", userId).maybeSingle();
    etsy_shop_id = String(s?.etsy_shop_id ?? "");
  }

  return {
    id: l.id,
    user_id: l.user_id,
    etsy_listing_id: l.etsy_listing_id,
    etsy_shop_id,
    title: l.title,
    description: l.description,
    tags: l.tags || [],
    materials: l.materials || [],
    image_urls: l.image_urls || [],
    has_video: (l.video_count ?? 0) > 0,
    price: l.price,
    shipping_price: l.shipping_price_usd,
    current_grade: typeof l.grade === "number" ? l.grade : null,
  };
}

export async function loadShopCtx(
  supabase: SupabaseClient,
  userId: string,
  etsyShopId?: string,
): Promise<ShopCtx | null> {
  const cols =
    "id,user_id,etsy_shop_id,shop_name,return_policy,shipping_policy,review_count,review_avg,has_shop_icon,has_banner";
  const q = supabase.from("stores").select(cols).eq("user_id", userId);
  const { data: s, error } = etsyShopId
    ? await q.eq("etsy_shop_id", etsyShopId).maybeSingle()
    : await q.maybeSingle();
  if (error) {
    console.error("loadShopCtx select error", error);
    return null;
  }
  if (!s) return null;
  return {
    user_id: userId,
    etsy_shop_id: String(s.etsy_shop_id),
    shop_name: s.shop_name,
    return_policy: s.return_policy ?? null,
    shipping_policy: s.shipping_policy ?? null,
    review_count: s.review_count ?? null,
    review_avg: s.review_avg ?? null,
    has_shop_icon: s.has_shop_icon ?? null,
    has_banner: s.has_banner ?? null,
  };
}
