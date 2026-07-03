import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface SubScoreSummary {
  avg: number
  failing_count: number  // listings where this sub-score < 50
}

export interface CompetitorBenchmarks {
  avg_title_length: number
  avg_tag_count: number
  avg_photo_count: number
  avg_price: number
  top_tags: string[]
  competitor_count: number
}

export interface ActionPlanItem {
  rank: number
  dimension: 'tags' | 'title' | 'price' | 'photos'
  title: string
  detail: string
  listing_count: number
  sub_score: number
  route: string
  /** Listing IDs whose sub-score for this dimension is failing — used to filter
   * the Listings page when the user clicks "Fix" so they only see the affected rows. */
  failing_listing_ids: string[]
}

export interface ShopMarketOverview {
  avg_market_score: number
  scored_listings: number
  top_missing_tags: string[]
  primary_niche: string | null
  niche_source: string | null
  last_scored_at: string | null
  keyword_cluster: string | null
  // Sub-score breakdown
  tag_score: SubScoreSummary
  title_score: SubScoreSummary
  price_score: SubScoreSummary
  photo_score: SubScoreSummary
  // Competitor benchmarks (if available)
  benchmarks: CompetitorBenchmarks | null
  // Ordered action plan
  action_plan: ActionPlanItem[]
  // User averages for benchmark comparison
  user_avg_tags: number
  user_avg_title_length: number
  user_avg_photos: number
}

function buildActionPlan(
  scores: Record<string, SubScoreSummary>,
  benchmarks: CompetitorBenchmarks | null,
  userAvg: { tags: number; title: number; photos: number },
  top_missing_tags: string[],
  failingIds: { tags: string[]; title: string[]; price: string[]; photos: string[] },
): ActionPlanItem[] {
  const items: ActionPlanItem[] = []

  // Tags
  if (scores.tag_score.avg < 70) {
    const gapTags = benchmarks ? Math.round(benchmarks.avg_tag_count - userAvg.tags) : 0
    items.push({
      rank: 0,
      dimension: 'tags',
      title: `Add the ${top_missing_tags.length > 0 ? top_missing_tags.length + ' competitor' : 'missing'} tags your buyers are searching for`,
      detail: gapTags > 0
        ? `Your listings run about ${userAvg.tags} tags each, while similar shops use around ${benchmarks!.avg_tag_count} — every extra tag is another search you can show up in.`
        : `${scores.tag_score.failing_count} listings could reach more searches with a fuller tag set.`,
      listing_count: scores.tag_score.failing_count,
      sub_score: scores.tag_score.avg,
      route: '/app/listings',
      failing_listing_ids: failingIds.tags,
    })
  }

  // Title
  if (scores.title_score.avg < 70) {
    const gapChars = benchmarks ? Math.round(benchmarks.avg_title_length - userAvg.title) : 0
    items.push({
      rank: 1,
      dimension: 'title',
      title: `Lengthen titles to match what's winning in your niche`,
      detail: gapChars > 0
        ? `Your titles run about ${userAvg.title} characters — shops winning your searches use closer to ${benchmarks!.avg_title_length}, packing in the words buyers actually type.`
        : `${scores.title_score.failing_count} listings have room to grow into longer, keyword-rich titles.`,
      listing_count: scores.title_score.failing_count,
      sub_score: scores.title_score.avg,
      route: '/app/listings',
      failing_listing_ids: failingIds.title,
    })
  }

  // Photos
  if (scores.photo_score.avg < 70) {
    const gapPhotos = benchmarks ? Math.round(benchmarks.avg_photo_count - userAvg.photos) : 0
    items.push({
      rank: 2,
      dimension: 'photos',
      title: `Add more photos to compete visually`,
      detail: gapPhotos > 0
        ? `Your listings average ${userAvg.photos} photos. Top competitors average ${benchmarks!.avg_photo_count}. More photos signal quality to Etsy's algorithm.`
        : `${scores.photo_score.failing_count} listings are below the niche photo average.`,
      listing_count: scores.photo_score.failing_count,
      sub_score: scores.photo_score.avg,
      route: '/app/listings',
      failing_listing_ids: failingIds.photos,
    })
  }

  // Price
  if (scores.price_score.avg < 50) {
    items.push({
      rank: 3,
      dimension: 'price',
      title: `Review your pricing against the niche`,
      detail: benchmarks?.avg_price
        ? `Niche average is $${benchmarks.avg_price.toFixed(2)}. Listings priced far above average show lower click-through rates. This doesn't mean lower your prices — it means knowing where you sit.`
        : `${scores.price_score.failing_count} listings are priced significantly outside the niche cluster.`,
      listing_count: scores.price_score.failing_count,
      sub_score: scores.price_score.avg,
      route: '/app/listings',
      failing_listing_ids: failingIds.price,
    })
  }

  // Sort by sub_score ascending (worst first)
  return items.sort((a, b) => a.sub_score - b.sub_score).slice(0, 4)
}

export function useShopMarketOverview() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['shop_market_overview', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ShopMarketOverview | null> => {
      if (!user?.id) return null

      // Fetch all sub-scores for this user (most recent per listing)
      const { data: scores } = await db
        .from('listing_market_scores')
        .select('listing_id, market_score, title_score, tag_score, price_score, photo_score, missing_tags, scored_at, keyword_cluster, image_urls')
        .eq('user_id', user.id)
        .order('scored_at', { ascending: false })
        .limit(200)

      const rows = (scores ?? []) as Array<{
        listing_id: string
        market_score: number | null
        title_score: number | null
        tag_score: number | null
        price_score: number | null
        photo_score: number | null
        missing_tags: string[] | null
        scored_at: string
        keyword_cluster: string | null
        image_urls: string[] | null
      }>

      if (rows.length === 0) return null

      const n = rows.length
      const avg = (key: keyof typeof rows[0]) =>
        Math.round(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) / n)
      const failCount = (key: keyof typeof rows[0], threshold = 50) =>
        rows.filter(r => (Number(r[key]) || 0) < threshold).length

      const avg_market_score = avg('market_score')
      const keyword_cluster = rows[0]?.keyword_cluster ?? null

      // Sub-scores
      const tagScore: SubScoreSummary    = { avg: avg('tag_score'),   failing_count: failCount('tag_score') }
      const titleScore: SubScoreSummary  = { avg: avg('title_score'), failing_count: failCount('title_score') }
      const priceScore: SubScoreSummary  = { avg: avg('price_score'), failing_count: failCount('price_score', 40) }
      const photoScore: SubScoreSummary  = { avg: avg('photo_score'), failing_count: failCount('photo_score') }

      // Top missing tags across all listings
      const tagFreq = new Map<string, number>()
      for (const r of rows) {
        for (const tag of r.missing_tags ?? []) {
          tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1)
        }
      }
      const top_missing_tags = [...tagFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([tag]) => tag)

      // Niche profile
      const { data: niche } = await db
        .from('user_niche_profiles')
        .select('primary_niche, niche_source, keyword_clusters')
        .eq('user_id', user.id)
        .maybeSingle()

      // Competitor benchmarks from cache
      let benchmarks: CompetitorBenchmarks | null = null
      const clusterToCheck = keyword_cluster ?? niche?.keyword_clusters?.[0] ?? null
      if (clusterToCheck) {
        const { data: cache } = await db
          .from('market_insight_cache')
          .select('insights')
          .eq('keyword_cluster', clusterToCheck)
          .maybeSingle()

        if (cache?.insights) {
          const ins = cache.insights as Record<string, unknown>
          benchmarks = {
            avg_title_length: Number(ins.avg_title_length ?? 0),
            avg_tag_count:    Number(ins.avg_tag_count ?? 0),
            avg_photo_count:  Number(ins.avg_photo_count ?? 0),
            avg_price:        Number(ins.avg_price ?? 0),
            top_tags:         (ins.top_tags as string[] | null) ?? [],
            competitor_count: Number(ins.competitor_count ?? 0),
          }
        }
      }

      // User averages for benchmark comparison (computed client-side from listing scores)
      // We approximate tag count from tag_score: score = (tags/13)*100 roughly
      const userAvgTags   = Math.round((tagScore.avg / 100) * 13)
      const userAvgPhotos = Math.round((photoScore.avg / 100) * (benchmarks?.avg_photo_count ?? 10))
      // Title length approximation from score (score ~ title_len / avg_competitor_len * 100)
      const userAvgTitle  = benchmarks
        ? Math.round((titleScore.avg / 100) * benchmarks.avg_title_length)
        : 0

      // Collect failing listing IDs per dimension, deduped (most-recent row per listing).
      // Used by the "Fix" buttons on the Action Plan to deep-link Listings with a filter.
      const seenForDim = { tags: new Set<string>(), title: new Set<string>(), price: new Set<string>(), photos: new Set<string>() }
      const failingIds = { tags: [] as string[], title: [] as string[], price: [] as string[], photos: [] as string[] }
      const pushIf = (dim: keyof typeof failingIds, id: string, score: number | null, threshold: number) => {
        if (!id || seenForDim[dim].has(id)) return
        seenForDim[dim].add(id)
        if ((Number(score) || 0) < threshold) failingIds[dim].push(id)
      }
      for (const r of rows) {
        pushIf('tags', r.listing_id, r.tag_score, 50)
        pushIf('title', r.listing_id, r.title_score, 50)
        pushIf('price', r.listing_id, r.price_score, 40)
        pushIf('photos', r.listing_id, r.photo_score, 50)
      }

      const action_plan = buildActionPlan(
        { tag_score: tagScore, title_score: titleScore, price_score: priceScore, photo_score: photoScore },
        benchmarks,
        { tags: userAvgTags, title: userAvgTitle, photos: userAvgPhotos },
        top_missing_tags,
        failingIds,
      )

      return {
        avg_market_score,
        scored_listings: n,
        top_missing_tags,
        primary_niche: niche?.primary_niche ?? null,
        niche_source:  niche?.niche_source ?? null,
        last_scored_at: rows[0]?.scored_at ?? null,
        keyword_cluster,
        tag_score:   tagScore,
        title_score: titleScore,
        price_score: priceScore,
        photo_score: photoScore,
        benchmarks,
        action_plan,
        user_avg_tags:         userAvgTags,
        user_avg_title_length: userAvgTitle,
        user_avg_photos:       userAvgPhotos,
      }
    },
  })
}

/** Invalidate all market-related queries — call after a pipeline run completes. */
export function useInvalidateMarket() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return () => {
    qc.invalidateQueries({ queryKey: ['shop_market_overview', user?.id] })
    qc.invalidateQueries({ queryKey: ['market_score'] })
    qc.invalidateQueries({ queryKey: ['pipeline_status', user?.id] })
    qc.invalidateQueries({ queryKey: ['niche_profile', user?.id] })
  }
}
