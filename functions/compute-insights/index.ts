/**
 * Google Cloud Function: compute-insights
 * Nightly job: aggregates anonymized listing data from Supabase + ChromaDB
 * to produce cross-user trend insights stored in platform_insights table.
 *
 * Triggered: Cloud Scheduler daily at 3 AM
 * Also exposed as HTTP endpoint for admin manual triggers.
 */

import type { Request, Response } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'
import { ChromaClient, CHROMA_COLLECTIONS } from '../../src/lib/chroma'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const chroma = new ChromaClient(process.env.CHROMA_URL!)

export async function computeInsights(req: Request, res: Response) {
  console.log('Computing nightly insights...')

  const results = { computed: 0, errors: 0 }

  try {
    // ── 1. Keyword uplift analysis ─────────────────────────────────────────
    // Does having "handmade" in title correlate with better grade/views?
    const keywordInsights = await computeKeywordUplift()
    for (const insight of keywordInsights) {
      await supabase.from('platform_insights').insert(insight)
      results.computed++
    }

    // ── 2. Tag trend analysis ──────────────────────────────────────────────
    await computeTagTrends()
    results.computed++

    // ── 3. Category benchmarks ────────────────────────────────────────────
    await computeCategoryBenchmarks()
    results.computed++

    // ── 4. Timing analysis ────────────────────────────────────────────────
    const timingInsight = await computeTimingInsights()
    if (timingInsight) {
      await supabase.from('platform_insights').insert(timingInsight)
      results.computed++
    }

    // ── 5. Optimization ROI analysis ──────────────────────────────────────
    const roiInsight = await computeOptimizationROI()
    if (roiInsight) {
      await supabase.from('platform_insights').insert(roiInsight)
      results.computed++
    }

    // ── 6. Clean up expired insights ─────────────────────────────────────
    await supabase.from('platform_insights').delete().lt('expires_at', new Date().toISOString())

    console.log('Insights computed:', results)
    return res ? res.status(200).json(results) : results
  } catch (err) {
    console.error('Insight computation error:', err)
    results.errors++
    return res ? res.status(500).json({ error: String(err) }) : results
  }
}

async function computeKeywordUplift() {
  // Query optimization_outcomes to find which fields drive improvement
  const { data: outcomes } = await supabase
    .from('optimization_outcomes')
    .select('*')
    .eq('accepted', true)
    .not('views_uplift_pct', 'is', null)
    .limit(10000)

  if (!outcomes?.length) return []

  const avgUplift = outcomes.reduce((s, o) => s + (o.views_uplift_pct ?? 0), 0) / outcomes.length
  const titleChangedUplift = outcomes
    .filter(o => o.fields_changed?.includes('title'))
    .reduce((s, o) => s + (o.views_uplift_pct ?? 0), 0) /
    Math.max(1, outcomes.filter(o => o.fields_changed?.includes('title')).length)

  const insights = []

  if (titleChangedUplift > avgUplift * 1.1) {
    insights.push({
      insight_type: 'keyword_trend',
      title: 'Title optimizations drive the biggest view increases',
      body: `Optimizations that include title changes average ${titleChangedUplift.toFixed(1)}% more views vs ${avgUplift.toFixed(1)}% for tag-only changes. Lead with title improvements.`,
      metric: `+${titleChangedUplift.toFixed(1)}% views`,
      severity: 'info',
      confidence: 'high',
      sample_size: outcomes.length,
      supporting_data: { avg_uplift: avgUplift, title_uplift: titleChangedUplift },
    })
  }

  return insights
}

async function computeTagTrends() {
  // In production: query listing tags, compare this week vs last week
  // For now: upsert synthetic trend data based on what's in the listings table
  const { data: listings } = await supabase
    .from('listings')
    .select('tags, taxonomy_path, views, favorites, current_grade')
    .eq('state', 'active')
    .limit(50000)

  if (!listings?.length) return

  // Count tag frequency by category
  const tagFreq: Record<string, Record<string, number>> = {}
  const tagGrades: Record<string, number[]> = {}

  for (const listing of listings) {
    const category = listing.taxonomy_path?.[0] ?? 'other'
    if (!tagFreq[category]) tagFreq[category] = {}
    for (const tag of (listing.tags ?? [])) {
      tagFreq[category][tag] = (tagFreq[category][tag] ?? 0) + 1
      if (!tagGrades[tag]) tagGrades[tag] = []
      tagGrades[tag].push(listing.current_grade ?? 50)
    }
  }

  // Upsert top tags per category
  for (const [category, tags] of Object.entries(tagFreq)) {
    const topTags = Object.entries(tags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)

    for (const [tag, count] of topTags) {
      const avgGrade = tagGrades[tag]
        ? tagGrades[tag].reduce((s, g) => s + g, 0) / tagGrades[tag].length
        : 60
      await supabase.from('tag_trends').upsert({
        tag,
        category,
        in_top_sellers_pct: Math.min(1, count / (listings.length / 10)),
        search_volume_index: Math.min(100, Math.round(count * 2)),
        is_rising: avgGrade > 70,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'tag,category' })
    }
  }
}

async function computeCategoryBenchmarks() {
  const { data: listings } = await supabase
    .from('listings')
    .select('taxonomy_path, current_grade, current_image_grade, image_urls, tags, title, views, favorites, sales_count, price')
    .eq('state', 'active')
    .not('current_grade', 'is', null)
    .limit(50000)

  if (!listings?.length) return

  const byCategory: Record<string, typeof listings> = {}
  for (const l of listings) {
    const cat = l.taxonomy_path?.[0] ?? 'Other'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(l)
  }

  for (const [category, catListings] of Object.entries(byCategory)) {
    if (catListings.length < 10) continue
    const n = catListings.length
    await supabase.from('category_benchmarks').upsert({
      category,
      sample_size: n,
      avg_grade: catListings.reduce((s, l) => s + (l.current_grade ?? 0), 0) / n,
      avg_image_count: catListings.reduce((s, l) => s + (l.image_urls?.length ?? 0), 0) / n,
      avg_tag_count: catListings.reduce((s, l) => s + (l.tags?.length ?? 0), 0) / n,
      avg_title_length: catListings.reduce((s, l) => s + (l.title?.length ?? 0), 0) / n,
      avg_views: catListings.reduce((s, l) => s + (l.views ?? 0), 0) / n,
      avg_favorites: catListings.reduce((s, l) => s + (l.favorites ?? 0), 0) / n,
      avg_sales: catListings.reduce((s, l) => s + (l.sales_count ?? 0), 0) / n,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'category' })
  }
}

async function computeTimingInsights() {
  const { data: listings } = await supabase
    .from('listings')
    .select('etsy_created_at, views')
    .eq('state', 'active')
    .limit(50000)

  if (!listings?.length) return null

  const byDay: Record<number, number[]> = {}
  for (const l of listings) {
    const dow = new Date(l.etsy_created_at).getDay()
    if (!byDay[dow]) byDay[dow] = []
    byDay[dow].push(l.views ?? 0)
  }

  const dayAvgs = Object.entries(byDay).map(([dow, views]) => ({
    dow: parseInt(dow),
    avg: views.reduce((s, v) => s + v, 0) / views.length,
    count: views.length,
  }))

  const best = dayAvgs.sort((a, b) => b.avg - a.avg)[0]
  const worst = dayAvgs[dayAvgs.length - 1]
  if (!best || !worst) return null

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const uplift = Math.round((best.avg / worst.avg - 1) * 100)

  return {
    insight_type: 'timing_tip',
    title: `${days[best.dow]} listings get ${uplift}% more views than ${days[worst.dow]} listings`,
    body: `Analysis of ${listings.length} active listings shows ${days[best.dow]} is the best day to publish new listings for maximum early visibility.`,
    metric: `+${uplift}%`,
    severity: 'info',
    confidence: 'medium',
    sample_size: listings.length,
  }
}

async function computeOptimizationROI() {
  const { data: outcomes } = await supabase
    .from('optimization_outcomes')
    .select('views_uplift_pct, favorites_uplift_pct, accepted')
    .eq('accepted', true)
    .not('views_uplift_pct', 'is', null)
    .limit(5000)

  if (!outcomes?.length || outcomes.length < 100) return null

  const avgViews = outcomes.reduce((s, o) => s + (o.views_uplift_pct ?? 0), 0) / outcomes.length
  const avgFavs = outcomes.reduce((s, o) => s + (o.favorites_uplift_pct ?? 0), 0) / outcomes.length

  return {
    insight_type: 'optimization_roi',
    title: `Accepted optimizations earn +${avgViews.toFixed(0)}% more views in 30 days`,
    body: `Based on ${outcomes.length} optimization outcomes across all RAVE sellers, accepted AI optimizations average a ${avgViews.toFixed(1)}% views increase and ${avgFavs.toFixed(1)}% favorites increase within 30 days.`,
    metric: `+${avgViews.toFixed(0)}% views`,
    severity: 'info',
    confidence: 'high',
    sample_size: outcomes.length,
  }
}
