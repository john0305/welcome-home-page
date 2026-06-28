import type { DashboardListingRow } from '@/types'
import type { MediaBreakdown } from '@/contexts/AppContext'
import { isEvergreenShopType, type ShopType } from '@/lib/shopType'

export interface HealthSubScores {
  content: number   // 0-100 — avg listing grade quality
  media: number     // 0-100 — photo + video coverage
  tags: number      // 0-100 — avg tag utilization vs max 13
  freshness: number // 0-100 — penalty for old average listing age
}

export interface StoreHealthScore {
  overall: number
  /** Same as overall but kept to 1 decimal place so sub-point movement is visible in the UI. */
  overallExact: number
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  subScores: HealthSubScores
  totalListings: number
  gradedListings: number
  /** When true the freshness sub-score was excluded from the overall (digital / supplies). */
  freshnessExempt: boolean
}

/**
 * Journey-style label so the qualitative band feels like a stage in progress
 * rather than a report-card pass/fail.
 */
export function healthJourneyLabel(overall: number): string {
  if (overall >= 86) return 'Excellent'
  if (overall >= 71) return 'Strong'
  if (overall >= 56) return 'Making Progress'
  if (overall >= 41) return 'Building Momentum'
  return 'Getting Started'
}

export function computeStoreHealthScore(
  rows: DashboardListingRow[],
  media: MediaBreakdown,
  totalListingCount: number,
  shopType?: ShopType,
): StoreHealthScore {
  const active = rows.filter(l => l.state === 'active')
  const n = active.length

  if (n === 0) {
    return {
      overall: 0, overallExact: 0, grade: 'F',
      subScores: { content: 0, media: 0, tags: 0, freshness: 0 },
      totalListings: 0, gradedListings: 0, freshnessExempt: false,
    }
  }

  // Content Quality: avg grade weighted down when few listings graded
  const graded = active.filter(l => l.current_grade != null)
  const avgGrade = graded.length > 0
    ? graded.reduce((s, l) => s + l.current_grade!, 0) / graded.length
    : 0
  const gradedRatio = graded.length / n
  const content = Math.round(avgGrade * (0.7 + 0.3 * gradedRatio))

  // Media Coverage: 10-photo listings (60%) + video-enabled listings (40%)
  const total = Math.max(totalListingCount, 1)
  const mediaSc = Math.round(
    (media.fullPhotos / total) * 60 +
    (media.hasVideo / total) * 40
  )

  // Tag Health: avg tags per active listing vs Etsy max of 13
  const avgTags = active.reduce((s, l) => s + (l.tags?.length ?? 0), 0) / n
  const tags = Math.round((avgTags / 13) * 100)

  // Freshness: avg listing age — 0 days = 100, 1460 days (4 years) = 0.
  // Digital downloads and craft supplies are evergreen — a 2-year-old
  // printable planner is still perfectly valid — so we exclude freshness
  // from those shops and redistribute its 20% weight evenly across the
  // other three sub-scores.
  const now = Date.now()
  const avgAgeDays =
    active.reduce((s, l) => s + (now - new Date(l.etsy_created_at).getTime()) / 86400000, 0) / n
  const freshness = Math.round(Math.max(0, 100 - (avgAgeDays / 1460) * 100))

  const exempt = shopType ? isEvergreenShopType(shopType) : false
  // Weights: default 35/25/20/20 → evergreen 42/30/28/0.
  const w = exempt
    ? { content: 0.42, media: 0.30, tags: 0.28, freshness: 0 }
    : { content: 0.35, media: 0.25, tags: 0.20, freshness: 0.20 }

  const rawOverall = content * w.content + mediaSc * w.media + tags * w.tags + freshness * w.freshness

  // ── Recent-activity momentum ────────────────────────────────────────────
  // Goal: small, recent improvements (a re-grade, an optimization apply, a
  // tags fix) should visibly nudge the score, so users feel each action did
  // *something*. But this cannot inflate authority — it's strictly bounded
  // and decays day by day.
  //
  //   • Each listing updated in the last 7 days contributes a tiny bonus,
  //     scaled by how recently it was touched (full weight today → 0 at 7d).
  //   • Total momentum is hard-capped at +2.5 pts, so the structural score
  //     still governs the long-term position. A "43" never becomes a "60"
  //     just because the user clicked around.
  const nowMs = Date.now()
  let momentumRaw = 0
  for (const l of active) {
    if (!l.updated_at) continue
    const ageDays = (nowMs - new Date(l.updated_at).getTime()) / 86400000
    if (ageDays < 0 || ageDays > 7) continue
    const recency = 1 - ageDays / 7         // 1 today → 0 at 7d
    momentumRaw += 0.35 * recency
  }
  const momentum = Math.min(2.5, momentumRaw)

  const boosted = rawOverall + momentum
  const overallExact = Math.min(100, Math.round(boosted * 10) / 10)
  const overall = Math.min(100, Math.round(boosted))

  const grade: StoreHealthScore['grade'] =
    overall >= 90 ? 'A+' :
    overall >= 80 ? 'A' :
    overall >= 70 ? 'B' :
    overall >= 60 ? 'C' :
    overall >= 50 ? 'D' : 'F'

  return {
    overall, overallExact, grade,
    subScores: { content, media: mediaSc, tags, freshness },
    totalListings: n, gradedListings: graded.length, freshnessExempt: exempt,
  }
}

export function subScoreColor(score: number): string {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#00D4C8'
  if (score >= 40) return '#f59e0b'
  return '#f97316' // warm amber, never pure red
}

export function healthGradeColor(grade: StoreHealthScore['grade']): string {
  if (grade === 'A+' || grade === 'A') return '#10b981'
  if (grade === 'B') return '#00D4C8'
  if (grade === 'C') return '#f59e0b'
  if (grade === 'D') return '#f97316'
  return '#fb923c' // warm amber for F — avoid punishing red
}
