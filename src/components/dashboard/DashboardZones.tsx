/**
 * Dashboard three-zone living system:
 *  Zone 1 — TodaysPulse:   what changed in the last 24h
 *  Zone 2 — BiggestLevers: ranked, deep-linked action cards
 *  Zone 3 — ShopAtAGlance: reference data (sales / stats)
 *
 * Each zone reads only fields that actually exist on shop_snapshots /
 * listing_renewal_summary / dashboardRows. Cards/pills self-hide when the
 * underlying value is missing or zero — we never surface a stat that
 * undermines trust in the data.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  RefreshCw, TrendingUp, TrendingDown, Minus, ArrowRight,
  Tag as TagIcon, Type, Sparkles, Coins, ShoppingBag, Star, AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { SnapshotDeltaList } from './SnapshotDeltaList'
import { RecentOrdersList } from './RecentOrdersList'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { useListingFlags } from '@/hooks/useListingFlags'
import { isHidden, isMonitoring } from '@/lib/listingFlags'
import type { DashboardListingRow } from '@/types'
import type { ShopSnapshotPoint } from '@/contexts/AppContext'
import { format } from 'date-fns'

// ───────────────────────────────────────────────────────────────────────────
// Shared bits
// ───────────────────────────────────────────────────────────────────────────

const TEAL = 'hsl(var(--primary))'

function Pill({
  label, value, delta, deltaSuffix = '', onClick,
}: {
  label: string
  value: string
  delta?: { value: number; positiveIsGood?: boolean } | null
  deltaSuffix?: string
  onClick?: () => void
}) {
  const positiveIsGood = delta?.positiveIsGood ?? true
  const good = delta ? (delta.value > 0 ? positiveIsGood : delta.value < 0 ? !positiveIsGood : null) : null
  const color = good === null ? 'hsl(var(--muted-foreground))' : good ? '#16a34a' : '#dc2626'
  const Icon = !delta || delta.value === 0 ? Minus : delta.value > 0 ? TrendingUp : TrendingDown

  const inner = (
    <div className="flex flex-col items-center gap-1 text-center w-full">
      <p
        className="text-[10px] uppercase tracking-wide font-medium truncate w-full text-muted-foreground"
        style={{ lineHeight: '1.1' }}
      >
        {label}
      </p>
      <div className="flex items-baseline justify-center gap-1.5 flex-wrap">
        <p className="text-base font-bold text-foreground leading-none" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
          {value}
        </p>
        {delta ? (
          <span className="text-[10px] flex items-center gap-0.5 leading-none" style={{ color }}>
            <Icon className="h-3 w-3" />
            {delta.value === 0 ? '0' : `${delta.value > 0 ? '+' : ''}${delta.value}${deltaSuffix}`}
          </span>
        ) : null}
      </div>
    </div>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="relative rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-2 transition-all hover:bg-primary/10 active:scale-95 min-w-0 flex items-center justify-center cursor-pointer"
      >
        {inner}
        <ArrowRight className="absolute top-1 right-1 h-2.5 w-2.5 text-primary/60" />
      </button>
    )
  }
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 min-w-0 flex items-center justify-center">
      {inner}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// ZONE 1 — Today's Pulse
// ───────────────────────────────────────────────────────────────────────────

interface TodaysPulseProps {
  snapshotHistory: ShopSnapshotPoint[]
  lastSyncedAt: string | null
  /** Real delta from store_health_history (last two rows). null until 2+ snapshots exist. */
  confirmedDelta: number | null
  /** Count of fix_lifecycle 'applied' rows since the last history snapshot. */
  pendingFixCount: number
  /** True when at least one history row exists — used to differentiate "tracking starting" vs "no data yet". */
  hasAnyHistory: boolean
}

export function TodaysPulse({ snapshotHistory, lastSyncedAt, confirmedDelta, pendingFixCount, hasAnyHistory }: TodaysPulseProps) {
  const { user } = useAuth()
  // snapshotHistory is oldest→newest. Need last two to compute deltas.
  const latest = snapshotHistory.length > 0 ? snapshotHistory[snapshotHistory.length - 1] : null
  const prior = snapshotHistory.length > 1 ? snapshotHistory[snapshotHistory.length - 2] : null

  // Show views/favorites whenever the latest snapshot has data.
  // Delta is the change since the prior snapshot; may be null if there's only one snapshot.
  const viewsAvail = !!(latest && latest.total_views > 0)
  const favsAvail = !!(latest && latest.total_favorites > 0)
  const viewsDelta = (latest && prior) ? latest.total_views - prior.total_views : null
  const favsDelta = (latest && prior) ? latest.total_favorites - prior.total_favorites : null

  const [drillDown, setDrillDown] = useState<null | 'views' | 'favorites' | 'orders'>(null)

  const pills: React.ReactNode[] = []

  if (viewsAvail) {
    const todayViews = viewsDelta !== null ? viewsDelta : null
    pills.push(
      <Pill key="views" label="Views today"
        value={todayViews !== null ? `${todayViews >= 0 ? '+' : ''}${todayViews.toLocaleString()}` : '—'}
        onClick={() => setDrillDown('views')} />
    )
  }

  if (favsAvail) {
    const todayFavs = favsDelta !== null ? favsDelta : null
    pills.push(
      <Pill key="favs" label="Favorites today"
        value={todayFavs !== null ? `${todayFavs >= 0 ? '+' : ''}${todayFavs.toLocaleString()}` : '—'}
        onClick={() => setDrillDown('favorites')} />
    )
  }

  // Orders (30d) — from snapshot, hide if 0.
  if (latest && latest.orders_30d > 0) {
    pills.push(
      <Pill key="orders" label="Orders (30d)" value={latest.orders_30d.toLocaleString()}
        onClick={() => setDrillDown('orders')} />
    )
  }

  // Revenue (30d) — hide if 0.
  if (latest && latest.revenue_30d > 0) {
    pills.push(
      <Pill key="rev" label="Revenue (30d)" value={formatCurrency(latest.revenue_30d)} />
    )
  }

  // Score change — backed by store_health_history. Never shows a bare "—".
  if (confirmedDelta !== null) {
    const rounded = Number(confirmedDelta.toFixed(1))
    const display = rounded === 0 ? '0.0' : `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`
    pills.push(
      <Pill
        key="score"
        label="Score Change"
        value={display}
        delta={rounded === 0 ? null : { value: rounded }}
        deltaSuffix=" pts"
      />
    )
  } else if (hasAnyHistory) {
    // Exactly one snapshot exists — friendlier than a bare dash.
    pills.push(
      <div
        key="score-pending"
        className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 min-w-0 flex flex-col items-center gap-1 text-center"
      >
        <p className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground" style={{ lineHeight: '1.1' }}>
          Score Change
        </p>
        <p className="text-[10px] leading-tight text-muted-foreground">
          Collecting data
        </p>
      </div>
    )
  }

  // Optimistic pending delta from fix_lifecycle rows not yet folded into history.
  if (pendingFixCount > 0) {
    pills.push(
      <div
        key="pending"
        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 min-w-0 flex flex-col items-center gap-1 text-center"
      >
        <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
        <span className="text-[11px] text-emerald-700 font-medium">
          +{pendingFixCount} pending
        </span>
      </div>
    )
  }

  // Last sync
  if (lastSyncedAt) {
    pills.push(
      <div
        key="sync"
        className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2 flex flex-col items-center gap-1 text-center min-w-0"
      >
        <RefreshCw className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}
        </span>
      </div>
    )
  }

  if (pills.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap justify-center gap-2">
        {pills.map((p, i) => (
          <div key={i} className="w-[130px] sm:w-[140px] [&>*]:w-full">{p}</div>
        ))}
      </div>
      <Dialog open={drillDown !== null} onOpenChange={(o) => { if (!o) setDrillDown(null) }}>
        <DialogContent className="max-w-md bg-surface-1 border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {drillDown === 'views'
                ? 'Views by listing'
                : drillDown === 'favorites'
                ? 'Favorites by listing'
                : 'Recent orders — last 30 days'}
            </DialogTitle>
          </DialogHeader>
          {drillDown === 'orders' ? (
            <RecentOrdersList userId={user?.id} expectedOrderCount={latest?.orders_30d ?? 0} onNavigate={() => setDrillDown(null)} />
          ) : drillDown ? (
            <SnapshotDeltaList userId={user?.id} metric={drillDown} onNavigate={() => setDrillDown(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// ZONE 2 — Your Biggest Levers
// ───────────────────────────────────────────────────────────────────────────

interface LeverCard {
  key: string
  impactRank: number
  impactLabel: 'HIGH IMPACT' | 'MEDIUM IMPACT'
  impactColor: string
  icon: React.ElementType
  headline: string
  body: string
  note?: string
  affectedCount: number
  cta: string
  onClick: () => void
}

interface StaleRow {
  etsy_listing_id: string
  total_renewals: number
  total_renewal_cost_usd: number
  estimated_stale_score: number
  is_unique_item: boolean
  current_state: string
}

export function BiggestLevers({ rows }: { rows: DashboardListingRow[] }) {
  const navigate = useNavigate()
  const { connectedStore } = useApp()
  const { flagsByListingId } = useListingFlags()
  const [showAll, setShowAll] = useState(false)
  const [staleRenewal, setStaleRenewal] = useState<{
    count: number; spend: number; avgRenewals: number; listingIds: string[];
  } | null>(null)

  const etsyShopId = connectedStore?.shop_id ?? null

  useEffect(() => {
    if (!etsyShopId) { setStaleRenewal(null); return }
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('listing_renewal_summary')
        .select('etsy_listing_id, total_renewals, total_renewal_cost_usd, is_unique_item, current_state, estimated_stale_score')
        .eq('etsy_shop_id', etsyShopId)
      if (cancelled || !data) return
      const stale = (data as StaleRow[]).filter(
        r => r.is_unique_item && r.current_state === 'active' && r.estimated_stale_score >= 60,
      )
      if (stale.length === 0) { setStaleRenewal({ count: 0, spend: 0, avgRenewals: 0, listingIds: [] }); return }
      const spend = stale.reduce((s, r) => s + Number(r.total_renewal_cost_usd ?? 0), 0)
      const avgRenewals = Math.round(stale.reduce((s, r) => s + Number(r.total_renewals ?? 0), 0) / stale.length)
      // Map etsy_listing_id → internal listing id (for filter navigation).
      const { data: listingRows } = await supabase
        .from('listings')
        .select('id, etsy_listing_id')
        .in('etsy_listing_id', stale.map(r => r.etsy_listing_id))
      const listingIds = ((listingRows ?? []) as Array<{ id: string }>).map(l => l.id)
      if (!cancelled) setStaleRenewal({ count: stale.length, spend, avgRenewals, listingIds })
    })()
    return () => { cancelled = true }
  }, [etsyShopId])

  // Hide listings the user has snoozed/deferred/confirmed; keep monitoring
  // listings around so we can re-label them rather than nag.
  const active = useMemo(
    () => rows.filter(r => r.state === 'active' && !isHidden(flagsByListingId.get(r.id))),
    [rows, flagsByListingId],
  )

  const levers: LeverCard[] = useMemo(() => {
    const out: LeverCard[] = []
    const notMonitoring = (id: string) => !isMonitoring(flagsByListingId.get(id))

    // Lever 1 — Tags (exclude monitoring listings — user already acted)
    const tagsShort = active.filter(l => (l.tags?.length ?? 0) < 13 && notMonitoring(l.id))
    if (tagsShort.length > 0) {
      const avgTags = Math.round(active.reduce((s, l) => s + (l.tags?.length ?? 0), 0) / Math.max(active.length, 1))
      
      out.push({
        key: 'tags',
        impactRank: tagsShort.length * 3,
        impactLabel: 'HIGH IMPACT',
        impactColor: '#ef4444',
        icon: TagIcon,
        headline: `${tagsShort.length} listing${tagsShort.length === 1 ? '' : 's'} not using all 13 tags`,
        body: `Each empty tag slot is a missed Etsy search match. Shop average is ${avgTags}/13.`,
        affectedCount: tagsShort.length,
        cta: 'Fix tags',
        onClick: () => navigate('/app/actions?dimension=tags'),
      })
    }

    // Lever 2 — Titles (exclude monitoring)
    const shortTitles = active.filter(l => (l.title?.length ?? 0) < 80 && notMonitoring(l.id))
    if (shortTitles.length > 0) {
      const avgLen = Math.round(active.reduce((s, l) => s + (l.title?.length ?? 0), 0) / Math.max(active.length, 1))
      
      out.push({
        key: 'titles',
        impactRank: shortTitles.length * 2,
        impactLabel: 'HIGH IMPACT',
        impactColor: '#ef4444',
        icon: Type,
        headline: `${shortTitles.length} listing${shortTitles.length === 1 ? '' : 's'} with short titles`,
        body: `Your titles average ${avgLen} characters. Titles over 80 characters rank measurably better on Etsy.`,
        affectedCount: shortTitles.length,
        cta: 'Lengthen titles',
        onClick: () => navigate('/app/actions?dimension=title'),
      })
    }

    // Lever 3 — Never optimized (monitoring listings have been optimized — exclude)
    const never = active.filter(l => (l.optimization_count ?? 0) === 0 && notMonitoring(l.id))
    if (never.length > 0) {
      out.push({
        key: 'never',
        impactRank: never.length * 2.5,
        impactLabel: 'HIGH IMPACT',
        impactColor: '#ef4444',
        icon: Sparkles,
        headline: `${never.length} listing${never.length === 1 ? '' : 's'} never optimized`,
        body: 'These have the most to gain. AI rewrites typically lift grades by 30–50 pts.',
        affectedCount: never.length,
        cta: 'Start optimizing',
        onClick: () => navigate('/app/actions'),
      })
    }

    // Lever 4 — Renewal waste. Renewal spend is real ongoing money regardless
    // of optimization status, so monitoring listings stay on this list — we
    // just annotate how many are already being measured.
    if (staleRenewal && staleRenewal.count > 0) {
      const monitoringRows = staleRenewal.listingIds
        .map(id => isMonitoring(flagsByListingId.get(id)))
        .filter((m): m is NonNullable<typeof m> => !!m)
      const monitoringCount = monitoringRows.length
      const earliestEnd = monitoringRows
        .map(m => m.measurement_window_end)
        .filter((d): d is string => !!d)
        .sort()[0]
      let note: string | undefined
      if (monitoringCount > 0) {
        note = `${monitoringCount} already optimized — monitoring${earliestEnd ? ` · results by ${format(new Date(earliestEnd), 'MMM d')}` : ''}`
      }
      out.push({
        key: 'renewals',
        impactRank: staleRenewal.spend,
        impactLabel: 'MEDIUM IMPACT',
        impactColor: '#f59e0b',
        icon: Coins,
        headline: `$${staleRenewal.spend.toFixed(2)} spent renewing ${staleRenewal.count} listing${staleRenewal.count === 1 ? '' : 's'} that aren't selling`,
        body: `These items have renewed ${staleRenewal.avgRenewals}× on average without a sale. Each renewal is a sunk cost on a listing that may need a different approach.`,
        note,
        affectedCount: staleRenewal.count,
        cta: 'Review these listings',
        onClick: () => navigate('/app/actions'),
      })
    }

    // Sort high impact first, then by rank
    return out.sort((a, b) => {
      if (a.impactLabel !== b.impactLabel) return a.impactLabel === 'HIGH IMPACT' ? -1 : 1
      return b.impactRank - a.impactRank
    }).slice(0, 4)
  }, [active, navigate, staleRenewal, flagsByListingId])

  if (levers.length === 0) return null

  const visibleLevers = showAll ? levers : levers.slice(0, 2)
  const hiddenCount = levers.length - visibleLevers.length

  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider mb-3 text-muted-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
        Your Biggest Levers
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        {visibleLevers.map(l => {
          const Icon = l.icon
          return (
            <div
              key={l.key}
              className="rounded-xl border border-border bg-surface-1 p-4 flex flex-col gap-3 shadow-warm-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ background: `${l.impactColor}1a`, border: `1px solid ${l.impactColor}40` }}>
                    <Icon className="h-4 w-4" style={{ color: l.impactColor }} />
                  </div>
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                    style={{ background: `${l.impactColor}1a`, color: l.impactColor }}
                  >
                    {l.impactLabel}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-sm font-bold text-foreground leading-snug" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                  {l.headline}
                </p>
                <p className="text-xs mt-1.5 leading-relaxed text-muted-foreground">{l.body}</p>
                {l.note && (
                  <p className="mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/15 text-[hsl(var(--primary))]">
                    {l.note}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-xs font-medium" style={{ color: TEAL }}>
                  Affects {l.affectedCount} listing{l.affectedCount === 1 ? '' : 's'}
                </span>
                <Button
                  size="sm"
                  onClick={l.onClick}
                  className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {l.cta} <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 text-xs font-semibold transition-opacity hover:opacity-80 text-primary"
        >
          See all {levers.length} opportunities →
        </button>
      )}
      {showAll && levers.length > 2 && (
        <button
          onClick={() => setShowAll(false)}
          className="mt-3 text-xs font-medium transition-opacity hover:opacity-80 text-muted-foreground"
        >
          Show less
        </button>
      )}
    </section>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// ZONE 3 — Recent Sales (snapshot-only, 30d)
// ───────────────────────────────────────────────────────────────────────────

interface RecentSalesProps {
  snapshot: {
    orders_30d: number; revenue_30d: number; total_sales: number;
  } | null
}

export function RecentSales30d({ snapshot }: RecentSalesProps) {
  const navigate = useNavigate()
  const orders = snapshot?.orders_30d ?? 0
  const revenue = Number(snapshot?.revenue_30d ?? 0)
  const lifetime = snapshot?.total_sales ?? 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
          <ShoppingBag className="h-4 w-4" />
          Recent Sales · Last 30 days
        </CardTitle>
      </CardHeader>
      <CardContent>
        {orders === 0 ? (
          <div className="py-2">
            <p className="text-sm text-foreground font-medium">No sales in this window.</p>
            <p className="text-xs mt-1 text-muted-foreground">
              Your listings are being seen — keep optimizing.
            </p>
            <Button
              variant="outline" size="sm" className="mt-3 gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
              onClick={() => navigate('/app/listings')}
            >
              View your listings <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Orders</div>
              <div className="text-base font-bold text-foreground">{orders.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Revenue</div>
              <div className="text-base font-bold text-foreground">{formatCurrency(revenue)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Lifetime sales</div>
              <div className="text-base font-bold text-foreground">{lifetime.toLocaleString()}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// ZONE 3 — Shop Stats (compact, snapshot-aware)
// ───────────────────────────────────────────────────────────────────────────

export function ShopStatsBlock() {
  const { syncStats } = useApp()
  const oldestDays = syncStats.oldestListingAt
    ? Math.round((Date.now() - new Date(syncStats.oldestListingAt).getTime()) / 86400000)
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground">Shop at a Glance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
          {syncStats.shopRating !== null && (
            <div>
              <div className="text-xs text-muted-foreground">Shop rating</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span className="text-base font-bold text-foreground">{syncStats.shopRating.toFixed(2)}</span>
                <span className="text-xs text-muted-foreground">({syncStats.reviewCount})</span>
              </div>
            </div>
          )}
          {oldestDays !== null && (
            <div>
              <div className="text-xs text-muted-foreground">Oldest active</div>
              <div className="text-base font-bold text-foreground mt-0.5">{oldestDays}d</div>
            </div>
          )}
          {syncStats.avgPrice !== null && (
            <div>
              <div className="text-xs text-muted-foreground">Avg price</div>
              <div className="text-base font-bold text-foreground mt-0.5">
                {formatCurrency(syncStats.avgPrice)}
                {syncStats.minPrice !== null && syncStats.maxPrice !== null && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    ({formatCurrency(syncStats.minPrice)}–{formatCurrency(syncStats.maxPrice)})
                  </span>
                )}
              </div>
            </div>
          )}
          <div>
            <div className="text-xs text-muted-foreground">Listings indexed</div>
            <div className="text-base font-bold text-foreground mt-0.5">{syncStats.listingCount.toLocaleString()}</div>
          </div>
          {syncStats.media.fullPhotos > 0 && (
            <div className="col-span-2">
              <div className="text-xs text-muted-foreground">Full-photo listings</div>
              <div className="text-base font-bold text-foreground mt-0.5">
                {syncStats.media.fullPhotos} / {syncStats.listingCount}
                {syncStats.media.missingPhotos > 0 && (
                  <span className="text-xs font-normal ml-2 text-amber-600">
                    <AlertTriangle className="inline h-3 w-3 mr-0.5" />
                    {syncStats.media.missingPhotos} with no photos
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
