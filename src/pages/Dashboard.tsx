import { useEffect, useRef, useState, useMemo } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import {
  RefreshCw, BarChart2, ArrowRight, Activity, ShoppingBag, Award,
  AlertTriangle, Store, Zap, CheckCircle2, Sparkles, Eye,
} from 'lucide-react'
import { KPICard } from '@/components/dashboard/KPICard'
import { EchoPicksPanel } from '@/components/dashboard/EchoPicksPanel'
import { DailyBriefingCard } from '@/components/dashboard/DailyBriefingCard'
import { OptimizationActivityFeed } from '@/components/dashboard/OptimizationActivityFeed'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { OptimizationUsageBanner } from '@/components/optimization/OptimizationLimitGate'
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist'
import { EmptyDashboard } from '@/components/empty-states/EmptyDashboard'
import { Header } from '@/components/layout/Header'
import { loadOnboardingState, completeOnboardingStep } from '@/types/onboarding'
import { PipelineLoadingState, type PipelineStage } from '@/components/market/PipelineLoadingState'
import { usePipelineStatus } from '@/hooks/useMarketScore'
import { FixActionDrawer } from '@/components/dashboard/FixActionDrawer'
import { computeStoreHealthScore } from '@/lib/healthScore'
import { detectShopType } from '@/lib/shopType'
import { ScoreClimbBanner } from '@/components/dashboard/ScoreClimbBanner'
import { useStoreHealthHistory, usePendingFixCountSince } from '@/hooks/useStoreHealthHistory'
import { useShopIntelligence } from '@/hooks/useShopIntelligence'
import { MilestoneToast, useMilestone } from '@/components/ui/MilestoneToast'
import { healthGradeColor } from '@/lib/healthScore'

function numToGrade(n: number | null): string {
  if (n == null) return '—'
  if (n >= 90) return 'A+'
  if (n >= 80) return 'A'
  if (n >= 70) return 'B'
  if (n >= 60) return 'C'
  if (n >= 50) return 'D'
  return 'F'
}

const SNAPSHOT_KEY = 'radariq_dash_snapshot'
interface DashboardSnapshot { avg_grade: number; timestamp: string }
function readSnapshot(): DashboardSnapshot | null {
  try { const raw = localStorage.getItem(SNAPSHOT_KEY); return raw ? JSON.parse(raw) as DashboardSnapshot : null } catch { return null }
}
function writeSnapshot(avgGrade: number) {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ avg_grade: avgGrade, timestamp: new Date().toISOString() }))
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    dashboardRows, connectedStore, storeStatus,
    syncListings, refreshConnectedStore, syncStats, lastSyncedAt,
    loadDashboardData, shopSnapshotHistory, recentOptimizations,
  } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showChecklist, setShowChecklist] = useState(true)
  const [openFixId, setOpenFixId] = useState<string | null>(null)
  const onboardingState = loadOnboardingState()

  const { intelligence } = useShopIntelligence(user?.id)
  const isNewUser = storeStatus === 'not_connected'

  // Auto-sync on first OAuth callback
  const autoSyncTriggered = useRef(false)
  useEffect(() => {
    if (searchParams.get('connected') !== '1') return
    if (autoSyncTriggered.current) return
    autoSyncTriggered.current = true
    completeOnboardingStep('connect_store')
    window.dispatchEvent(new Event('radariq:onboarding-updated'))
    void (async () => {
      await refreshConnectedStore()
      await syncListings()
    })()
    const next = new URLSearchParams(searchParams)
    next.delete('connected')
    setSearchParams(next, { replace: true })
  }, [searchParams, refreshConnectedStore, syncListings, setSearchParams])

  useEffect(() => {
    if (dashboardRows.length === 0) return
    const state = loadOnboardingState()
    const step = state.steps.find(s => s.id === 'view_health_score')
    if (step && !step.completed) {
      completeOnboardingStep('view_health_score')
      window.dispatchEvent(new Event('radariq:onboarding-updated'))
    }
  }, [dashboardRows.length])

  // Real-time health score refresh
  useEffect(() => {
    const storeId = connectedStore?.id
    if (!storeId) return
    let cancelled = false
    let channel: ReturnType<typeof import('@/integrations/supabase/client').supabase.channel> | null = null
    void (async () => {
      const { supabase } = await import('@/integrations/supabase/client')
      if (cancelled) return
      channel = supabase
        .channel(`store-health-${storeId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stores', filter: `id=eq.${storeId}` },
          (payload) => {
            const next = (payload.new as { store_health_score?: number | null })?.store_health_score
            const prev = (payload.old as { store_health_score?: number | null })?.store_health_score
            if (next !== prev) void loadDashboardData()
          })
        .subscribe()
    })()
    return () => {
      cancelled = true
      if (channel) void import('@/integrations/supabase/client').then(({ supabase }) => supabase.removeChannel(channel!))
    }
  }, [connectedStore?.id, loadDashboardData])

  const activeListings = useMemo(() => dashboardRows.filter(l => l.state === 'active'), [dashboardRows])
  const liveAvgGrade = useMemo(() => {
    const grades = activeListings.filter(l => l.current_grade != null).map(l => l.current_grade!)
    return grades.length > 0 ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : null
  }, [activeListings])

  const needsAttentionCount = useMemo(
    () => activeListings.filter(l => (l.current_grade ?? 100) < 60).length,
    [activeListings],
  )

  const storeHealth = useMemo(() => {
    const shopType = detectShopType(dashboardRows)
    return computeStoreHealthScore(dashboardRows, syncStats.media, syncStats.listingCount, shopType)
  }, [dashboardRows, syncStats])

  const { delta: confirmedDelta, latest: latestHistory, record: recordHealth } = useStoreHealthHistory()
  const pendingFixCount = usePendingFixCountSince(latestHistory?.recorded_at ?? null)

  useEffect(() => {
    if (dashboardRows.length === 0) return
    void recordHealth(storeHealth.overall, storeHealth.overallExact, storeHealth.subScores, connectedStore?.id ?? null)
  }, [storeHealth.overall, storeHealth.overallExact, dashboardRows.length, connectedStore?.id, recordHealth])

  useEffect(() => {
    if (liveAvgGrade == null) return
    writeSnapshot(liveAvgGrade)
  }, [liveAvgGrade])

  const latestSnapshot = shopSnapshotHistory.length > 0 ? shopSnapshotHistory[shopSnapshotHistory.length - 1] : null
  const milestone = useMilestone({
    storeHealthScore: dashboardRows.length > 0 ? storeHealth.overall : null,
    views30d: latestSnapshot?.total_views ?? null,
    orders30d: latestSnapshot?.orders_30d ?? null,
    optimizedCount: recentOptimizations.length,
    listingCount: dashboardRows.length > 0 ? dashboardRows.length : null,
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const greetingEmoji = hour < 12 ? '☀️' : hour < 17 ? '✨' : '🌙'

  const hasData = dashboardRows.length > 0 || syncStats.listingCount > 0
  const isInitialLoading = storeStatus === 'unknown' && !hasData
  const firstName = user?.full_name?.split(' ')[0] ?? user?.username ?? 'there'

  // Score improvement message for hero
  const scoreMessage = useMemo(() => {
    if (confirmedDelta && confirmedDelta > 0) {
      return `Your shop improved ${confirmedDelta.toFixed(1)} points recently. Here's what's working.`
    }
    if (pendingFixCount && pendingFixCount > 0) {
      return `You have ${pendingFixCount} applied fix${pendingFixCount === 1 ? '' : 'es'} — results coming soon.`
    }
    if (needsAttentionCount > 0) {
      return `${needsAttentionCount} listing${needsAttentionCount === 1 ? '' : 's'} need attention. Let's fix them.`
    }
    return "Echo is scanning your shop for opportunities."
  }, [confirmedDelta, pendingFixCount, needsAttentionCount])

  // This week's wins
  const recentWins = useMemo(() => {
    const wins: string[] = []
    if (recentOptimizations.length > 0) {
      wins.push(`Optimized ${recentOptimizations.length} listing${recentOptimizations.length === 1 ? '' : 's'}`)
    }
    if (confirmedDelta && confirmedDelta > 0) wins.push(`Score up +${confirmedDelta.toFixed(1)} pts`)
    if (pendingFixCount && pendingFixCount > 0) wins.push(`${pendingFixCount} fixes applied`)
    return wins.slice(0, 4)
  }, [recentOptimizations, confirmedDelta, pendingFixCount])

  if (isNewUser) {
    return (
      <div className="flex flex-col min-h-full">
        <Header title="Dashboard" description={format(new Date(), 'EEEE, MMMM d, yyyy')} />
        <div className="flex-1 p-6"><EmptyDashboard /></div>
      </div>
    )
  }

  const gradeColor = healthGradeColor(storeHealth.grade)

  return (
    <div className="flex flex-col min-h-full bg-background">
      <Header title="Dashboard" description={format(new Date(), 'EEEE, MMMM d, yyyy')} />

      <div className="flex-1 px-4 md:px-6 pt-5 pb-8 space-y-5">

        {/* ── HERO: two-column (greeting left, health score right) ── */}
        {hasData ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            {/* Left: greeting + message + CTA */}
            <div
              className="rounded-2xl border border-border overflow-hidden relative"
              style={{ background: 'hsl(var(--surface-1))' }}
            >
              {/* Decorative warm glow — top-right corner only */}
              <div className="absolute top-0 right-0 w-56 h-56 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, hsl(var(--secondary) / 0.18) 0%, transparent 65%)', transform: 'translate(25%, -35%)' }} />
              <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.10) 0%, transparent 70%)', transform: 'translate(-30%, 40%)' }} />

              <div className="relative px-6 py-6">
                <p className="text-xs font-semibold text-secondary/80 uppercase tracking-widest mb-1">
                  {format(new Date(), 'EEEE, MMMM d')}
                </p>
                <h1
                  className="text-3xl font-bold text-foreground leading-tight mb-1"
                  style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}
                >
                  {greeting}, {firstName} {greetingEmoji}
                </h1>
                <p className="text-sm text-foreground/70 mb-4 max-w-sm leading-relaxed">
                  {scoreMessage.split(/(\d+\.?\d* points?|\d+ fix|\d+ applied|\d+ listing)/g).map((part, i) =>
                    /^\d/.test(part)
                      ? <strong key={i} className="text-secondary font-bold">{part}</strong>
                      : part
                  )}
                </p>

                {/* Score delta badge */}
                {confirmedDelta !== null && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => navigate('/app/actions')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-95 shadow-md"
                      style={{ background: 'hsl(22 65% 50%)' }}
                    >
                      See what changed <ArrowRight className="h-4 w-4" />
                    </button>
                    {lastSyncedAt && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <RefreshCw className="h-3 w-3" />
                        {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                )}
                {confirmedDelta === null && (
                  <button
                    onClick={() => navigate('/app/listings')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-95 shadow-md"
                    style={{ background: 'hsl(22 65% 50%)' }}
                  >
                    View listings <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Right: compact health score ring */}
            <div className="rounded-2xl border border-border bg-surface-1 p-5 flex flex-col items-center justify-center gap-3 shadow-warm-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Shop Health Score</p>
              {/* Ring */}
              <div className="relative w-28 h-28">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 112 112">
                  <circle cx="56" cy="56" r="46" fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
                  <circle
                    cx="56" cy="56" r="46" fill="none"
                    stroke={gradeColor} strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(storeHealth.overall / 100) * 289} 289`}
                    style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1)' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold leading-none" style={{ color: gradeColor, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                    {storeHealth.overall}
                  </span>
                  <span className="text-xs font-semibold mt-0.5 text-center px-1" style={{ color: gradeColor }}>
                    {storeHealth.grade === 'F' ? 'Just Starting' : storeHealth.grade === 'D' ? 'Building Up' : `Grade ${storeHealth.grade}`}
                  </span>
                </div>
              </div>
              {confirmedDelta !== null && confirmedDelta !== 0 && (
                <div className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${confirmedDelta > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {confirmedDelta > 0 ? '↑' : '↓'} {Math.abs(confirmedDelta).toFixed(1)} from last week
                </div>
              )}
              <button
                onClick={() => navigate('/app/score-roadmap')}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                View score roadmap <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : isInitialLoading ? (
          <div className="rounded-2xl border border-border bg-surface-1 p-6 animate-pulse h-40" />
        ) : null}

        {/* ── KPI row ── */}
        {hasData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StitchKPI
              label="Active Listings"
              value={activeListings.length.toString()}
              icon={<ShoppingBag className="h-4 w-4" />}
              iconColor="bg-primary/12 text-primary"
              onClick={() => navigate('/app/listings')}
            />
            <StitchKPI
              label="Avg. Listing Grade"
              value={numToGrade(liveAvgGrade)}
              icon={<Award className="h-4 w-4" />}
              iconColor="bg-violet-100 text-violet-600"
              trend={liveAvgGrade != null ? `${liveAvgGrade} / 100` : undefined}
            />
            <StitchKPI
              label="Views This Week"
              value={latestSnapshot?.total_views != null ? latestSnapshot.total_views.toLocaleString() : '—'}
              icon={<Eye className="h-4 w-4" />}
              iconColor="bg-violet-100 text-violet-600"
              trendUp={typeof confirmedDelta === 'number' && confirmedDelta > 0}
              trend={confirmedDelta != null ? `${confirmedDelta > 0 ? '+' : ''}${confirmedDelta.toFixed(1)}%` : undefined}
              onClick={() => navigate('/app/performance')}
            />
            <StitchKPI
              label="Needs Attention"
              value={needsAttentionCount.toString()}
              icon={<AlertTriangle className="h-4 w-4" />}
              iconColor={needsAttentionCount === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}
              trend={needsAttentionCount === 0 ? 'All healthy' : 'below grade C'}
              onClick={needsAttentionCount > 0 ? () => navigate('/app/listings', { state: { preset: 'lowest_grade' } }) : undefined}
            />
          </div>
        )}
        {isInitialLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-surface-1 border border-border animate-pulse" />)}
          </div>
        )}

        {/* ── Vacation notice ── */}
        {connectedStore?.is_vacation && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm flex items-center gap-2 text-amber-800">
            <span className="shrink-0">✈️</span>
            <span>Your shop is on vacation — stats are frozen. Everything resumes when you reopen.</span>
          </div>
        )}

        {/* ── Score climb celebration ── */}
        {hasData && <ScoreClimbBanner blended={storeHealth.overallExact} pendingFixCount={pendingFixCount} />}

        {/* ── Pipeline indicator ── */}
        <PipelineStatusBlock />

        {/* ── Onboarding ── */}
        {showChecklist && !onboardingState.completed && storeStatus !== 'unknown' && (
          <OnboardingChecklist onDismiss={() => setShowChecklist(false)} />
        )}

        {/* ── No data yet ── */}
        {!isInitialLoading && !hasData && storeStatus === 'connected' && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-6">
            <p className="font-semibold text-foreground mb-1">Your store is connected — let's pull in your listings.</p>
            <p className="text-sm text-muted-foreground">Hit sync in the top right to import your Etsy listings.</p>
          </div>
        )}

        <OptimizationUsageBanner />

        {/* ── MAIN CONTENT: two columns ── */}
        {hasData && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

            {/* LEFT column */}
            <div className="space-y-4">

              {/* Daily AI Briefing */}
              {connectedStore?.id && (
                <DailyBriefingCard storeId={connectedStore.id} pendingFixCount={pendingFixCount ?? 0} />
              )}

              {/* Priority actions — single consolidated queue. The old
                  "Your Priority Actions" list duplicated EchoPicksPanel
                  near-verbatim (same usePendingFixActions rows), and the
                  detailed StoreHealthScoreCard repeated the hero ring; score
                  detail lives on ScoreRoadmap, linked from the hero. */}
              <EchoPicksPanel />

              {/* Activity */}
              <OptimizationActivityFeed />
            </div>

            {/* RIGHT column */}
            <div className="space-y-4">

              {/* Echo's Insight — the one proactive-assistant voice (naming unified: Echo) */}
              <div className="rounded-2xl border border-violet-300/50 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-950/20 overflow-hidden">
                <div className="flex items-start gap-2.5 px-4 py-3.5 border-b border-violet-200/60 dark:border-violet-500/20">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-500/15 shrink-0 mt-0.5">
                    <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">Echo's Insight</p>
                  </div>
                  <Sparkles className="h-3.5 w-3.5 text-violet-300 dark:text-violet-500 shrink-0" />
                </div>
                <div className="px-4 py-3">
                  {(intelligence as unknown as { niche_summary?: string | null } | null)?.niche_summary ? (
                    <p className="text-sm text-violet-900 dark:text-violet-100 leading-relaxed">{(intelligence as unknown as { niche_summary: string }).niche_summary}</p>
                  ) : (
                    <p className="text-sm text-violet-800/80 dark:text-violet-200 leading-relaxed italic">
                      "Echo is scanning your niche for trending tags and competitor insights. Check back after your first sync."
                    </p>
                  )}
                </div>
              </div>

              {/* This Week's Wins */}
              {recentWins.length > 0 && (
                <div className="rounded-2xl border border-border bg-surface-1 shadow-warm-sm p-4">
                  <h3 className="text-sm font-bold text-foreground mb-3" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                    This Week's Wins
                  </h3>
                  <div className="space-y-2">
                    {recentWins.map((win, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm text-foreground/80">{win}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Optimization Streak */}
              {recentOptimizations.length > 0 && (
                <div className="rounded-2xl border border-border bg-surface-1 shadow-warm-sm px-4 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                      Optimization Streak
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {recentOptimizations.length} optimization{recentOptimizations.length === 1 ? '' : 's'} this week
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-primary/10 border-2 border-primary/25 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-primary" />
                  </div>
                </div>
              )}

              {/* Quick nav links */}
              <div className="grid grid-cols-1 gap-2.5">
                <Link
                  to="/app/intelligence"
                  className="group flex items-center gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3 hover:border-primary/30 hover:bg-primary/4 transition-all"
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <BarChart2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Intelligence Hub</p>
                    <p className="text-[11px] text-muted-foreground">Tags, competitors & niche trends</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/60 group-hover:translate-x-0.5 transition-all" />
                </Link>
              </div>
            </div>
          </div>
        )}

        <FixActionDrawer fixActionId={openFixId} onClose={() => setOpenFixId(null)} />
      </div>

      {/* Milestone toast */}
      <MilestoneToast milestone={milestone} />
    </div>
  )
}

/** Clean Stitch-style KPI card */
function StitchKPI({
  label, value, icon, iconColor, trend, trendUp, onClick,
}: {
  label: string
  value: string
  icon: React.ReactNode
  iconColor: string
  trend?: string
  trendUp?: boolean
  onClick?: () => void
}) {
  const inner = (
    <div className="rounded-2xl border border-border bg-surface-1 p-4 flex flex-col gap-2 shadow-warm-sm h-full">
      <div className="flex items-start justify-between gap-2">
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${iconColor}`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-[11px] font-semibold ${trendUp ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            {trendUp && '↑ '}{trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium leading-none mb-1">{label}</p>
        <p className="text-2xl font-bold text-foreground leading-none" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
          {value}
        </p>
      </div>
    </div>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left h-full cursor-pointer hover:scale-[1.02] transition-transform">
        {inner}
      </button>
    )
  }
  return inner
}

function PipelineStatusBlock() {
  const { data: pipeline } = usePipelineStatus()
  if (!pipeline || pipeline.status !== 'running') return null
  const reason = pipeline.trigger_reason ?? ''
  const stage: PipelineStage = reason.includes('niche') ? 'niche' : reason.includes('scor') ? 'scoring' : 'market'
  return <PipelineLoadingState stage={stage} listingsProcessed={pipeline.listings_processed} />
}
