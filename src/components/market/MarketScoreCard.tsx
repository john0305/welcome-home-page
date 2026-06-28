import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Tag, Type, DollarSign, Image, Heart, Lock, RefreshCw, Loader2, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { canUseTierOnly } from '@/lib/tier-access'
import type { MarketScoreRow } from '@/hooks/useMarketScore'
import { triggerPipeline, usePipelineStatus, useNicheProfile } from '@/hooks/useMarketScore'
import { useToast } from '@/hooks/use-toast'
import { LockedFeature } from './LockedFeature'
import type { GapIndicators } from '@/lib/marketScoreGaps'
import { supabase } from '@/integrations/supabase/client'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  score: MarketScoreRow | null | undefined
  tier: string | null | undefined
  loading?: boolean
  /** When true the user has no niche detected yet — show empty state */
  nicheUnknown?: boolean
  /** Current listing price (used to display "Niche avg $X · You're at $Y") */
  listingPrice?: number | null
  /** Status indicators per sub-score, computed from fix_lifecycle + score */
  indicators?: GapIndicators
  /** Listing UUID — enables realtime niche updates + fallback selector */
  listingUuid?: string
}

const INDICATOR: Record<string, { label: string; emoji: string; color: string } | undefined> = {
  'open-fix':   { label: 'Open fix available', emoji: '🔴', color: '#ef4444' },
  'fixed':      { label: 'Fixed — monitoring', emoji: '✅', color: '#10b981' },
  'user-action':{ label: 'User action needed', emoji: '⚠️', color: '#f59e0b' },
  'advisory':   { label: 'Advisory only',      emoji: '💡', color: '#60a5fa' },
  'info':       undefined,
}


const SCORE_COLOR = (s: number) =>
  s >= 70 ? '#10b981' : s >= 50 ? 'hsl(var(--primary))' : s >= 30 ? '#f59e0b' : '#ef4444'

const SUB_DIMS = [
  { key: 'title_score',       label: 'Title',       icon: Type,       desc: 'Length and keyword placement vs competitors' },
  { key: 'tag_score',         label: 'Tags',        icon: Tag,        desc: 'Tag coverage vs top competitor tags' },
  { key: 'price_score',       label: 'Price',       icon: DollarSign, desc: 'Within ±20% of niche average' },
  { key: 'photo_score',       label: 'Photos',      icon: Image,      desc: 'Photo count vs competitor average' },
  { key: 'favorites_score',   label: 'Traction',    icon: Heart,      desc: 'Favorites vs niche average (log scale)' },
] as const

function scoreLabel(score: number): string {
  if (score >= 80) return 'Above average for your niche'
  if (score >= 60) return 'Competitive — room to close the gap'
  if (score >= 40) return 'Below average — specific gaps to fix'
  return 'Significantly behind competitors'
}

// Semantic grouping: cluster near-duplicate tags so "gift for her", "gifts for
// women", "gift for wife" collapse to a single chip. We normalise each tag
// (lowercase + synonym-mapped tokens, sorted) and keep the most-used variant
// from each group as the representative.
const TAG_SYNONYMS: Record<string, string> = {
  her: 'woman', women: 'woman', woman: 'woman', wife: 'woman', girl: 'woman',
  girls: 'woman', female: 'woman', females: 'woman', mom: 'woman', mum: 'woman',
  mother: 'woman', ladies: 'woman', lady: 'woman',
  him: 'man', men: 'man', man: 'man', husband: 'man', boy: 'man',
  boys: 'man', male: 'man', dad: 'man', father: 'man',
  gifts: 'gift', present: 'gift', presents: 'gift',
  jewellery: 'jewelry',
  necklaces: 'necklace', earrings: 'earring', rings: 'ring', bracelets: 'bracelet',
}

function normaliseTag(t: string): string {
  return t.toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => TAG_SYNONYMS[w] ?? w)
    .sort()
    .join(' ')
}

function groupSimilarTags(
  items: Array<{ tag: string; pct: number }>,
): Array<{ tag: string; pct: number; variants: string[] }> {
  const groups = new Map<string, { tag: string; pct: number; variants: string[] }>()
  for (const it of items) {
    if (!it.tag) continue
    const key = normaliseTag(it.tag)
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { tag: it.tag, pct: it.pct, variants: [it.tag] })
    } else {
      existing.variants.push(it.tag)
      if (it.pct > existing.pct) { existing.tag = it.tag; existing.pct = it.pct }
    }
  }
  return [...groups.values()].sort((a, b) => b.pct - a.pct)
}

function formatScanTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${dateStr} at ${timeStr}`
}

function nextStepHint(score: MarketScoreRow): string {
  const lowestKey = (['title_score', 'tag_score', 'price_score', 'photo_score'] as const)
    .reduce((low, k) => ((score[k] ?? 100) < (score[low] ?? 100) ? k : low), 'title_score' as const)

  const hints: Record<string, string> = {
    title_score: `Lengthen your title — competitors average longer, keyword-richer titles`,
    tag_score:   `Add ${score.missing_tag_count ?? 'missing'} competitor tags to close your tag gap`,
    price_score: `Your price may be off from niche average — check Price Positioning`,
    photo_score: `Add more photos — competitors have more images`,
  }
  return hints[lowestKey] ?? 'Review the breakdown below for your top opportunity'
}

export function MarketScoreCard({ score, tier, loading, nicheUnknown, listingPrice, indicators, listingUuid }: Props) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: pipeline, refetch: refetchPipeline } = usePipelineStatus()
  const { data: nicheProfile } = useNicheProfile()
  const [expanded, setExpanded] = useState(false)
  
  const [refreshing, setRefreshing] = useState(false)

  // ── Detecting-state UX: progressive message + hard 90s timeout ──────────
  const [detectElapsed, setDetectElapsed] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const [selectedFallback, setSelectedFallback] = useState('')
  const [savingFallback, setSavingFallback] = useState(false)
  const detectStartRef = useRef<number | null>(null)


  const canSeeBreakdown = canUseTierOnly(tier, 'market_score_breakdown')
  const primaryColor = '#00C4AF'

  const handleRefresh = async () => {
    setRefreshing(true)
    const result = await triggerPipeline(true)
    setRefreshing(false)
    if (result.ok) {
      // Reset the detecting timer so the user gets the full 90s window again
      detectStartRef.current = Date.now()
      setDetectElapsed(0)
      setTimedOut(false)
      toast({ title: 'Scan started', description: "We're scanning your market. Check back in ~60 seconds." })
      refetchPipeline()
    } else {
      toast({ title: 'Refresh failed', description: result.error ?? 'Unknown error', variant: 'destructive' })
    }
  }

  // Auto-trigger a market scan the first time we mount with an unknown niche
  // and no pipeline already running. Manual refresh icon stays available for
  // explicit re-scans.
  const autoTriggeredRef = useRef(false)
  useEffect(() => {
    if (autoTriggeredRef.current) return
    if (!nicheUnknown && score) return
    if (pipeline?.status === 'running') return
    if (loading) return
    autoTriggeredRef.current = true
    void triggerPipeline(false).then((res) => {
      if (res.ok) refetchPipeline()
    })
  }, [nicheUnknown, score, pipeline?.status, loading, refetchPipeline])

  // ── Realtime subscription: when the listings row's niche fields update,
  // invalidate market_score + resolve_niche so the card re-renders in place
  // without a manual refresh. Active only while we're in the detecting state.
  const detectingActive = !loading && !score && (nicheUnknown || pipeline?.status === 'running')
  useEffect(() => {
    if (!listingUuid || !detectingActive) return
    const channel = supabase
      .channel(`listing-niche:${listingUuid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'listings', filter: `id=eq.${listingUuid}` },
        (payload) => {
          const row = payload.new as { niche?: string | null; niche_status?: string | null }
          if (row?.niche || row?.niche_status === 'resolved' || row?.niche_status === 'needs_input') {
            queryClient.invalidateQueries({ queryKey: ['resolve_niche'] })
            queryClient.invalidateQueries({ queryKey: ['market_score'] })
            queryClient.invalidateQueries({ queryKey: ['niche_profile'] })
          }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [listingUuid, detectingActive, queryClient])

  // ── Progressive timer + 90s hard timeout while detecting ─────────────────
  useEffect(() => {
    if (!detectingActive) {
      detectStartRef.current = null
      setDetectElapsed(0)
      setTimedOut(false)
      return
    }
    if (detectStartRef.current == null) detectStartRef.current = Date.now()
    const tick = () => {
      const startedAt = detectStartRef.current ?? Date.now()
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      setDetectElapsed(elapsed)
      if (elapsed >= 90) setTimedOut(true)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [detectingActive])

  // While detecting, retry the resolver every 15s — once the pipeline writes
  // user_niche_profiles we'll hit the shop_niche fallback (Level 3) and resolve.
  useEffect(() => {
    if (!detectingActive || !listingUuid) return
    const id = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['resolve_niche'] })
    }, 15000)
    return () => window.clearInterval(id)
  }, [detectingActive, listingUuid, queryClient])

  const detectingMessage = useMemo(() => {
    if (detectElapsed < 45) return 'Detecting niche… (this can take up to 60 seconds)'
    if (detectElapsed < 90) return 'Still working — almost there…'
    return 'Detection took longer than expected.'
  }, [detectElapsed])

  const nicheOptions = useMemo(() => {
    const opts = new Set<string>()
    if (nicheProfile?.primary_niche && nicheProfile.primary_niche !== 'unknown') {
      opts.add(nicheProfile.primary_niche)
    }
    ;(nicheProfile?.keyword_clusters ?? []).forEach((c) => c && opts.add(c))
    return Array.from(opts)
  }, [nicheProfile])

  const saveManualNiche = async (chosen: string) => {
    if (!listingUuid || !chosen) return
    setSavingFallback(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('listings')
        .update({
          niche: chosen,
          niche_source: 'needs_input',
          niche_status: 'resolved',
          niche_confidence: 0.4,
          niche_detected_at: new Date().toISOString(),
        })
        .eq('id', listingUuid)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['resolve_niche'] })
      queryClient.invalidateQueries({ queryKey: ['market_score'] })
      // Kick a re-scan now that we have a confirmed niche
      void triggerPipeline(true).then((r) => { if (r.ok) refetchPipeline() })
      toast({ title: 'Niche set', description: `Using "${chosen}" for this listing.` })
    } catch (e) {
      toast({ title: 'Could not save', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSavingFallback(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border overflow-hidden" style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}>
        <div className="h-0.5" style={{ background: primaryColor }} />
        <div className="p-5 space-y-4">
          <Skeleton className="h-5 w-40" />
          <div className="flex items-center gap-6">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-8 w-32" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // No-comp-data state: a score row exists but every score is null (new behavior)
  // OR every score is 0 (legacy rows written before we returned nulls). Either
  // way, the Etsy public-search API failed for every keyword cluster.
  const allZero = !!score &&
    (score.market_score ?? 0) === 0 &&
    (score.title_score ?? 0) === 0 &&
    (score.tag_score ?? 0) === 0 &&
    (score.photo_score ?? 0) === 0 &&
    (score.favorites_score ?? 0) === 0
  const noCompData = !!score && (score.market_score == null || allZero)


  if (nicheUnknown || !score || noCompData) {
    const isRunning = pipeline?.status === 'running'
    let message: string
    if (isRunning) {
      message = 'Scanning your market…'
    } else if (nicheUnknown) {
      message = "We haven't detected your shop's niche yet. Run a scan to start seeing market insights for this listing."
    } else if (noCompData) {
      message = "We couldn't load competitor data from Etsy on the last scan (the public search API may have been rate-limited). Try again in a minute."
    } else {
      message = "No market score for this listing yet. Run a scan to generate one."
    }

    // Auto-trigger handles the initial scan; show a pulsing "Detecting niche…"
    // indicator while we wait. Manual re-scan stays in the top-right corner.
    const isDetecting = isRunning || nicheUnknown || (!score && !noCompData)
    // While auto-detection is silently running in the background, render a
    // compact one-line pill instead of a full card. The full card returns
    // automatically once a score is available (or the niche-needs-input
    // fallback fires after the 90s timeout).
    if (isDetecting && !timedOut) {
      return (
        <div
          className="rounded-lg border px-3 py-2 flex items-center gap-2.5"
          style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
              style={{ background: primaryColor }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: primaryColor }}
            />
          </span>
          <span className="text-xs text-foreground/80 flex-1 min-w-0 truncate">
            Market score — scanning your niche in the background…
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing || isRunning}
            title="Re-scan market"
            aria-label="Re-scan market"
            className="p-1 rounded-md hover:bg-white/5 disabled:opacity-40 shrink-0"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            {refreshing || isRunning
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RefreshCw className="h-3 w-3" />}
          </button>
        </div>
      )
    }

    return (
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}
      >
        <div className="h-0.5" style={{ background: primaryColor }} />
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: primaryColor }} />
              <span className="text-sm font-semibold text-foreground">Market Score</span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing || isRunning}
              title="Re-scan market"
              aria-label="Re-scan market"
              className="p-1.5 rounded-md border transition-all hover:bg-white/5 disabled:opacity-40"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              {refreshing || isRunning
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RefreshCw className="h-3 w-3" />}
            </button>
          </div>
          {isDetecting && timedOut ? (
            nicheProfile?.primary_niche && nicheProfile.primary_niche !== 'unknown' ? (
              <div className="py-4 space-y-2">
                <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                  <span className="font-medium text-foreground">{nicheProfile.primary_niche}</span>
                </p>
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Using shop niche as estimate. Re-scan to refine.
                </p>
                {nicheOptions.length > 1 && (
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={selectedFallback}
                      onChange={(e) => setSelectedFallback(e.target.value)}
                      className="text-xs rounded-md px-2 py-1.5 bg-white/5 border border-white/10 text-foreground"
                    >
                      <option value="">Override niche…</option>
                      {nicheOptions.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedFallback || savingFallback}
                      onClick={() => saveManualNiche(selectedFallback)}
                      className="text-xs px-2 py-1.5 rounded-md border border-white/10 hover:bg-white/5 disabled:opacity-40"
                      style={{ color: primaryColor }}
                    >
                      {savingFallback ? 'Saving…' : 'Apply'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-4 space-y-2">
                <p className="text-sm text-foreground">
                  We couldn't detect a niche automatically.
                </p>
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Select the best match for this listing.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  {nicheOptions.length > 0 ? (
                    <select
                      value={selectedFallback}
                      onChange={(e) => setSelectedFallback(e.target.value)}
                      className="text-xs rounded-md px-2 py-1.5 bg-white/5 border border-white/10 text-foreground flex-1"
                    >
                      <option value="">Choose a niche…</option>
                      {nicheOptions.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={selectedFallback}
                      onChange={(e) => setSelectedFallback(e.target.value)}
                      placeholder="e.g. boho wall art"
                      className="text-xs rounded-md px-2 py-1.5 bg-white/5 border border-white/10 text-foreground flex-1"
                    />
                  )}
                  <button
                    type="button"
                    disabled={!selectedFallback.trim() || savingFallback}
                    onClick={() => saveManualNiche(selectedFallback.trim())}
                    className="text-xs px-2 py-1.5 rounded-md border border-white/10 hover:bg-white/5 disabled:opacity-40"
                    style={{ color: primaryColor }}
                  >
                    {savingFallback ? 'Saving…' : 'Apply'}
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="py-4">
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{message}</p>
            </div>
          )}
        </div>
      </div>
    )
  }



  const marketScore = score.market_score ?? 0
  const scoreColor = SCORE_COLOR(marketScore)

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(0,196,175,0.07) 0%, rgba(0,196,175,0.02) 100%)',
        borderColor: `${scoreColor}40`,
        boxShadow: `0 4px 24px ${scoreColor}10`,
      }}
    >
      <div style={{ height: 2, background: `linear-gradient(90deg, transparent 0%, ${scoreColor} 20%, ${scoreColor} 80%, transparent 100%)` }} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: primaryColor }} />
            <span className="text-sm font-semibold text-foreground">Market Score</span>
            {score.keyword_cluster && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{ background: 'rgba(0,196,175,0.12)', color: primaryColor }}
              >
                {score.keyword_cluster}
              </span>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing || pipeline?.status === 'running'}
            title="Re-scan market"
            aria-label="Re-scan market"
            className="p-1.5 rounded-md border transition-all hover:bg-white/5 disabled:opacity-40"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
          >
            {refreshing || pipeline?.status === 'running'
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RefreshCw className="h-3 w-3" />}
          </button>
        </div>

        {/* Main score display */}
        <div className="flex items-center gap-6 mb-4">
          {/* Score ring */}
          <div className="relative shrink-0" style={{ width: 88, height: 88 }}>
            <svg width="88" height="88" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r="36" fill="none" stroke="#1a2e2e" strokeWidth="8" />
              <circle
                cx="44" cy="44" r="36"
                fill="none"
                stroke={scoreColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 36}`}
                strokeDashoffset={`${2 * Math.PI * 36 * (1 - marketScore / 100)}`}
                transform="rotate(-90 44 44)"
                style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold" style={{ color: scoreColor, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                {marketScore}
              </span>
              <span className="text-[9px] uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>/ 100</span>
            </div>
          </div>

          {/* Text content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground font-medium">{scoreLabel(marketScore)}</p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {nextStepHint(score)}
            </p>

            {/* Missing competitor tags — wrap, show top 3, expand for the rest */}
            <MissingTagsChips
              rawDetail={score.missing_tags_detail?.length
                ? score.missing_tags_detail
                : (score.missing_tags ?? []).map((t) => ({ tag: t, pct: 0 }))}
              scannedAt={score.scored_at}
            />
          </div>
        </div>


        {/* Breakdown toggle */}
        {canSeeBreakdown ? (
          <>
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ color: primaryColor }}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? 'Hide breakdown' : 'Score breakdown'}
            </button>

            {expanded && (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {SUB_DIMS.map(({ key, label, icon: Icon, desc }) => {
                  const rawVal = score[key]
                  const isUnavailable = key === 'price_score' && (rawVal == null || score.niche_avg_price == null)
                  const val = rawVal ?? 0
                  const color = isUnavailable ? '#475569' : SCORE_COLOR(val)
                  return (
                    <div
                      key={key}
                      className="rounded-lg p-3 flex flex-col"
                      style={{ background: 'hsl(var(--surface-2))', border: '1px solid hsl(var(--border))' }}
                    >
                      <div className="flex items-center gap-1 mb-1.5">
                        <Icon className="h-3 w-3" style={{ color }} />
                        <span className="text-[9px] uppercase tracking-wide font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</span>
                        {(() => {
                          const indKey = key === 'title_score' ? 'title'
                            : key === 'tag_score' ? 'tags'
                            : key === 'photo_score' ? 'photos'
                            : key === 'price_score' ? 'price'
                            : 'favorites'
                          const ind = indicators ? INDICATOR[indicators[indKey as keyof GapIndicators]] : undefined
                          if (!ind) return null
                          return (
                            <span title={ind.label} className="ml-auto text-[10px]" style={{ color: ind.color }}>
                              {ind.emoji}
                            </span>
                          )
                        })()}
                      </div>
                      {isUnavailable ? (
                        <p className="text-[11px] font-medium" style={{ color: 'hsl(var(--muted-foreground))', fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                          Niche avg unavailable
                        </p>
                      ) : (
                        <>
                          <p className="text-xl font-bold" style={{ color, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>{val}</p>
                          <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: 'hsl(var(--border))' }}>
                            <div className="h-full rounded-full" style={{ width: `${val}%`, background: color, transition: 'width 0.7s ease' }} />
                          </div>
                        </>
                      )}
                      <p className="text-[9px] mt-1.5 leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {key === 'price_score' && score.niche_avg_price != null && listingPrice != null
                          ? `Niche avg: $${Math.round(score.niche_avg_price)} · You're at $${Math.round(listingPrice)}`
                          : desc}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </>

        ) : (
          <LockedFeature
            feature="market_score_breakdown"
            tier={tier}
            preview={
              <div className="flex gap-2 mt-1">
                {SUB_DIMS.map(({ key, label }) => (
                  <div key={key} className="flex-1 rounded-lg p-2 text-center" style={{ background: 'hsl(var(--surface-2))' }}>
                    <p className="text-xs font-bold blur-sm select-none text-foreground">{score[key] ?? '??'}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</p>
                  </div>
                ))}
              </div>
            }
          />
        )}
      </div>
    </div>
  )
}

function MissingTagsChips({
  rawDetail,
  scannedAt,
}: {
  rawDetail: Array<{ tag: string; pct: number }>
  scannedAt: string | null | undefined
}) {
  const [showAll, setShowAll] = useState(false)
  const grouped = useMemo(() => groupSimilarTags(rawDetail).slice(0, 10), [rawDetail])
  if (grouped.length === 0) return null
  const COLLAPSED = 3
  const visible = showAll ? grouped : grouped.slice(0, COLLAPSED)
  const hidden = grouped.length - visible.length
  const scanned = formatScanTimestamp(scannedAt)
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Tag className="h-3 w-3" style={{ color: '#f59e0b' }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#f59e0b' }}>
          {grouped.length} competitor tag{grouped.length === 1 ? '' : 's'} you're missing
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {visible.map(({ tag, pct, variants }) => (
          <span
            key={tag}
            title={
              (pct > 0 ? `Used by ${pct}% of top competitors` : 'Used by top competitors') +
              (variants.length > 1 ? ` · also: ${variants.filter((v) => v !== tag).join(', ')}` : '')
            }
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
          >
            {tag}
            {pct > 0 && <span className="text-[10px] opacity-70">{pct}%</span>}
          </span>
        ))}
        {hidden > 0 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium hover:bg-white/5 transition-colors"
            style={{ color: '#f59e0b', border: '1px dashed rgba(245,158,11,0.35)' }}
          >
            +{hidden} more
          </button>
        )}
        {showAll && grouped.length > COLLAPSED && (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium hover:bg-white/5 transition-colors"
            style={{ color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' }}
          >
            Show less
          </button>
        )}
      </div>
      {scanned && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <Clock className="h-2.5 w-2.5" />
          Last scanned: {scanned}
        </div>
      )}
    </div>
  )
}
