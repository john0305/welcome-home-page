import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { EtsyListing, DashboardListingRow } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { detectShopType, type ShopType } from '@/lib/shopType'

export type { ShopType } from '@/lib/shopType'

/**
 * Hook wrapper around `detectShopType` — see `src/lib/shopType.ts` for the
 * full detection rules (digital, supplies, personalized, made-to-order,
 * inventory, one-of-a-kind).
 */
export function useShopType(listings: EtsyListing[] | DashboardListingRow[]): ShopType {
  return useMemo(() => detectShopType(listings as Parameters<typeof detectShopType>[0]), [listings])
}

/**
 * Category source priority: section → taxonomy_path → tag-cluster fallback.
 * tags[0] is intentionally never used as a category label.
 */
function listingCategory(l: EtsyListing, tagFrequency: Map<string, number>): string {
  // 1. Etsy shop section
  const section = (l as unknown as { shop_section_id?: number | null; section_name?: string | null })
    .section_name
  if (section && typeof section === 'string' && section.trim()) return section.trim()

  // 2. Taxonomy path (last segment is most specific)
  if (l.taxonomy_path && l.taxonomy_path.length > 0) {
    return l.taxonomy_path[l.taxonomy_path.length - 1]
  }

  // 3. Tag-cluster fallback — pick this listing's most shop-wide-frequent tag
  if (l.tags && l.tags.length > 0) {
    let best = l.tags[0]
    let bestFreq = tagFrequency.get(best) ?? 0
    for (const t of l.tags) {
      const f = tagFrequency.get(t) ?? 0
      if (f > bestFreq) { best = t; bestFreq = f }
    }
    // Only return it if it's actually a cluster (appears on ≥3 listings),
    // otherwise call it Uncategorized.
    if (bestFreq >= 3) return best
  }
  return 'Uncategorized'
}

interface Props {
  listings: EtsyListing[]
  shopType: ShopType
}

/**
 * Replaces the single "Top Performing Listing" card with shop-type-aware
 * surfaces. Inventory shops still see a top performer; one-of-a-kind shops
 * see top categories + ready-to-move listings since "top performer" is
 * misleading when every listing only has 1 unit to sell.
 */
export function AnalyticsTopPerformers({ listings, shopType }: Props) {
  const active = useMemo(() => listings.filter(l => l.state === 'active'), [listings])

  // Shop-wide tag frequency, used for the category fallback.
  const tagFrequency = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of active) for (const t of l.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  }, [active])

  // ─── Inventory-style shops: classic top-performer card ───────────────────
  // Anything that isn't pure one-of-a-kind benefits from "units sold" framing
  // (digital downloads, supplies, made-to-order, personalized). Label varies
  // so the surface reads correctly for each archetype.
  if (shopType !== 'one_of_a_kind') {
    const top = [...active].sort((a, b) => (b.sales_count ?? 0) - (a.sales_count ?? 0))[0]
    const label =
      shopType === 'digital'      ? 'Top Performer · Downloads' :
      shopType === 'supplies'     ? 'Top Performer · Units Moved' :
      shopType === 'made_to_order'? 'Top Performer · Orders' :
      shopType === 'personalized' ? 'Top Performer · Custom Orders' :
                                    'Top Performer · Units Sold'
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          {top ? (
            <div>
              <p className="font-medium text-sm line-clamp-2">{top.title}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{top.views} views</span>
                <span>{top.favorites} ♥</span>
                <span>{top.sales_count} sold</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <Badge variant={(top.current_grade ?? 0) >= 70 ? 'success' : 'warning'} className="text-xs">
                  {top.current_grade ?? '?'}/100
                </Badge>
                <span className="text-muted-foreground">Optimized {top.optimization_count}×</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No active listings yet.</p>
          )}
        </CardContent>
      </Card>
    )
  }

  // ─── One-of-a-kind shops: top categories + ready-to-move ─────────────────
  // Top categories by units sold + revenue
  const byCategory = new Map<string, { units: number; revenue: number }>()
  for (const l of active) {
    const cat = listingCategory(l, tagFrequency)
    const cur = byCategory.get(cat) ?? { units: 0, revenue: 0 }
    cur.units += l.sales_count ?? 0
    cur.revenue += (l.price ?? 0) * (l.sales_count ?? 0)
    byCategory.set(cat, cur)
  }
  const topCategories = [...byCategory.entries()]
    .sort((a, b) => b[1].units - a[1].units || b[1].revenue - a[1].revenue)
    .slice(0, 3)

  // Ready-to-move: graded well & viewed recently. Loose proxy since we don't
  // have per-day view history — anything with views > 0 and grade ≥ 70.
  let readyToMove = active
    .filter(l => (l.current_grade ?? 0) >= 70 && (l.views ?? 0) > 0)
    .sort((a, b) => (b.favorites ?? 0) - (a.favorites ?? 0))
    .slice(0, 3)
  if (readyToMove.length < 3) {
    readyToMove = active
      .filter(l => (l.current_grade ?? 0) >= 50)
      .sort((a, b) => (b.favorites ?? 0) - (a.favorites ?? 0))
      .slice(0, 3)
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">What's Selling · Top Categories</CardTitle>
        </CardHeader>
        <CardContent>
          {topCategories.length === 0 ? (
            <p className="text-xs text-muted-foreground">No sales yet to derive top categories.</p>
          ) : (
            <div className="space-y-2.5">
              {topCategories.map(([cat, { units, revenue }]) => (
                <div key={cat} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground truncate max-w-[60%]">{cat}</span>
                  <span className="text-muted-foreground shrink-0">
                    {units} sold · {formatCurrency(revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Ready to Move · Best Positioned</CardTitle>
        </CardHeader>
        <CardContent>
          {readyToMove.length === 0 ? (
            <p className="text-xs text-muted-foreground">No high-grade listings yet.</p>
          ) : (
            <div className="space-y-2">
              {readyToMove.map(l => (
                <div key={l.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{l.title}</span>
                  <Badge variant="success" className="text-[10px] shrink-0">{l.current_grade}/100</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
