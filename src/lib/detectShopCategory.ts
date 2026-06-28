/**
 * Lightweight shop category detector. Bins a shop into one of a handful of
 * categories so we can tailor personalization question copy and AI prompts
 * to what the seller actually sells (shirts vs. jewelry vs. art prints, etc.).
 *
 * Pure function — no DB calls, no React. Caller passes whatever slice of
 * listings it has handy (title + tags is enough).
 */

export type ShopCategory =
  | 'apparel'
  | 'jewelry'
  | 'home_decor'
  | 'art_print'
  | 'craft_supply'
  | 'digital'
  | 'vintage'
  | 'paper_goods'
  | 'beauty'
  | 'accessories'
  | 'other'

export const CATEGORY_LABELS: Record<ShopCategory, string> = {
  apparel: 'Apparel & Clothing',
  jewelry: 'Jewelry',
  home_decor: 'Home Decor',
  art_print: 'Art & Prints',
  craft_supply: 'Craft Supplies',
  digital: 'Digital Downloads',
  vintage: 'Vintage',
  paper_goods: 'Paper Goods & Stationery',
  beauty: 'Beauty & Bath',
  accessories: 'Accessories & Bags',
  other: 'Other',
}

export interface CategoryDetectionInput {
  title?: string | null
  tags?: string[] | null
  materials?: string[] | null
}

const KEYWORDS: Record<Exclude<ShopCategory, 'other' | 'vintage'>, string[]> = {
  apparel: ['shirt', 't-shirt', 'tee ', ' tee', 'hoodie', 'sweatshirt', 'sweater', 'tank top', 'dress', 'skirt', 'pants', 'jeans', 'leggings', 'jacket', 'apparel', 'clothing', 'crewneck', 'unisex', 'blouse', 'cardigan'],
  jewelry: ['necklace', 'earring', 'bracelet', 'ring ', ' ring', 'pendant', 'choker', 'anklet', 'brooch', 'jewelry', 'jewellery', 'gemstone', 'sterling silver', 'gold filled', 'beaded'],
  home_decor: ['pillow', 'throw blanket', 'candle', 'wall hanging', 'tapestry', 'mug', 'coaster', 'planter', 'vase', 'lamp', 'decor', 'home decor', 'doormat', 'rug', 'cushion'],
  art_print: ['print', 'poster', 'wall art', 'painting', 'illustration', 'art print', 'giclee', 'canvas', 'photograph', 'sketch'],
  craft_supply: ['supply', 'supplies', 'pattern', 'fabric by the yard', 'yarn', 'bead', 'charm', 'clasp', 'findings', 'wire', 'kit'],
  digital: ['digital download', 'svg', 'png file', 'printable', 'digital file', 'instant download', 'template', 'clipart', 'cricut'],
  paper_goods: ['card', 'invitation', 'planner', 'journal', 'sticker', 'notebook', 'bookmark', 'stationery', 'calendar'],
  beauty: ['soap', 'lotion', 'balm', 'scrub', 'lipstick', 'serum', 'perfume', 'bath bomb', 'skincare', 'fragrance', 'oil blend'],
  accessories: ['bag', 'tote', 'purse', 'wallet', 'keychain', 'hat', 'beanie', 'scarf', 'belt', 'pin ', 'backpack', 'pouch'],
}

const VINTAGE_HINTS = ['vintage', 'antique', 'mid-century', 'art deco', 'victorian', 'edwardian', '1920s', '1930s', '1940s', '1950s', '1960s', '1970s', '1980s', 'retro']

export function detectShopCategory(listings: CategoryDetectionInput[]): ShopCategory {
  if (!listings || listings.length === 0) return 'other'

  const scores: Record<string, number> = {}
  let vintageHits = 0

  for (const l of listings) {
    const hay = [
      String(l.title ?? '').toLowerCase(),
      ...(Array.isArray(l.tags) ? l.tags.map(t => String(t).toLowerCase()) : []),
      ...(Array.isArray(l.materials) ? l.materials.map(m => String(m).toLowerCase()) : []),
    ].join(' | ')

    for (const hint of VINTAGE_HINTS) {
      if (hay.includes(hint)) { vintageHits++; break }
    }

    for (const [cat, words] of Object.entries(KEYWORDS)) {
      for (const w of words) {
        if (hay.includes(w)) {
          scores[cat] = (scores[cat] ?? 0) + 1
          break
        }
      }
    }
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  // If more than ~40% of listings look vintage AND there's no overwhelming
  // category match, treat the shop as primarily vintage.
  if (vintageHits / listings.length > 0.4 && (!best || best[1] / listings.length < 0.6)) {
    return 'vintage'
  }
  if (!best || best[1] === 0) return 'other'
  return best[0] as ShopCategory
}
