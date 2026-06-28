/**
 * Performance comparison: optimized vs not yet optimized.
 *
 * Headline = single composite "performance index" so users get an immediate
 * read. Sub-metrics (avg views/day, favorites rate, sales/listing/day) are
 * shown below for detail. All metrics are normalized per-listing-per-day so
 * uneven segment sizes don't bias the comparison.
 *
 * Sales attribution requires real receipt data (listing_sales_events). Until
 * we have >= MIN_ATTRIBUTED_SALES, the sales component is hidden and the
 * index is recomputed using views + favorites only.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ArrowRight } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { DashboardListingRow } from '@/types'

const TEAL = 'hsl(var(--primary))'
const MIN_ATTRIBUTED_SALES = 10

function ageDays(iso: string): number {
  return Math.max(1, (Date.now() - new Date(iso).getTime()) / 86400000)
}

function avgViewsPerDay(rows: DashboardListingRow[]): number {
  if (rows.length === 0) return 0
  const sum = rows.reduce((s, l) => s + ((l.views ?? 0) / ageDays(l.etsy_created_at)), 0)
  return sum / rows.length
}

function favoritesRate(rows: DashboardListingRow[]): number {
  const v = rows.reduce((s, l) => s + (l.views ?? 0), 0)
  const f = rows.reduce((s, l) => s + (l.favorites ?? 0), 0)
  return v > 0 ? (f / v) * 100 : 0
}

interface Props {
  rows: DashboardListingRow[]
}

export function PerformanceComparison({ rows }: Props) {
  const { user } = useAuth()
  const active = useMemo(() => rows.filter(r => r.state === 'active'), [rows])
  const optimized = useMemo(() => active.filter(r => (r.optimization_count ?? 0) > 0), [active])
  const notOptimized = useMemo(() => active.filter(r => (r.optimization_count ?? 0) === 0), [active])

  // Per-listing attributed sales in the last 30 days, from listing_sales_events.
  const [salesByListing, setSalesByListing] = useState<Map<string, number>>(new Map())
  const [totalAttributed, setTotalAttributed] = useState(0)

  useEffect(() => {
    if (!user) return
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('listing_sales_events')
        .select('listing_id, units')
        .eq('user_id', user.id)
        .gte('sold_on', since)
      if (cancelled || !data) return
      const m = new Map<string, number>()
      let total = 0
      for (const r of data as Array<{ listing_id: string; units: number | null }>) {
        const u = Number(r.units ?? 1)
        m.set(r.listing_id, (m.get(r.listing_id) ?? 0) + u)
        total += u
      }
      setSalesByListing(m)
      setTotalAttributed(total)
    })()
    return () => { cancelled = true }
  }, [user?.id])

  if (optimized.length < 5) {
    return (
      <section className="rounded-xl border p-5" style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${TEAL}1a` }}>
            <Sparkles className="h-4 w-4" style={{ color: TEAL }} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
              Performance comparison
            </h3>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Optimize 5+ listings to unlock the optimized vs not-yet comparison.
              You're at {optimized.length} / 5.
            </p>
            <Link to="/app/actions" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: TEAL }}>
              View your fix queue <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </section>
    )
  }

  const salesUnlocked = totalAttributed >= MIN_ATTRIBUTED_SALES

  function totalSales(seg: DashboardListingRow[]): number {
    return seg.reduce((s, l) => s + (salesByListing.get(l.id) ?? 0), 0)
  }

  function salesRatePer100PerDay(seg: DashboardListingRow[]): number {
    if (seg.length === 0) return 0
    const sales = totalSales(seg)
    // sales per 100 listings per day, over the 30d window
    return (sales / seg.length / 30) * 100
  }

  function performanceIndex(seg: DashboardListingRow[]): number {
    const v = avgViewsPerDay(seg)
    const f = favoritesRate(seg)
    if (!salesUnlocked) {
      return v * 0.5 + f * 0.5
    }
    const s = salesRatePer100PerDay(seg)
    return v * 0.3 + f * 0.3 + s * 0.4
  }

  const cols = [
    { key: 'opt', label: 'Optimized', count: optimized.length, rows: optimized, accent: TEAL },
    { key: 'not', label: 'Not yet optimized', count: notOptimized.length, rows: notOptimized, accent: '#64748b' },
  ] as const

  const notOptCount = notOptimized.length

  // Headline: "Optimized listings get X% more views/day"
  const optV = avgViewsPerDay(optimized)
  const notV = avgViewsPerDay(notOptimized)
  const viewsLiftPct = notV > 0 ? Math.round(((optV - notV) / notV) * 100) : null

  return (
    <section className="rounded-xl border p-5" style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
          Is RadarIQ working?
        </h3>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Performance index
        </span>
      </div>
      {viewsLiftPct != null && viewsLiftPct > 0 ? (
        <p className="text-sm font-semibold mb-1" style={{ color: TEAL, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
          Optimized listings get {viewsLiftPct}% more views/day
        </p>
      ) : null}
      <p className="text-[11px] mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Performance Index combines views, favorites, and sales into one score (0–10 scale)
      </p>
      <div className="grid grid-cols-2 gap-3">
        {cols.map(col => {
          const avgV = avgViewsPerDay(col.rows)
          const favR = favoritesRate(col.rows)
          const salesR = salesRatePer100PerDay(col.rows)
          const idx = performanceIndex(col.rows)
          return (
            <div
              key={col.key}
              className="rounded-lg border p-3"
              style={{ background: 'hsl(var(--surface-2))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className="text-xs font-semibold" style={{ color: col.accent }}>{col.label}</p>
                <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{col.count} listings</p>
              </div>
              <div className="mb-3">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Index</p>
                <p className="text-2xl font-bold" style={{ color: col.accent, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                  {idx.toFixed(1)}
                </p>
              </div>
              <Stat label="Avg views/day" value={avgV.toFixed(1)} />
              <Stat label="Favorites rate" value={`${favR.toFixed(1)}%`} />
              <Stat label="Sales (30d)" value={totalSales(col.rows).toString()} />
              {salesUnlocked ? (
                <Stat label="Sales/100 listings/day" value={salesR.toFixed(2)} />
              ) : null}
            </div>
          )
        })}
      </div>
      {!salesUnlocked && (
        <p className="text-[10px] mt-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {totalAttributed > 0
            ? `Sales comparison coming soon — ${totalAttributed}/${MIN_ATTRIBUTED_SALES} attributed`
            : 'Sales comparison coming soon — based on order history as it accumulates'}
        </p>
      )}
      {notOptCount > 0 && (
        <>
          <Link
            to="/app/actions?filter=high-impact"
            className="mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
            style={{ background: 'hsl(var(--surface-2))', borderColor: 'hsl(var(--primary) / 0.25)' }}
          >
            <p className="text-[11px] leading-snug" style={{ color: 'hsl(var(--foreground))' }}>
              <span className="font-semibold text-foreground">{notOptCount} listings</span> haven't been optimized yet — that's where your biggest gains are.
            </p>
            <span className="flex items-center gap-1 text-xs font-semibold whitespace-nowrap" style={{ color: TEAL }}>
              Optimize next <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
          <p className="mt-1.5 text-[10px] text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {notOptCount} listing{notOptCount === 1 ? '' : 's'} remaining
          </p>
        </>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</span>
      <span className="text-sm font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>{value}</span>
    </div>
  )
}
