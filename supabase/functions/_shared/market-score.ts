/**
 * Market score calculation and photo change detection.
 *
 * Scoring compares a user's listing against the competitor dataset
 * pulled from market_insight_cache / competitor_snapshots.
 *
 * All functions are pure computation — no external calls.
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { EtsyListing } from "./etsy-quota.ts";

export interface MarketInsights {
  competitor_count: number;
  avg_title_length: number;
  avg_tag_count: number;
  avg_photo_count: number;
  avg_price: number;
  avg_favorers: number;
  top_tags: string[];         // tags appearing in ≥30% of top competitor listings
  top_tags_with_freq: Array<{ tag: string; pct: number }>; // same set, with frequency % across competitors
  missing_tags_threshold: number; // min frequency to qualify as a "missing tag"
}

export interface ListingMarketScore {
  // null = no competitor data available yet (don't show 0/100, show "no data" state)
  market_score: number | null;
  title_score: number | null;
  tag_score: number | null;
  price_score: number | null;
  photo_score: number | null;
  favorites_score: number | null;
  description_score: number | null;
  market_rank_estimate: number | null;
  missing_tags: string[];
  missing_tags_detail: Array<{ tag: string; pct: number }>;
  missing_tag_count: number | null;
  niche_avg_price: number | null;
  insights: MarketInsights;
}



export interface UserListing {
  etsy_listing_id: string;
  title: string;
  tags: string[];
  price: number;
  photo_count: number;
  image_urls: string[];
  favorites: number;
  description: string;
}

/** Builds MarketInsights from a set of competitor listings. */
export function buildMarketInsights(competitors: EtsyListing[]): MarketInsights {
  if (competitors.length === 0) {
    return {
      competitor_count: 0,
      avg_title_length: 80,
      avg_tag_count: 10,
      avg_photo_count: 7,
      avg_price: 0,
      avg_favorers: 0,
      top_tags: [],
      top_tags_with_freq: [],
      missing_tags_threshold: 0.3,
    };
  }

  const n = competitors.length;
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

  const tagFreq = new Map<string, number>();
  for (const c of competitors) {
    for (const tag of c.tags ?? []) {
      tagFreq.set(tag.toLowerCase(), (tagFreq.get(tag.toLowerCase()) ?? 0) + 1);
    }
  }

  const threshold = 0.3;
  const ranked = [...tagFreq.entries()]
    .filter(([, count]) => count / n >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  const top_tags = ranked.map(([tag]) => tag);
  const top_tags_with_freq = ranked.map(([tag, count]) => ({
    tag,
    pct: Math.round((count / n) * 100),
  }));

  // Only consider competitors that reported a positive price
  const pricedCompetitors = competitors
    .map((c) => (c.price ? c.price.amount / (c.price.divisor || 100) : 0))
    .filter((p) => p > 0);
  const avgPrice = pricedCompetitors.length
    ? Number((pricedCompetitors.reduce((s, v) => s + v, 0) / pricedCompetitors.length).toFixed(2))
    : 0;

  return {
    competitor_count: n,
    avg_title_length: Math.round(avg(competitors.map((c) => (c.title ?? "").length))),
    avg_tag_count: Math.round(avg(competitors.map((c) => (c.tags ?? []).length))),
    avg_photo_count: Math.round(avg(competitors.map((c) => (c.images ?? []).length))),
    avg_price: avgPrice,
    avg_favorers: Math.round(avg(competitors.map((c) => c.num_favorers ?? 0))),
    top_tags,
    top_tags_with_freq,
    missing_tags_threshold: threshold,
  };

}

/** Clamp a value to [0, 100]. */
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** Score a single listing against market insights. */
export function scoreListingVsMarket(
  listing: UserListing,
  insights: MarketInsights,
): ListingMarketScore {
  if (insights.competitor_count === 0) {
    // No competitor data yet — return nulls so the UI can show a
    // "couldn't load market data" state instead of a misleading 0/100.
    return {
      market_score: null, title_score: null, tag_score: null, price_score: null,
      photo_score: null, favorites_score: null, description_score: null,
      market_rank_estimate: null, missing_tags: [], missing_tags_detail: [],
      missing_tag_count: null, niche_avg_price: null, insights,
    };
  }


  // Title score: length vs niche average. Optimal = ≥ avg.
  const titleLen = (listing.title ?? "").length;
  const titleScore = clamp(
    titleLen >= insights.avg_title_length
      ? 100
      : (titleLen / insights.avg_title_length) * 100,
  );

  // Tag score: user tags vs competitor top_tags (gap analysis)
  const userTagsLower = new Set((listing.tags ?? []).map((t) => t.toLowerCase()));
  const missingTags = insights.top_tags.filter((t) => !userTagsLower.has(t));
  const freqMap = new Map(
    (insights.top_tags_with_freq ?? []).map((t) => [t.tag, t.pct]),
  );
  const missingTagsDetail = missingTags
    .map((tag) => ({ tag, pct: freqMap.get(tag) ?? 0 }))
    .sort((a, b) => b.pct - a.pct);
  const userTagCount = listing.tags?.length ?? 0;
  // Score = % of top competitor tags present + partial credit for tag slot usage
  const topTagsCoverage =
    insights.top_tags.length > 0
      ? (insights.top_tags.filter((t) => userTagsLower.has(t)).length / insights.top_tags.length) * 70
      : 50;
  const tagSlotScore = (userTagCount / 13) * 30;
  const tagScore = clamp(topTagsCoverage + tagSlotScore);

  // Price score: within ±20% of average = 100. Further out = lower.
  // If we have no niche average or no listing price, return null so the UI
  // can show "Niche avg unavailable" instead of a misleading 0, and the
  // composite score rebalances around the dimensions we *do* have.
  let priceScore: number | null = null;
  const haveAvgPrice = insights.avg_price > 0;
  if (haveAvgPrice && listing.price > 0) {
    const ratio = listing.price / insights.avg_price;
    if (ratio >= 0.8 && ratio <= 1.2) priceScore = 100;
    else if (ratio < 0.8) priceScore = clamp(100 - (0.8 - ratio) * 200);
    else priceScore = clamp(100 - (ratio - 1.2) * 150);
  }

  // Photo score: vs avg competitor photo count
  const photoCount = listing.photo_count ?? listing.image_urls?.length ?? 0;
  const photoScore =
    insights.avg_photo_count > 0
      ? clamp((photoCount / insights.avg_photo_count) * 100)
      : (photoCount >= 5 ? 80 : photoCount * 16);

  // Favorites score: log scale vs avg (new listings shouldn't be heavily penalised)
  const favs = listing.favorites ?? 0;
  const avgFavs = insights.avg_favorers;
  let favoritesScore = 50;
  if (avgFavs > 0) {
    const logRatio = Math.log1p(favs) / Math.log1p(avgFavs);
    favoritesScore = clamp(logRatio * 100);
  }

  // Description score: simple length heuristic
  const descLen = (listing.description ?? "").length;
  const descScore = clamp(
    descLen >= 500 ? 100 : descLen >= 200 ? 75 : descLen >= 100 ? 50 : 25,
  );

  // Composite market score (weighted). When price_score is null we drop the
  // price dimension entirely and re-normalize the remaining weights so a
  // missing data point doesn't drag the score down.
  const parts: Array<{ score: number; weight: number }> = [
    { score: titleScore, weight: 0.25 },
    { score: tagScore, weight: 0.30 },
    { score: photoScore, weight: 0.15 },
    { score: favoritesScore, weight: 0.10 },
    { score: descScore, weight: 0.05 },
  ];
  if (priceScore !== null) parts.push({ score: priceScore, weight: 0.15 });
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const market_score = clamp(
    parts.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight,
  );

  // Rough rank estimate: position in a 1-25 simulated search result
  const market_rank_estimate = Math.max(1, Math.round(25 * (1 - market_score / 100)) + 1);

  return {
    market_score,
    title_score: titleScore,
    tag_score: tagScore,
    price_score: priceScore,
    photo_score: photoScore,
    favorites_score: favoritesScore,
    description_score: descScore,
    market_rank_estimate,
    missing_tags: missingTags.slice(0, 12),
    missing_tags_detail: missingTagsDetail.slice(0, 12),
    missing_tag_count: missingTags.length,
    niche_avg_price: haveAvgPrice ? insights.avg_price : null,
    insights,
  };
}


export interface PhotoSnapshot {
  photo_count: number;
  image_urls: string[];
  primary_image_url: string;
}

export interface PhotoChanges {
  photos_added: boolean;
  photos_removed: boolean;
  count_delta: number;
  primary_photo_changed: boolean;
  any_photo_replaced: boolean;
}

/** Detects photo changes between two snapshots. */
export function detectPhotoChanges(before: PhotoSnapshot, after: PhotoSnapshot): PhotoChanges {
  return {
    photos_added: after.photo_count > before.photo_count,
    photos_removed: after.photo_count < before.photo_count,
    count_delta: after.photo_count - before.photo_count,
    primary_photo_changed: after.primary_image_url !== before.primary_image_url,
    any_photo_replaced:
      after.photo_count === before.photo_count &&
      JSON.stringify(after.image_urls) !== JSON.stringify(before.image_urls),
  };
}

/**
 * Fetches or refreshes the market insight cache for a keyword cluster.
 * Returns competitor listings (from cache if fresh, or by searching Etsy).
 */
export async function getOrRefreshCache(
  supabase: SupabaseClient,
  keywordCluster: string,
  userId: string,
  fetchFromEtsy: () => Promise<EtsyListing[]>,
): Promise<{ listings: EtsyListing[]; from_cache: boolean }> {
  const { data: cached } = await supabase
    .from("market_insight_cache")
    .select("insights, competitor_listings, expires_at")
    .eq("keyword_cluster", keywordCluster)
    .maybeSingle();

  if (cached && new Date(cached.expires_at) > new Date()) {
    return {
      listings: (cached.competitor_listings as EtsyListing[]) ?? [],
      from_cache: true,
    };
  }

  // Cache miss — fetch from Etsy and store
  const listings = await fetchFromEtsy();
  if (listings.length === 0) {
    return { listings: [], from_cache: false };
  }

  const insights = buildMarketInsights(listings);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await supabase.from("market_insight_cache").upsert({
    keyword_cluster: keywordCluster,
    insights,
    competitor_listings: listings,
    source: "etsy_api",
    expires_at: expiresAt,
  });

  // Also store individual snapshots for history/analysis
  const today = new Date().toISOString().split("T")[0];
  const snapshots = listings.map((l, idx) => ({
    user_id: userId,
    keyword_cluster: keywordCluster,
    etsy_listing_id: String(l.listing_id),
    shop_id: String(l.shop_id ?? ""),
    title: l.title,
    tags: l.tags ?? [],
    price: l.price ? l.price.amount / (l.price.divisor || 100) : null,
    num_favorers: l.num_favorers ?? 0,
    photo_count: (l.images ?? []).length,
    image_urls: (l.images ?? []).map((i) => i.url_570xN ?? "").filter(Boolean),
    description_length: (l.description ?? "").length,
    rank_position: idx + 1,
    source: "etsy_api",
  }));

  // Upsert via the expression index (keyword_cluster, etsy_listing_id, date)
  // Since we can't directly reference the expression index for ON CONFLICT,
  // we use a soft-insert approach: insert + ignore conflicts.
  for (const snap of snapshots) {
    const { error } = await supabase.from("competitor_snapshots").upsert(snap);
    if (error) {
      console.warn(`[market-score] competitor snapshot skipped: ${error.message}`);
    }
  }

  return { listings, from_cache: false };
}
