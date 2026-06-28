import { useEffect, useState, useMemo } from 'react'
import { Header } from '@/components/layout/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { formatPct, formatDelta, daysUntilWindow, confidenceFor } from '@/lib/attribution'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, Sparkles, Trophy, Share2, Clock } from 'lucide-react'
import { PerformanceListingDetail } from '@/components/performance/PerformanceListingDetail'
import { ShareableCard } from '@/components/performance/ShareableCard'
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip, ReferenceLine, ReferenceArea } from 'recharts'
import { useApp } from '@/contexts/AppContext'
import { Plane } from 'lucide-react'

type AttributionRow = any
type WinRow = any

type Listing = { id: string; title: string; thumbnail_url: string | null }

export default function Performance() {
  const { user } = useAuth()
  const { connectedStore } = useApp()
  const isVacation = !!connectedStore?.is_vacation
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AttributionRow[]>([])
  const [wins, setWins] = useState<WinRow[]>([])
  const [listings, setListings] = useState<Record<string, Listing>>({})
  const [shopSnaps, setShopSnaps] = useState<any[]>([])
  const [filter, setFilter] = useState<'all' | 'biggest_improvement' | 'biggest_opportunity'>('all')
  const [selected, setSelected] = useState<AttributionRow | null>(null)
  const [shareWin, setShareWin] = useState<{ headline: string; listing: Listing | null } | null>(null)

  useEffect(() => {
    if (!user) return
    void (async () => {
      setLoading(true)
      const [attrRes, winsRes, listRes, shopRes] = await Promise.all([
        supabase.from('performance_attribution').select('*').eq('user_id', user.id).order('optimized_at', { ascending: false }),
        supabase.from('wins_feed').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('listings').select('id, title, thumbnail_url').eq('user_id', user.id),
        supabase.from('shop_snapshots').select('recorded_on, total_views, total_favorites, total_sales, revenue_30d')
          .eq('user_id', user.id).order('recorded_on', { ascending: true }).limit(120),
      ])
      setRows(attrRes.data ?? [])
      setWins(winsRes.data ?? [])
      setListings(Object.fromEntries((listRes.data ?? []).map((l: any) => [l.id, l])))
      setShopSnaps(shopRes.data ?? [])
      setLoading(false)
    })()
  }, [user])

  // Pick best window per listing (prefer 30d sufficient, else most recent)
  const bestPerListing = useMemo(() => {
    const by: Record<string, AttributionRow> = {}
    for (const r of rows) {
      const existing = by[r.listing_id]
      const isBetter = !existing
        || (r.is_sufficient_data && !existing.is_sufficient_data)
        || (r.is_sufficient_data === existing.is_sufficient_data && r.window_days === 30)
      if (isBetter) by[r.listing_id] = r
    }
    return Object.values(by)
  }, [rows])

  const filtered = useMemo(() => {
    const list = [...bestPerListing]
    if (filter === 'biggest_improvement') {
      list.sort((a, b) => (b.views_pct ?? -999) - (a.views_pct ?? -999))
    } else if (filter === 'biggest_opportunity') {
      list.sort((a, b) => (a.views_pct ?? 999) - (b.views_pct ?? 999))
    } else {
      list.sort((a, b) => new Date(b.optimized_at).getTime() - new Date(a.optimized_at).getTime())
    }
    return list
  }, [bestPerListing, filter])

  const headlineStat = useMemo(() => {
    const valid = bestPerListing.filter(r => r.is_sufficient_data && !r.is_anomaly)
    if (valid.length === 0) return null
    const candidates = [
      { label: 'more views', values: valid.map(r => r.views_pct).filter((v): v is number => v != null && v > 0) },
      { label: 'more favorites', values: valid.map(r => r.favorites_pct).filter((v): v is number => v != null && v > 0) },
      { label: 'higher score', values: valid.map(r => r.score_delta).filter((v): v is number => v != null && v > 0) },
    ]
    let best: { label: string; avg: number } | null = null
    for (const c of candidates) {
      if (c.values.length === 0) continue
      const avg = Math.round(c.values.reduce((a, b) => a + b, 0) / c.values.length)
      if (!best || avg > best.avg) best = { label: c.label, avg }
    }
    return best
  }, [bestPerListing])

  const optimizedCount = bestPerListing.length
  const totalListings = Object.keys(listings).length

  const trend = shopSnaps.map(s => ({
    date: s.recorded_on,
    views: s.total_views,
    favorites: s.total_favorites,
    sales: s.total_sales,
  }))

  // ── Vacation-aware delta ────────────────────────────────────────────────────
  // When the shop is on vacation, Etsy stops organic traffic — views drop to
  // near-zero and a raw 90d delta looks like the shop is failing.
  // We use the last pre-vacation snapshot as the comparison endpoint instead.
  const vacationStartIdx = useMemo(() => {
    if (!isVacation || shopSnaps.length < 3) return -1
    // Find the last snapshot where views are "healthy" (> median / 3)
    // before a sustained drop. Work backwards from the end.
    const views = shopSnaps.map(s => s.total_views ?? 0)
    const nonZero = views.filter(v => v > 0)
    if (nonZero.length === 0) return -1
    const threshold = nonZero.reduce((a, b) => a + b, 0) / nonZero.length * 0.25
    // Find the last index where views were above threshold
    for (let i = shopSnaps.length - 1; i >= 0; i--) {
      if ((shopSnaps[i].total_views ?? 0) >= threshold) return i
    }
    return -1
  }, [shopSnaps, isVacation])

  const first = shopSnaps[0]
  // When on vacation, compare up to the last pre-vacation snapshot, not today
  const lastForDelta = isVacation && vacationStartIdx >= 0
    ? shopSnaps[vacationStartIdx]
    : shopSnaps[shopSnaps.length - 1]
  const vacationStartDate = vacationStartIdx >= 0 ? shopSnaps[vacationStartIdx]?.recorded_on : null

  const trendDelta = first && lastForDelta ? {
    views: (lastForDelta.total_views ?? 0) - (first.total_views ?? 0),
    favorites: (lastForDelta.total_favorites ?? 0) - (first.total_favorites ?? 0),
    sales: (lastForDelta.total_sales ?? 0) - (first.total_sales ?? 0),
    revenue: Number(lastForDelta.revenue_30d ?? 0) - Number(first.revenue_30d ?? 0),
    isPreVacation: isVacation && vacationStartIdx >= 0,
  } : null

  const deltaLabel = trendDelta?.isPreVacation ? 'pre-vacation' : '90d'

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Performance" description="How your optimizations are actually performing" />

      <div className="flex-1 px-3 sm:px-4 md:px-6 py-4 space-y-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-[var(--radius-lg)] bg-surface-1 skeleton-shimmer" />
            ))}
          </div>
        ) : (
          <>
            {/* Vacation notice */}
            {isVacation && (
              <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-amber-500/25 bg-amber-500/7 p-3">
                <Plane className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-amber-400">Shop on vacation</p>
                  <p className="text-xs mt-0.5 text-muted-foreground">
                    Etsy pauses search visibility in vacation mode — chart dips are expected, not a performance issue.
                  </p>
                </div>
              </div>
            )}

            {/* Headline stat */}
            {headlineStat && (
              <div className="rounded-[var(--radius-lg)] border border-primary/20 bg-primary/6 p-4">
                <p className="text-base font-semibold text-foreground leading-snug">
                  Optimized listings get <span className="text-primary">+{headlineStat.avg}%</span> {headlineStat.label} on average
                </p>
                <p className="text-xs mt-1 text-muted-foreground">Across {optimizedCount} optimized listings</p>
              </div>
            )}

            {/* Stats row — 2-col on mobile, 4-col on md+ */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Optimized" value={`${optimizedCount}/${totalListings}`} accentColor="hsl(163 60% 26%)" />
              <Stat label={`Views Δ ${deltaLabel}`} value={trendDelta ? formatDelta(trendDelta.views) : '—'} accentColor="hsl(22 65% 56%)" />
              <Stat label={`Favs Δ ${deltaLabel}`} value={trendDelta ? formatDelta(trendDelta.favorites) : '—'} accentColor="hsl(258 44% 55%)" />
              <Stat label={`Revenue Δ ${deltaLabel}`} value={trendDelta ? formatCurrency(trendDelta.revenue) : '—'} accentColor="#F59E0B" />
            </div>

            {/* Views trend chart */}
            {trend.length > 1 && (
              <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
                <p className="text-xs font-medium mb-3 text-muted-foreground">Store views trend</p>
                <div className="h-28">
                  <ResponsiveContainer>
                    <LineChart data={trend}>
                      <XAxis dataKey="date" hide />
                      <YAxis hide />
                      <RTooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <div className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-xs shadow-sm text-foreground/90">
                              <p className="font-medium mb-0.5">{label}</p>
                              <p>Views: {payload[0]?.value}</p>
                              {isVacation && vacationStartDate && label > vacationStartDate && (
                                <p className="text-amber-400 mt-1">✈️ Vacation mode</p>
                              )}
                            </div>
                          )
                        }}
                      />
                      {isVacation && vacationStartDate && (
                        <ReferenceArea x1={vacationStartDate} fill="rgba(245,158,11,0.08)" />
                      )}
                      {vacationStartDate && (
                        <ReferenceLine x={vacationStartDate} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} />
                      )}
                      <Line type="monotone" dataKey="views" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Wins feed */}
            {wins.length > 0 && (
              <div className="rounded-[var(--radius-lg)] border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <p className="text-sm font-semibold text-foreground">Wins</p>
                </div>
                <div className="divide-y divide-border">
                  {wins.slice(0, 5).map(w => {
                    const l = listings[w.listing_id]
                    return (
                      <div key={w.id} className="flex items-start gap-2.5 px-4 py-3">
                        <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: '#f59e0b' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{l?.title ?? 'Listing'}</p>
                          <p className="text-xs mt-0.5 text-muted-foreground">{w.headline}</p>
                        </div>
                        <button
                          className="shrink-0 rounded-[var(--radius-sm)] p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                          onClick={() => setShareWin({ headline: w.headline, listing: l ?? null })}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Listing performance */}
            <div className="rounded-[var(--radius-lg)] border border-border bg-card overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Listing Performance</p>
                <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
                  <SelectTrigger className="w-full sm:w-44 text-xs h-8"
>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Most recent</SelectItem>
                    <SelectItem value="biggest_improvement">Biggest improvement</SelectItem>
                    <SelectItem value="biggest_opportunity">Biggest opportunity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {filtered.length === 0 ? (
                <p className="text-sm text-center py-10 text-muted-foreground/60">
                  No attribution data yet — check back after your optimizations have tracked for a week.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map(r => {
                    const l = listings[r.listing_id]
                    const pending = !r.is_sufficient_data
                    const daysLeft = pending ? daysUntilWindow(r.optimized_at, r.window_days) : 0
                    return (
                      <button key={r.id}
                        onClick={() => setSelected(r)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                      >
                        <div className="h-10 w-10 rounded-md overflow-hidden shrink-0" style={{ background: '#0d1f1f' }}>
                          {l?.thumbnail_url && <img src={l.thumbnail_url} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{l?.title ?? 'Listing'}</p>
                          <p className="text-xs mt-0.5 text-muted-foreground">
                            {new Date(r.optimized_at).toLocaleDateString()} · {r.window_days}d window
                          </p>
                          {/* Metrics stacked below title on all sizes — no horizontal overflow */}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                            {pending ? (
                              <span className="flex items-center gap-1 text-[11px]" style={{ color: '#f59e0b' }}>
                                <Clock className="h-3 w-3" /> Pending — {daysLeft}d left
                              </span>
                            ) : (
                              <>
                                <MetricPill label="Score" value={r.score_delta != null ? `${r.score_delta > 0 ? '+' : ''}${r.score_delta}` : '—'} positive={r.score_delta > 0} />
                                <MetricPill label="Views" value={formatPct(r.views_pct)} positive={(r.views_pct ?? 0) > 0} />
                                <MetricPill label="Favs" value={formatPct(r.favorites_pct)} positive={(r.favorites_pct ?? 0) > 0} />
                              </>
                            )}
                          </div>
                        </div>
                        <TrendingUp className="h-3.5 w-3.5 mt-1 shrink-0" style={{ color: 'hsl(var(--foreground))' }} />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {selected && (
        <PerformanceListingDetail
          attribution={selected}
          listing={listings[selected.listing_id] ?? null}
          allWindows={rows.filter(r => r.listing_id === selected.listing_id)}
          onClose={() => setSelected(null)}
        />
      )}
      {shareWin && (
        <ShareableCard
          headline={shareWin.headline}
          listing={shareWin.listing}
          onClose={() => setShareWin(null)}
        />
      )}
    </div>
  )
}

function Stat({ label, value, accentColor }: { label: string; value: string; accentColor?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden shadow-warm-sm">
      {/* Colored top accent bar */}
      <div className="h-1" style={{ background: accentColor ?? 'hsl(var(--primary))' }} />
      <div className="px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground mt-0.5" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>{value}</p>
      </div>
    </div>
  )
}

function MetricPill({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <span className="text-[11px] font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
      {label}: <span style={{ color: positive ? '#34d399' : value === '—' ? '#475569' : '#f87171' }}>{value}</span>
    </span>
  )
}
