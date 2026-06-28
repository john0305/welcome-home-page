// Pure detection helpers — no project type imports to avoid coupling.

/**
 * Etsy seller archetype detected from active listings. Used downstream to
 * adapt scoring (freshness penalty, photo thresholds) and dashboard surfaces
 * (top-performer card vs. top-categories) so e.g. a digital-printable shop
 * isn't penalized for 2-year-old listings or sub-10 mockups.
 */
export type ShopType =
  | 'one_of_a_kind'   // vintage / OOAK: qty 1, item gone when sold
  | 'inventory'       // restockable physical goods, qty > 1
  | 'made_to_order'   // handmade with artificially high qty (e.g. 999)
  | 'digital'         // digital downloads / printables
  | 'supplies'        // craft supplies & tools
  | 'personalized'    // custom / monogrammed / personalized goods

// Tag/title tokens treated as strong digital signals.
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
}

function ratio(matches: number, total: number) {
  return total === 0 ? 0 : matches / total
}

function hasToken(text: string, tokens: string[]): boolean {
  const t = text.toLowerCase()
  return tokens.some(tok => t.includes(tok))
}

/**
 * Heuristic detection. Order matters: digital > supplies > personalized >
 * made_to_order > inventory > one_of_a_kind. We require ≥40% of active
 * listings to match a niche signal before declaring the whole shop that
 * type, so a single tagged listing can't flip the classification.
 */
export function detectShopType(listings: AnyListing[]): ShopType {
  const active = listings.filter(l => l.state === 'active')
  if (active.length === 0) return 'one_of_a_kind'

  let digital = 0, supplies = 0, personalized = 0, madeToOrder = 0, inventory = 0
  for (const l of active) {
    const tagsBlob = (l.tags ?? []).join(' ')
    const titleBlob = l.title ?? ''
    const blob = `${titleBlob} ${tagsBlob}`
    const tax = (l.taxonomy_path ?? []).join(' ').toLowerCase()

    const isDigital = l.is_digital === true || hasToken(blob, DIGITAL_TOKENS)
    const isSupplies = tax.includes('craft supplies') || hasToken(blob, SUPPLIES_TOKENS)
    const isPersonalized = hasToken(titleBlob, PERSONALIZED_TOKENS)
    const qty = l.quantity ?? 0
    const sold = l.sales_count ?? 0
    // Artificially high qty + meaningful sales = made-to-order, not inventory.
    const isMadeToOrder = qty >= 100 && sold > qty * 0.1
    const isInventory = qty > 1 && !isMadeToOrder

    if (isDigital) digital++
    if (isSupplies) supplies++
    if (isPersonalized) personalized++
    if (isMadeToOrder) madeToOrder++
    if (isInventory) inventory++
  }

  const n = active.length
  if (ratio(digital, n) >= 0.4) return 'digital'
  if (ratio(supplies, n) >= 0.4) return 'supplies'
  if (ratio(personalized, n) >= 0.4) return 'personalized'
  if (ratio(madeToOrder, n) >= 0.3) return 'made_to_order'
  if (inventory > 0) return 'inventory'
  return 'one_of_a_kind'
}

/** True for shop types where "old listing" isn't a quality problem. */
export function isEvergreenShopType(t: ShopType): boolean {
  return t === 'digital' || t === 'supplies'
}
