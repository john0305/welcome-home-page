/**
 * MarketDashboardCard — full market intelligence overview for the Dashboard.
 *
 * Shows:
 *   1. Average market score with a clear plain-English label
 *   2. Sub-score breakdown: tags / title / price / photos vs competitor benchmarks
 *   3. Ordered action plan (worst sub-score first) with direct CTAs
 *   4. Refresh that triggers the pipeline and invalidates queries on completion
 *
 * Empty states:
 *   - No data yet → "Run your first scan"
 *   - Pipeline running → progress state
 *   - Niche unknown → nudge toward personalization form
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, Tag, Type, DollarSign, Image, RefreshCw, Loader2,
  ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useShopMarketOverview, useInvalidateMarket } from '@/hooks/useShopMarketOverview'
import { usePipelineStatus, triggerPipeline } from '@/hooks/useMarketScore'
import { useToast } from '@/hooks/use-toast'

const SCORE_COLOR = (s: number) =>
  s >= 70 ? '#10b981' : s >= 50 ? '#00C4AF' : s >= 30 ? '#f59e0b' : '#ef4444'

const SCORE_LABEL = (s: number) => {
  if (s >= 75) return 'Competitive in your niche'
  if (s >= 55) return 'Room to close the gap'
  if (s >= 35) return 'Falling behind competitors'
  if (s > 0)   return 'Significant gaps to fix'
  return 'No market data yet'
}

const NICHE_LABELS: Record<string, string> = {
  jewelry: 'Jewelry', handmade_bath_beauty: 'Bath & Beauty', vintage: 'Vintage',
  home_decor: 'Home Decor', art_prints: 'Art & Prints', craft_supplies: 'Craft Supplies',
  digital_downloads: 'Digital Downloads', paper_party: 'Paper & Party',
  clothing_accessories: 'Clothing & Accessories', accessories: 'Accessories',
}

const DIM_META = {
  tags:   { icon: Tag,        label: 'Tags',   color: '#a78bfa' },
  title:  { icon: Type,       label: 'Title',  color: '#60a5fa' },
  price:  { icon: DollarSign, label: 'Price',  color: '#34d399' },
  photos: { icon: Image,      label: 'Photos', color: '#fbbf24' },
} as const

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'hsl(var(--border))' }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${score}%`, background: color }}
      />
    </div>
  )
}

export function MarketDashboardCard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: overview, isLoading } = useShopMarketOverview()
  const { data: pipeline } = usePipelineStatus()
  const invalidateMarket = useInvalidateMarket()
  const [refreshing, setRefreshing] = useState(false)
  const [whyExpanded, setWhyExpanded] = useState(false)

  const isRunning = pipeline?.status === 'running' || refreshing

  const handleRefresh = async () => {
    setRefreshing(true)
    const result = await triggerPipeline(true)
    if (!result.ok) {
      setRefreshing(false)
      toast({ title: 'Scan failed', description: result.error, variant: 'destructive' })
      return
    }
    toast({ title: 'Market scan started', description: 'Takes about 60 seconds. Scores update automatically.' })
    // Poll until pipeline completes, then invalidate
    const poll = setInterval(async () => {
      const { data } = await (supabase as any)
        .from('pipeline_run_log')
        .select('status')
        .eq('user_id', (await (supabase as any).auth.getUser()).data?.user?.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data?.status === 'complete' || data?.status === 'failed') {
        clearInterval(poll)
        setRefreshing(false)
        invalidateMarket()
      }
    }, 4000)
    // Safety: stop polling after 2 min
    setTimeout(() => { clearInterval(poll); setRefreshing(false) }, 120_000)
  }

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-xl border overflow-hidden" style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}>
        <div className="h-0.5" style={{ background: '#00C4AF' }} />
        <div className="p-5 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-20" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
    )
  }

  // ── No data / pipeline not run ──────────────────────────────────────────────
  if (!overview) {
    return (
      <div className="rounded-xl border overflow-hidden" style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}>
        <div className="h-0.5" style={{ background: '#00C4AF' }} />
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: '#00C4AF' }} />
              <span className="text-sm font-semibold text-foreground">Market Score</span>
            </div>
          </div>
          {isRunning ? (
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="h-5 w-5 animate-spin shrink-0" style={{ color: '#00C4AF' }} />
              <div>
                <p className="text-sm font-medium text-foreground">Scanning your market…</p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Finding your real competitors. Takes about 60 seconds.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                We haven't scanned your market yet. One scan finds your real competitors and shows you exactly where you stand — not just as a number, but as a real position in your niche.
              </p>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: '#00C4AF', color: '#000' }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Scan my market now
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const scoreColor = SCORE_COLOR(overview.avg_market_score)
  const nicheLabel = overview.primary_niche
    ? (NICHE_LABELS[overview.primary_niche] ?? overview.primary_niche)
    : null

  const subScores = [
    { key: 'tags'   as const, score: overview.tag_score.avg,   failing: overview.tag_score.failing_count },
    { key: 'title'  as const, score: overview.title_score.avg, failing: overview.title_score.failing_count },
    { key: 'photos' as const, score: overview.photo_score.avg, failing: overview.photo_score.failing_count },
    { key: 'price'  as const, score: overview.price_score.avg, failing: overview.price_score.failing_count },
  ].sort((a, b) => a.score - b.score) // worst first

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(0,196,175,0.05) 0%, rgba(0,196,175,0.02) 100%)',
        borderColor: `${scoreColor}35`,
      }}
    >
      <div style={{ height: 2, background: `linear-gradient(90deg, transparent 0%, ${scoreColor} 20%, ${scoreColor} 80%, transparent 100%)` }} />

      <div className="p-5 space-y-4">

        {/* ── Header: score ring + label + refresh ── */}
        <div className="flex items-start gap-4">
          {/* Score ring */}
          <div className="relative shrink-0" style={{ width: 68, height: 68 }}>
            <svg width="68" height="68" viewBox="0 0 68 68">
              <circle cx="34" cy="34" r="28" fill="none" stroke="#1a2e2e" strokeWidth="6" />
              <circle
                cx="34" cy="34" r="28" fill="none"
                stroke={scoreColor} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 28}`}
                strokeDashoffset={`${2 * Math.PI * 28 * (1 - overview.avg_market_score / 100)}`}
                transform="rotate(-90 34 34)"
                style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold leading-none" style={{ color: scoreColor, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                {overview.avg_market_score}
              </span>
              <span className="text-[8px] uppercase tracking-wide mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>/100</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 shrink-0" style={{ color: '#00C4AF' }} />
                <span className="text-sm font-semibold text-foreground">Market Score</span>
              </div>
              <button
                onClick={handleRefresh}
                disabled={isRunning}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-medium transition-all hover:bg-white/5 disabled:opacity-40 shrink-0"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
              >
                {isRunning ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
                {isRunning ? 'Scanning…' : 'Refresh'}
              </button>
            </div>
            <p className="text-sm font-medium" style={{ color: scoreColor }}>{SCORE_LABEL(overview.avg_market_score)}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {nicheLabel && `${nicheLabel} · `}{overview.scored_listings} listings scored
            </p>
          </div>
        </div>

        {/* ── Why this score ── */}
        <div>
          <button
            onClick={() => setWhyExpanded(e => !e)}
            className="flex items-center gap-1.5 text-xs font-semibold w-full text-left"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            {whyExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Why this score
          </button>

          {whyExpanded && (
            <div className="mt-3 space-y-2.5">
              {subScores.map(({ key, score, failing }) => {
                const meta = DIM_META[key]
                const Icon = meta.icon
                const color = SCORE_COLOR(score)

                // Benchmark comparison line
                let benchmarkLine = ''
                if (overview.benchmarks) {
                  const b = overview.benchmarks
                  if (key === 'tags' && overview.user_avg_tags > 0)
                    benchmarkLine = `You avg ${overview.user_avg_tags} tags · competitors avg ${Math.round(b.avg_tag_count)}`
                  else if (key === 'title' && overview.user_avg_title_length > 0)
                    benchmarkLine = `You avg ${overview.user_avg_title_length} chars · competitors avg ${Math.round(b.avg_title_length)}`
                  else if (key === 'photos' && overview.user_avg_photos > 0)
                    benchmarkLine = `You avg ${overview.user_avg_photos} photos · competitors avg ${Math.round(b.avg_photo_count)}`
                  else if (key === 'price' && b.avg_price > 0)
                    benchmarkLine = `Niche average $${b.avg_price.toFixed(2)}`
                }

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3 w-3 shrink-0" style={{ color: meta.color }} />
                        <span className="text-[11px] font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{meta.label}</span>
                        {failing > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
                            {failing} listings
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-bold" style={{ color }}>{score}/100</span>
                    </div>
                    <ScoreBar score={score} color={color} />
                    {benchmarkLine && (
                      <p className="text-[9px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{benchmarkLine}</p>
                    )}
                  </div>
                )
              })}

              {overview.benchmarks && (
                <p className="text-[9px] pt-1" style={{ color: 'hsl(var(--foreground))' }}>
                  Based on {overview.benchmarks.competitor_count} competitors in your niche.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action plan removed — replaced by Zone 2 "Biggest Levers" on the dashboard. */}


        {/* ── Top missing tags (compact) ── */}
        {overview.top_missing_tags.length > 0 && (
          <div className="border-t pt-3" style={{ borderColor: 'hsl(var(--border))' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#f59e0b' }}>
              Tags your competitors use that you don't
            </p>
            <div className="flex flex-wrap gap-1.5">
              {overview.top_missing_tags.slice(0, 6).map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ background: 'rgba(245,158,11,0.10)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── No benchmarks warning ── */}
        {!overview.benchmarks && overview.avg_market_score > 0 && (
          <div className="flex items-start gap-2 rounded-md p-2.5 border"
            style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.20)' }}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
            <p className="text-[10px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Competitor benchmarks not yet loaded. Hit Refresh to pull the latest competitor data for your niche.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}

// Supabase client for the polling logic above
import { supabase } from '@/integrations/supabase/client'
