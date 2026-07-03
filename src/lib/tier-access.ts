import { supabase } from '@/integrations/supabase/client'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export type Tier = 'free' | 'starter' | 'pro'

export type Feature =
  | 'listings_1' | 'listings_5' | 'listings_all'
  | 'market_score_basic'
  | 'market_score_breakdown'
  | 'tag_gap_count_only'
  | 'tag_gap_top3'
  | 'tag_gap_full'
  | 'competitor_count_only'
  | 'competitor_basic'
  | 'competitor_full'
  | 'score_history_7d'
  | 'score_history_30d'
  | 'score_history_unlimited'
  | 'price_positioning_basic'
  | 'price_positioning_full'
  | 'niche_health'
  | 'shop_suppression_analysis'
  | 'market_rank_estimate'
  | 'action_attribution'
  | 'competitor_alerts'
  | 'market_informed_optimization'
  | 'guided_fix_tags'
  | 'guided_fix_title'
  | 'guided_fix_description'
  | 'guided_fix_price'
  | 'echo_memory'
  | 'data_integrations'

export const TIER_ACCESS: Record<Tier, Feature[]> = {
  free: [
    'listings_1',
    'market_score_basic',
    'tag_gap_count_only',
    'competitor_count_only',
    'score_history_7d',
    'guided_fix_tags',
  ],
  starter: [
    'listings_5',
    'market_score_basic',
    'tag_gap_top3',
    'competitor_basic',
    'score_history_30d',
    'price_positioning_basic',
    'guided_fix_tags',
  ],
  pro: [
    'listings_all',
    'market_score_basic',
    'market_score_breakdown',
    'tag_gap_full',
    'competitor_full',
    'score_history_unlimited',
    'price_positioning_basic',
    'price_positioning_full',
    'niche_health',
    'shop_suppression_analysis',
    'market_rank_estimate',
    'action_attribution',
    'competitor_alerts',
    'market_informed_optimization',
    'guided_fix_tags',
    'guided_fix_title',
    'guided_fix_description',
    'echo_memory',
    // Third-party data sources (GA4 etc.) — the "more integrations" step-up
    // named in the tier strategy; core Etsy insights stay free.
    'data_integrations',
  ],
}

/** Cache for feature flags (in-memory per session, ~5min TTL). */
const flagCache = new Map<string, { value: boolean; ts: number }>()
const FLAG_CACHE_TTL = 5 * 60 * 1000

async function getFeatureFlag(flagKey: string): Promise<{ enabled: boolean; paused: boolean } | null> {
  const cached = flagCache.get(flagKey)
  if (cached && Date.now() - cached.ts < FLAG_CACHE_TTL) {
    return { enabled: cached.value, paused: false }
  }
  const { data } = await db
    .from('feature_flags')
    .select('enabled, paused')
    .eq('flag_key', flagKey)
    .maybeSingle()
  if (!data) return null
  flagCache.set(flagKey, { value: (data as { enabled: boolean }).enabled, ts: Date.now() })
  return data as { enabled: boolean; paused: boolean }
}

/** Normalise tier strings that may come from DB (e.g. 'enterprise' → 'pro'). */
function normaliseTier(tier: string | null | undefined): Tier {
  if (tier === 'pro' || tier === 'enterprise') return 'pro'
  if (tier === 'starter') return 'starter'
  return 'free'
}

/**
 * Check whether a user on the given tier can use a feature.
 * Respects both tier access list AND feature flag state.
 * Returns false if the flag is disabled or paused, regardless of tier.
 */
export async function canUse(tier: string | null | undefined, feature: Feature): Promise<boolean> {
  const t = normaliseTier(tier)
  const tierAllows = TIER_ACCESS[t]?.includes(feature) ?? false
  if (!tierAllows) return false
  // Map Feature to flag_key (same name where applicable)
  const flagKey = feature as string
  const flag = await getFeatureFlag(flagKey)
  if (!flag) return true // no flag row = not gated
  if (flag.paused || !flag.enabled) return false
  return true
}

/** Synchronous version — uses tier only, no feature flag check. Use in render paths. */
export function canUseTierOnly(tier: string | null | undefined, feature: Feature): boolean {
  return TIER_ACCESS[normaliseTier(tier)]?.includes(feature) ?? false
}

export interface UpgradePrompt {
  headline: string
  cta: string
}

export function getUpgradePrompt(feature: Feature): UpgradePrompt {
  const prompts: Partial<Record<Feature, UpgradePrompt>> = {
    tag_gap_full: {
      headline: "See all the tags your competitors use that you don't",
      cta: 'Unlock Tag Gap Analysis',
    },
    tag_gap_top3: {
      headline: 'See the top 3 tags your competitors use that you\'re missing',
      cta: 'Upgrade to Starter',
    },
    competitor_full: {
      headline: "See exactly who's beating you and what they're doing right",
      cta: 'Unlock Competitor Intelligence',
    },
    competitor_basic: {
      headline: 'See average competitor pricing in your niche',
      cta: 'Upgrade to Starter',
    },
    score_history_unlimited: {
      headline: 'Track your progress over 90+ days',
      cta: 'Unlock Full Score History',
    },
    score_history_30d: {
      headline: 'Track your progress over 30 days',
      cta: 'Upgrade to Starter',
    },
    market_informed_optimization: {
      headline: "Optimize against what's actually winning in your market right now",
      cta: 'Unlock Market Optimization',
    },
    market_score_breakdown: {
      headline: 'See your score broken down by title, tags, price, and photos',
      cta: 'Unlock Score Breakdown',
    },
    niche_health: {
      headline: "See how competitive your niche is and where it's trending",
      cta: 'Unlock Niche Intelligence',
    },
    shop_suppression_analysis: {
      headline: "Find out if Etsy is suppressing your listings — and why",
      cta: 'Unlock Suppression Analysis',
    },
    market_rank_estimate: {
      headline: 'See your estimated search rank vs competitors',
      cta: 'Unlock Market Rank',
    },
    guided_fix_title: {
      headline: 'Let RadarIQ write you a market-optimized title and apply it directly',
      cta: 'Unlock Title Updates',
    },
    guided_fix_description: {
      headline: 'Let RadarIQ rewrite your description to close the gap with top performers',
      cta: 'Unlock Description Updates',
    },
    echo_memory: {
      headline: 'Echo remembers your shop across sessions for smarter advice',
      cta: 'Unlock Echo Memory',
    },
  }
  return prompts[feature] ?? { headline: 'Unlock this feature', cta: 'Upgrade to Pro' }
}

/** How many listings a tier can access. */
export function getListingLimit(tier: string | null | undefined): number | null {
  const t = normaliseTier(tier)
  if (TIER_ACCESS[t].includes('listings_all')) return null // unlimited
  if (TIER_ACCESS[t].includes('listings_5')) return 5
  return 1
}

/** Score history window in days (null = unlimited). */
export function getScoreHistoryDays(tier: string | null | undefined): number | null {
  const t = normaliseTier(tier)
  if (TIER_ACCESS[t].includes('score_history_unlimited')) return null
  if (TIER_ACCESS[t].includes('score_history_30d')) return 30
  return 7
}
