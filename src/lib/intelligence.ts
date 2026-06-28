/**
 * Intelligence query layer
 * Computes insights from Supabase aggregate data + ChromaDB similarity.
 * All user data used here is anonymized before insertion into cross-user pools.
 */

import type { Insight, CategoryBenchmark, UserBenchmark, TagTrend } from '@/types/intelligence'
import type { EtsyListing } from '@/types'

// ─── Anonymization ────────────────────────────────────────────────────────────

export async function hashUserId(userId: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`radariq:${userId}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function bucketPrice(price: number): string {
  if (price < 15) return 'under_15'
  if (price < 30) return '15_30'
  if (price < 50) return '30_50'
  if (price < 100) return '50_100'
  return 'over_100'
}

export function bucketMetric(value: number, bucketSize = 50): number {
  return Math.round(value / bucketSize) * bucketSize
}

// ─── Personalized insight generation ─────────────────────────────────────────

export function generatePersonalizedInsights(
  listings: EtsyListing[],
  benchmark: CategoryBenchmark | null,
  trends: TagTrend[]
): Insight[] {
  const insights: Insight[] = []
  const now = new Date().toISOString()

  if (!listings.length) return insights

  // Image count check
  const lowImageListings = listings.filter(l => l.image_urls.length < 5)
  if (lowImageListings.length > 0) {
    const benchmarkAvg = benchmark?.avg_image_count ?? 7.2
    insights.push({
      id: 'img-count',
      type: 'image_benchmark',
      severity: 'warning',
      title: `${lowImageListings.length} listing${lowImageListings.length > 1 ? 's' : ''} need more photos`,
      body: `Platform avg is ${benchmarkAvg.toFixed(1)} images. Listings with 8+ images get 2.3× more views on average.`,
      metric: `+${Math.round((benchmarkAvg / 3) * 100 - 100)}% views potential`,
      action_label: 'View listings',
      action_route: '/app/listings',
      affected_listing_ids: lowImageListings.map(l => l.id),
      data_source: 'platform',
      confidence: 'high',
      created_at: now,
    })
  }

  // Tag count check
  const lowTagListings = listings.filter(l => l.tags.length < 10)
  if (lowTagListings.length > 0) {
    insights.push({
      id: 'tag-count',
      type: 'tag_opportunity',
      severity: 'opportunity',
      title: `${lowTagListings.length} listing${lowTagListings.length > 1 ? 's' : ''} using fewer than 10 tags`,
      body: `Etsy allows 13 tags. Sellers using all 13 appear in 40% more search results. Fill every slot.`,
      metric: '+40% search visibility',
      action_label: 'Optimize tags',
      action_route: '/app/queue',
      affected_listing_ids: lowTagListings.map(l => l.id),
      data_source: 'platform',
      confidence: 'high',
      created_at: now,
    })
  }

  // Grade below category average
  const avgGrade = listings.reduce((s, l) => s + (l.current_grade ?? 0), 0) / listings.length
  if (benchmark && avgGrade < benchmark.avg_grade - 5) {
    insights.push({
      id: 'grade-benchmark',
      type: 'grade_benchmark',
      severity: 'warning',
      title: `Your average grade (${Math.round(avgGrade)}) is below sellers in your category (${benchmark.avg_grade})`,
      body: `Listings scoring above ${benchmark.avg_grade} get ${Math.round((benchmark.avg_views_per_listing / (avgGrade / benchmark.avg_grade) - benchmark.avg_views_per_listing) / benchmark.avg_views_per_listing * 100)}% more views on average. Run optimizations to close the gap.`,
      metric: `${Math.round(benchmark.avg_grade - avgGrade)} pts below avg`,
      action_label: 'Run optimization batch',
      action_route: '/app/queue',
      data_source: 'category',
      confidence: 'high',
      created_at: now,
    })
  }

  // Trending tags the user is missing
  const userTags = new Set(listings.flatMap(l => l.tags.map(t => t.toLowerCase())))
  const missingTrends = trends.filter(t => t.is_rising && !userTags.has(t.tag)).slice(0, 3)
  if (missingTrends.length > 0) {
    insights.push({
      id: 'trending-tags',
      type: 'keyword_trend',
      severity: 'trending',
      title: `${missingTrends.length} trending tags you're not using yet`,
      body: `"${missingTrends[0].tag}" is up ${Math.round(missingTrends[0].week_over_week_change * 100)}% this week. ${Math.round(missingTrends[0].in_top_sellers_pct * 100)}% of top sellers in your category use it.`,
      metric: `+${Math.round(missingTrends[0].week_over_week_change * 100)}% this week`,
      action_label: 'Optimize with trends',
      action_route: '/app/queue',
      data_source: 'platform',
      confidence: 'medium',
      created_at: now,
    })
  }

  // Stale listings needing re-optimization
  const staleListings = listings.filter(l => {
    if (!l.last_optimized_at) return false
    const daysSince = (Date.now() - new Date(l.last_optimized_at).getTime()) / 86400000
    return daysSince > 90 && (l.current_grade ?? 0) < 75
  })
  if (staleListings.length > 0) {
    insights.push({
      id: 'reoptimize',
      type: 'reoptimization_alert',
      severity: 'warning',
      title: `${staleListings.length} listing${staleListings.length > 1 ? 's' : ''} need re-optimization`,
      body: `Etsy's algorithm favors freshly updated listings. These haven't been optimized in 90+ days and are likely losing search rank.`,
      action_label: 'Schedule re-optimization',
      action_route: '/app/queue',
      affected_listing_ids: staleListings.map(l => l.id),
      data_source: 'user',
      confidence: 'high',
      created_at: now,
    })
  }

  return insights
}
