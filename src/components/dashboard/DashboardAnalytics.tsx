import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Receipt, ArrowRight, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PaidFeatureGate } from '@/components/auth/PaidFeatureGate'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { mockSales } from '@/data/mockData'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AnalyticsTopPerformers, useShopType } from './AnalyticsTopPerformers'

const DAY_OPTIONS = [
  { label: '7d',  days: 7 },
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
]

/** Grade history from listing_grades — real weekly averages. */
function useGradeTrend() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['grade_trend', user?.id],
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // Get all listing IDs for this user, then fetch their grades
      const { data: userListings } = await supabase
        .from('listings')
        .select('id')
        .eq('user_id', user!.id)
        .limit(500)

      const listingIds = (userListings ?? []).map((l: { id: string }) => l.id)
      if (listingIds.length === 0) return null

      const since = new Date()
      since.setMonth(since.getMonth() - 6)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: grades } = await (supabase as any)
        .from('listing_grades')
        .select('overall_score, graded_at')
        .in('listing_id', listingIds)
        .gte('graded_at', since.toISOString())
        .order('graded_at', { ascending: true })
        .limit(500)

      if (!grades || grades.length === 0) return null

      // Group by month, average scores
      const byMonth = new Map<string, number[]>()
      for (const g of (grades as unknown as Array<{ overall_score: number; graded_at: string }>)) {
        const d = new Date(g.graded_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const existing = byMonth.get(key) ?? []
        existing.push(g.overall_score)
        byMonth.set(key, existing)
      }

      const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      return [...byMonth.entries()].map(([key, scores]) => ({
        month: monthLabels[parseInt(key.split('-')[1]) - 1],
        avg_grade: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
        count: scores.length,
      }))
    },
  })
}

export function DashboardAnalytics() {
  const { listings, isStoreConnected } = useApp()
  const shopType = useShopType(listings)
  const { data: gradeTrend } = useGradeTrend()
  const [salesDays, setSalesDays] = useState(30)

  const isOOAK = shopType === 'one_of_a_kind' || shopType === 'vintage' as never

  // Sales derivation — connected shops use listing data, disconnected use mock
  const allSales = useMemo(() => {
    if (!isStoreConnected) return mockSales
    return listings
      .filter(l => (l.sales_count ?? 0) > 0)
      .flatMap(l => Array.from({ length: l.sales_count ?? 0 }, (_, i) => ({
        id: `${l.id}-${i}`,
        listing_id: l.id,
        listing_title: l.title,
        listing_thumbnail: l.thumbnail_url,
        sale_date: l.etsy_updated_at ?? l.last_synced_at ?? new Date().toISOString(),
        sale_price: l.price ?? 0,
        quantity_sold: 1,
        listing_grade_at_sale: l.current_grade,
        // For OOAK: quantity=0 means sold, quantity=1 means available
        is_sold_out: isOOAK && (l.quantity ?? 0) === 0,
      })))
      .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime())
  }, [listings, isStoreConnected, isOOAK])

  // Time-filtered sales
  const sales = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - salesDays)
    return allSales.filter(s => new Date(s.sale_date) >= cutoff).slice(0, 50)
  }, [allSales, salesDays])

  const totalRevenue = sales.reduce((s, r) => s + r.sale_price * r.quantity_sold, 0)

  // Engagement correlation for OOAK — views + favorites vs grade
  // For inventory shops — sales vs grade
  const correlationData = useMemo(() => {
    if (isOOAK) {
      return listings
        .filter(l => l.current_grade !== undefined && ((l.views ?? 0) > 0 || (l.favorites ?? 0) > 0))
        .map(l => ({
          grade: l.current_grade,
          engagement: (l.views ?? 0) + (l.favorites ?? 0) * 3, // favorites weighted 3×
          views: l.views ?? 0,
          favorites: l.favorites ?? 0,
          name: l.title.slice(0, 20),
          sold: (l.sales_count ?? 0) > 0,
        }))
    }
    return listings
      .filter(l => l.current_grade !== undefined && (l.sales_count ?? 0) > 0)
      .map(l => ({ grade: l.current_grade, sales: l.sales_count, name: l.title.slice(0, 20) }))
  }, [listings, isOOAK])

  // Grade trend: real data if available, friendly empty state if not
  const trendData = gradeTrend ?? []
  const gradeNow = trendData.length > 0 ? trendData[trendData.length - 1].avg_grade : null
  const gradeFirst = trendData.length > 1 ? trendData[0].avg_grade : null
  const gradeLift = gradeNow !== null && gradeFirst !== null ? gradeNow - gradeFirst : null

  const salesLabel = isOOAK ? 'Items sold' : 'Orders'

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Average Grade Trend — real data */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Average Grade Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {gradeNow !== null ? (
              <>
                <p className="text-2xl font-bold">{gradeNow}/100</p>
                {gradeLift !== null && (
                  <p className={`text-xs mt-0.5 ${gradeLift >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                    {gradeLift >= 0 ? '↑' : '↓'} {Math.abs(gradeLift)} pts over the period
                  </p>
                )}
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={trendData} margin={{ top: 10, right: 0, left: -30, bottom: 0 }}>
                    <Line type="monotone" dataKey="avg_grade" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload
                        return (
                          <div className="rounded border bg-background p-2 text-xs shadow-sm">
                            <p>{d.month}: {d.avg_grade}/100 avg</p>
                            <p className="text-muted-foreground">{d.count} grades recorded</p>
                          </div>
                        )
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-24 text-center">
                <TrendingUp className="h-8 w-8 mb-2 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Grade your listings to start tracking your trend.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sales — with time frame selector */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">
                {salesLabel} · Last {salesDays}d
              </CardTitle>
              <div className="flex items-center gap-0.5">
                {DAY_OPTIONS.map(o => (
                  <button
                    key={o.days}
                    onClick={() => setSalesDays(o.days)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${salesDays === o.days ? 'text-white' : 'text-muted-foreground hover:text-white'}`}
                    style={salesDays === o.days ? { background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' } : {}}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {sales.length} {sales.length === 1 ? salesLabel.toLowerCase().replace(/s$/, '') : salesLabel.toLowerCase()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatCurrency(totalRevenue)} revenue
              {!isStoreConnected && <span className="ml-1 opacity-60">(sample)</span>}
              {isOOAK && isStoreConnected && <span className="ml-1 opacity-60">· based on last update date</span>}
            </p>
            <div className="mt-4 space-y-2">
              {sales.slice(0, 3).map(s => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-muted-foreground max-w-[140px]">{s.listing_title}</span>
                  <span className="font-medium">{formatCurrency(s.sale_price)}</span>
                </div>
              ))}
              {sales.length === 0 && (
                <p className="text-xs text-muted-foreground">No {salesLabel.toLowerCase()} in the last {salesDays} days.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <AnalyticsTopPerformers listings={listings} shopType={shopType} />
      </div>

      {/* Grade vs Engagement / Sales Correlation — adapts to shop type */}
      <PaidFeatureGate
        featureName={isOOAK ? 'Grade vs Engagement Correlation' : 'Grade vs Sales Correlation'}
        description={isOOAK
          ? 'See how listing grades correlate with views and favorites. For one-of-a-kind items, engagement is the right signal — a sold item only ever has sales_count of 1.'
          : 'See how listing grade improvements directly correlate with sales. Available on Pro plans.'
        }
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {isOOAK ? 'Grade vs Engagement (Views + Favorites)' : 'Grade vs Sales Correlation'}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {isOOAK
                ? 'Each bar = one listing. For vintage/OOAK items, engagement (views + favorites weighted 3×) is the meaningful performance signal. Sold items are marked.'
                : 'Each bar = one listing. Higher grades → more sales.'
              }
            </p>
          </CardHeader>
          <CardContent>
            {correlationData.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] rounded-md border border-dashed">
                <p className="text-sm text-muted-foreground text-center max-w-md px-6">
                  {isOOAK
                    ? 'Correlation builds as more listings are graded and get views. Grade your listings to start seeing this.'
                    : 'Correlation data builds as more listings are graded — check back once additional listings have been graded.'
                  }
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={correlationData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="rounded-md border bg-background p-2 shadow-sm text-xs">
                          <p className="font-medium">{d.name}</p>
                          <p>Grade: {d.grade}/100</p>
                          {isOOAK ? (
                            <>
                              <p>Views: {d.views}</p>
                              <p>Favorites: {d.favorites}</p>
                              {d.sold && <p className="text-emerald-500 font-medium">✓ Sold</p>}
                            </>
                          ) : (
                            <p>Sales: {d.sales}</p>
                          )}
                        </div>
                      )
                    }}
                  />
                  <Bar
                    dataKey={isOOAK ? 'engagement' : 'sales'}
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </PaidFeatureGate>
    </div>
  )
}

/**
 * Recent sales feed — time-aware, shop-type-aware.
 */
export function RecentSalesBlock() {
  const { listings, isStoreConnected } = useApp()
  const navigate = useNavigate()
  const shopType = useShopType(listings)
  const [days, setDays] = useState(30)
  const isOOAK = shopType === 'one_of_a_kind'

  const sales = useMemo(() => {
    if (!isStoreConnected) return mockSales
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return listings
      .filter(l => (l.sales_count ?? 0) > 0)
      .flatMap(l => Array.from({ length: l.sales_count ?? 0 }, (_, i) => ({
        id: `${l.id}-${i}`,
        listing_id: l.id,
        listing_title: l.title,
        listing_thumbnail: l.thumbnail_url,
        sale_date: l.etsy_updated_at ?? l.last_synced_at ?? new Date().toISOString(),
        sale_price: l.price ?? 0,
        quantity_sold: 1,
        listing_grade_at_sale: l.current_grade,
      })))
      .filter(s => new Date(s.sale_date) >= cutoff)
      .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime())
      .slice(0, 10)
  }, [listings, isStoreConnected, days])

  const headerLabel = isOOAK ? 'Sold Items' : 'Recent Sales & Listing Grades'

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm text-muted-foreground">
            {headerLabel}
            {!isStoreConnected && <span className="ml-2 text-xs opacity-60">(sample)</span>}
            {isOOAK && isStoreConnected && (
              <span className="ml-2 text-xs opacity-50">· date based on last listing update</span>
            )}
          </CardTitle>
          <div className="flex items-center gap-0.5 shrink-0">
            {DAY_OPTIONS.map(o => (
              <button
                key={o.days}
                onClick={() => setDays(o.days)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${days === o.days ? 'text-white' : 'text-muted-foreground hover:text-white'}`}
                style={days === o.days ? { background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' } : {}}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sales.length === 0 ? (
          <div className="flex flex-col items-center text-center py-8 px-4 rounded-lg"
            style={{ background: 'hsl(var(--primary) / 0.04)', border: '1px dashed hsl(var(--primary) / 0.18)' }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-full mb-3"
              style={{ background: 'hsl(var(--primary) / 0.12)' }}>
              <Receipt className="h-6 w-6" style={{ color: 'hsl(var(--primary))' }} />
            </div>
            <p className="text-sm font-semibold text-white mb-1">
              {isOOAK ? `No items sold in the last ${days} days` : `No sales in the last ${days} days`}
            </p>
            <p className="text-xs mb-4 max-w-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {isOOAK
                ? 'Your sold items will appear here. In the meantime, sharp listings with high favorites are your best signal.'
                : 'Your first sale will appear here automatically once it lands on Etsy. In the meantime, sharpen your listings.'}
            </p>
            <Button size="sm" variant="outline" className="gap-1.5"
              onClick={() => navigate('/app/listings')}
              style={{ borderColor: 'hsl(var(--primary) / 0.4)', color: 'hsl(var(--primary))' }}>
              {isOOAK ? 'Improve your listings' : 'View your listings'} <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sales.map(s => (
              <div key={s.id} className="flex items-center gap-3">
                <div className="h-9 w-9 shrink-0 rounded overflow-hidden bg-muted">
                  {s.listing_thumbnail && (
                    <img src={s.listing_thumbnail} alt="" className="h-full w-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{s.listing_title}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(s.sale_date)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={(s.listing_grade_at_sale ?? 0) >= 70 ? 'success' : 'warning'} className="text-xs">
                    {s.listing_grade_at_sale ?? '?'}/100
                  </Badge>
                  <span className="font-medium text-sm">{formatCurrency(s.sale_price)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
