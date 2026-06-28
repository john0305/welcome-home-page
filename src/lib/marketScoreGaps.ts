/**
 * Reconciles market score sub-scores with the fix_lifecycle queue.
 *
 * Rule: if a sub-score is below its threshold, the listing MUST have a
 * corresponding open fix item (or, for price, an advisory). This file
 * defines the thresholds, builds synthetic gap items the queue can show
 * even before a real lifecycle row exists, and exposes helpers used by
 * the listing detail UI.
 */
import type { MarketScoreRow } from '@/hooks/useMarketScore'
import type { FixField, FixLifecycleRow } from '@/lib/fixLifecycle'

export type GapStatus = 'open-fix' | 'fixed' | 'user-action' | 'advisory' | 'info'

export const FIELD_THRESHOLDS: Record<'title' | 'tags' | 'photos' | 'price', number> = {
  title: 70,
  tags: 70,
  photos: 60,
  price: 50,
}

export interface SyntheticGap {
  /** Stable id so React keys don't collide with real DB rows */
  id: string
  field: FixField
  score: number | null
  issue_description: string
  suggested_fix: string
  /** Photos and price get special treatment in the queue */
  kind: 'standard' | 'user-action' | 'advisory'
}

export interface GapIndicators {
  /** What badge to show on each market-score sub-card */
  title: GapStatus
  tags: GapStatus
  photos: GapStatus
  price: GapStatus
  favorites: GapStatus
}

/** True if user already dismissed price ("My price is intentional"). */
export function isPriceOverridden(rows: FixLifecycleRow[]): boolean {
  return rows.some(r => r.field === 'price' && r.dismissed && r.source === 'market_score')
}

export function computeGaps(args: {
  score: MarketScoreRow | null | undefined
  listingPrice: number | null | undefined
  photoCount: number | null | undefined
  lifecycleRows: FixLifecycleRow[]
}): { gaps: SyntheticGap[]; indicators: GapIndicators; openCount: number; priceAdvisory: SyntheticGap | null } {
  const { score, listingPrice, photoCount, lifecycleRows } = args
  const gaps: SyntheticGap[] = []
  let priceAdvisory: SyntheticGap | null = null

  const indicators: GapIndicators = {
    title: 'info', tags: 'info', photos: 'info', price: 'info', favorites: 'info',
  }

  if (!score) return { gaps, indicators, openCount: 0, priceAdvisory: null }

  const byField = new Map<FixField, FixLifecycleRow>()
  for (const r of lifecycleRows) byField.set(r.field, r)

  const titleScore = score.title_score ?? 100
  if (titleScore < FIELD_THRESHOLDS.title) {
    const existing = byField.get('title')
    if (!existing || existing.status === 'open' || existing.status === 'reopened') {
      gaps.push({
        id: existing?.id ?? `gap:title`,
        field: 'title',
        score: titleScore,
        issue_description: `Title scoring ${titleScore}/100 — lengthen and add high-traffic keywords from your niche`,
        suggested_fix: 'Use Optimize → Title to rewrite with niche-leading keyword patterns.',
        kind: 'standard',
      })
      indicators.title = 'open-fix'
    } else {
      indicators.title = 'fixed'
    }
  } else if (byField.get('title')) {
    indicators.title = 'fixed'
  }

  const tagScore = score.tag_score ?? 100
  if (tagScore < FIELD_THRESHOLDS.tags) {
    const existing = byField.get('tags')
    const missing = score.missing_tag_count ?? 0
    if (!existing || existing.status === 'open' || existing.status === 'reopened') {
      gaps.push({
        id: existing?.id ?? `gap:tags`,
        field: 'tags',
        score: tagScore,
        issue_description: missing > 0
          ? `${missing} high-traffic competitor tags missing (tag score ${tagScore}/100)`
          : `Tag score ${tagScore}/100 — coverage trails top competitors`,
        suggested_fix: 'Use Optimize → Tags to add the missing high-traffic tags automatically.',
        kind: 'standard',
      })
      indicators.tags = 'open-fix'
    } else {
      indicators.tags = 'fixed'
    }
  } else if (byField.get('tags')) {
    indicators.tags = 'fixed'
  }

  const photoScore = score.photo_score ?? 100
  if (photoScore < FIELD_THRESHOLDS.photos) {
    const existing = byField.get('photos')
    if (!existing || existing.status === 'open' || existing.status === 'reopened') {
      const used = photoCount ?? 0
      gaps.push({
        id: existing?.id ?? `gap:photos`,
        field: 'photos',
        score: photoScore,
        issue_description: `Only ${used} of 10 photo slots used — competitors have more imagery`,
        suggested_fix: 'Add more photos in Etsy — aim for at least 7. Focus on detail shots, scale reference, and lifestyle context.',
        kind: 'user-action',
      })
      indicators.photos = 'user-action'
    } else {
      indicators.photos = 'fixed'
    }
  } else if (byField.get('photos')) {
    indicators.photos = 'fixed'
  }

  const overridden = isPriceOverridden(lifecycleRows)
  const priceScore = score.price_score ?? 100
  if (priceScore < FIELD_THRESHOLDS.price && !overridden && score.niche_avg_price != null) {
    const avg = Math.round(score.niche_avg_price)
    const you = listingPrice != null ? Math.round(listingPrice) : null
    priceAdvisory = {
      id: 'gap:price',
      field: 'price',
      score: priceScore,
      issue_description: you != null
        ? `Your price is significantly off niche average ($${avg} avg · you're at $${you}) — this may affect your score.`
        : `Your price is significantly off niche average ($${avg} avg) — this may affect your score.`,
      suggested_fix: 'Adjust if your pricing strategy allows.',
      kind: 'advisory',
    }
    indicators.price = 'advisory'
  } else if (overridden) {
    indicators.price = 'info'
  }

  indicators.favorites = 'info'

  return { gaps, indicators, openCount: gaps.length + (priceAdvisory ? 1 : 0), priceAdvisory }
}

/** Decide whether the "No open issues" green state has been earned. */
export function isHealthy(args: {
  score: MarketScoreRow | null | undefined
  openLifecycleCount: number
  openGapCount: number
}): boolean {
  const { score, openLifecycleCount, openGapCount } = args
  if (openLifecycleCount > 0 || openGapCount > 0) return false
  if (!score) return true
  const market = score.market_score ?? 0
  if (market >= 65) return true
  // Sub-scores all above thresholds?
  const sub = (k: keyof MarketScoreRow, t: number) => (score[k] as number | null ?? 100) >= t
  return sub('title_score', 70) && sub('tag_score', 70) && sub('photo_score', 60) && sub('price_score', 50)
}
