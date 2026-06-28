import { TrendingDown, TrendingUp, Minus, Loader2, Gauge } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStoreVelocity } from '@/hooks/useStoreVelocity'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import type { ShopSnapshotPoint } from '@/contexts/AppContext'

interface Props {
  snapshotHistory?: ShopSnapshotPoint[]
}

export function StoreVelocityCard({ snapshotHistory = [] }: Props) {
  const { user } = useAuth()
  const { stats, loading, computing } = useStoreVelocity(user?.id)
  const [orderCounts, setOrderCounts] = useState<{ total: number; attributed: number } | null>(null)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    void (async () => {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const { data } = await supabase
        .from('order_line_items' as never)
        .select('listing_id')
        .eq('user_id', user.id)
        .gte('sold_on', since.toISOString().slice(0, 10))
        .limit(500)
      if (cancelled || !data || !Array.isArray(data)) return
      const rows = data as unknown as Array<{ listing_id: string | null }>
      setOrderCounts({ total: rows.length, attributed: rows.filter(r => r.listing_id).length })
    })()
    return () => { cancelled = true }
  }, [user?.id])

  if (loading) return null

  // Fallback: derive recent sale count from shop_snapshots.total_sales when
  // per-listing snapshot quantity-diffing missed it (common for digital /
  // made-to-order listings whose quantity never decrements).
  const snapSales = (() => {
    if (snapshotHistory.length < 2) return 0
    const sales = snapshotHistory.map(s => (s as unknown as { total_sales?: number }).total_sales ?? 0)
    return Math.max(0, sales[sales.length - 1] - sales[0])
  })()

  if (!stats?.computed_at) {
    return (
      <div className="rounded-xl border p-4" style={{ background: 'hsl(var(--primary) / 0.04)', borderColor: 'hsl(var(--primary) / 0.18)' }}>
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'hsl(var(--primary))' }} />
          <span className="font-semibold">Building your sales history from snapshots…</span>
        </div>
        <p className="mt-1 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          This may take a few minutes on first load.
        </p>
      </div>
    )
  }

  if ((stats.sample_size ?? 0) === 0) {
    return (
      <div className="rounded-xl border p-4" style={{ background: '#0b1a1a', borderColor: 'rgba(148,163,184,0.15)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Gauge className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <p className="text-sm font-semibold text-foreground">Store velocity</p>
        </div>
        {orderCounts && orderCounts.total > 0 ? (
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <span className="font-semibold text-foreground">{orderCounts.total} Etsy order{orderCounts.total === 1 ? '' : 's'}</span> synced
            from the last 30 days. {orderCounts.attributed > 0
              ? `${orderCounts.attributed} tied to current listing records; velocity will expand as more order-linked listings sync.`
              : 'Listing links are still syncing, so per-listing velocity is not ready yet.'}
          </p>
        ) : snapSales > 0 ? (
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <span className="font-semibold text-foreground">{snapSales} {snapSales === 1 ? 'sale' : 'sales'}</span> detected
            from your shop totals over the last {snapshotHistory.length} synced days, but we couldn't tie them to
            specific listings (digital / made-to-order listings often keep quantity static). Per-listing velocity
            will populate once we ingest order-level data.
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            No sales detected in snapshot history yet. Velocity tracking will build as nightly syncs accumulate.
          </p>
        )}
      </div>
    )
  }

  const locked = (stats.sample_size ?? 0) < 10
  if (locked) {
    return (
      <div className="rounded-xl border p-4" style={{ background: '#0b1a1a', borderColor: 'rgba(148,163,184,0.15)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Gauge className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <p className="text-sm font-semibold text-foreground">Store velocity</p>
        </div>
        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {orderCounts && orderCounts.total > 0
            ? `${orderCounts.total} Etsy order${orderCounts.total === 1 ? '' : 's'} synced in the last 30 days; ${stats.sample_size} tied to current listing records. `
            : ''}
          Need 10+ sold listings to compute a benchmark — you have {stats.sample_size}.
        </p>
      </div>
    )
  }

  const trend = stats.monthly_trend ?? []
  const trendDirection = (() => {
    if (trend.length < 2) return 'stable'
    const first = trend[0].avg_days
    const last = trend[trend.length - 1].avg_days
    if (last < first * 0.9) return 'improving'
    if (last > first * 1.1) return 'stagnating'
    return 'stable'
  })()

  const stPct = stats.sell_through_90d
  const stPriorPct = stats.sell_through_prior_90d
  const stDelta = stPct != null && stPriorPct != null && stPriorPct > 0
    ? Math.round(((stPct - stPriorPct) / stPriorPct) * 100)
    : null

  const infiniteShare = stats.active_count > 0 ? stats.infinite_count / stats.active_count : 0
  const showInfinite = infiniteShare >= 0.1 && stats.infinite_sales_per_month != null

  const showOptSplit =
    stats.avg_days_optimized != null && stats.avg_days_not_optimized != null

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* Tile 1: Days to sell */}
      <div className="rounded-xl border p-4" style={{ background: 'hsl(var(--surface-1))', borderColor: 'hsl(var(--primary) / 0.20)' }}>
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Store avg days to sell</p>
          {computing && <Loader2 className="h-3 w-3 animate-spin" style={{ color: 'hsl(var(--primary))' }} />}
        </div>
        <p className="mt-1 text-3xl font-bold text-foreground">
          {Math.round(stats.avg_days_to_sell ?? 0)}<span className="text-base font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}> days avg</span>
        </p>

        {showOptSplit && (
          <p className="mt-1 text-xs" style={{ color: 'hsl(var(--foreground))' }}>
            Optimized: <span className="font-semibold text-foreground">{Math.round(stats.avg_days_optimized!)}d</span>
            <span className="mx-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>·</span>
            Not optimized: <span className="font-semibold text-foreground">{Math.round(stats.avg_days_not_optimized!)}d</span>
          </p>
        )}

        <div className="mt-2 flex items-center gap-2 text-xs">
          {trendDirection === 'improving' && <><TrendingDown className="h-3 w-3" style={{ color: '#10b981' }} /><span style={{ color: '#10b981' }}>Improving over 6 months</span></>}
          {trendDirection === 'stagnating' && <><TrendingUp className="h-3 w-3" style={{ color: '#f59e0b' }} /><span style={{ color: '#f59e0b' }}>Stagnating over 6 months</span></>}
          {trendDirection === 'stable' && <><Minus className="h-3 w-3" style={{ color: 'hsl(var(--muted-foreground))' }} /><span style={{ color: 'hsl(var(--muted-foreground))' }}>Stable over 6 months</span></>}
        </div>

        {stats.p20_days_to_sell != null && (
          <p className="mt-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Your fastest 20% sold in under <span className="font-semibold text-foreground">{Math.round(stats.p20_days_to_sell)} days</span>
          </p>
        )}

        {showInfinite && (
          <p className="mt-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Digital / made-to-order items: <span className="font-semibold text-foreground">{stats.infinite_sales_per_month} sales/month avg</span>
          </p>
        )}
      </div>

      {/* Tile 2: Sell-through */}
      <div className="rounded-xl border p-4" style={{ background: 'hsl(var(--surface-1))', borderColor: 'hsl(var(--primary) / 0.20)' }}>
        <p className="text-xs uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Sell-through (90 days)</p>
        <p className="mt-1 text-3xl font-bold text-foreground">
          {stPct ?? 0}<span className="text-base font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>%</span>
        </p>
        <p className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
          {stats.sold_last_90d} of {stats.active_count} active listings sold
        </p>
        {stDelta != null && (
          <p className="mt-2 text-xs flex items-center gap-1">
            {stDelta > 0
              ? <><TrendingUp className="h-3 w-3" style={{ color: '#10b981' }} /><span style={{ color: '#10b981' }}>Up from {stPriorPct}% — {stDelta}% improvement</span></>
              : stDelta < 0
                ? <><TrendingDown className="h-3 w-3" style={{ color: '#ef4444' }} /><span style={{ color: '#ef4444' }}>Down from {stPriorPct}% — {Math.abs(stDelta)}% drop</span></>
                : <><Minus className="h-3 w-3" style={{ color: 'hsl(var(--muted-foreground))' }} /><span style={{ color: 'hsl(var(--muted-foreground))' }}>No change vs prior 90 days</span></>}
          </p>
        )}
      </div>
    </div>
  )
}
