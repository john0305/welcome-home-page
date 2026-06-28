// Snapshot top Etsy competitors for the calling user's most-used tags.
// For each of the top 5 tags, queries the Etsy public listings endpoint and
// upserts up to 5 competing listings into competitor_snapshots.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EtsyListing {
  listing_id: number;
  shop_id?: number;
  title?: string;
  description?: string;
  tags?: string[];
  price?: { amount: number; divisor: number };
  num_favorers?: number;
  quantity?: number;
  images?: Array<{ url_570xN?: string; url_fullxfull?: string }>;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY;
  const ETSY_API_KEY = Deno.env.get("ETSY_API_KEY");
  const ETSY_SHARED_SECRET = Deno.env.get("ETSY_SHARED_SECRET");

  if (!ETSY_API_KEY) return json({ error: "ETSY_API_KEY missing" }, 500);
  if (!ETSY_SHARED_SECRET) return json({ error: "ETSY_SHARED_SECRET missing" }, 500);
  // Etsy requires `keystring:shared_secret` in x-api-key as of Feb 9, 2026.
  const ETSY_API_KEY_HEADER = `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supaAuth = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supaAuth.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const supa = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Pull user's active listings to derive top tags
    const { data: listings } = await supa
      .from("listings")
      .select("tags")
      .eq("user_id", userId)
      .eq("state", "active")
      .limit(500);

    const tagFreq = new Map<string, number>();
    for (const l of listings ?? []) {
      const tags = (l.tags ?? []) as string[];
      for (const t of tags) {
        const k = (t || "").trim().toLowerCase();
        if (k.length < 3) continue;
        tagFreq.set(k, (tagFreq.get(k) ?? 0) + 1);
      }
    }
    const topTags = [...tagFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t);

    if (topTags.length === 0) {
      return json({ ok: true, snapshots: 0, message: "No tags to scan" });
    }

    let inserted = 0;
    const errors: string[] = [];

    for (const tag of topTags) {
      const url = `https://openapi.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(tag)}&limit=5&sort_on=score&includes=Images`;
      const res = await fetch(url, { headers: { "x-api-key": ETSY_API_KEY_HEADER } });
      if (!res.ok) {
        errors.push(`${tag}: ${res.status}`);
        continue;
      }
      const body = await res.json().catch(() => ({}));
      const results = (body.results ?? []) as EtsyListing[];

      // Clear previous snapshots for this keyword to keep table fresh
      await supa.from("competitor_snapshots").delete().eq("keyword_cluster", tag).eq("user_id", userId);

      const rows = results.map((r, idx) => {
        const priceVal = r.price ? r.price.amount / (r.price.divisor || 100) : null;
        const images = (r.images ?? []).map(i => i.url_570xN || i.url_fullxfull || "").filter(Boolean);
        return {
          user_id: userId,
          keyword_cluster: tag,
          etsy_listing_id: String(r.listing_id),
          shop_id: r.shop_id != null ? String(r.shop_id) : null,
          shop_name: null,
          title: r.title ?? null,
          tags: r.tags ?? [],
          price: priceVal,
          num_favorers: r.num_favorers ?? 0,
          quantity: r.quantity ?? null,
          photo_count: images.length,
          image_urls: images,
          description_length: r.description ? r.description.length : null,
          rank_position: idx + 1,
          source: "etsy_api",
          captured_at: new Date().toISOString(),
        };
      });

      if (rows.length > 0) {
        const { error } = await supa.from("competitor_snapshots").insert(rows);
        if (error) errors.push(`${tag}: ${error.message}`);
        else inserted += rows.length;
      }
    }

    return json({ ok: true, snapshots: inserted, tags: topTags, errors });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
