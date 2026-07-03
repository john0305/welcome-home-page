// Pure detection helpers — no project type imports to avoid coupling.
// Server-side mirror: supabase/functions/_shared/shop-type.ts (keep in sync).

/**
 * Etsy seller archetype detected from active listings. Used downstream to
 * adapt scoring (freshness penalty, photo thresholds), branch recommendations
 * (photo advice for a digital shop is about previews, not lighting), and
 * dashboard surfaces.
 *
 * Detection prefers Etsy's own classification fields (listing_type, when_made,
 * who_made, is_supply — captured by sync since 2026-07) and falls back to
 * token heuristics for rows synced before those columns existed.
 */
export type ShopType =
  | 'one_of_a_kind'   // OOAK: qty 1, item gone when sold
  | 'vintage'         // vintage/resale (when_made = vintage year ranges)
  | 'inventory'       // restockable physical goods, qty > 1
  | 'made_to_order'   // produced after purchase (incl. print-on-demand)
  | 'digital'         // digital downloads / printables
  | 'supplies'        // craft supplies & tools
  | 'personalized'    // custom / monogrammed / personalized goods

/** Per-listing classification — recommendations branch on this, not only the shop type. */
export type ListingKind = 'digital' | 'made_to_order' | 'vintage' | 'supplies' | 'personalized' | 'one_of_a_kind' | 'inventory'

// Tag/title tokens treated as strong digital signals (legacy fallback).
const DIGITAL_TOKENS = [
  'digital download', 'printable', 'instant download', 'svg', 'pdf download',
  'png file', 'cricut', 'silhouette', 'sublimation', 'clipart',
]
const SUPPLIES_TOKENS = [
  'craft supply', 'craft supplies', 'beads', 'jewelry findings', 'fabric by the yard',
  'yarn', 'cabochon', 'destash', 'wholesale', 'bulk', 'lot of',
]
const PERSONALIZED_TOKENS = [
  'personalized', 'personalised', 'custom', 'customized', 'monogram',
  'made to order', 'made-to-order', 'your name', 'your photo',
]

type AnyListing = {
  state?: string
  quantity?: number | null
  is_digital?: boolean
  tags?: string[] | null
  title?: string | null
  sales_count?: number | null
  taxonomy_path?: string[] | null
  // Etsy classification fields (present on rows synced after 2026-07)
  listing_type?: string | null      // 'physical' | 'download' | 'both'
  when_made?: string | null         // 'made_to_order' | '2020_2025' | 'before_2006' | ...
  who_made?: string | null          // 'i_did' | 'someone_else' | 'collective'
  is_supply?: boolean | null
  is_personalizable?: boolean | null
}

function ratio(matches: number, total: number) {
  return total === 0 ? 0 : matches / total
}

function hasToken(text: string, tokens: string[]): boolean {
  const t = text.toLowerCase()
  return tokens.some(tok => t.includes(tok))
}

/** Etsy when_made values before 2006 (plus explicit ranges) are vintage per Etsy's own rules. */
function isVintageWhenMade(whenMade: string | null | undefined): boolean {
  if (!whenMade) return false
  if (whenMade === 'made_to_order') return false
  // Formats: 'before_2006', '2000_2005', '1990s', '1980s', ..., 'before_1700'
  const m = whenMade.match(/^(\d{4})/)
  if (m) return Number(m[1]) < 2006
  const decade = whenMade.match(/^(\d{4})s$/)
  if (decade) return Number(decade[1]) < 2006
  return whenMade.startsWith('before_')
}

/** Classify a single listing. Deterministic fields first, token fallback second. */
export function classifyListing(l: AnyListing): ListingKind {
  const blob = `${l.title ?? ''} ${(l.tags ?? []).join(' ')}`
  const tax = (l.taxonomy_path ?? []).join(' ').toLowerCase()

  // Deterministic (Etsy's own fields)
  if (l.listing_type === 'download' || l.is_digital === true) return 'digital'
  if (l.is_supply === true) return 'supplies'
  if (isVintageWhenMade(l.when_made)) return 'vintage'
  if (l.when_made === 'made_to_order') {
    return l.is_personalizable === true ? 'personalized' : 'made_to_order'
  }

  // Token/heuristic fallback for legacy rows
  if (hasToken(blob, DIGITAL_TOKENS)) return 'digital'
  if (tax.includes('craft supplies') || hasToken(blob, SUPPLIES_TOKENS)) return 'supplies'
  if (hasToken(l.title ?? '', PERSONALIZED_TOKENS)) return 'personalized'
  const qty = l.quantity ?? 0
  const sold = l.sales_count ?? 0
  if (qty >= 100 && sold > qty * 0.1) return 'made_to_order'
  if (qty > 1) return 'inventory'
  return 'one_of_a_kind'
}

export interface ShopTypeProfile {
  type: ShopType
  /** Share of active listings matching the winning type (0–1). */
  confidence: number
  /** Count of active listings per ListingKind. */
  breakdown: Record<ListingKind, number>
  totalActive: number
}

/**
 * Full shop-type profile with confidence + breakdown, for persistence and the
 * confirm/correct UI. Majority kind wins; personalized folds into
 * made_to_order for the shop-level label unless it is itself the majority.
 */
export function deriveShopTypeProfile(listings: AnyListing[]): ShopTypeProfile {
  const active = listings.filter(l => l.state === 'active')
  const breakdown: Record<ListingKind, number> = {
    digital: 0, made_to_order: 0, vintage: 0, supplies: 0,
    personalized: 0, one_of_a_kind: 0, inventory: 0,
  }
  for (const l of active) breakdown[classifyListing(l)]++

  const n = active.length
  if (n === 0) return { type: 'one_of_a_kind', confidence: 0, breakdown, totalActive: 0 }

  const entries = Object.entries(breakdown) as [ListingKind, number][]
  entries.sort((a, b) => b[1] - a[1])
  const [topKind, topCount] = entries[0]
  return { type: topKind as ShopType, confidence: ratio(topCount, n), breakdown, totalActive: n }
}

/**
 * Heuristic single-label detection (legacy signature kept for existing
 * callers: Dashboard, Intelligence, ScoreRoadmap, PersistentStoreHeader,
 * useScoreChangeWatcher, AnalyticsTopPerformers).
 */
export function detectShopType(listings: AnyListing[]): ShopType {
  return deriveShopTypeProfile(listings).type
}

/** True for shop types where "old listing" isn't a quality problem. */
export function isEvergreenShopType(t: ShopType): boolean {
  return t === 'digital' || t === 'supplies'
}

/** Seller-facing labels for the confirm/correct UI. */
export const SHOP_TYPE_LABELS: Record<ShopType, string> = {
  one_of_a_kind: 'One-of-a-kind pieces',
  vintage: 'Vintage & pre-loved finds',
  inventory: 'Handmade in batches',
  made_to_order: 'Made to order',
  digital: 'Digital downloads',
  supplies: 'Craft supplies & materials',
  personalized: 'Personalized & custom orders',
}
