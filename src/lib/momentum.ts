/**
 * Momentum — short-term shop activity indicator.
 *
 * Compares the trailing 3-day average of (views + favorites deltas) to the
 * trailing 7-day average, then maps the ratio to a 0–100 gauge position via a
 * bounded log2 curve so the needle scales smoothly with magnitude instead of
 * pegging at the extremes.
 *
 * Purely visualization — does NOT feed into the Store Health Score.
 */
import type { ShopSnapshotPoint } from '@/contexts/AppContext'

export type MomentumTier = 'quiet' | 'steady' | 'rising' | 'hot'

export interface MomentumResult {
  tier: MomentumTier
  /** 0–100 normalized gauge position */
  score: number
  threeDayAvg: number
  sevenDayAvg: number
  /** ratio of 3-day avg to 7-day avg, clamped for display */
  ratio: number
  /** true when absolute activity is too low for the ratio to be meaningful */
  lowVolume: boolean
  /** last 7 days of (views delta) per recorded_on, oldest→newest */
  viewsSeries: { date: string; value: number }[]
  /** last 7 days of (favorites delta) per recorded_on, oldest→newest */
  favsSeries: { date: string; value: number }[]
  /** true when fewer than 3 days of history exist */
  insufficient: boolean
}

const NEUTRAL: Omit<MomentumResult, 'viewsSeries' | 'favsSeries'> = {
  tier: 'steady',
  score: 50,
  threeDayAvg: 0,
  sevenDayAvg: 0,
  ratio: 1,
  lowVolume: false,
  insufficient: true,
}

/** Map a ratio (3d avg / 7d avg) to a 0–100 gauge position using log2. */
function ratioToPosition(ratio: number): number {
  if (!isFinite(ratio) || ratio <= 0) return 50
  const pos = 50 + Math.log2(ratio) * 25
  return Math.max(0, Math.min(100, pos))
}

function tierForPosition(pos: number): MomentumTier {
  if (pos >= 70) return 'hot'
  if (pos >= 55) return 'rising'
  if (pos >= 45) return 'steady'
  return 'quiet'
}

export function computeMomentum(history: ShopSnapshotPoint[]): MomentumResult {
  if (!history || history.length < 2) {
    return { ...NEUTRAL, viewsSeries: [], favsSeries: [] }
  }

  // Build per-day deltas from valid shop counters only. Etsy occasionally
  // returns zero/older counters during sync; treating those as real days pegs
  // the gauge hard left/right. Normalize gaps so skipped days don't create a
  // fake one-day surge when the next good snapshot arrives.
  const validHistory = history.filter(s => s.total_views > 0 && s.total_favorites > 0)
  if (validHistory.length < 2) {
    return { ...NEUTRAL, viewsSeries: [], favsSeries: [], insufficient: true }
  }

  const deltas: { date: string; views: number; favs: number; combined: number }[] = []
  for (let i = 1; i < validHistory.length; i++) {
    const prev = validHistory[i - 1]
    const cur = validHistory[i]
    const dayGap = Math.max(
      1,
      Math.round((new Date(cur.recorded_on).getTime() - new Date(prev.recorded_on).getTime()) / 86_400_000),
    )
    const v = Math.max(0, cur.total_views - prev.total_views) / dayGap
    const f = Math.max(0, cur.total_favorites - prev.total_favorites) / dayGap
    deltas.push({ date: cur.recorded_on, views: v, favs: f, combined: v + f })
  }

  const viewsSeries = deltas.slice(-7).map(d => ({ date: d.date, value: d.views }))
  const favsSeries = deltas.slice(-7).map(d => ({ date: d.date, value: d.favs }))

  if (deltas.length < 3) {
    return { ...NEUTRAL, viewsSeries, favsSeries, insufficient: true }
  }

  const last3 = deltas.slice(-3)
  const last7 = deltas.slice(-7)
  const avg = (arr: { combined: number }[]) => arr.reduce((s, d) => s + d.combined, 0) / arr.length

  const threeDayAvg = avg(last3)
  const sevenDayAvg = avg(last7)

  const ratio = sevenDayAvg > 0
    ? threeDayAvg / sevenDayAvg
    : (threeDayAvg > 0 ? 2 : 1)

  let score = Math.round(ratioToPosition(ratio))

  // Low-volume guardrail: small absolute numbers make ratios noisy. Cap the
  // gauge so a "2 → 4 favorites" jump can't look like a major surge.
  const lowVolume = sevenDayAvg < 10
  if (lowVolume && score > 60) score = 60

  const tier = tierForPosition(score)

  return {
    tier,
    score,
    threeDayAvg,
    sevenDayAvg,
    ratio,
    lowVolume,
    viewsSeries,
    favsSeries,
    insufficient: false,
  }
}

export function momentumColor(tier: MomentumTier): string {
  switch (tier) {
    case 'hot': return '#f97316'
    case 'rising': return '#00D4C8'
    case 'steady': return '#94a3b8'
    case 'quiet': return '#475569'
  }
}

export function momentumLabel(tier: MomentumTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

/** Descriptive text based on gauge position (0–100), with low-volume suffix. */
export function momentumContextForScore(score: number, lowVolume = false): string {
  let base: string
  if (score >= 70) base = 'Views and favorites trending up vs. last week'
  else if (score >= 55) base = 'Activity picking up vs. last week'
  else if (score >= 45) base = 'Activity steady vs. last week'
  else if (score >= 30) base = 'Activity slightly below last week'
  else base = 'Activity slower than last week'
  return lowVolume ? `${base} — low activity volume, trend may be noisy` : base
}

/** Back-compat helper kept for any callers still passing a tier. */
export function momentumContext(tier: MomentumTier): string {
  switch (tier) {
    case 'hot': return 'Views and favorites trending up vs. last week'
    case 'rising': return 'Activity picking up vs. last week'
    case 'steady': return 'Activity steady vs. last week'
    case 'quiet': return 'Activity slower than last week'
  }
}

/** CSS animation-duration for the radar sweep — scales continuously with score. */
export function momentumSweepDuration(scoreOrTier: number | MomentumTier): string {
  let score: number
  if (typeof scoreOrTier === 'number') {
    score = scoreOrTier
  } else {
    // legacy: derive a representative score from tier
    score = scoreOrTier === 'hot' ? 85 : scoreOrTier === 'rising' ? 62 : scoreOrTier === 'steady' ? 50 : 20
  }
  const secs = 6 - (Math.max(0, Math.min(100, score)) / 100) * 4.5
  return `${secs.toFixed(2)}s`
}
