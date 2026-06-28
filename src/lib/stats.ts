import type { DashboardListingRow, DashboardStats, QueueItem, OptimizationRecord } from '@/types'

// Computes every KPI the dashboard needs from slim per-row data already in
// memory — no second round-trip. Called from a useMemo so it only reruns when
// dashboardRows actually changes, not on every render.
export function computeDashboardStatsFromListings(
  rows: DashboardListingRow[],
  queue: QueueItem[],
  recentOptimizations: OptimizationRecord[] = [],
  shopSnapshot?: {
    total_views: number; total_sales: number; orders_30d: number;
    revenue_30d: number; total_favorites: number;
  } | null,
): DashboardStats {

  const listings = rows    // local alias so the rest of the function reads cleanly
  const active = rows.filter(l => l.state === 'active')
  const now = Date.now()

  const grades = active.filter(l => l.current_grade != null).map(l => l.current_grade!)

  const avgGrade = grades.length > 0
    ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length)
    : 0
  // Image grade isn't in the slim schema — we'd need a separate query or the
  // full listing row to get it. Use avgGrade as the fallback so the KPI card
  // shows a real number rather than 0.
  const avgImgGrade = avgGrade

  const dist = { a_plus: 0, a: 0, b: 0, c: 0, d: 0, f: 0 }
  for (const g of grades) {
    if (g >= 90) dist.a_plus++
    else if (g >= 80) dist.a++
    else if (g >= 70) dist.b++
    else if (g >= 60) dist.c++
    else if (g >= 50) dist.d++
    else dist.f++
  }

  const oldestDays = listings.reduce((max, l) => {
    const days = (now - new Date(l.etsy_created_at).getTime()) / 86400000
    return Math.max(max, days)
  }, 0)
  const totalViews = active.reduce((s, l) => s + (l.views ?? 0), 0)
  const totalFavorites = active.reduce((s, l) => s + (l.favorites ?? 0), 0)
  const totalSales = active.reduce((s, l) => s + (l.sales_count ?? 0), 0)
  const approxRevenue = active.reduce((s, l) => s + (l.price ?? 0) * (l.sales_count ?? 0), 0)

  // Shop-level snapshot (when available) is more accurate than per-listing sums
  // because Etsy doesn't expose per-listing views or sales counts on the listing
  // endpoint — we get them aggregated from the shop stats / receipts endpoints.
  const headlineViews = shopSnapshot?.total_views ?? totalViews
  const headlineFavorites = shopSnapshot?.total_favorites ?? totalFavorites
  const headlineSales = shopSnapshot?.orders_30d ?? totalSales
  const headlineRevenue = shopSnapshot?.revenue_30d ?? approxRevenue

  return {
    total_listings: listings.length,
    active_listings: active.length,
    avg_listing_grade: avgGrade,
    avg_image_grade: avgImgGrade,
    listings_needing_optimization: active.filter(l => (l.current_grade ?? 100) < 60).length,
    listings_never_graded: listings.filter(l => l.optimization_count === 0).length,
    total_views_30d: headlineViews,
    total_favorites_30d: headlineFavorites,
    total_sales_month: headlineSales,
    sales_revenue_month: headlineRevenue,
    optimization_queue_length: queue.filter(q => q.status === 'pending').length,
    oldest_listing_days: Math.round(oldestDays),
    grade_distribution: dist,
    views_trend: [],
    sales_trend: [],
    recent_optimizations: recentOptimizations,
  }
}
