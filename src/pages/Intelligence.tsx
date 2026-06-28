﻿// Performance Intelligence Hub — daily-snapshot-driven, tabbed personal briefing.
// Also the app's landing page: merges in the dashboard's Score / Comparison /
// Trend cards above the standard KPI grid.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sparkles, TrendingUp, TrendingDown, AlertTriangle, ShoppingBag,
  Heart, Eye, Star, RefreshCw, ChevronRight, Users, Tag, HelpCircle, X, DollarSign,
} from 'lucide-react'

import {
  LineChart, Line, ResponsiveContainer, Tooltip as RTooltip,
  AreaChart, Area, XAxis, YAxis, BarChart, Bar, Cell,
} from 'recharts'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useApp } from '@/contexts/AppContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { RecentTractionFeed } from '@/components/dashboard/RecentTractionFeed'
import { GradeChart } from '@/components/dashboard/GradeChart'
import { SalesChart } from '@/components/dashboard/SalesChart'
import { InsightCard } from '@/components/market/InsightCard'
import { useDismissedAlerts } from '@/hooks/useDismissedAlerts'
import { PerformanceComparison } from '@/components/dashboard/PerformanceComparison'
import { ScoreTrendMini } from '@/components/dashboard/ScoreTrendMini'
import { ScoreClimbBanner } from '@/components/dashboard/ScoreClimbBanner'
import { ScoreHeroPanel } from '@/components/intelligence/ScoreHeroPanel'
import { ScoreFactorRows } from '@/components/intelligence/ScoreFactorRows'
import { TopImpactActions } from '@/components/intelligence/TopImpactActions'
import { useStoreHealthHistory, usePendingFixCountSince } from '@/hooks/useStoreHealthHistory'
import { computeStoreHealthScore } from '@/lib/healthScore'
import { detectShopType } from '@/lib/shopType'
import { SanityCheckPanel } from '@/components/intelligence/SanityCheckPanel'

// â"€â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
interface ListingSnap {
  listing_id: string
  recorded_on: string
  views: number
  favorites: number
  quantity: number
}
interface ShopSnap {
  recorded_on: string
  total_views: number
  total_favorites: number
  shop_followers: number
  total_sales: number
  active_count: number
  sold_out_count: number
  expiring_soon_count: number
  review_count: number
  avg_rating: number | null
  orders_30d: number
  revenue_30d: number
}

interface ReviewRow {
  id: string
  rating: number
  review_text: string | null
  listing_id: string | null
  etsy_created_at: string | null
}
interface ListingLite {
  id: string
  title: string
  thumbnail_url: string | null
  views: number
  favorites: number
  price: number | null
  ending_at: string | null
  score: number | null
  tags: string[] | null
}

// â"€â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const TEAL = 'hsl(var(--primary))'

function fmtNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(Math.round(n))
}
function fmtMoney(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`
}
function fmtAgo(iso: string | null): string {
  if (!iso) return '—'
  const days = (Date.now() - new Date(iso).getTime()) / 86400000
  if (days < 1) return 'today'
  if (days < 2) return 'yesterday'
  if (days < 30) return `${Math.round(days)}d ago`
  if (days < 365) return `${Math.round(days / 30)}mo ago`
  return `${Math.round(days / 365)}y ago`
}

function delta(curr: number, prev: number): { pct: number; up: boolean | null } {
  // Insufficient baseline: no prior data to compare against. Don't fabricate +100%.
  if (prev === 0) return { pct: 0, up: null }
  const d = ((curr - prev) / prev) * 100
  return { pct: Math.abs(d), up: d === 0 ? null : d > 0 }
}


function RadarStatus({ snapshotting, lastRecordedOn }: { snapshotting: boolean; lastRecordedOn: string | null }) {
  const color = snapshotting ? '#fbbf24' : '#34d399'
  const label = snapshotting
    ? 'Radar scanning Etsy…'
    : lastRecordedOn
      ? `Live Â· last sync ${fmtAgo(lastRecordedOn)}`
      : 'Radar idle'
  // Faster, brighter pulse while a sync is in flight — doubles as the global
  // "data is updating right now" indicator across every Intelligence tab.
  const pingClass = snapshotting ? 'animate-radar-ping-fast' : 'animate-radar-ping'
  const glow = snapshotting ? `0 0 10px ${color}, 0 0 18px ${color}99` : `0 0 6px ${color}`
  return (
    <div
      className="hidden sm:flex items-center gap-1.5 rounded-full px-2.5 py-1 border"
      style={{ borderColor: color + (snapshotting ? '99' : '55'), background: color + (snapshotting ? '22' : '15') }}
    >
      <span className="relative flex h-2 w-2">
        <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 motion-reduce:hidden', pingClass)} style={{ background: color }} />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color, boxShadow: glow }} />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
    </div>
  )
}

function KpiCard({

  label, value, deltaLabel, up, series, color = TEAL, icon: Icon, snapshotting,
}: {
  label: string; value: string; deltaLabel?: string; up?: boolean | null;
  series: { x: string; y: number }[]; color?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  snapshotting?: boolean;
}) {
  const trendColor = up == null ? '#64748b' : up ? '#34d399' : '#f87171'
  // Pulse when value changes (after first render) so the user can tell the
  // radar just refreshed this metric. Stays visible long enough to notice,
  // then fades out gently rather than snapping away.
  const prevRef = useRef<string | undefined>(undefined)
  const [updateState, setUpdateState] = useState<'idle' | 'pulse' | 'fading'>('idle')
  useEffect(() => {
    if (prevRef.current === undefined) { prevRef.current = value; return }
    if (prevRef.current !== value) {
      prevRef.current = value
      setUpdateState('pulse')
      const t1 = setTimeout(() => setUpdateState('fading'), 5000)
      const t2 = setTimeout(() => setUpdateState('idle'), 7000)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [value])
  const showBadge = updateState !== 'idle'
  const highlight = updateState === 'pulse'

  return (
    <div
      className={cn('relative rounded-[var(--radius-lg)] border bg-card p-4 transition-all duration-500', highlight && 'animate-kpi-pulse')}
      style={{
        borderColor: highlight ? color : undefined,
        boxShadow: highlight ? `0 0 0 1px ${color}66, 0 6px 28px ${color}33` : 'none',
      }}
    >
      {showBadge && (
        <div
          className="absolute bottom-1.5 right-2 flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-opacity duration-[2000ms] pointer-events-none z-10"
          style={{
            background: 'hsl(var(--card))',
            border: `1px solid ${color}66`,
            opacity: updateState === 'fading' ? 0 : 1,
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color }}>Updated</span>
        </div>
      )}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" style={{ color }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        {deltaLabel && (
          <span className="text-[10px] font-bold flex items-center gap-0.5" style={{ color: trendColor }}>
            {up == null ? '—' : up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {deltaLabel}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <div className="h-10 mt-1 -mx-1">
        {series.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="y" stroke={color} strokeWidth={1.5} fill={`url(#g-${label})`} baseValue="dataMin" isAnimationActive={false} />
              <YAxis hide domain={['dataMin', 'dataMax']} />

            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
            {snapshotting ? (
              <>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-radar-ping" style={{ background: color }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                </span>
                <span className="italic">Scanning Etsy…</span>
              </>
            ) : (
              <span className="italic">
                {series.length === 1 ? 'Take another snapshot to start a trend' : 'No data yet'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


// â"€â"€â"€ Main page â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export default function Intelligence() {
  const { user } = useAuth()
  const {
    listings: appListings, dashboardStats, connectedStore,
    dashboardRows, syncStats,
  } = useApp()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Persist the active tab to the URL (?tab=alerts) so browser back/forward
  // restores the tab the user was on instead of snapping back to "overview".
  const [searchParams, setSearchParams] = useSearchParams()
  const VALID_TABS = ['overview', 'listings', 'competitors', 'customers', 'trends', 'activity', 'alerts']
  const urlTab = searchParams.get('tab') || ''
  const tab = VALID_TABS.includes(urlTab) ? urlTab : 'overview'
  const setTab = (next: string) => {
    const sp = new URLSearchParams(searchParams)
    if (!next || next === 'overview') sp.delete('tab')
    else sp.set('tab', next)
    setSearchParams(sp, { replace: true })
  }
  const [loading, setLoading] = useState(true)
  const [snapshotting, setSnapshotting] = useState(false)
  const [listingSnaps, setListingSnaps] = useState<ListingSnap[]>([])
  const [shopSnaps, setShopSnaps] = useState<ShopSnap[]>([])
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [listings, setListings] = useState<ListingLite[]>([])
  const [vacationPeriods, setVacationPeriods] = useState<Array<{ started_on: string; ended_on: string | null }>>([])
  const [needsAnswers, setNeedsAnswers] = useState<Array<{ id: string; title: string; thumbnail_url: string | null; clarifying_questions: string[] }>>([])
  const [lastSnapshotAt, setLastSnapshotAt] = useState<number | null>(null)
  const [, force] = useState(0)
  const { dismissed, dismiss } = useDismissedAlerts(user?.id)
  const [confirmDismiss, setConfirmDismiss] = useState<string | null>(null)

  // â"€â"€ Merged dashboard data: store-health score + history + pending fixes â"€â"€
  const storeHealth = useMemo(() => {
    const shopType = detectShopType(dashboardRows)
    return computeStoreHealthScore(dashboardRows, syncStats.media, syncStats.listingCount, shopType)
  }, [dashboardRows, syncStats])
  const storeHealthScore = dashboardRows.length > 0 ? storeHealth.overall : null
  const { rows: historyRows, delta: confirmedDelta, latest: latestHistory, record: recordHealth } = useStoreHealthHistory()
  const pendingFixCount = usePendingFixCountSince(latestHistory?.recorded_at ?? null)

  // Keep store_health_history accumulating now that Intelligence is the landing page.
  useEffect(() => {
    if (dashboardRows.length === 0) return
    void recordHealth(
      storeHealth.overall,
      storeHealth.overallExact,
      storeHealth.subScores,
      connectedStore?.id ?? null,
    )
  }, [storeHealth.overall, storeHealth.overallExact, dashboardRows.length, connectedStore?.id, recordHealth])

  // historyRows is used by ScoreHeroPanel for the score sparkline

  // Tick once a minute so the cooldown countdown stays current without a refresh.
  useEffect(() => {
    const t = window.setInterval(() => force(n => n + 1), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const cooldownMs = 60 * 60 * 1000
  const cooldownRemaining = lastSnapshotAt ? Math.max(0, cooldownMs - (Date.now() - lastSnapshotAt)) : 0
  const onCooldown = cooldownRemaining > 0
  const cooldownMinutesLeft = Math.ceil(cooldownRemaining / 60000)


  useEffect(() => { void loadAll() }, [user?.id])

  async function loadLastSnapshotTimestamp() {
    if (!user?.id) return
    const { data } = await supabase
      .from('listing_snapshots')
      .select('created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const ts = (data as { created_at?: string } | null)?.created_at
    setLastSnapshotAt(ts ? new Date(ts).getTime() : null)
  }

  async function loadAll(opts: { skipAutoSnapshot?: boolean } = {}) {
    if (!user?.id) return
    setLoading(true)
    const sinceDate = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    const [ls, ss, rv, lst, na] = await Promise.all([
      supabase.from('listing_snapshots').select('listing_id, recorded_on, views, favorites, quantity')
        .eq('user_id', user.id).gte('recorded_on', sinceDate).order('recorded_on', { ascending: true }),
      supabase.from('shop_snapshots').select('*').eq('user_id', user.id)
        .gte('recorded_on', sinceDate).order('recorded_on', { ascending: true }),
      supabase.from('shop_reviews').select('id, rating, review_text, listing_id, etsy_created_at')
        .eq('user_id', user.id).order('etsy_created_at', { ascending: false }).limit(200),
      supabase.from('listings').select('id, title, thumbnail_url, views, favorites, price, ending_at, score, tags')
        .eq('user_id', user.id),
      supabase.from('listings').select('id, title, thumbnail_url, clarifying_questions')
        .eq('user_id', user.id).not('clarifying_questions', 'is', null).limit(20),
    ])
    setListingSnaps((ls.data ?? []) as ListingSnap[])
    setShopSnaps((ss.data ?? []) as ShopSnap[])
    setReviews((rv.data ?? []) as ReviewRow[])
    setListings((lst.data ?? []) as ListingLite[])
    const naRows = ((na.data ?? []) as Array<{ id: string; title: string; thumbnail_url: string | null; clarifying_questions: string[] | null }>)
      .filter(r => Array.isArray(r.clarifying_questions) && r.clarifying_questions.length > 0)
      .map(r => ({ id: r.id, title: r.title, thumbnail_url: r.thumbnail_url, clarifying_questions: r.clarifying_questions as string[] }))
    setNeedsAnswers(naRows)
    setLoading(false)

    void loadLastSnapshotTimestamp()
    void loadVacationPeriods()

    // Auto-snapshot on first visit if the user has listings but no shop_snapshots yet.
    if (!opts.skipAutoSnapshot && (ss.data?.length ?? 0) === 0 && (lst.data?.length ?? 0) > 0) {
      void autoSnapshot()
    }
  }

  async function loadVacationPeriods() {
    const shopId = connectedStore?.shop_id
    if (!shopId) { setVacationPeriods([]); return }
    const { data } = await supabase
      .from('shop_vacation_periods')
      .select('started_on, ended_on')
      .eq('etsy_shop_id', String(shopId))
      .order('started_on', { ascending: true })
    setVacationPeriods((data ?? []) as Array<{ started_on: string; ended_on: string | null }>)
  }

  async function autoSnapshot() {
    setSnapshotting(true)
    try {
      const { error } = await supabase.functions.invoke('snapshot-performance', { body: {} })
      if (error) throw error
      await loadAll({ skipAutoSnapshot: true })
    } catch (e) {
      console.error('auto-snapshot failed', e)
    } finally {
      setSnapshotting(false)
    }
  }


  async function runSnapshotNow() {
    if (onCooldown) {
      toast({ title: 'Snapshot taken recently', description: `Available again in ${cooldownMinutesLeft} minute${cooldownMinutesLeft === 1 ? '' : 's'}.` })
      return
    }
    setSnapshotting(true)
    try {
      const { error } = await supabase.functions.invoke('snapshot-performance', { body: {} })
      if (error) throw error
      setLastSnapshotAt(Date.now())
      toast({ title: 'Snapshot saved', description: 'Pull down to see updated listing activity.' })
      await loadAll({ skipAutoSnapshot: true })
    } catch (e) {
      toast({ title: 'Snapshot failed', description: String(e), variant: 'destructive' })
    } finally {
      setSnapshotting(false)
    }
  }

  // â"€â"€â"€ Derived metrics â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const derived = useMemo(() => deriveBriefing(shopSnaps, listingSnaps, listings, reviews, vacationPeriods), [shopSnaps, listingSnaps, listings, reviews, vacationPeriods])

  const firstName = user?.full_name?.split(' ')[0] ?? user?.username?.split(' ')[0] ?? 'there'
  const hasAnySnapshots = shopSnaps.length > 0 || listingSnaps.length > 0

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Intelligence"
        description="Your shop's performance, briefed daily"
        actions={
          <div className="flex items-center gap-2">
            <RadarStatus snapshotting={snapshotting} lastRecordedOn={shopSnaps[shopSnaps.length - 1]?.recorded_on ?? null} />
            <Button
              size="sm"
              variant="outline"
              onClick={runSnapshotNow}
              disabled={snapshotting || onCooldown}
              title={onCooldown ? `Snapshot taken recently — available again in ${cooldownMinutesLeft} minute${cooldownMinutesLeft === 1 ? '' : 's'}` : undefined}
            >
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', snapshotting && 'animate-spin')} />
              {snapshotting ? 'Recording…' : onCooldown ? `Cooldown Â· ${cooldownMinutesLeft}m` : 'Snapshot now'}
            </Button>
          </div>
        }

      />

      {/* relative + z-0 creates a stacking context below the sticky Header (z-10)
          so scrolling content never bleeds visually above it */}
      <div className="flex-1 p-4 md:p-6 space-y-4 relative" style={{ zIndex: 0 }}>
        {/* Greeting */}
        <div className="rounded-[var(--radius-xl)] border border-primary/15 bg-gradient-to-r from-primary/8 via-surface-1 to-surface-1 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-[var(--radius)] flex items-center justify-center shrink-0 bg-primary/15 border border-primary/25">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm md:text-base font-semibold text-foreground">
                Hi {firstName} — {derived.greeting}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{derived.subline}</p>
            </div>
          </div>
        </div>

        {needsAnswers.length > 0 && (
          <details className="group rounded-[var(--radius-lg)] border border-border bg-card p-4">
            <summary className="flex items-center justify-between cursor-pointer list-none">
              <div className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
                <HelpCircle className="h-4 w-4" style={{ color: TEAL }} />
                <p className="text-sm font-semibold text-white">Listings waiting on your answers</p>
                <Badge variant="outline" className="text-[10px] border-border text-foreground/70">{needsAnswers.length}</Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-foreground/70"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate('/app/listings?needs_answers=1') }}
              >
                View all <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            </summary>
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-3">Quick answers help the AI grade and optimize these listings more accurately.</p>
              <div className="space-y-1.5">
                {needsAnswers.slice(0, 8).map(l => (
                  <button
                    key={l.id}
                    onClick={() => navigate(`/app/listings/${l.id}`)}
                    className="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/5 transition-colors"
                  >
                    <div className="h-8 w-8 shrink-0 rounded overflow-hidden bg-surface-2">
                      {l.thumbnail_url ? <img src={l.thumbnail_url} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <span className="text-xs text-white truncate flex-1">{l.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{l.clarifying_questions.length} {l.clarifying_questions.length === 1 ? 'question' : 'questions'}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </details>
        )}



        {!hasAnySnapshots && !loading && (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-card p-6 text-center">
            <Sparkles className="h-6 w-6 mx-auto mb-2" style={{ color: TEAL }} />
            <p className="text-sm font-semibold text-white">We're gathering your data</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Your first full briefing arrives after a couple of snapshots. Want to start now?</p>
            <Button size="sm" onClick={runSnapshotNow} disabled={snapshotting}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', snapshotting && 'animate-spin')} />
              Take first snapshot
            </Button>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          {/* Single horizontally scrollable tab row — keeps all sections in one
              visual group and prevents the Alerts badge from getting clipped. */}
          <div className="-mx-1 overflow-x-auto no-scrollbar">
            <TabsList variant="line" className="inline-flex w-max gap-0 px-0">
              <TabsTrigger value="overview" className="text-xs whitespace-nowrap">Overview</TabsTrigger>
              <TabsTrigger value="listings" className="text-xs whitespace-nowrap">Listings</TabsTrigger>
              <TabsTrigger value="competitors" className="text-xs whitespace-nowrap">Competitors</TabsTrigger>
              <TabsTrigger value="customers" className="text-xs whitespace-nowrap">Customers</TabsTrigger>
              <TabsTrigger value="trends" className="text-xs whitespace-nowrap">Trends</TabsTrigger>
              <TabsTrigger value="activity" className="text-xs whitespace-nowrap">Activity</TabsTrigger>
              <TabsTrigger value="alerts" className="text-xs whitespace-nowrap flex items-center gap-1">
                Alerts{(() => { const n = derived.alerts.filter(a => !dismissed.has(a.key)).length; return n > 0 ? <Badge className="h-4 px-1 text-[9px]">{n}</Badge> : null })()}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* â"€â"€ Overview â"€â"€ */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {dashboardRows.length > 0 && (
              <ScoreClimbBanner blended={storeHealth.overallExact} pendingFixCount={pendingFixCount} />
            )}
            {dashboardRows.length > 0 && (
              <ScoreHeroPanel
                health={storeHealth}
                confirmedDelta={confirmedDelta}
                historyRows={historyRows}
              />
            )}
            {dashboardRows.length > 0 && (
              <ScoreFactorRows
                health={storeHealth}
                rows={dashboardRows}
                syncStats={syncStats}
              />
            )}
            {dashboardRows.length > 0 && <TopImpactActions />}
            {dashboardRows.length > 0 && <PerformanceComparison rows={dashboardRows} />}
            {dashboardRows.length > 0 && <ScoreTrendMini currentScore={storeHealthScore} />}

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard label="Total Views" value={fmtNum(derived.kpis.views.curr)}
                deltaLabel={`${derived.kpis.views.deltaPct}%`} up={derived.kpis.views.up}
                series={derived.kpis.views.series} icon={Eye} snapshotting={snapshotting} />
              <KpiCard label="Total Favorites" value={fmtNum(derived.kpis.favs.curr)}
                deltaLabel={`${derived.kpis.favs.deltaPct}%`} up={derived.kpis.favs.up}
                series={derived.kpis.favs.series} color="#f472b6" icon={Heart} snapshotting={snapshotting} />
              <KpiCard label="Orders (30d)" value={fmtNum(derived.kpis.orders.curr)}
                deltaLabel={`${derived.kpis.orders.deltaPct}%`} up={derived.kpis.orders.up}
                series={derived.kpis.orders.series} color="#34d399" icon={ShoppingBag} snapshotting={snapshotting} />
              <KpiCard label="Revenue (30d)" value={fmtMoney(derived.kpis.revenue30d)}
                deltaLabel={`${derived.kpis.revenue.deltaPct}%`} up={derived.kpis.revenue.up}
                series={derived.kpis.revenue.series} color="#22d3ee" icon={DollarSign} snapshotting={snapshotting} />
              <KpiCard label="Favorites Rate" value={derived.kpis.conv.curr > 0 ? `${derived.kpis.conv.curr.toFixed(2)}%` : '—'}
                deltaLabel={derived.kpis.conv.curr > 0 ? `${derived.kpis.conv.deltaPct}%` : undefined} up={derived.kpis.conv.up}
                series={derived.kpis.conv.series} color="#fbbf24" icon={Star} snapshotting={snapshotting} />
            </div>


            <div className="grid md:grid-cols-2 gap-3">
              <SidePanel title="This week's wins" tone="good" items={derived.wins} empty="No clear wins yet — give it a few days." />
              <AttentionSummaryCard
                count={derived.alerts.filter(a => !dismissed.has(a.key)).length}
                onOpen={() => setTab('alerts')}
              />
            </div>

            <ExpiringSoonPanel listings={listings} onOpen={(id) => navigate(`/app/listings/${id}`)} />

            <div className="grid md:grid-cols-2 gap-3">
              <MoverCard label="Biggest mover" listing={derived.topMover} listings={listings} navigate={navigate} positive />
              <MoverCard label="Biggest drop" listing={derived.topDrop} listings={listings} navigate={navigate} positive={false} />
            </div>
          </TabsContent>


          {/* â"€â"€ Listings performance â"€â"€ */}
          <TabsContent value="listings" className="mt-4">
            <ListingsPerformanceTable listings={listings} snaps={listingSnaps} onOpen={(id) => navigate(`/app/listings/${id}`)} />
          </TabsContent>

          {/* â"€â"€ Competitors + your changes â"€â"€ */}
          <TabsContent value="competitors" className="mt-4 space-y-4">
            <CompetitorsPanel userListings={listings} userId={user?.id ?? null} />
          </TabsContent>

          {/* â"€â"€ Customers â"€â"€ */}
          <TabsContent value="customers" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="Orders (30d)" value={fmtNum(derived.kpis.orders.curr)} />
              <StatTile label="Revenue (30d)" value={fmtMoney(derived.kpis.revenue30d)} />
              <StatTile label="AOV" value={derived.kpis.aov ? fmtMoney(derived.kpis.aov) : '—'} />
              <StatTile label="Avg rating" value={derived.kpis.avgRating ? `${derived.kpis.avgRating.toFixed(2)} â˜…` : '—'} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" style={{ color: TEAL }} />
                  {shopSnaps.length > 1 ? 'Orders over time' : 'Reviews per week'}
                </CardTitle>
                {shopSnaps.length <= 1 && derived.reviewWeekly.some(b => b.v > 0) && (
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    Stand-in for orders until daily snapshots build up — each Etsy review = one completed order.
                  </p>
                )}
              </CardHeader>
              <CardContent className="h-56">
                {shopSnaps.length > 1 ? (
                  <ResponsiveContainer><LineChart data={shopSnaps.map(s => ({ d: s.recorded_on.slice(5), v: s.orders_30d }))}>
                    <XAxis dataKey="d" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                    <RTooltip contentStyle={{ background: 'hsl(var(--surface-1))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                    <Line type="monotone" dataKey="v" stroke={TEAL} strokeWidth={2} dot={false} />
                  </LineChart></ResponsiveContainer>
                ) : derived.reviewWeekly.some(b => b.v > 0) ? (
                  <ResponsiveContainer><LineChart data={derived.reviewWeekly}>
                    <XAxis dataKey="d" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
                    <RTooltip contentStyle={{ background: 'hsl(var(--surface-1))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                    <Line type="monotone" dataKey="v" stroke={TEAL} strokeWidth={2} dot={{ r: 3, fill: TEAL }} />
                  </LineChart></ResponsiveContainer>
                ) : <EmptyChart />}
              </CardContent>
            </Card>

            {/* Coaching / stay-on-track */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4" style={{ color: TEAL }} />Coaching
                </CardTitle>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">Read from your reviews and rating trend — no extra snapshots needed.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {derived.coaching.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70 italic">Not enough review history yet to coach on.</p>
                ) : derived.coaching.map((c, i) => {
                  const color = c.tone === 'good' ? '#34d399' : c.tone === 'warn' ? '#fbbf24' : '#94a3b8'
                  return (
                    <div key={i} className="rounded-[var(--radius)] border border-border bg-surface-2 p-3" style={{ borderLeft: `3px solid ${color}` }}>
                      <p className="text-xs font-semibold text-foreground">{c.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{c.body}</p>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" style={{ color: TEAL }} />Recent reviews</CardTitle></CardHeader>
              <CardContent>
                {reviews.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70">No reviews synced yet. Snapshot to pull the latest.</p>
                ) : (
                  <ul className="space-y-3">
                    {reviews.slice(0, 8).map(r => {
                      const lst = listings.find(l => l.id === r.listing_id)
                      return (
                        <li key={r.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                          <div className="flex items-center gap-0.5 shrink-0">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={cn('h-3 w-3', i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
                            ))}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-foreground/70 line-clamp-2">{r.review_text ?? <em className="text-muted-foreground/70">No comment</em>}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {lst && <button onClick={() => navigate(`/app/listings/${lst.id}`)} className="text-[10px] hover:underline" style={{ color: TEAL }}>{lst.title.slice(0, 40)}…</button>}
                              <span className="text-[10px] text-muted-foreground/70">{fmtAgo(r.etsy_created_at)}</span>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* â"€â"€ Trends (Tag filter â†’ Grade distribution â†’ Activity trends â†’ Price distribution) â"€â"€ */}
          <TabsContent value="trends" className="mt-4 space-y-4">
            <TrendsSection
              listings={listings}
              shopSnaps={shopSnaps}
              listingSnaps={listingSnaps}
              fullDistribution={dashboardStats?.grade_distribution ?? null}
            />
          </TabsContent>


          {/* â"€â"€ Activity (moved from Dashboard) â"€â"€ */}
          <TabsContent value="activity" className="mt-4 space-y-4">
            <RecentTractionFeed />
            {dashboardStats ? (
              <ActivityFeed records={dashboardStats.recent_optimizations} />
            ) : (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">No optimization activity yet.</p>
              </div>
            )}
          </TabsContent>


          {/* â"€â"€ Alerts â"€â"€ */}
          <TabsContent value="alerts" className="mt-4 space-y-2">
            <SanityCheckPanel />
            {(() => {
              const visibleAlerts = derived.alerts.filter(a => !dismissed.has(a.key))
              if (visibleAlerts.length === 0) {
                return (
                  <div className="rounded-xl border border-dashed p-8 text-center">
                    <p className="text-sm text-muted-foreground">No alerts right now. Your shop looks healthy. âœ¨</p>
                  </div>
                )
              }
              return visibleAlerts.map((a) => (
                <div key={a.key} className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                  <InsightCard
                    icon={AlertTriangle}
                    title={a.title}
                    impact={a.severity === 'high' ? 'high' : 'medium'}
                    context={a.body}
                    action={a.listingId ? 'Open listing' : 'View details'}
                    onAction={a.listingId ? () => navigate(`/app/listings/${a.listingId}`) : undefined}
                    status="not_started"
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmDismiss(a.key)}
                    className="absolute top-2 right-2 h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-white hover:bg-white/5 transition-colors"
                    aria-label="Dismiss alert"
                    title="Mark as handled"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {confirmDismiss === a.key && (
                    <div className="absolute top-9 right-2 z-10 rounded-md border p-2 shadow-lg flex items-center gap-2">
                      <span className="text-[11px] text-foreground/70">Mark as handled?</span>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={async () => {
                          setConfirmDismiss(null)
                          await dismiss(a.alertType, a.key)
                          toast({ title: 'Marked as handled' })
                        }}
                      >Confirm</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setConfirmDismiss(null)}>Cancel</Button>
                    </div>
                  )}
                </div>
              ))
            })()}
          </TabsContent>
        </Tabs>

        {loading && <Skeleton className="h-12 w-full" />}
      </div>
    </div>
  )
}

// â"€â"€â"€ Subcomponents â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground mt-1" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>{value}</p>
    </div>
  )
}

function EmptyChart() {
  return <div className="h-full flex items-center justify-center text-xs text-muted-foreground/70 italic">Need at least 2 days of snapshots</div>
}

export type SidePanelItem = string | { key: string; label: string; alertType: string }

function SidePanel({ title, items, tone, empty, dismissed, onDismiss }: {
  title: string; tone: 'good' | 'warn'; items: SidePanelItem[]; empty: string;
  dismissed?: Set<string>;
  onDismiss?: (alertType: string, alertKey: string) => void;
}) {
  const color = tone === 'good' ? '#34d399' : '#fbbf24'
  const visible = items.filter(it => typeof it === 'string' ? true : !dismissed?.has(it.key))
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
        {tone === 'good' ? <TrendingUp className="h-4 w-4" style={{ color }} /> : <AlertTriangle className="h-4 w-4" style={{ color }} />}
        {title}
      </CardTitle></CardHeader>
      <CardContent>
        {visible.length === 0 ? <p className="text-xs text-muted-foreground/70">{empty}</p> : (
          <ul className="space-y-2">
            {visible.slice(0, 3).map((s, i) => {
              const key = typeof s === 'string' ? `s-${i}` : s.key
              const label = typeof s === 'string' ? s : s.label
              const dismissable = typeof s !== 'string' && !!onDismiss
              return (
                <li key={key} className="group text-xs text-foreground/70 flex items-start gap-2 transition-opacity">
                  <span className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
                  <span className="flex-1">{label}</span>
                  {dismissable && (
                    <button
                      type="button"
                      onClick={() => { onDismiss!((s as { alertType: string }).alertType, (s as { key: string }).key) }}
                      className="opacity-40 hover:opacity-100 transition-opacity text-muted-foreground hover:text-white shrink-0"
                      aria-label="Mark as handled"
                      title="Mark as handled"
                    >
                      Ã—
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function MoverCard({ label, listing, listings, navigate, positive }: {
  label: string; listing: { listing_id: string; deltaPct: number; delta: number } | null;
  listings: ListingLite[]; navigate: (p: string) => void; positive: boolean;
}) {
  const color = positive ? '#34d399' : '#f87171'
  const lst = listings.find(l => l.id === listing?.listing_id)

  // Pulse the delta badge briefly when the number changes after first render,
  // so live snapshots are noticeable. Same prev-value-ref pattern as KpiCard.
  const deltaValue = listing?.delta ?? null
  const prevRef = useRef<number | null | undefined>(undefined)
  const [highlight, setHighlight] = useState(false)
  useEffect(() => {
    if (prevRef.current === undefined) { prevRef.current = deltaValue; return }
    if (prevRef.current !== deltaValue) {
      prevRef.current = deltaValue
      setHighlight(true)
      const t = setTimeout(() => setHighlight(false), 1800)
      return () => clearTimeout(t)
    }
  }, [deltaValue])

  if (!listing || !lst) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
        <CardContent><p className="text-xs text-muted-foreground/70">Not enough data yet.</p></CardContent>
      </Card>
    )
  }
  return (
    <Card className="cursor-pointer hover:border-border"
      onClick={() => navigate(`/app/listings/${lst.id}`)}>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center justify-between">
        <span>{label}</span>
        <span
          className={cn(
            'text-xs font-bold rounded px-1.5 py-0.5 transition-all duration-500',
            highlight && 'animate-kpi-pulse motion-reduce:animate-none',
          )}
          style={{
            color,
            background: highlight ? `${color}22` : 'transparent',
            boxShadow: highlight ? `0 0 0 1px ${color}66, 0 0 14px ${color}44` : 'none',
          }}
        >
          {positive ? '+' : ''}{listing.delta} views ({Math.round(listing.deltaPct)}%)
        </span>
      </CardTitle></CardHeader>
      <CardContent className="flex items-center gap-3">
        {lst.thumbnail_url
          ? <img src={lst.thumbnail_url} alt="" className="h-12 w-12 rounded object-cover shrink-0" />
          : <div className="h-12 w-12 rounded bg-surface-2 shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm text-white line-clamp-2">{lst.title}</p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">{lst.views} total views Â· {lst.favorites} favorites</p>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Compact summary used on Overview in place of the full "Worth your attention"
 * panel — taps through to the Alerts tab which is the canonical, detailed view.
 */
function AttentionSummaryCard({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count === 0) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Worth your attention</CardTitle></CardHeader>
        <CardContent><p className="text-xs text-muted-foreground/70 italic">Nothing flagged — nice work.</p></CardContent>
      </Card>
    )
  }
  const noun = count === 1 ? 'thing needs' : 'things need'
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left rounded-xl border p-4 transition-colors hover:bg-white/[0.03] flex items-center justify-between gap-3"
      style={{ background: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.30)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.18)' }}>
          <AlertTriangle className="h-4 w-4" style={{ color: '#fbbf24' }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{count} {noun} your attention</p>
          <p className="text-[11px] text-muted-foreground">See severity, details, and quick actions in Alerts.</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function ListingsPerformanceTable({ listings, snaps, onOpen }: {
  listings: ListingLite[]; snaps: ListingSnap[]; onOpen: (id: string) => void;
}) {
  const byListing = useMemo(() => {
    const m = new Map<string, ListingSnap[]>()
    for (const s of snaps) {
      const arr = m.get(s.listing_id) ?? []
      arr.push(s)
      m.set(s.listing_id, arr)
    }
    return m
  }, [snaps])

  const rows = listings.map(l => {
    const s = byListing.get(l.id) ?? []
    const last = s[s.length - 1]
    const weekAgo = s.find(x => {
      const d = (Date.now() - new Date(x.recorded_on).getTime()) / 86400000
      return d >= 6 && d <= 8
    }) ?? s[0]
    const vDelta = last && weekAgo ? last.views - weekAgo.views : 0
    const fDelta = last && weekAgo ? last.favorites - weekAgo.favorites : 0
    return { l, series: s.slice(-14), vDelta, fDelta }
  }).sort((a, b) => b.vDelta - a.vDelta)

  if (listings.length === 0) {
    return <p className="text-xs text-muted-foreground/70 p-4">No listings yet.</p>
  }

  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            <th className="text-left p-3">Listing</th>
            <th className="text-right p-3 hidden sm:table-cell">Views</th>
            <th className="text-right p-3">Views +/- 7d</th>
            <th className="text-right p-3 hidden md:table-cell">Favs +/-</th>
            <th className="text-right p-3 hidden lg:table-cell w-24">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map(({ l, series, vDelta, fDelta }) => (
            <tr key={l.id} className="border-t cursor-pointer hover:bg-surface-1/50" onClick={() => onOpen(l.id)}>
              <td className="p-3">
                <div className="flex items-center gap-2 min-w-0">
                  {l.thumbnail_url
                    ? <img src={l.thumbnail_url} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                    : <div className="h-8 w-8 rounded bg-surface-2 shrink-0" />}
                  <span className="text-xs text-foreground line-clamp-1">{l.title}</span>
                </div>
              </td>
              <td className="text-right p-3 text-xs text-foreground/70 hidden sm:table-cell">{fmtNum(l.views)}</td>
              <td className={cn('text-right p-3 text-xs font-semibold', vDelta > 0 ? 'text-emerald-400' : vDelta < 0 ? 'text-red-400' : 'text-muted-foreground/70')}>
                {vDelta > 0 ? '+' : ''}{vDelta}
              </td>
              <td className={cn('text-right p-3 text-xs hidden md:table-cell', fDelta > 0 ? 'text-emerald-400' : fDelta < 0 ? 'text-red-400' : 'text-muted-foreground/70')}>
                {fDelta > 0 ? '+' : ''}{fDelta}
              </td>
              <td className="p-2 hidden lg:table-cell">
                <div className="h-8 w-24 ml-auto">
                  {series.length > 1 ? (
                    <ResponsiveContainer><LineChart data={series.map(s => ({ y: s.views }))}>
                      <Line type="monotone" dataKey="y" stroke={TEAL} strokeWidth={1.5} dot={false} />
                    </LineChart></ResponsiveContainer>
                  ) : <div className="h-full flex items-center justify-end text-[10px] text-muted-foreground/40">—</div>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TopTags({ listings }: { listings: { tags?: string[] }[] }) {
  const counts = new Map<string, number>()
  for (const l of listings) for (const t of (l.tags ?? [])) counts.set(t, (counts.get(t) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  if (top.length === 0) return <p className="text-xs text-muted-foreground/70">Load your listings to see your tag mix.</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {top.map(([t, n]) => (
        <span key={t} className="text-[11px] px-2 py-1 rounded-full border text-muted-foreground bg-surface-2 border-border">
          {t} <span className="text-muted-foreground/70">Â· {n}</span>
        </span>
      ))}
    </div>
  )
}

function priceBuckets(listings: ListingLite[]) {
  const buckets: Record<string, number> = { '<$15': 0, '$15-30': 0, '$30-50': 0, '$50-100': 0, '$100+': 0 }
  for (const l of listings) {
    const p = l.price ?? 0
    if (p < 15) buckets['<$15']++
    else if (p < 30) buckets['$15-30']++
    else if (p < 50) buckets['$30-50']++
    else if (p < 100) buckets['$50-100']++
    else buckets['$100+']++
  }
  return Object.entries(buckets).map(([b, n]) => ({ b, n }))
}

// Softer, gradient-friendly palette per bucket (low â†’ high price)
const PRICE_BAR_COLORS = ['#7dd3c0', '#5fc9b8', '#48bfb0', '#37b2a5', '#2aa195']

function computeGradeDistribution(listings: ListingLite[]) {
  const dist = { a_plus: 0, a: 0, b: 0, c: 0, d: 0, f: 0 }
  for (const l of listings) {
    const g = l.score
    if (g == null) continue
    if (g >= 90) dist.a_plus++
    else if (g >= 80) dist.a++
    else if (g >= 70) dist.b++
    else if (g >= 60) dist.c++
    else if (g >= 50) dist.d++
    else dist.f++
  }
  return dist
}

function TrendsSection({
  listings,
  shopSnaps,
  listingSnaps,
  fullDistribution,
}: {
  listings: ListingLite[]
  shopSnaps: ShopSnap[]
  listingSnaps: ListingSnap[]
  fullDistribution: import('@/types').GradeDistribution | null
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const tagCounts = useMemo(() => {
    const c = new Map<string, number>()
    for (const l of listings) for (const t of (l.tags ?? [])) c.set(t, (c.get(t) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  }, [listings])

  const isFiltered = selected.size > 0
  const filtered = useMemo(() => {
    if (!isFiltered) return listings
    return listings.filter(l => (l.tags ?? []).some(t => selected.has(t)))
  }, [listings, selected, isFiltered])

  const filteredIds = useMemo(() => new Set(filtered.map(l => l.id)), [filtered])

  // Grade distribution — recompute from filtered listings if filtered,
  // otherwise prefer the precomputed full distribution (covers all listings,
  // matches what the dashboard shows).
  const distribution = useMemo(() => {
    if (isFiltered) return computeGradeDistribution(filtered)
    return fullDistribution ?? computeGradeDistribution(listings)
  }, [isFiltered, filtered, fullDistribution, listings])

  // Activity trends — when unfiltered use shop-wide snapshots (accurate).
  // When filtered, aggregate per-day from listing_snapshots for matching IDs.
  const { viewsTrend, salesTrend } = useMemo(() => {
    if (!isFiltered) {
      return {
        viewsTrend: shopSnaps.map(s => ({ date: s.recorded_on, value: s.total_views })),
        salesTrend: shopSnaps.map(s => ({ date: s.recorded_on, value: s.orders_30d })),
      }
    }
    const matched = listingSnaps.filter(s => filteredIds.has(s.listing_id))
    // Sum views per date.
    const viewsByDate = new Map<string, number>()
    for (const s of matched) viewsByDate.set(s.recorded_on, (viewsByDate.get(s.recorded_on) ?? 0) + s.views)
    const views = [...viewsByDate.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }))

    // Approximate sales per date from quantity decreases per listing between
    // consecutive snapshots. Etsy doesn't expose per-listing sales by date.
    const byListing = new Map<string, ListingSnap[]>()
    for (const s of matched) {
      const arr = byListing.get(s.listing_id) ?? []
      arr.push(s); byListing.set(s.listing_id, arr)
    }
    const salesByDate = new Map<string, number>()
    byListing.forEach(arr => {
      arr.sort((a, b) => a.recorded_on.localeCompare(b.recorded_on))
      for (let i = 1; i < arr.length; i++) {
        const drop = arr[i - 1].quantity - arr[i].quantity
        if (drop > 0) salesByDate.set(arr[i].recorded_on, (salesByDate.get(arr[i].recorded_on) ?? 0) + drop)
      }
    })
    const sales = [...salesByDate.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }))
    return { viewsTrend: views, salesTrend: sales }
  }, [isFiltered, shopSnaps, listingSnaps, filteredIds])

  const priceData = useMemo(() => priceBuckets(filtered), [filtered])
  const total = filtered.length
  const avgPrice = total > 0 ? filtered.reduce((s, l) => s + (l.price ?? 0), 0) / total : 0

  function toggle(tag: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag); else next.add(tag)
      return next
    })
  }

  const selectedArr = [...selected]
  const tagLabel = selectedArr.length === 1
    ? `'${selectedArr[0]}'`
    : selectedArr.length > 1 ? `${selectedArr.length} tags` : ''
  const filteredCardStyle = isFiltered
    ? { borderLeft: '3px solid hsl(var(--primary))' }
    : {}

  return (
    <>
      {/* 1. Tag filter — the control */}
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Tag className="h-4 w-4" style={{ color: TEAL }} />
            Filter by tag
            {isFiltered && (
              <button
                onClick={() => setSelected(new Set())}
                className="ml-auto text-[11px] text-muted-foreground hover:text-white transition-colors"
              >
                Clear ({selected.size})
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tagCounts.length === 0 ? (
            <p className="text-xs text-muted-foreground/70">Load your listings to see your tag mix.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tagCounts.map(([t, n]) => {
                const on = selected.has(t)
                return (
                  <button
                    key={t}
                    onClick={() => toggle(t)}
                    className="text-[11px] px-2 py-1 rounded-full border transition-all duration-200 hover:scale-105"
                    style={{
                      borderColor: on ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                      background: on ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--surface-2))',
                      color: on ? 'hsl(var(--primary))' : 'hsl(var(--foreground) / 0.65)',
                      boxShadow: on ? '0 0 0 1px hsl(var(--primary) / 0.3)' : 'none',
                    }}
                  >
                    {t} <span className={on ? 'opacity-70' : 'text-muted-foreground/70'}>Â· {n}</span>
                  </button>
                )
              })}
            </div>
          )}
          {isFiltered && (
            <div
              className="mt-3 flex items-center justify-between rounded-md px-3 py-2 animate-fade-in"
              style={{ background: 'hsl(var(--primary) / 0.08)', border: '1px solid hsl(var(--primary) / 0.25)' }}
            >
              <p className="text-[11px]" style={{ color: TEAL }}>
                Showing {total} listing{total === 1 ? '' : 's'} tagged {tagLabel}
              </p>
              <button
                onClick={() => setSelected(new Set())}
                className="text-[11px] underline hover:no-underline"
                style={{ color: TEAL }}
              >
                Clear filter
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2 + 3. Grade distribution + Activity trends */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div style={isFiltered ? { borderLeft: `3px solid ${TEAL}`, borderRadius: 12 } : undefined}>
          <GradeChart
            distribution={distribution}
            titleSuffix={isFiltered ? `${total} listings tagged ${tagLabel}` : undefined}
          />
        </div>
        <div
          className="lg:col-span-2"
          style={isFiltered ? { borderLeft: `3px solid ${TEAL}`, borderRadius: 12 } : undefined}
        >
          <SalesChart
            viewsTrend={viewsTrend}
            salesTrend={salesTrend}
            titleSuffix={isFiltered ? `${tagLabel} listings` : undefined}
          />
        </div>
      </div>

      {/* 4. Price distribution */}
      <Card style={filteredCardStyle} className="animate-fade-in">
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Price distribution{isFiltered ? ` — ${tagLabel} listings` : ''}</span>
            {total > 0 && (
              <span className="text-[11px] font-normal text-muted-foreground">
                {total} listing{total === 1 ? '' : 's'} Â· avg ${avgPrice.toFixed(2)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          {total > 0 ? (
            <ResponsiveContainer>
              <BarChart data={priceData} key={[...selected].sort().join('|') || 'all'}>
                <defs>
                  {PRICE_BAR_COLORS.map((c, i) => (
                    <linearGradient key={i} id={`bar-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.55} />
                    </linearGradient>
                  ))}
                </defs>
                <XAxis dataKey="b" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <RTooltip
                  cursor={{ fill: 'hsl(var(--primary) / 0.06)' }}
                  contentStyle={{ background: 'hsl(var(--surface-1))', border: '1px solid hsl(var(--border))', fontSize: 12, borderRadius: 8 }}
                />
                <Bar
                  dataKey="n"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive
                  animationBegin={120}
                  animationDuration={900}
                  animationEasing="ease-out"
                >
                  {priceData.map((_, i) => (
                    <Cell key={i} fill={`url(#bar-grad-${i % PRICE_BAR_COLORS.length})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </CardContent>
      </Card>
    </>
  )
}

function deriveBriefing(
  shopSnaps: ShopSnap[],
  listingSnaps: ListingSnap[],
  listings: ListingLite[],
  reviews: ReviewRow[],
  vacationPeriods: Array<{ started_on: string; ended_on: string | null }> = [],
) {
  const latest = shopSnaps[shopSnaps.length - 1]
  const weekAgoIdx = shopSnaps.findIndex(s => {
    const d = (Date.now() - new Date(s.recorded_on).getTime()) / 86400000
    return d >= 6 && d <= 8
  })
  // Only treat as a real week-ago baseline if we actually found a snapshot ~7 days back
  // AND it's a different snapshot than today's. Otherwise WoW comparisons are meaningless.
  const weekAgo = weekAgoIdx >= 0 ? shopSnaps[weekAgoIdx] : undefined
  const hasWeekBaseline = !!weekAgo && weekAgo !== latest

  // â"€â"€ Vacation suppression â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // If the prior 7-day comparison window overlaps a known vacation period,
  // suppress drop alerts/concerns — the metric move is explained by the shop
  // being closed, not by an organic decline.
  const dayMs = 86400000
  const compEnd = Date.now()
  const compStart = compEnd - 7 * dayMs
  const overlapDays = (() => {
    let total = 0
    for (const p of vacationPeriods) {
      const s = new Date(p.started_on + 'T00:00:00Z').getTime()
      const e = p.ended_on ? new Date(p.ended_on + 'T00:00:00Z').getTime() : compEnd
      const lo = Math.max(s, compStart)
      const hi = Math.min(e, compEnd)
      if (hi > lo) total += (hi - lo) / dayMs
    }
    return total
  })()
  const vacationOverlapsComparison = overlapDays > 0
  const vacationPausedComparison = overlapDays >= 5  // most of the window was vacation




  // Per-listing 7-day deltas â†’ for top mover/drop
  const byListing = new Map<string, ListingSnap[]>()
  for (const s of listingSnaps) {
    const a = byListing.get(s.listing_id) ?? []
    a.push(s); byListing.set(s.listing_id, a)
  }
  const movers: { listing_id: string; delta: number; deltaPct: number }[] = []
  byListing.forEach((arr, id) => {
    if (arr.length < 2) return
    const last = arr[arr.length - 1]
    const prev = arr.find(x => (Date.now() - new Date(x.recorded_on).getTime()) / 86400000 >= 6) ?? arr[0]
    const d = last.views - prev.views
    const pct = prev.views > 0 ? (d / prev.views) * 100 : 0
    movers.push({ listing_id: id, delta: d, deltaPct: pct })
  })
  movers.sort((a, b) => b.delta - a.delta)
  const topMover = movers[0]?.delta > 0 ? movers[0] : null
  const topDrop = movers[movers.length - 1]?.delta < 0 ? movers[movers.length - 1] : null

  // KPI series — pulled from shop_snapshots (now correctly summed in the edge function)
  const viewsSeries = shopSnaps.map(s => ({ x: s.recorded_on, y: s.total_views }))
  const ordersSeries = shopSnaps.map(s => ({ x: s.recorded_on, y: s.orders_30d }))
  const revenueSeries = shopSnaps.map(s => ({ x: s.recorded_on, y: Number(s.revenue_30d ?? 0) }))
  const favByDay = new Map<string, number>()
  for (const s of listingSnaps) favByDay.set(s.recorded_on, (favByDay.get(s.recorded_on) ?? 0) + s.favorites)
  const favSeriesArr = shopSnaps.some(s => s.total_favorites > 0)
    ? shopSnaps.map(s => ({ x: s.recorded_on, y: s.total_favorites }))
    : [...favByDay.entries()].sort().map(([x, y]) => ({ x, y }))

  // Favorites rate: total favorites / total views (%) — always computable from cumulative totals,
  // unlike conv rate which needs a 30d-ago snapshot most new accounts don't have yet.
  const favRateSeries = shopSnaps.map((s) => {
    const favsForDay = s.total_favorites > 0 ? s.total_favorites : (favByDay.get(s.recorded_on) ?? 0)
    return { x: s.recorded_on, y: s.total_views > 0 ? (favsForDay / s.total_views) * 100 : 0 }
  })
  const currFavRate = latest && latest.total_views > 0
    ? ((latest.total_favorites > 0 ? latest.total_favorites : (favByDay.get(latest.recorded_on) ?? 0)) / latest.total_views) * 100
    : 0
  const weekAgoFavRate = weekAgo && weekAgo.total_views > 0
    ? ((weekAgo.total_favorites > 0 ? weekAgo.total_favorites : (favByDay.get(weekAgo.recorded_on) ?? 0)) / weekAgo.total_views) * 100
    : 0

  const latestFavs = latest?.total_favorites || favSeriesArr[favSeriesArr.length - 1]?.y || sumListingFavs(listings)
  const weekAgoFavs = favSeriesArr[0]?.y ?? 0

  const kpis = {
    views: kpiFrom(viewsSeries, latest?.total_views ?? sumListingViews(listings), weekAgo?.total_views ?? 0),
    favs: kpiFrom(favSeriesArr, latestFavs, weekAgoFavs),
    orders: kpiFrom(ordersSeries, latest?.orders_30d ?? 0, weekAgo?.orders_30d ?? 0),
    conv: kpiFrom(favRateSeries, currFavRate, weekAgoFavRate),
    revenue: kpiFrom(revenueSeries, Number(latest?.revenue_30d ?? 0), Number(weekAgo?.revenue_30d ?? 0)),
    revenue30d: latest?.revenue_30d ?? 0,
    aov: latest && latest.orders_30d > 0 ? latest.revenue_30d / latest.orders_30d : null,
    avgRating: latest?.avg_rating ?? null,
  }



  // Greeting narrative
  const movingPart = topMover ? `"${listings.find(l => l.id === topMover.listing_id)?.title?.slice(0, 30) ?? 'a listing'}" is trending up` : null
  const concernPart = topDrop ? `1 listing needs attention` : null
  const greeting = !hasWeekBaseline
    ? `here's your shop at a glance. We'll start showing week-over-week trends once we have a few days of data.`
    : kpis.views.up == null
      ? `here's your shop at a glance.`
      : kpis.views.up
        ? `views are up ${kpis.views.deltaPct}% this week.`
        : `views are down ${kpis.views.deltaPct}% this week — let's dig in.`
  const subline = [movingPart, concernPart, latest && `${latest.active_count} active listings`].filter(Boolean).join(' Â· ') || 'Snapshot any time to refresh your briefing.'

  // Wins / concerns — only show WoW comparisons once we have a real week-ago baseline
  const wins: SidePanelItem[] = []
  const concerns: SidePanelItem[] = []
  if (hasWeekBaseline && kpis.views.up) wins.push(`Total shop views +${kpis.views.deltaPct}% WoW`)
  if (hasWeekBaseline && kpis.orders.up) wins.push(`Orders climbed ${kpis.orders.deltaPct}% in the last week`)
  if (topMover) {
    const lst = listings.find(l => l.id === topMover.listing_id)
    if (lst) wins.push(`"${lst.title.slice(0, 40)}" gained ${topMover.delta} views`)
  }
  const recent5star = reviews.filter(r => r.rating === 5).length
  if (recent5star >= 3) wins.push(`${recent5star} new 5â˜… reviews`)

  // Concerns get stable keys so dismissals re-surface only when the underlying
  // situation actually changes (new review id, different drop bucket, etc).
  if (hasWeekBaseline && kpis.views.up === false && !vacationOverlapsComparison) {
    const bucket = Math.round(kpis.views.deltaPct / 10) * 10
    concerns.push({ key: `views_drop:${bucket}:${new Date().toISOString().slice(0, 10)}`, label: `Views down ${kpis.views.deltaPct}% WoW`, alertType: 'views_drop' })
  }
  if (hasWeekBaseline && kpis.orders.up === false && !vacationOverlapsComparison) {
    const bucket = Math.round(kpis.orders.deltaPct / 10) * 10
    concerns.push({ key: `orders_drop:${bucket}:${new Date().toISOString().slice(0, 10)}`, label: `Orders dropped ${kpis.orders.deltaPct}%`, alertType: 'orders_drop' })
  }
  if (vacationPausedComparison) {
    concerns.push({
      key: `vacation_pause:${new Date().toISOString().slice(0, 10)}`,
      label: 'View trend paused during vacation mode — comparison will resume once enough post-vacation data is collected',
      alertType: 'vacation_pause',
    })
  }
  if (topDrop && !vacationOverlapsComparison) {
    const lst = listings.find(l => l.id === topDrop.listing_id)
    if (lst) concerns.push({ key: `listing_drop:${lst.id}:${Math.abs(topDrop.delta)}`, label: `"${lst.title.slice(0, 40)}" lost ${Math.abs(topDrop.delta)} views`, alertType: 'listing_drop' })
  }
  if (latest && latest.expiring_soon_count > 0) {
    concerns.push({ key: `expiring:${latest.expiring_soon_count}`, label: `${latest.expiring_soon_count} listings expire within 7 days`, alertType: 'expiring' })
  }
  const badReviewRows = reviews.filter(r => r.rating <= 2)
  if (badReviewRows.length > 0) {
    // One dismissible row per low review, keyed by review id — only re-surfaces for genuinely new reviews.
    const newest = badReviewRows[0]
    concerns.push({ key: `low_review:${newest.id}`, label: `${badReviewRows.length} recent 1—2â˜… review${badReviewRows.length > 1 ? 's' : ''}`, alertType: 'low_review' })
  }

  // Alerts (Alerts tab cards). Each alert carries a stable key + alertType so
  // it can be dismissed and only re-surface when the underlying situation
  // genuinely changes.
  const alerts: { key: string; alertType: string; title: string; body: string; severity: 'high' | 'med'; listingId?: string }[] = []
  if (kpis.views.up === false && kpis.views.deltaPct > 40 && !vacationOverlapsComparison) {
    const bucket = Math.round(kpis.views.deltaPct / 10) * 10
    alerts.push({ key: `views_drop:${bucket}:${new Date().toISOString().slice(0, 10)}`, alertType: 'views_drop', title: 'Sharp drop in views', body: `Shop views fell ${kpis.views.deltaPct}% week-over-week — could indicate a search-rank change.`, severity: 'high' })
  }
  if (vacationPausedComparison) {
    alerts.push({
      key: `vacation_pause:${new Date().toISOString().slice(0, 10)}`,
      alertType: 'vacation_pause',
      title: 'View trend paused — vacation mode',
      body: 'View trend paused during vacation mode — comparison will resume once enough post-vacation data is collected.',
      severity: 'med',
    })
  }
  if (latest && latest.expiring_soon_count > 0) {
    alerts.push({ key: `expiring:${latest.expiring_soon_count}`, alertType: 'expiring', title: `${latest.expiring_soon_count} listings expiring soon`, body: 'Renew within 7 days to avoid going inactive.', severity: 'med' })
  }
  for (const l of listings) {
    if (l.views > 100 && byListing.get(l.id)?.length && (l.favorites ?? 0) === 0) {
      // Re-surface after another 30 days of views-with-no-favorites by bucketing views in 50s.
      const bucket = Math.floor((l.views ?? 0) / 50) * 50
      alerts.push({ key: `zero_favs:${l.id}:${bucket}`, alertType: 'zero_favs', title: 'High views, zero favorites', body: `"${l.title.slice(0, 50)}" has ${l.views} views but no favorites. Pricing or photos may be off.`, severity: 'med', listingId: l.id })
    }
  }
  if (topDrop && Math.abs(topDrop.deltaPct) > 50 && !vacationOverlapsComparison) {
    const lst = listings.find(l => l.id === topDrop.listing_id)
    if (lst) alerts.push({ key: `listing_drop:${lst.id}:${Math.abs(topDrop.delta)}`, alertType: 'listing_drop', title: 'Listing losing traction', body: `"${lst.title.slice(0, 50)}" lost ${Math.abs(topDrop.delta)} views (${Math.round(topDrop.deltaPct)}%) this week.`, severity: 'med', listingId: lst.id })
  }
  for (const r of reviews.slice(0, 5)) if (r.rating <= 2) {
    alerts.push({ key: `low_review:${r.id}`, alertType: 'low_review', title: `New ${r.rating}â˜… review`, body: r.review_text ?? 'No comment provided.', severity: 'high', listingId: r.listing_id ?? undefined })
  }

  // â"€â"€ Coaching insights (review-driven) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // Etsy v3 doesn't expose seller response time, so we lean on signals we DO
  // have: rating trend, review velocity, % 5â˜…, listings with no reviews yet.
  const coaching: { tone: 'good' | 'warn' | 'neutral'; title: string; body: string }[] = []
  const now = Date.now()
  const dated = reviews.filter(r => r.etsy_created_at).map(r => ({ ...r, ts: new Date(r.etsy_created_at!).getTime() }))
  const last30 = dated.filter(r => (now - r.ts) / 86400000 <= 30)
  const prev30 = dated.filter(r => { const d = (now - r.ts) / 86400000; return d > 30 && d <= 60 })

  if (last30.length > 0) {
    const fiveStarPct = Math.round((last30.filter(r => r.rating === 5).length / last30.length) * 100)
    if (fiveStarPct >= 90) {
      coaching.push({ tone: 'good', title: `${fiveStarPct}% 5â˜… in the last 30 days`, body: `Buyers love what you're shipping — keep doing it. ${last30.length} review${last30.length === 1 ? '' : 's'} counted.` })
    } else if (fiveStarPct >= 70) {
      coaching.push({ tone: 'neutral', title: `${fiveStarPct}% 5â˜… in the last 30 days`, body: 'Solid, but there\'s room to push higher. Check sub-5â˜… reviews for repeat themes (shipping, packaging, fit).' })
    } else {
      coaching.push({ tone: 'warn', title: `${fiveStarPct}% 5â˜… in the last 30 days`, body: 'Below the healthy 70% mark. Read recent reviews for the most common complaint and address it before it tanks search rank.' })
    }
  }

  const avg30 = last30.length > 0 ? last30.reduce((s, r) => s + r.rating, 0) / last30.length : null
  const avgPrev = prev30.length > 0 ? prev30.reduce((s, r) => s + r.rating, 0) / prev30.length : null
  if (avg30 != null && avgPrev != null) {
    const diff = avg30 - avgPrev
    if (diff <= -0.2) coaching.push({ tone: 'warn', title: `Rating sliding ${diff.toFixed(2)} â˜…`, body: `30-day avg is ${avg30.toFixed(2)} vs ${avgPrev.toFixed(2)} the month before. Act on the latest 1—3â˜… reviews first.` })
    else if (diff >= 0.2) coaching.push({ tone: 'good', title: `Rating climbing +${diff.toFixed(2)} â˜…`, body: `30-day avg is ${avg30.toFixed(2)} vs ${avgPrev.toFixed(2)} the month before. Whatever you changed is working.` })
  }

  if (dated.length >= 2) {
    const velocity30 = last30.length
    const velocityPrev = prev30.length
    if (velocity30 === 0 && velocityPrev > 0) {
      coaching.push({ tone: 'warn', title: 'No new reviews in 30 days', body: `You averaged ${velocityPrev} review${velocityPrev === 1 ? '' : 's'} the month before. Sales may have dipped, or buyers aren't being prompted — a polite follow-up message bumps response rates.` })
    } else if (velocity30 > 0 && velocityPrev > 0) {
      const change = Math.round(((velocity30 - velocityPrev) / velocityPrev) * 100)
      if (change >= 25) coaching.push({ tone: 'good', title: `${change}% more reviews than last month`, body: `${velocity30} new reviews — momentum is real. Keep up whatever's driving sales.` })
      else if (change <= -40) coaching.push({ tone: 'warn', title: `Reviews dropped ${Math.abs(change)}%`, body: `Only ${velocity30} new this month vs ${velocityPrev}. Worth checking shipping times and re-engaging recent buyers.` })
    }
    const lastReviewDays = Math.floor((now - dated[0].ts) / 86400000)
    if (lastReviewDays >= 14 && velocity30 < 2) {
      coaching.push({ tone: 'neutral', title: `${lastReviewDays} days since your last review`, body: 'A quick "thanks for your order" message at fulfillment time consistently lifts review rates.' })
    }
  } else if (dated.length === 0 && listings.length > 0) {
    coaching.push({ tone: 'neutral', title: 'No reviews yet', body: 'Once you have a few orders, follow up with buyers after delivery — review rate roughly doubles with a single polite nudge.' })
  }

  const noReviewListings = listings.filter(l => l.views > 50 && !dated.some(r => r.listing_id === l.id))
  if (noReviewListings.length >= 3 && dated.length > 0) {
    coaching.push({ tone: 'neutral', title: `${noReviewListings.length} popular listings with no reviews`, body: 'Listings with reviews convert noticeably better. Prioritise asking buyers of these to share their experience.' })
  }

  // Stay-on-track encouragement when nothing's wrong
  if (coaching.length === 0 && latest) {
    coaching.push({ tone: 'good', title: "You're holding steady", body: 'No red flags in your reviews or trends. Keep snapshotting daily so we can spot drift early.' })
  }

  // Review-based weekly orders fallback (real per-day data even without snapshots)
  const reviewWeekly = buildWeeklyCounts(dated.map(r => r.ts), 8)

  return { greeting, subline, kpis, wins, concerns, topMover, topDrop, alerts, coaching, reviewWeekly }
}

function buildWeeklyCounts(timestamps: number[], weeks: number) {
  const now = Date.now()
  const buckets: { d: string; v: number }[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const end = now - i * 7 * 86400000
    const start = end - 7 * 86400000
    const label = new Date(end).toISOString().slice(5, 10)
    buckets.push({ d: label, v: timestamps.filter(t => t > start && t <= end).length })
  }
  return buckets
}

function kpiFrom(series: { x: string; y: number }[], curr: number, prev: number) {
  const d = delta(curr, prev)
  return { curr, series, deltaPct: Math.round(d.pct), up: d.up }
}
function sumListingViews(l: ListingLite[]) { return l.reduce((s, x) => s + (x.views ?? 0), 0) }
function sumListingFavs(l: ListingLite[]) { return l.reduce((s, x) => s + (x.favorites ?? 0), 0) }

// Etsy charges $0.20 per listing renewal (4-month cycle).
const ETSY_RENEWAL_FEE = 0.20

function ExpiringSoonPanel({ listings, onOpen }: { listings: ListingLite[]; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const now = Date.now()
  const expiring = useMemo(
    () => listings.filter(l => {
      if (!l.ending_at) return false
      const days = (new Date(l.ending_at).getTime() - now) / 86400000
      return days >= 0 && days <= 7
    }),
    [listings, now],
  )
  if (expiring.length === 0) return null

  const views = expiring.map(l => l.views ?? 0)
  const favs = expiring.map(l => l.favorites ?? 0)
  const prices = expiring.map(l => l.price ?? 0).filter(p => p > 0)
  const grades = expiring.map(l => l.score ?? 0).filter(g => g > 0)
  const avg = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
  const min = (a: number[]) => a.length ? Math.min(...a) : 0
  const max = (a: number[]) => a.length ? Math.max(...a) : 0

  const totalValue = sum(prices)
  const renewalCost = expiring.length * ETSY_RENEWAL_FEE
  // Suggested price bump per listing to recoup renewal cost on the next sale
  const bumpPerListing = ETSY_RENEWAL_FEE
  // If we wanted to recoup over an avg conversion (rough: assume 2% of views become sales),
  // we could compute differently — but a flat $0.20 bump is the simplest, honest answer.

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" style={{ color: '#fbbf24' }} />
            {expiring.length} listings expire within 7 days
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              ~${renewalCost.toFixed(2)} to renew all
            </span>
            <ChevronRight className={cn('h-4 w-4 text-muted-foreground/70 transition-transform', expanded && 'rotate-90')} />
          </div>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4 animate-fade-in">
          {/* Snapshot grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <MiniStat label="Avg views" value={fmtNum(avg(views))} sub={`${fmtNum(min(views))}—${fmtNum(max(views))}`} />
            <MiniStat label="Avg favorites" value={fmtNum(avg(favs))} sub={`${fmtNum(min(favs))}—${fmtNum(max(favs))}`} />
            <MiniStat label="Avg grade" value={grades.length ? Math.round(avg(grades)).toString() : '—'} sub={grades.length ? `${Math.round(min(grades))}—${Math.round(max(grades))}` : 'Not graded yet'} />
            <MiniStat label="Avg price" value={prices.length ? fmtMoney(avg(prices)) : '—'} sub={prices.length ? `${fmtMoney(min(prices))}—${fmtMoney(max(prices))}` : '—'} />
          </div>

          {/* Renewal economics */}
          <div className="rounded-lg border p-3 bg-surface-2 border-border">
            <div className="flex items-start gap-2">
              <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: TEAL }} />
              <div className="space-y-1 text-xs text-foreground/70">
                <p>
                  Renewing all {expiring.length} would cost about{' '}
                  <span className="font-semibold text-white">${renewalCost.toFixed(2)}</span>{' '}
                  ($0.20 each). Combined catalog value is{' '}
                  <span className="font-semibold text-white">{fmtMoney(totalValue)}</span>.
                </p>
                <p className="text-muted-foreground">
                  Friendly nudge: a <span className="text-white font-semibold">${bumpPerListing.toFixed(2)}</span> price bump per listing covers the renewal on the very next sale. Listings with low grades or zero favorites might be better paused than renewed.
                </p>
              </div>
            </div>
          </div>

          {/* Per-listing breakdown */}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  <th className="text-left p-2">Listing</th>
                  <th className="text-right p-2">Views</th>
                  <th className="text-right p-2">Favs</th>
                  <th className="text-right p-2 hidden sm:table-cell">Grade</th>
                  <th className="text-right p-2">Price</th>
                  <th className="text-right p-2">Expires</th>
                </tr>
              </thead>
              <tbody>
                {expiring
                  .slice()
                  .sort((a, b) => new Date(a.ending_at!).getTime() - new Date(b.ending_at!).getTime())
                  .slice(0, 15)
                  .map(l => {
                    const days = Math.max(0, Math.ceil((new Date(l.ending_at!).getTime() - now) / 86400000))
                    return (
                      <tr
                        key={l.id}
                        className="border-t cursor-pointer hover:bg-surface-1/50"
                       
                        onClick={() => onOpen(l.id)}
                      >
                        <td className="p-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {l.thumbnail_url
                              ? <img src={l.thumbnail_url} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
                              : <div className="h-7 w-7 rounded bg-surface-2 shrink-0" />}
                            <span className="text-foreground/90 line-clamp-1">{l.title}</span>
                          </div>
                        </td>
                        <td className="text-right p-2 text-foreground/70">{fmtNum(l.views ?? 0)}</td>
                        <td className="text-right p-2 text-foreground/70">{fmtNum(l.favorites ?? 0)}</td>
                        <td className="text-right p-2 text-foreground/70 hidden sm:table-cell">{l.score ?? '—'}</td>
                        <td className="text-right p-2 text-foreground/70">{l.price ? fmtMoney(l.price) : '—'}</td>
                        <td className={cn('text-right p-2 font-semibold', days <= 2 ? 'text-red-400' : days <= 4 ? 'text-amber-400' : 'text-muted-foreground')}>
                          {days === 0 ? 'today' : `${days}d`}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
            {expiring.length > 15 && (
              <p className="text-[10px] text-muted-foreground/70 text-center p-2 border-t">
                + {expiring.length - 15} more
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-2.5 bg-surface-2 border-border">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <p className="text-base font-bold text-foreground mt-0.5" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  )
}

// â"€â"€â"€ Competitors + Your Changes â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
interface CompetitorRow {
  id: string
  keyword_cluster: string
  etsy_listing_id: string
  shop_name: string | null
  title: string | null
  tags: string[] | null
  price: number | null
  num_favorers: number | null
  photo_count: number | null
  description_length: number | null
  rank_position: number | null
  image_urls: string[] | null
  captured_at: string | null
}

function CompetitorsPanel({ userListings, userId }: { userListings: ListingLite[]; userId: string | null }) {
  const { toast } = useToast()
  const [comps, setComps] = useState<CompetitorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)

  async function load() {
    if (!userId) return
    setLoading(true)
    const { data } = await supabase.from('competitor_snapshots')
      .select('id, keyword_cluster, etsy_listing_id, shop_name, title, tags, price, num_favorers, photo_count, description_length, rank_position, image_urls, captured_at')
      .eq('user_id', userId)
      .order('captured_at', { ascending: false })
      .limit(200)
    setComps((data ?? []) as CompetitorRow[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [userId])


  async function scan() {
    setScanning(true)
    try {
      const { error } = await supabase.functions.invoke('snapshot-competitors', { body: {} })
      if (error) throw error
      toast({ title: 'Competitor scan complete', description: 'Pulled fresh top-ranked listings for your tags.' })
      await load()
    } catch (e) {
      toast({ title: 'Scan failed', description: String(e), variant: 'destructive' })
    } finally {
      setScanning(false)
    }
  }

  // Top tags from user listings (for matching) and own per-tag averages
  const userTagStats = useMemo(() => {
    const m = new Map<string, { count: number; price: number[]; favs: number[] }>()
    for (const l of userListings) {
      for (const t of (l.tags ?? [])) {
        const k = (t || '').trim().toLowerCase()
        if (!k) continue
        const cur = m.get(k) ?? { count: 0, price: [], favs: [] }
        cur.count++
        if (l.price != null) cur.price.push(l.price)
        cur.favs.push(l.favorites ?? 0)
        m.set(k, cur)
      }
    }
    return m
  }, [userListings])

  // Filter competitors to relevant tags only and group
  const grouped = useMemo(() => {
    const g = new Map<string, CompetitorRow[]>()
    for (const c of comps) {
      if (!userTagStats.has(c.keyword_cluster)) continue
      const arr = g.get(c.keyword_cluster) ?? []
      arr.push(c)
      g.set(c.keyword_cluster, arr)
    }
    // Sort each group by rank
    for (const [, arr] of g) arr.sort((a, b) => (a.rank_position ?? 99) - (b.rank_position ?? 99))
    return [...g.entries()].slice(0, 5)
  }, [comps, userTagStats])

  function avg(xs: number[]): number {
    if (xs.length === 0) return 0
    return xs.reduce((a, b) => a + b, 0) / xs.length
  }

  return (
    <div className="space-y-4">
      {/* Scan controls */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" style={{ color: TEAL }} />
              Closest competitors
            </CardTitle>
            <Button size="sm" variant="outline" onClick={scan} disabled={scanning}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', scanning && 'animate-spin')} />
              {scanning ? 'Scanning…' : 'Scan Etsy'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            Top-ranked Etsy listings for your most-used tags. Compare your averages to theirs.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : grouped.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-xs text-muted-foreground">
                No competitor data yet — click <span className="text-white font-medium">Scan Etsy</span> to pull top listings for your tags.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(([tag, rows]) => {
                const stats = userTagStats.get(tag)!
                const userPrice = avg(stats.price)
                const userFavs = avg(stats.favs)
                const compPrice = avg(rows.map(r => r.price ?? 0).filter(x => x > 0))
                const compFavs = avg(rows.map(r => r.num_favorers ?? 0))
                const compPhotos = avg(rows.map(r => r.photo_count ?? 0))
                return (
                  <div key={tag} className="rounded-xl border border-border bg-surface-1 shadow-warm-sm overflow-hidden" style={{ borderLeft: '3px solid hsl(258 44% 55%)' }}>
                    <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5 text-violet-500" />
                        <span className="text-sm font-semibold text-foreground">{tag}</span>
                        <span className="text-[10px] text-muted-foreground bg-surface-2 border border-border rounded-full px-2 py-0.5">
                          {stats.count} of your listings
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{rows.length} competitors</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <BenchTile label="Avg price" you={userPrice ? `$${userPrice.toFixed(2)}` : '—'} them={compPrice ? `$${compPrice.toFixed(2)}` : '—'} />
                      <BenchTile label="Avg favorites" you={fmtNum(userFavs)} them={fmtNum(compFavs)} />
                      <BenchTile label="Avg photos" you={'—'} them={compPhotos ? compPhotos.toFixed(1) : '—'} />
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {rows.slice(0, 6).map(r => (
                        <a
                          key={r.id}
                          href={`https://www.etsy.com/listing/${r.etsy_listing_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center gap-2 rounded-xl border border-border p-2 hover:border-violet-300 hover:bg-violet-50/50 transition-colors"
                        >
                          {r.image_urls?.[0] ? (
                            <img src={r.image_urls[0]} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-surface-2 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-foreground line-clamp-2 group-hover:underline">{r.title ?? 'Untitled'}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {r.price != null ? `$${r.price.toFixed(2)}` : '—'} · {fmtNum(r.num_favorers ?? 0)} favs · {r.photo_count ?? 0} photos
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BenchTile({ label, you, them }: { label: string; you: string; them: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <div className="flex items-baseline justify-between mt-1 gap-2">
        <span className="text-xs text-muted-foreground">you <span className="text-white font-semibold">{you}</span></span>
        <span className="text-xs text-muted-foreground">them <span className="text-white font-semibold">{them}</span></span>
      </div>
    </div>
  )
}


