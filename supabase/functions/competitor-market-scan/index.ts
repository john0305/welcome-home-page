/**
 * competitor-market-scan
 *
 * Scans Etsy search results for a user's key search terms, stores each
 * result set in market_snapshots, and compares against the previous
 * snapshot to generate competitor_alerts for detected changes.
 *
 * POST body:
 *   { user_id: string, search_terms?: string[], source: 'nightly' | 'manual' | 'onboarding' }
 *
 * Always returns HTTP 200. Failures use { success: false, error: '...' }.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isServiceOrCronCall } from "../_shared/service-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EtsyListingRaw {
  listing_id: number;
  title?: string;
  tags?: string[];
  price?: { amount: number; divisor: number };
  num_favorers?: number;
  creation_timestamp?: number;
  images?: Array<{ url_570xN?: string }>;
  shipping_profile?: {
    min_processing_days?: number;
    free_shipping_is_applied?: boolean;
  };
  materials?: string[];
}

interface CompetitorListing {
  etsy_listing_id: string;
  title: string;
  tags: string[];
  price: number;
  photo_count: number;
  review_count: number;
  listing_age_days: number;
  ships_fast: boolean;
  has_free_shipping: boolean;
  return_policy_present: boolean;
  materials_filled: boolean;
  rank_position: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseListing(r: EtsyListingRaw, rank: number): CompetitorListing {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    etsy_listing_id: String(r.listing_id),
    title: r.title ?? "",
    tags: r.tags ?? [],
    price: r.price ? r.price.amount / (r.price.divisor || 100) : 0,
    photo_count: (r.images ?? []).length,
    review_count: r.num_favorers ?? 0,
    listing_age_days: r.creation_timestamp
      ? Math.floor((nowSec - r.creation_timestamp) / 86400)
      : 0,
    ships_fast: (r.shipping_profile?.min_processing_days ?? 99) <= 3,
    has_free_shipping: r.shipping_profile?.free_shipping_is_applied ?? false,
    return_policy_present: false, // requires Shop include — not fetched here
    materials_filled: (r.materials ?? []).length > 0,
    rank_position: rank,
  };
}

function tagOverlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b.map((t) => t.toLowerCase()));
  const matches = a.filter((t) => setB.has(t.toLowerCase())).length;
  return matches / Math.max(a.length, b.length);
}

async function fetchEtsySearch(
  searchTerm: string,
  apiKeyHeader: string,
): Promise<EtsyListingRaw[] | "rate_limited"> {
  const url =
    `https://openapi.etsy.com/v3/application/listings/active` +
    `?keywords=${encodeURIComponent(searchTerm)}&limit=100&sort_on=score` +
    `&includes=Images,ShippingProfile`;

  const doFetch = () =>
    fetch(url, { headers: { "x-api-key": apiKeyHeader } });

  let res = await doFetch();
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await doFetch();
    if (res.status === 429) return "rate_limited";
  }
  if (!res.ok) throw new Error(`Etsy API ${res.status}`);
  const body = await res.json().catch(() => ({}));
  return (body.results ?? []) as EtsyListingRaw[];
}

function deriveSearchTerms(
  listings: Array<{ tags?: string[]; title?: string }>,
): string[] {
  const tagFreq = new Map<string, number>();
  const titles: string[] = [];

  for (const l of listings) {
    for (const t of (l.tags ?? []) as string[]) {
      const k = (t || "").trim().toLowerCase();
      if (k.length < 3) continue;
      tagFreq.set(k, (tagFreq.get(k) ?? 0) + 1);
    }
    if (l.title) titles.push(String(l.title));
  }

  const topTags = [...tagFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);

  const titleTerms = titles
    .slice(0, 5)
    .map((t) => t.trim().split(/\s+/).slice(0, 3).join(" ").toLowerCase())
    .filter((t) => t.length >= 3);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of [...topTags, ...titleTerms]) {
    if (!seen.has(term) && result.length < 12) {
      seen.add(term);
      result.push(term);
    }
  }
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Internal pipeline function: callers (nightly-action-scan, onboarding-pipeline)
  // pass the service-role bearer. It accepts an arbitrary user_id and spends
  // Etsy API quota, so it must never be anon-invocable.
  if (!isServiceOrCronCall(req)) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const startMs = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ETSY_API_KEY = Deno.env.get("ETSY_API_KEY");
    const ETSY_SHARED_SECRET = Deno.env.get("ETSY_SHARED_SECRET");

    if (!ETSY_API_KEY || !ETSY_SHARED_SECRET) {
      return json({ success: false, error: "Etsy API keys not configured" });
    }

    const apiKeyHeader = `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const { user_id, source = "manual" } = body;
    let searchTerms: string[] | null = body.search_terms ?? null;

    if (!user_id) {
      return json({ success: false, error: "user_id is required" });
    }

    // ── Derive search terms from listings if not provided ──────────────────
    if (!searchTerms || searchTerms.length === 0) {
      const { data: listings } = await supabase
        .from("listings")
        .select("tags, title")
        .eq("user_id", user_id)
        .eq("state", "active")
        .limit(500);

      searchTerms = deriveSearchTerms(listings ?? []);
    }

    if (searchTerms.length === 0) {
      return json({
        success: true,
        user_id,
        search_terms_scanned: 0,
        search_terms_failed: 0,
        failed_terms: [],
        snapshots_created: 0,
        alerts_created: 0,
        duration_ms: Date.now() - startMs,
        message: "No search terms found — add active listings with tags",
      });
    }

    let snapshotsCreated = 0;
    let alertsCreated = 0;
    const failedTerms: string[] = [];

    for (const searchTerm of searchTerms) {
      try {
        // Fetch previous snapshot BEFORE inserting new one (avoids timing ambiguity)
        const { data: prevRow } = await supabase
          .from("market_snapshots")
          .select("listings")
          .eq("user_id", user_id)
          .eq("search_term", searchTerm)
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // ── Fetch Etsy results ───────────────────────────────────────────
        const result = await fetchEtsySearch(searchTerm, apiKeyHeader);
        if (result === "rate_limited") {
          console.warn(`Rate limited on "${searchTerm}" — skipping`);
          failedTerms.push(searchTerm);
          continue;
        }

        const parsedListings: CompetitorListing[] = result.map((r, i) =>
          parseListing(r, i + 1)
        );

        // ── Insert market_snapshot ───────────────────────────────────────
        const { error: insertErr } = await supabase.from("market_snapshots").insert({
          user_id,
          search_term: searchTerm,
          result_count: parsedListings.length,
          listings: parsedListings,
          scan_source: source,
          captured_at: new Date().toISOString(),
        });
        if (insertErr) {
          console.error(`market_snapshots insert failed for "${searchTerm}"`, insertErr);
          failedTerms.push(searchTerm);
          continue;
        }
        snapshotsCreated += 1;

        // ── Change detection ─────────────────────────────────────────────
        if (!prevRow) continue;

        const prevListings = (prevRow.listings ?? []) as CompetitorListing[];
        const prevMap = new Map(prevListings.map((l) => [l.etsy_listing_id, l]));
        const prevIds = new Set(prevListings.map((l) => l.etsy_listing_id));
        const nowIso = new Date().toISOString();
        const alerts: Array<Record<string, unknown>> = [];

        // Compare top-10 listings present in both snapshots
        for (const curr of parsedListings.slice(0, 10)) {
          const prev = prevMap.get(curr.etsy_listing_id);
          if (!prev) continue;

          // Price changed > 10%
          if (prev.price > 0 && Math.abs(curr.price - prev.price) / prev.price > 0.1) {
            alerts.push({
              user_id,
              search_term: searchTerm,
              competitor_listing_id: curr.etsy_listing_id,
              competitor_title: curr.title,
              change_type: "price_change",
              before_value: { price: prev.price },
              after_value: { price: curr.price },
              rank_before: prev.rank_position,
              rank_after: curr.rank_position,
              detected_at: nowIso,
              severity: curr.rank_position <= 3 ? "critical" : "warning",
            });
          }

          // Tags < 50% overlap
          if (tagOverlapRatio(prev.tags, curr.tags) < 0.5) {
            alerts.push({
              user_id,
              search_term: searchTerm,
              competitor_listing_id: curr.etsy_listing_id,
              competitor_title: curr.title,
              change_type: "tags_updated",
              before_value: { tags: prev.tags },
              after_value: { tags: curr.tags },
              rank_before: prev.rank_position,
              rank_after: curr.rank_position,
              detected_at: nowIso,
              severity: "warning",
            });
          }

          // Title changed
          if (prev.title !== curr.title && curr.title.length > 0) {
            alerts.push({
              user_id,
              search_term: searchTerm,
              competitor_listing_id: curr.etsy_listing_id,
              competitor_title: curr.title,
              change_type: "title_updated",
              before_value: { title: prev.title },
              after_value: { title: curr.title },
              rank_before: prev.rank_position,
              rank_after: curr.rank_position,
              detected_at: nowIso,
              severity: "info",
            });
          }

          // Rank shifted 5+ positions
          const rankDelta = Math.abs(curr.rank_position - prev.rank_position);
          if (rankDelta >= 5) {
            alerts.push({
              user_id,
              search_term: searchTerm,
              competitor_listing_id: curr.etsy_listing_id,
              competitor_title: curr.title,
              change_type: "rank_change",
              before_value: { rank: prev.rank_position },
              after_value: { rank: curr.rank_position },
              rank_before: prev.rank_position,
              rank_after: curr.rank_position,
              detected_at: nowIso,
              // rose in rank (lower number = better) = warning
              severity: curr.rank_position < prev.rank_position ? "warning" : "info",
            });
          }
        }

        // New competitors: only the current top-20 matter — comparing all 100
        // results produced dozens of noise alerts per term on churny searches.
        for (const curr of parsedListings.slice(0, 20)) {
          if (!prevIds.has(curr.etsy_listing_id)) {
            alerts.push({
              user_id,
              search_term: searchTerm,
              competitor_listing_id: curr.etsy_listing_id,
              competitor_title: curr.title,
              change_type: "new_competitor",
              before_value: null,
              after_value: { rank: curr.rank_position },
              rank_before: null,
              rank_after: curr.rank_position,
              detected_at: nowIso,
              severity: curr.rank_position <= 5 ? "critical" : "info",
            });
          }
        }

        if (alerts.length > 0) {
          const { error: alertErr } = await supabase
            .from("competitor_alerts")
            .insert(alerts);
          if (alertErr) {
            console.error(`competitor_alerts insert failed for "${searchTerm}"`, alertErr);
          } else {
            alertsCreated += alerts.length;
          }
        }
      } catch (e) {
        console.error(`scan failed for "${searchTerm}"`, e);
        failedTerms.push(searchTerm);
      }
    }

    // Retention (cost + ToS storage-minimization): each snapshot is a ~100-
    // listing JSON blob, up to 12/night/user — unbounded growth was the
    // pipeline's biggest cost exposure. Change detection only ever reads the
    // single most recent snapshot per term, so 30 days is generous.
    try {
      const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
      await supabase
        .from("market_snapshots")
        .delete()
        .eq("user_id", user_id)
        .lt("captured_at", cutoff);
    } catch (e) {
      console.warn("market_snapshots retention prune failed", e);
    }

    return json({
      success: true,
      user_id,
      search_terms_scanned: searchTerms.length - failedTerms.length,
      search_terms_failed: failedTerms.length,
      failed_terms: failedTerms,
      snapshots_created: snapshotsCreated,
      alerts_created: alertsCreated,
      duration_ms: Date.now() - startMs,
    });
  } catch (err) {
    console.error("competitor-market-scan top-level error", err);
    return json({
      success: false,
      error: String(err),
      user_id: "",
      search_terms_scanned: 0,
      search_terms_failed: 0,
      failed_terms: [],
      snapshots_created: 0,
      alerts_created: 0,
      duration_ms: Date.now() - startMs,
    });
  }
});
