import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { computeGaps } from '@/lib/marketScoreGaps'
import type { FixLifecycleRow } from '@/lib/fixLifecycle'
import { ArrowLeft, Eye, Heart, ShoppingBag, Clock, Sparkles, ExternalLink, Image as ImageIcon, CheckCircle2, XCircle, ChevronDown, ChevronUp, Undo2, AlertTriangle, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Header } from '@/components/layout/Header'
import { GradeDisplay } from '@/components/optimization/GradeDisplay'
import { OptimizationDiff } from '@/components/optimization/OptimizationDiff'
import { useListingActions } from '@/hooks/useListingActions'
import { hasPersonalization } from '@/lib/personalization'
import { recordOptimizationFeedback } from '@/lib/optimizationFeedback'
import { Loader2 } from 'lucide-react'
import { RejectModal } from '@/components/optimization/RejectModal'
import type { RejectionCategory } from '@/components/optimization/RejectModal'
import { GradeBadge } from '@/components/listings/GradeBadge'
import { ListingChangelog } from '@/components/listings/ListingChangelog'
import { ClarifyingQuestionsCard } from '@/components/listings/ClarifyingQuestionsCard'
import { SuggestedActionsCard, type SuggestedAction } from '@/components/listings/SuggestedActionsCard'
import { PeerRecommendationsCard } from '@/components/listings/PeerRecommendationsCard'
import { EffortMetric } from '@/components/listings/EffortMetric'
import { FixQueue } from '@/components/listings/FixQueue'
import { ResolvedFixes } from '@/components/listings/ResolvedFixes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SwipeableTabs, type SwipeTab } from '@/components/listings/SwipeableTabs'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { Plane } from 'lucide-react'
import { mockGrades } from '@/data/mockData'
import { formatDate, formatCurrency, daysSince, formatSales } from '@/lib/utils'
import { getGradeLabel } from '@/types'
import { OptimizationImpactChart, MilestoneStrip, type ImpactSnapshot } from '@/components/listings/OptimizationImpactChart'
import { OptimizeSplitButton } from '@/components/listings/OptimizeSplitButton'
import { PhotoAnalysisPanel } from '@/components/listings/PhotoAnalysisPanel'
import { ListingRenewalTimeline } from '@/components/listings/ListingRenewalTimeline'
import { SelectiveRewriteReviewDialog } from '@/components/optimization/SelectiveRewriteReviewDialog'
import { OptimizationReviewDialog } from '@/components/optimization/OptimizationReviewDialog'
import { OptimizationPreflightModal } from '@/components/optimization/OptimizationPreflightModal'
import { useOptimizationPreflight } from '@/hooks/useOptimizationPreflight'
import type { RewriteFieldType, PhotoAnalysisResult, PeerRecVerdict, OptimizeOptions } from '@/hooks/useListingActions'
import { useMarketScore } from '@/hooks/useMarketScore'
import { useResolveNiche } from '@/hooks/useResolveNiche'
import { MarketScoreCard } from '@/components/market/MarketScoreCard'
import { GuidedFixFlow } from '@/components/market/GuidedFixFlow'
import { useListingFlags } from '@/hooks/useListingFlags'
import { VelocityContextBlock } from '@/components/listings/VelocityContextBlock'
import { format } from 'date-fns'
import { Progress } from '@/components/ui/progress'

export default function ListingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { listings, loadListings, connectedStore, refreshConnectedStore } = useApp()
  const { user } = useAuth()
  const { optimizeNow, gradeNow, rewriteField, analyzePhotos, rejectAndReoptimize, isOptimizing, isGrading } = useListingActions()
  const { flagsByListingId, applyFlag } = useListingFlags()
  const [reviewOptId, setReviewOptId] = useState<string | null>(null)
  // Full-row state for opening the OptimizationReviewDialog inline (pending full optimizations).
  const [pendingReviewRow, setPendingReviewRow] = useState<Parameters<typeof OptimizationReviewDialog>[0]['optimization']>(null)
  const [openingPendingReview, setOpeningPendingReview] = useState(false)
  const [photoPanelOpen, setPhotoPanelOpen] = useState(false)
  const [photoAnalysisLoading, setPhotoAnalysisLoading] = useState(false)
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisResult['analysis'] | null>(null)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set())
  const [rejectedIds, setRejectedIds] = useState<Map<string, string>>(new Map())
  const [pushingId, setPushingId] = useState<string | null>(null)
  const [descExpanded, setDescExpanded] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [optimizeError, setOptimizeError] = useState<string | null>(null)
  const [gradeFlash, setGradeFlash] = useState<{ delta: number } | null>(null)
  // Active tab is now controlled so the indicator pill can switch to the
  // Description tab before scrolling the Peer Recommendations card into view.
  const [activeTab, setActiveTab] = useState<string>('overview')
  const [openIssueCount, setOpenIssueCount] = useState<number | null>(null)
  // Pre-flight modal state — populated when the seller hits Optimize and the
  // backend reports open clarifying questions.
  const [preflightModal, setPreflightModal] = useState<{ open: boolean; questions: string[] } | null>(null)
  // Captured during a fresh optimize run so the review dialog can show the
  // "What influenced this optimization" card with the right context.
  const [lastRun, setLastRun] = useState<{
    optimizationId: string
    verdicts: PeerRecVerdict[]
    sessionAnswers: Record<string, string> | null
  } | null>(null)

  const [versions, setVersions] = useState<Array<{ id: string; created_at: string }>>([])
  const [reverting, setReverting] = useState(false)
  const [loadingListing, setLoadingListing] = useState(false)
  const { toast } = useToast()

  const isVacation = !!connectedStore?.is_vacation

  const listing = listings.find(l => l.id === id)

  // On hard refresh the listings cache in AppContext is empty, so trigger a
  // load instead of immediately showing "not found".
  useEffect(() => {
    if (!listing && listings.length === 0 && !loadingListing) {
      setLoadingListing(true)
      loadListings().finally(() => setLoadingListing(false))
    }
  }, [listing, listings.length, loadListings, loadingListing])

  const [optimizations, setOptimizations] = useState<Array<{
    id: string; created_at: string; status: string;
    original_title: string | null; original_description: string | null;
    original_tags: string[] | null; original_materials: string[] | null;
    optimized_title: string | null; optimized_description: string | null;
    optimized_tags: string[] | null; optimized_materials: string[] | null;
    original_grade: number | null; new_grade: number | null; grade_improvement: number | null;
    latest_grade: number | null; latest_grade_at: string | null;
    reject_reason: string | null;
  }>>([])

  const [snapshots, setSnapshots] = useState<ImpactSnapshot[]>([])
  const [vacationPeriods, setVacationPeriods] = useState<Array<{ started_on: string; ended_on: string | null }>>([])
  const [vacationBannerDismissed, setVacationBannerDismissed] = useState(false)
  const [optBannerDismissed, setOptBannerDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !id) return false
    return window.localStorage.getItem(`radariq:opt-banner-dismissed:${id}`) === '1'
  })

  useEffect(() => {
    if (!id) return
    supabase
      .from('listing_versions')
      .select('id, created_at')
      .eq('listing_id', id)
      .is('restored_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setVersions(data ?? []))

    supabase
      .from('optimizations')
      .select('id, created_at, status, original_title, original_description, original_tags, original_materials, optimized_title, optimized_description, optimized_tags, optimized_materials, original_grade, new_grade, grade_improvement, latest_grade, latest_grade_at, reject_reason')
      .eq('listing_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setOptimizations((data ?? []) as typeof optimizations))

    supabase
      .from('listing_snapshots')
      .select('recorded_on, views, favorites, quantity')
      .eq('listing_id', id)
      .order('recorded_on', { ascending: true })
      .limit(120)
      .then(({ data }) => setSnapshots((data ?? []) as ImpactSnapshot[]))
  }, [id])

  // Vacation history for this shop — used for chart overlay + return banner.
  useEffect(() => {
    const shopId = connectedStore?.shop_id
    if (!shopId) return
    supabase
      .from('shop_vacation_periods')
      .select('started_on, ended_on')
      .eq('etsy_shop_id', String(shopId))
      .order('started_on', { ascending: true })
      .then(({ data }) => setVacationPeriods((data ?? []) as Array<{ started_on: string; ended_on: string | null }>))
  }, [connectedStore?.shop_id])

  const recentlyReturnedFromVacation = useMemo(() => {
    const now = Date.now()
    return vacationPeriods.some(p => {
      if (!p.ended_on) return false
      const endedTs = new Date(p.ended_on + 'T00:00:00Z').getTime()
      const days = (now - endedTs) / 86400000
      return days >= 0 && days <= 14
    })
  }, [vacationPeriods])

  const handleRevert = async () => {
    if (versions.length === 0) return
    if (!confirm('Revert this listing to the saved original? This will push the original back to Etsy.')) return
    setReverting(true)
    const { error } = await supabase.functions.invoke('revert-listing', {
      body: { version_id: versions[0].id },
    })
    setReverting(false)
    if (error) {
      toast({ title: 'Revert failed', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Reverted to original', variant: 'success' })
    setVersions([])
  }

  const handleRewriteField = async (type: RewriteFieldType) => {
    if (!listing) return
    const result = await rewriteField(listing.id, type)
    if (result?.optimization_id) {
      setReviewOptId(result.optimization_id)
      // Also refresh the optimizations history so the new pending row shows up.
      supabase
        .from('optimizations')
        .select('id, created_at, status, original_title, original_description, original_tags, original_materials, optimized_title, optimized_description, optimized_tags, optimized_materials, original_grade, new_grade, grade_improvement, latest_grade, latest_grade_at, reject_reason')
        .eq('listing_id', listing.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => setOptimizations((data ?? []) as typeof optimizations))
    }
  }

  const handleAnalyzePhotos = async () => {
    if (!listing) return
    setPhotoPanelOpen(true)
    setPhotoAnalysisLoading(true)
    setPhotoAnalysis(null)
    const result = await analyzePhotos(listing.id)
    setPhotoAnalysisLoading(false)
    if (result?.analysis) setPhotoAnalysis(result.analysis)
    else setPhotoPanelOpen(false)
  }
  const reloadOpts = async () => {
    if (!id) return
    const { data } = await supabase
      .from('optimizations')
      .select('id, created_at, status, original_title, original_description, original_tags, original_materials, optimized_title, optimized_description, optimized_tags, optimized_materials, original_grade, new_grade, grade_improvement, latest_grade, latest_grade_at, reject_reason')
      .eq('listing_id', id)
      .order('created_at', { ascending: false })
    setOptimizations((data ?? []) as typeof optimizations)
  }

  const openPendingReview = async (optId: string) => {
    setOpeningPendingReview(true)
    const { data, error } = await supabase
      .from('optimizations')
      .select('id, listing_id, original_title, original_description, original_tags, original_materials, optimized_title, optimized_description, optimized_tags, optimized_materials, original_grade, new_grade, grade_improvement, validation_warnings')
      .eq('id', optId)
      .maybeSingle()
    setOpeningPendingReview(false)
    if (error || !data) {
      toast({ title: 'Could not load review', description: error?.message ?? 'Optimization not found.', variant: 'destructive' })
      return
    }
    setPendingReviewRow(data as typeof pendingReviewRow)
  }

  // ──────────────────────────────────────────────────────────────────────
  // Optimization preflight: surfaces cached peer recs + up to 3 open
  // clarifying questions WITHOUT consuming a credit. Powers both the
  // always-visible indicator pill and the lightweight questions modal
  // shown right before the optimize call.
  // ──────────────────────────────────────────────────────────────────────
  const { data: preflight, refresh: refreshPreflight } = useOptimizationPreflight(id)

  const scrollToCard = (cardId: 'peer-recommendations' | 'clarifying-questions') => {
    const tabId = cardId === 'peer-recommendations' ? 'peers' : 'help-ai'
    setActiveTab(tabId)
    setTimeout(() => {
      const el = document.getElementById(cardId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  // Submit handler shared by all "Optimize" entry points on this page.
  // 1. Re-fetch preflight (cheap, no credit) so we have the freshest open
  //    questions even if the seller answered some via the inline card.
  // 2. If there are open questions → open the modal and let the user fill /
  //    skip; the modal's onSubmit calls runOptimize with the payload.
  // 3. Otherwise → run optimize directly with no extra payload, identical
  //    to today's flow.
  // Preflight failures are silent — we fall through to a plain optimize so
  // a flaky preflight never blocks the core action.
  const runOptimize = async (opts?: OptimizeOptions) => {
    if (!listing) return
    setOptimizeError(null)
    const res = await optimizeNow([listing.id], opts)
    if (!res.ok) {
      setOptimizeError(res.error ?? 'Optimization failed — please try again.')
      return
    }
    if (res.optimizationId) {
      setLastRun({
        optimizationId: res.optimizationId,
        verdicts: res.peerRecVerdicts ?? [],
        sessionAnswers: res.sessionAnswers ?? null,
      })
    }
    await reloadOpts()
    // Refresh preflight so the pill reflects answered questions.
    void refreshPreflight()
  }

  const handleOptimizeClick = async () => {
    if (!listing) return
    let openQs: string[] = []
    try {
      const pre = await refreshPreflight()
      openQs = (pre.open_questions ?? []).map(q => q.question).filter(Boolean)
    } catch {
      openQs = []
    }
    if (openQs.length > 0) {
      setPreflightModal({ open: true, questions: openQs })
      return
    }
    await runOptimize()
  }




  const handleAccept = async (optId: string) => {
    if (isVacation) {
      toast({
        title: 'Your shop is on vacation mode',
        description: 'Etsy blocks listing updates while your shop is on vacation. This will stay pending — turn vacation off and try again.',
        variant: 'destructive',
      })
      return
    }
    setPushingId(optId)
    const { data, error } = await supabase.functions.invoke('push-to-etsy', {
      body: { optimization_id: optId },
    })
    let serverMsg: string | null = null
    if (error) {
      try {
        const ctx = (error as Error & { context?: { json?: () => Promise<unknown> } }).context
        const body = ctx?.json ? (await ctx.json()) as { error?: string; message?: string } : null
        serverMsg = body?.message || body?.error || null
      } catch { /* ignore */ }
    }
    setPushingId(null)
    const payload = (data ?? null) as { error?: string; message?: string } | null
    if (error || payload?.error) {
      const msg = serverMsg || payload?.message || payload?.error || error?.message || 'Etsy rejected the update'
      // Refresh store status in case vacation just got toggled on.
      void refreshConnectedStore()
      toast({
        title: 'Could not push to Etsy',
        description: `${msg} — the optimization stays pending and you can retry later.`,
        variant: 'destructive',
      })
      return
    }
    setAcceptedIds(prev => new Set([...prev, optId]))
    toast({ title: 'Pushed to Etsy', description: 'Your listing is updated. Revert anytime.', variant: 'success' })
    // Flip into monitoring mode + re-grade so sub-scores reflect the new content
    // (and "gaps still affecting your score" clears anything that's now above threshold).
    if (id) {
      void applyFlag(id, 'optimized_monitoring')
      // Show the success banner again for this fresh apply
      try { window.localStorage.removeItem(`radariq:opt-banner-dismissed:${id}`) } catch { /* ignore */ }
      setOptBannerDismissed(false)
      void gradeNow(id)
    }
    await reloadOpts()
    void loadListings()
  }





  if (!listing) {
    if (loadingListing || listings.length === 0) {
      return (
        <div className="flex flex-col">
          <Header title="Loading…" />
          <div className="p-6 flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      )
    }
    return (
      <div className="flex flex-col">
        <Header title="Listing Not Found" />
        <div className="p-6 text-center py-20">
          <p className="text-muted-foreground">Listing not found.</p>
          <Button className="mt-4" onClick={() => navigate('/app/listings')}>
            Back to Listings
          </Button>
        </div>
      </div>
    )
  }


  // Build the grade display from the listing's stored score_breakdown so the
  // sidebar reflects whatever grade-listing last wrote, instead of the static
  // mockGrades fixture. Falls back to mockGrades only in dev/mock mode.
  const sb = (listing as unknown as { score_breakdown?: {
    overall?: number; rules?: Record<string, number>; ai?: Record<string, unknown>;
    summary?: string; personalization_used?: boolean;
    score_deductions?: string[]; recommendations?: string[];
    photos_analyzed?: number; photos_total?: number;
  } | null }).score_breakdown
  const dbScore = (listing as unknown as { score?: number | null }).score
  const decayPoints = Number((listing as { decay_points?: number }).decay_points ?? 0)
  const needsAttention = !!(listing as { needs_attention?: boolean }).needs_attention
  const clarifyingQuestions = ((listing as { clarifying_questions?: string[] | null }).clarifying_questions ?? []) as string[]
  const clarifyingAnswers = (listing as { clarifying_answers?: Record<string, string> | null }).clarifying_answers ?? null
  const clarifyingHistory = ((listing as { clarifying_history?: unknown }).clarifying_history ?? []) as Array<{ question: string; answer: string | null; asked_at?: string; answered_at?: string | null; updated_at?: string | null; skipped_at?: string | null }>

  const liveGrade = sb ? (() => {
    const r = sb.rules ?? {}
    const a = (sb.ai ?? {}) as Record<string, unknown>
    const num = (v: unknown) => Number(v) || 0
    const rawOverall = sb.overall ?? dbScore ?? 0
    const overall = Math.max(0, rawOverall - decayPoints)
    const cap = (n: number) => Math.max(0, Math.min(25, Math.round(n)))
    const deductions = (sb.score_deductions as string[] | undefined) ?? (a.top_issues as string[] | undefined) ?? []
    const recs = (sb.recommendations as string[] | undefined)
      ?? (a.prioritized_recommendations as string[] | undefined)
      ?? (a.quick_win ? [a.quick_win as string] : [])
    const priceDir = a.price_direction as string | undefined
    const priceReason = a.price_reasoning as string | undefined
    const priceNote = priceDir && priceDir !== "fair"
      ? `Price looks ${priceDir === "too_high" ? "too high" : "too low"}${priceReason ? ` — ${priceReason}` : ""}.`
      : null
    const photosNote = sb.photos_analyzed != null && sb.photos_total != null && sb.photos_analyzed < sb.photos_total
      ? `Only ${sb.photos_analyzed} of ${sb.photos_total} photos were analyzed.`
      : null
    return {
      overall_score: overall,
      title_score: cap(num(r.title_rule) * 1.5 + num(a.title_quality) * 1),
      description_score: cap(num(r.description_rule) * 1.5 + num(a.description_alignment) * 1),
      tags_score: cap(num(r.tags_rule) * 1.5 + num(a.tags_relevance) * 1),
      image_score: cap(num(r.photos_rule) * 1 + num(a.photo_quality) * 1),
      strengths: [],
      weaknesses: [
        ...(priceNote ? [priceNote] : []),
        ...(photosNote ? [photosNote] : []),
        ...deductions,
      ],
      recommendations: recs,
      personalization_used: !!sb.personalization_used,
    }
  })() : null
  const grade = liveGrade ?? mockGrades.find(g => g.listing_id === id)

  // Approved optimizations (for impact display)
  const approvedOpts = optimizations
    .filter(o => o.status === 'approved' || o.status === 'accepted' || o.status === 'pushed')
    .map(o => ({ id: o.id, approved_at: o.created_at }))
    .sort((a, b) => a.approved_at.localeCompare(b.approved_at))
  const hasImpactData = approvedOpts.length > 0
  const firstOptDate = approvedOpts[0]?.approved_at ?? null
  const lastOptDate = approvedOpts[approvedOpts.length - 1]?.approved_at ?? null

  // Compute delta vs snapshot closest before lastOptDate
  type DeltaResult = { delta: number; pct: number | null; direction: 'up' | 'down' | 'flat'; hasData: boolean; postDays: number }
  const computeDelta = (field: 'views' | 'favorites' | 'quantity'): DeltaResult => {
    if (!hasImpactData || snapshots.length < 2) return { delta: 0, pct: null, direction: 'flat', hasData: false, postDays: 0 }
    const optTs = new Date(lastOptDate!).getTime()
    const get = (s: ImpactSnapshot) => (field === 'quantity' ? (s.quantity ?? 0) : (s[field] ?? 0))
    const before = [...snapshots].reverse().find(s => new Date(s.recorded_on).getTime() < optTs)
    const after = snapshots[snapshots.length - 1]
    if (!before || !after || new Date(after.recorded_on).getTime() <= optTs) {
      return { delta: 0, pct: null, direction: 'flat', hasData: false, postDays: 0 }
    }
    const delta = get(after) - get(before)
    const pct = get(before) > 0 ? (delta / get(before)) * 100 : null
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
    const postDays = Math.max(0, Math.round((new Date(after.recorded_on).getTime() - optTs) / 86400000))
    return { delta, pct, direction, hasData: true, postDays }
  }
  const viewsDelta = computeDelta('views')
  const favsDelta = computeDelta('favorites')
  const salesDelta = computeDelta('quantity') // proxy for sales — qty change
  const lastSnapDate = snapshots[snapshots.length - 1]?.recorded_on

  const DeltaBadge = ({ d, unit }: { d: DeltaResult; unit: string }) => {
    if (!d.hasData) return null
    const color = d.direction === 'up' ? 'text-emerald-600' : d.direction === 'down' ? 'text-[#F0A500]' : 'text-foreground/40'
    const arrow = d.direction === 'up' ? '↑' : d.direction === 'down' ? '↓' : '→'
    const sign = d.delta > 0 ? '+' : ''
    const main = d.direction === 'flat' ? 'flat' : `${sign}${d.delta} ${unit}`
    const pct = d.pct != null && d.direction !== 'flat' ? ` (${sign}${d.pct.toFixed(1)}%)` : ''
    return (
      <div className={`mt-1 text-[10px] font-medium ${color}`}>
        {arrow} {main}{pct}
        <div className="mt-0.5 text-[9px] font-normal text-muted-foreground">since last optimization</div>
      </div>
    )
  }

  // ── Post-optimization state ────────────────────────────────────────────
  // A listing is considered "optimized" once the most recent accepted/pushed
  // optimization exists OR the user explicitly flipped it into monitoring.
  const listingFlags = flagsByListingId.get(listing.id) ?? []
  const monitoringFlag = listingFlags.find(f => f.flag_type === 'optimized_monitoring') ?? null
  const lastAppliedOpt = optimizations.find(o => o.status === 'accepted' || o.status === 'pushed' || acceptedIds.has(o.id)) ?? null
  const optimizedAt = monitoringFlag?.applied_at ?? lastAppliedOpt?.created_at ?? null
  const isOptimized = !!optimizedAt
  const signal7 = optimizedAt ? new Date(new Date(optimizedAt).getTime() + 7 * 86_400_000) : null
  const signal30 = optimizedAt ? new Date(new Date(optimizedAt).getTime() + 30 * 86_400_000) : null
  const monitoringProgress = (() => {
    if (!optimizedAt || !signal7) return 0
    const start = new Date(optimizedAt).getTime()
    const end = signal7.getTime()
    const pct = ((Date.now() - start) / (end - start)) * 100
    return Math.max(0, Math.min(100, pct))
  })()
  const dismissOptBanner = () => {
    setOptBannerDismissed(true)
    try { window.localStorage.setItem(`radariq:opt-banner-dismissed:${listing.id}`, '1') } catch { /* ignore */ }
  }


  return (
    <div className="flex flex-col">
      <Header
        title={listing.title.slice(0, 60) + (listing.title.length > 60 ? '...' : '')}
        actions={
          versions.length > 0 ? (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleRevert} disabled={reverting}>
              <Undo2 className="h-3.5 w-3.5" />
              {reverting ? 'Reverting…' : 'Revert to original'}
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {recentlyReturnedFromVacation && !vacationBannerDismissed && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            <Plane className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 text-foreground/90">
              Your shop recently returned from vacation mode. Views and favorites may take 7–14 days to normalize — we'll keep tracking in the meantime.
            </div>
            <button
              type="button"
              onClick={() => setVacationBannerDismissed(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {isOptimized && !optBannerDismissed && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
            <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 text-foreground/90">
              Optimization applied — your listing has been updated on Etsy. Signal data will appear in 7–14 days.
            </div>
            <button
              type="button"
              onClick={dismissOptBanner}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <MarketInsightsBlock
          listingUuid={listing.id}
          etsyListingId={String((listing as { etsy_listing_id?: number | string }).etsy_listing_id ?? '')}
          currentTitle={listing.title}
          currentTags={(listing.tags ?? []) as string[]}
          listingPrice={listing.price ?? null}
          photoCount={listing.image_urls?.length ?? (listing as { photo_count?: number }).photo_count ?? null}
          tier={user?.tier}
        />

        <div className="space-y-5">
          <div className="space-y-5">
            {/* Title & meta */}
            <Card>

              <CardContent className="p-5">
                {/* Two-column: listing info left + grade panel right (sm+) */}
                <div className="flex gap-4">
                  {/* ── Left: info + actions ── */}
                  <div className="flex-1 min-w-0">
                    {/* Top row: status badges + View on Etsy + mobile-only grade badge */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <Badge variant={listing.state === 'active' ? 'success' : 'secondary'} className="h-5 px-2 py-0 text-[10px]">
                          {listing.state ? listing.state.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : ''}
                        </Badge>
                        {optimizations.some(o => o.status === 'pending') ? (
                          <Badge variant="outline" className="h-5 px-2 py-0 text-[10px] border-primary/60 text-primary bg-primary/5">Pending review</Badge>
                        ) : isOptimized ? (
                          <Badge className="h-5 px-2 py-0 text-[10px] bg-primary/15 text-primary border-transparent hover:bg-primary/20">
                            Optimized {optimizedAt ? format(new Date(optimizedAt), 'MMM d') : ''}
                          </Badge>
                        ) : listing.optimization_count === 0 && (
                          <Badge variant="warning" className="h-5 px-2 py-0 text-[10px]">Never optimized</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Grade badge on mobile only — desktop shows it in the right panel */}
                        <div className="sm:hidden">
                          <GradeBadge score={listing.current_grade ?? dbScore ?? 0} size="lg" />
                        </div>
                        <a
                          href={`https://www.etsy.com/listing/${listing.etsy_listing_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>View on Etsy</span>
                        </a>
                      </div>
                    </div>

                    {/* Title */}
                    <h2 className="text-lg font-semibold leading-snug break-words">{listing.title}</h2>

                    {gradeFlash && (
                      <span className={`sm:hidden text-xs font-semibold animate-in fade-in slide-in-from-top-1 ${gradeFlash.delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {gradeFlash.delta > 0 ? '+' : ''}{gradeFlash.delta} pts
                      </span>
                    )}
                    <ListingChangelog listingId={listing.id} />

                    {preflight && (preflight.peer_count > 0 || preflight.open_questions.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {preflight.peer_count > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('peers')}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15 transition-colors"
                            aria-label="Jump to peer recommendations"
                          >
                            <Sparkles className="h-3 w-3" />
                            {preflight.peer_recommendations.length || preflight.peer_count} Peer {(preflight.peer_recommendations.length || preflight.peer_count) === 1 ? 'Insight' : 'Insights'}
                          </button>
                        )}
                        {preflight.open_questions.length > 0 && (
                          <button
                            type="button"
                            onClick={() => scrollToCard('clarifying-questions')}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15 transition-colors"
                            aria-label="Jump to clarifying questions"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {preflight.open_questions.length} {preflight.open_questions.length === 1 ? 'Question' : 'Questions'}
                          </button>
                        )}
                      </div>
                    )}

                    <p className="text-2xl font-bold mt-2">{formatCurrency(listing.price)}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(() => {
                        const pendingOpt = optimizations.find(o => o.status === 'pending')
                        if (!pendingOpt) return null
                        return (
                          <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={openingPendingReview}
                            onClick={() => void openPendingReview(pendingOpt.id)}
                          >
                            {openingPendingReview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            {openingPendingReview ? 'Loading…' : 'Review pending optimization'}
                          </Button>
                        )
                      })()}
                      {isOptimized ? (
                        <div className="w-full rounded-lg border border-primary/30 bg-primary/8 p-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-primary">
                            <Eye className="h-4 w-4" />
                            Watching for signal
                          </div>
                          {signal7 && signal30 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Est. 7-day signal {format(signal7, 'MMM d')} · Est. 30-day signal {format(signal30, 'MMM d')}
                            </p>
                          )}
                          <Progress value={monitoringProgress} className="mt-2 h-1.5" />
                          <p className="mt-2 text-xs text-muted-foreground">
                            We'll notify you when this listing shows meaningful view or favorite changes after optimization.
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                        <OptimizeSplitButton
                          busy={isOptimizing(listing.id)}
                          size="sm"
                          onOptimizeAll={() => void handleOptimizeClick()}
                          onRewriteField={(t) => void handleRewriteField(t)}
                          onAnalyzePhotos={() => void handleAnalyzePhotos()}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={isGrading(listing.id)}
                          onClick={async () => {
                            const prev = (listing.current_grade ?? dbScore ?? 0) as number
                            const res = await gradeNow(listing.id)
                            if (res.ok && res.newScore != null) {
                              const delta = Math.round(res.newScore - prev)
                              if (delta !== 0) {
                                setGradeFlash({ delta })
                                setTimeout(() => setGradeFlash(null), 3000)
                              }
                            }
                          }}
                        >
                          {isGrading(listing.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          {isGrading(listing.id) ? 'Regrading…' : 'Grade'}
                        </Button>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">Re-optimize if you want to iterate before signal arrives.</p>
                    </div>
                  ) : (
                    <>
                      <OptimizeSplitButton
                        busy={isOptimizing(listing.id)}
                        onOptimizeAll={() => void handleOptimizeClick()}
                        onRewriteField={(t) => void handleRewriteField(t)}
                        onAnalyzePhotos={() => void handleAnalyzePhotos()}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={isGrading(listing.id)}
                        onClick={async () => {
                          const prev = (listing.current_grade ?? dbScore ?? 0) as number
                          const res = await gradeNow(listing.id)
                          if (res.ok && res.newScore != null) {
                            const delta = Math.round(res.newScore - prev)
                            if (delta !== 0) {
                              setGradeFlash({ delta })
                              setTimeout(() => setGradeFlash(null), 3000)
                            }
                          }
                        }}
                      >
                        {isGrading(listing.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {isGrading(listing.id) ? 'Regrading…' : 'Grade'}
                      </Button>
                    </>
                  )}
                </div>
                {optimizeError && (
                  <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div className="flex-1">{optimizeError}</div>
                    <button
                      type="button"
                      onClick={() => setOptimizeError(null)}
                      className="text-destructive/60 hover:text-destructive"
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                  </div>

                  {/* ── Right: grade panel (sm+) ── */}
                  <div className="hidden sm:flex flex-col w-[45%] shrink-0 pl-4 border-l border-border/40">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Listing Grade</p>

                    {/* Score number + grade letter + delta */}
                    {(() => {
                      const score = grade?.overall_score ?? listing.current_grade ?? dbScore ?? 0
                      const label = getGradeLabel(score)
                      const gradeColorCss = score >= 80 ? '#10b981' : score >= 60 ? 'hsl(var(--primary))' : score >= 40 ? '#f59e0b' : '#f97316'
                      return (
                        <div className="flex items-baseline gap-2 mb-3">
                          <span className="text-4xl font-bold leading-none" style={{ color: gradeColorCss, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                            {score}
                          </span>
                          <span
                            className="text-base font-bold px-2 py-0.5 rounded-lg"
                            style={{ background: `${gradeColorCss}20`, color: gradeColorCss, border: `1px solid ${gradeColorCss}40` }}
                          >
                            {label}
                          </span>
                          {gradeFlash && (
                            <span className={`text-xs font-semibold animate-in fade-in ${gradeFlash.delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {gradeFlash.delta > 0 ? '+' : ''}{gradeFlash.delta} pts
                            </span>
                          )}
                        </div>
                      )
                    })()}

                    {/* Factor bars */}
                    {grade ? (
                      <div className="space-y-2">
                        {([
                          { key: 'title_score', label: 'Title', max: 25, action: () => void handleRewriteField('title') },
                          { key: 'description_score', label: 'Description', max: 25, action: () => void handleRewriteField('description') },
                          { key: 'tags_score', label: 'Tags', max: 25, action: () => void handleRewriteField('tags') },
                          { key: 'image_score', label: 'Images', max: 25, action: () => void handleAnalyzePhotos() },
                        ] as const).map(f => {
                          const val = (grade as unknown as Record<string, number>)[f.key] ?? 0
                          const pct = Math.round((val / f.max) * 100)
                          const barColor = pct >= 88 ? '#10b981' : pct >= 72 ? '#3b82f6' : pct >= 56 ? '#f59e0b' : '#f97316'
                          return (
                            <div key={f.key}>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[10px] text-muted-foreground">{f.label}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-semibold tabular-nums" style={{ color: barColor }}>{val}/{f.max}</span>
                                  <button
                                    type="button"
                                    onClick={f.action}
                                    disabled={isOptimizing(listing.id)}
                                    className="text-[9px] font-medium text-primary hover:underline disabled:opacity-40"
                                  >
                                    Fix
                                  </button>
                                </div>
                              </div>
                              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--border))' }}>
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%`, background: barColor }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center pt-2">
                        <p className="text-xs text-muted-foreground mb-1.5">Not graded yet</p>
                        <Button size="sm" className="gap-1 h-7 text-xs" disabled={isGrading(listing.id)} onClick={() => void gradeNow(listing.id)}>
                          {isGrading(listing.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Grade
                        </Button>
                      </div>
                    )}

                    {!hasPersonalization(connectedStore?.shop_id) && grade && !(grade as { personalization_used?: boolean }).personalization_used && (
                      <Button size="sm" variant="link" className="h-auto px-0 py-0 text-[10px] justify-start mt-2" onClick={() => navigate('/app/store-profile')}>
                        + Personalize grade
                      </Button>
                    )}
                  </div>
                </div>
                {optimizeError && (
                  <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div className="flex-1">{optimizeError}</div>
                    <button
                      type="button"
                      onClick={() => setOptimizeError(null)}
                      className="text-destructive/60 hover:text-destructive"
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}


                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-center">
                  {(() => {
                    const sales = formatSales(listing)
                    const views = listing.views ?? 0
                    const favs = listing.favorites ?? 0
                    // For one-of-a-kind listings, "Sales" is always 0/1 — show
                    // favorite-rate (favs per 100 views) instead, which is a
                    // meaningful engagement signal for unique items.
                    const favRate = views > 0 ? (favs / views) * 100 : null
                    const thirdCard = sales.isUnique
                      ? {
                          label: 'Fav rate',
                          value: favRate === null ? '—' : `${favRate.toFixed(1)}%`,
                          delta: null as typeof salesDelta | null,
                          unit: '',
                        }
                      : {
                          label: 'Sales',
                          value: sales.value,
                          delta: salesDelta,
                          unit: 'sold',
                        }
                    return ([
                      { label: 'Views', value: views.toLocaleString(), delta: viewsDelta, unit: 'views' },
                      { label: 'Favorites', value: favs, delta: favsDelta, unit: '♥' },
                      thirdCard,
                      { label: 'Age', value: `${daysSince(listing.etsy_created_at)}d`, delta: null, unit: '' },
                    ] as const).map(s => (
                      <div key={s.label} className="rounded-md bg-muted p-2 sm:p-3 min-w-0">
                        <p className="text-base sm:text-lg font-bold truncate">{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        {s.delta && <DeltaBadge d={s.delta} unit={s.unit} />}
                      </div>
                    ))
                  })()}
                </div>
                {hasImpactData && viewsDelta.hasData && lastSnapDate && (
                  <p className="mt-2 text-center text-[10px] text-muted-foreground">
                    {viewsDelta.postDays} day{viewsDelta.postDays === 1 ? '' : 's'} post-optimization · data through {formatDate(lastSnapDate)}
                  </p>
                )}

              </CardContent>
            </Card>




            <SwipeableTabs
              value={activeTab}
              onChange={setActiveTab}
              tabs={[
                {
                  id: 'overview',
                  label: 'Overview',
                  content: (
                    <>
                      {(listing.image_urls?.length ?? 0) > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center justify-between">
                              <span className="flex items-center gap-1.5"><ImageIcon className="h-4 w-4" />Images ({listing.image_urls?.length ?? 0}/10)</span>
                              {listing.current_image_grade !== undefined && (
                                <GradeBadge score={listing.current_image_grade} size="sm" />
                              )}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="flex gap-2 flex-wrap">
                              {(listing.image_urls ?? []).map((url, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setLightboxIdx(i)}
                                  className="h-16 w-16 rounded overflow-hidden bg-surface-2 transition-transform hover:scale-105 hover:ring-2 hover:ring-primary/50 focus:outline-none focus:ring-2 focus:ring-primary"
                                  aria-label={`View image ${i + 1}`}
                                >
                                  <img src={url} alt={`Image ${i + 1}`} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                </button>
                              ))}
                              {Array.from({ length: Math.max(0, 10 - (listing.image_urls?.length ?? 0)) }).map((_, i) => (
                                <div key={`empty-${i}`} className="h-16 w-16 rounded border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
                                  <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
                                </div>
                              ))}
                            </div>
                            {(listing.image_urls?.length ?? 0) < 5 && (
                              <p className="mt-2 text-xs text-amber-600">⚠ Add {10 - (listing.image_urls?.length ?? 0)} more photos to maximize your image score</p>
                            )}
                          </CardContent>
                        </Card>
                      )}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Description ({(listing.description ?? '').length} chars)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className={`text-sm text-muted-foreground whitespace-pre-wrap ${descExpanded ? '' : 'line-clamp-6'}`}>{listing.description ?? ''}</p>
                          {(() => {
                            const desc = listing.description ?? ''
                            const lineCount = desc.split('\n').length
                            const needsExpand = lineCount > 6 || desc.length > 500
                            if (!needsExpand) return null
                            return (
                              <button
                                onClick={() => setDescExpanded(v => !v)}
                                className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                {descExpanded ? (
                                  <><ChevronUp className="h-3 w-3" /> Show less</>
                                ) : (
                                  <><ChevronDown className="h-3 w-3" /> Read more</>
                                )}
                              </button>
                            )
                          })()}
                          {(listing.description ?? '').length < 500 && (
                            <p className="mt-2 text-xs text-amber-600">⚠ Description is short ({(listing.description ?? '').length} chars). Aim for 500+ characters.</p>
                          )}
                        </CardContent>
                      </Card>

                      {/* Tags */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span>Tags ({(listing.tags ?? []).length}/13)</span>
                            {(listing.tags ?? []).length < 13 && (
                              <span className="text-[11px] text-amber-600 font-normal">{13 - (listing.tags ?? []).length} missing</span>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-1.5">
                            {(listing.tags ?? []).length > 0
                              ? (listing.tags ?? []).map(t => (
                                  <span key={t} className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary">{t}</span>
                                ))
                              : <span className="text-xs text-muted-foreground italic">No tags — add up to 13 for better search visibility</span>
                            }
                          </div>
                        </CardContent>
                      </Card>

                      {/* Materials + listing meta */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Listing Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1.5">Materials</p>
                            <div className="flex flex-wrap gap-1.5">
                              {(listing.materials ?? []).length > 0
                                ? (listing.materials ?? []).map(m => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)
                                : <span className="text-xs text-muted-foreground italic">No materials specified</span>}
                            </div>
                          </div>
                          {(() => {
                            const l = listing as { quantity?: number; who_made?: string; when_made?: string; taxonomy_path?: string[] }
                            const cells: { label: string; value: string; wide?: boolean }[] = []
                            if (listing.price != null) cells.push({ label: 'Price', value: `$${listing.price}` })
                            if (l.quantity != null) cells.push({ label: 'Quantity', value: String(l.quantity) })
                            if (l.who_made) cells.push({ label: 'Who Made', value: l.who_made.replace(/_/g, ' ') })
                            if (l.when_made) cells.push({ label: 'When Made', value: l.when_made.replace(/_/g, ' ') })
                            if (l.taxonomy_path?.length) cells.push({ label: 'Category', value: l.taxonomy_path.join(' › '), wide: true })
                            if (cells.length === 0) return null
                            // Pair up non-wide cells so rows always have 2 columns
                            const rows: typeof cells[] = []
                            const narrow = cells.filter(c => !c.wide)
                            const wide = cells.filter(c => c.wide)
                            for (let i = 0; i < narrow.length; i += 2) rows.push(narrow.slice(i, i + 2))
                            wide.forEach(c => rows.push([c]))
                            return (
                              <div className="space-y-2 text-xs">
                                {rows.map((row, ri) => (
                                  <div key={ri} className="grid grid-cols-2 gap-3">
                                    {row.map(cell => (
                                      <div key={cell.label} className={cell.wide ? 'col-span-2' : ''}>
                                        <p className="text-muted-foreground mb-0.5">{cell.label}</p>
                                        <p className="font-semibold text-foreground capitalize">{cell.value}</p>
                                      </div>
                                    ))}
                                    {row.length === 1 && !row[0].wide && <div />}
                                  </div>
                                ))}
                              </div>
                            )
                          })()}
                        </CardContent>
                      </Card>
                    </>
                  ),
                },
                {
                  id: 'performance',
                  label: 'Performance',
                  content: (
                    <>
                      <VelocityContextBlock listing={listing} />
                      {hasImpactData && (
                        <div className="space-y-2">
                          <OptimizationImpactChart snapshots={snapshots} optimizations={approvedOpts} vacationPeriods={vacationPeriods} />
                          <MilestoneStrip firstOptDate={firstOptDate} />
                        </div>
                      )}
                    </>
                  ),
                },
                {
                  id: 'actions',
                  label: 'Next Actions',
                  content: (
                    <>
                      <SuggestedActionsCard
                        actions={(
                          ((sb as Record<string, unknown> | null)?.suggested_actions as SuggestedAction[] | undefined)
                          ?? ((sb?.ai as Record<string, unknown> | undefined)?.suggested_actions as SuggestedAction[] | undefined)
                          ?? []
                        )}
                      />
                      <EffortMetric
                        optimizationCount={Number(listing.optimization_count ?? 0)}
                        etsyCreatedAt={listing.etsy_created_at}
                        lastOptimizedAt={listing.last_optimized_at}
                      />
                    </>
                  ),
                },
                {
                  id: 'peers',
                  label: 'Peers',
                  badge: preflight?.peer_count ? `${preflight.peer_count} peers` : undefined,
                  content: (
                    <div id="peer-recommendations" className="scroll-mt-20">
                      <PeerRecommendationsCard listingId={listing.id} />
                    </div>
                  ),
                },
                {
                  id: 'seo-recs',
                  label: 'SEO Recommendations',
                  content: grade ? (
                    <div className="space-y-4">
                      {(grade.strengths?.length ?? 0) > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-1.5 text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" /> Strengths
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-1.5">
                              {grade.strengths!.map((s, i) => (
                                <li key={i} className="flex items-start gap-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-sm leading-snug text-foreground/90">
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                      {(grade.weaknesses?.length ?? 0) > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-1.5 text-amber-600">
                              <AlertTriangle className="h-4 w-4" /> Weaknesses
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-1.5">
                              {grade.weaknesses!.map((s, i) => (
                                <li key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-sm leading-snug text-foreground/90">
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                      {(grade.recommendations?.length ?? 0) > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-1.5 text-blue-600">
                              <Sparkles className="h-4 w-4" /> Recommendations
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-1.5">
                              {grade.recommendations!.map((s, i) => (
                                <li key={i} className="flex items-start gap-2 rounded-lg bg-blue-50 px-2.5 py-2 text-sm leading-snug text-foreground/90">
                                  <span className="mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                                    {i + 1}
                                  </span>
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                      {!(grade.weaknesses?.length) && !(grade.recommendations?.length) && (
                        <Card>
                          <CardContent className="py-10 text-center">
                            <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">No weaknesses or recommendations — this listing looks solid.</p>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="py-10 text-center">
                        <p className="text-sm text-muted-foreground mb-3">Grade this listing to see SEO recommendations.</p>
                        <Button size="sm" className="gap-1.5" disabled={isGrading(listing.id)} onClick={() => void gradeNow(listing.id)}>
                          {isGrading(listing.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          Grade now
                        </Button>
                      </CardContent>
                    </Card>
                  ),
                },
                {
                  id: 'issues',
                  label: openIssueCount === 0 ? 'Open Issues' : `Open Issues (${openIssueCount})`,
                  muted: openIssueCount === 0,
                  content: (
                    <>
                      {needsAttention && (
                        <div className="rounded-md border border-amber-400/60 bg-amber-50 p-3 dark:bg-amber-950/30">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <div className="text-xs text-amber-800 dark:text-amber-200">
                              <p className="font-medium">Needs attention</p>
                              <p className="mt-0.5">
                                Traffic has dropped vs. this listing's own baseline and there's been no recent activity.
                                Grade reduced by <span className="font-semibold">{decayPoints}</span> pt{decayPoints === 1 ? '' : 's'} until it recovers or is refreshed.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      <FixQueue
                        listingId={listing.id}
                        shopId={String(connectedStore?.shop_id ?? '')}
                        etsyListingId={(listing as { etsy_listing_id?: number | string }).etsy_listing_id != null
                          ? String((listing as { etsy_listing_id?: number | string }).etsy_listing_id)
                          : null}
                        listingPrice={listing.price ?? null}
                        photoCount={listing.image_urls?.length ?? (listing as { photo_count?: number }).photo_count ?? null}
                        onCountChange={setOpenIssueCount}
                      />
                      <ResolvedFixes listingId={listing.id} />
                    </>
                  ),
                },
                {
                  id: 'renewals',
                  label: 'Renewals',
                  content: (
                    <ListingRenewalTimeline etsyListingId={listing?.etsy_listing_id != null ? String(listing.etsy_listing_id) : null} />
                  ),
                },
                {
                  id: 'history',
                  label: 'History',
                  badge: optimizations.length || undefined,
                  content: optimizations.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Sparkles className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-muted-foreground">No optimizations yet</p>
                        <Button className="mt-4 gap-2" size="sm" disabled={isOptimizing(listing.id)} onClick={() => void handleOptimizeClick()}>
                          {isOptimizing(listing.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          {isOptimizing(listing.id) ? 'Optimizing…' : 'Run first optimization'}
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      {optimizations.map(opt => {
                        const isAccepted = acceptedIds.has(opt.id) || opt.status === 'accepted' || opt.status === 'pushed'
                        const isRejected = rejectedIds.has(opt.id) || opt.status === 'rejected'
                        const isPending = !isAccepted && !isRejected && (opt.status === 'pending' || opt.status === 'completed')
                        return (
                          <Card key={opt.id}>
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <CardTitle className="text-sm">Optimization — {formatDate(opt.created_at)}</CardTitle>
                                <div className="flex items-center gap-2">
                                  {isRejected && rejectedIds.get(opt.id) && (
                                    <span className="text-xs text-muted-foreground italic">Rejected: {rejectedIds.get(opt.id)}</span>
                                  )}
                                  <Badge variant={isAccepted ? 'success' : isRejected ? 'destructive' : 'secondary'}>
                                    {isAccepted ? 'accepted' : isRejected ? 'rejected' : opt.status}
                                  </Badge>
                                </div>
                              </div>
                              {isAccepted && opt.new_grade != null && (
                                <div className="flex items-center gap-3 mt-2 text-xs">
                                  <span className="text-muted-foreground">
                                    At acceptance: <span className="font-medium text-foreground">{opt.new_grade}</span>
                                    {opt.original_grade != null && <span className="text-muted-foreground"> (from {opt.original_grade})</span>}
                                  </span>
                                  {opt.latest_grade != null && opt.latest_grade !== opt.new_grade && (
                                    <span className="text-muted-foreground">
                                      · Current: <span className={`font-medium ${opt.latest_grade >= opt.new_grade ? 'text-emerald-600' : 'text-amber-600'}`}>{opt.latest_grade}</span>
                                      <span className="ml-1">({opt.latest_grade >= opt.new_grade ? '+' : ''}{opt.latest_grade - opt.new_grade} since)</span>
                                      {opt.latest_grade_at && <span className="ml-1 text-muted-foreground">· re-graded {formatDate(opt.latest_grade_at)}</span>}
                                    </span>
                                  )}
                                </div>
                              )}
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <OptimizationDiff record={opt as unknown as import('@/types').OptimizationRecord} />
                              {isPending && opt.optimized_title && (
                                <>
                                  {isVacation && (
                                    <div className="flex items-start gap-2 rounded-md border border-amber-400/60 bg-amber-50 p-3 dark:bg-amber-950/30">
                                      <Plane className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                      <div className="text-xs text-amber-800 dark:text-amber-200">
                                        <p className="font-medium">Your shop is on vacation mode</p>
                                        <p className="mt-0.5">Etsy blocks listing updates while your shop is on vacation. You can still review or reject — accepting will stay pending until you turn vacation off.</p>
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex gap-2 pt-1">
                                    <Button size="sm" className="gap-1.5 flex-1" disabled={pushingId === opt.id || isVacation} onClick={() => void handleAccept(opt.id)}>
                                      {pushingId === opt.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                      {pushingId === opt.id ? 'Pushing to Etsy…' : 'Accept & apply to Etsy'}
                                    </Button>
                                    <Button size="sm" variant="outline" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5" disabled={pushingId === opt.id} onClick={() => setRejectTarget(opt.id)}>
                                      <XCircle className="h-3.5 w-3.5" /> Reject
                                    </Button>
                                  </div>
                                </>
                              )}
                            </CardContent>
                          </Card>
                        )
                      })}
                    </>
                  ),
                },
                {
                  id: 'seo-data',
                  label: 'SEO Data',
                  content: (() => {
                    // Tag frequency map: how many of your listings use each tag
                    const tagFreq = new Map<string, number>()
                    const totalListings = listings.length
                    for (const l of listings) {
                      for (const t of (l.tags ?? [])) {
                        tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1)
                      }
                    }
                    return (
                    <Card>
                      <CardContent className="p-5 space-y-4">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">Tags ({(listing.tags ?? []).length}/13)</p>
                          <p className="text-[11px] text-muted-foreground/60 mb-2">Hover a tag to see how often you use it across your shop.</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(listing.tags ?? []).map(t => {
                              const usedIn = tagFreq.get(t) ?? 0
                              const pct = totalListings > 0 ? Math.round((usedIn / totalListings) * 100) : 0
                              return (
                                <TooltipProvider key={t} delayDuration={100}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="secondary" className="text-xs cursor-default">{t}</Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="text-xs max-w-[200px]">
                                      <p>Used in <strong>{usedIn}</strong> of your {totalListings} listings ({pct}%)</p>
                                      {pct > 80 && <p className="text-amber-400 mt-0.5">Very common across your shop — try a more niche variant</p>}
                                      {pct < 5 && usedIn > 0 && <p className="text-emerald-400 mt-0.5">Rare in your shop — could be a differentiator</p>}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )
                            })}
                            {(listing.tags ?? []).length < 13 && <span className="text-xs text-amber-600">+{13 - (listing.tags ?? []).length} tags missing</span>}
                          </div>
                        </div>
                        <Separator />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">Materials ({(listing.materials ?? []).length})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(listing.materials ?? []).length > 0
                              ? (listing.materials ?? []).map(m => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)
                              : <span className="text-xs text-amber-600">No materials specified</span>}
                          </div>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {(() => {
                            const imgCount = (listing.image_urls?.length || (listing as { photo_count?: number }).photo_count || 0)
                            const lastSynced = (listing as { last_synced?: string | null }).last_synced
                            const lastOptimized = optimizations[0]?.created_at
                            return (
                              <>
                                <div><span className="text-muted-foreground">Created:</span> {formatDate(listing.etsy_created_at)}</div>
                                <div><span className="text-muted-foreground">Last synced:</span> {lastSynced ? formatDate(lastSynced) : '—'}</div>
                                <div><span className="text-muted-foreground">Optimized:</span> {listing.optimization_count ?? 0}×</div>
                                <div><span className="text-muted-foreground">Last optimized:</span> {lastOptimized ? formatDate(lastOptimized) : 'Never'}</div>
                                <div><span className="text-muted-foreground">Quantity:</span> {listing.quantity ?? '—'}</div>
                                <div><span className="text-muted-foreground">Images:</span> {imgCount}/10</div>
                              </>
                            )
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                    )
                  })(),
                },
              ] satisfies SwipeTab[]}
            />
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {needsAttention && (
              <div className="rounded-md border border-amber-400/60 bg-amber-50 p-3 dark:bg-amber-950/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-200">
                    <p className="font-medium">Needs attention</p>
                    <p className="mt-0.5">
                      Traffic has dropped vs. this listing's own baseline and there's been no recent activity.
                      Grade reduced by <span className="font-semibold">{decayPoints}</span> pt{decayPoints === 1 ? '' : 's'} until it recovers or is refreshed.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {(clarifyingQuestions.length > 0 || clarifyingHistory.length > 0) && (
              <div id="clarifying-questions" className="scroll-mt-20">
                <ClarifyingQuestionsCard
                  listingId={listing.id}
                  questions={clarifyingQuestions}
                  existingAnswers={clarifyingAnswers}
                  history={clarifyingHistory}
                  onSaved={() => { void loadListings(); void refreshPreflight() }}
                />
              </div>
            )}

            <ResolvedFixes listingId={listing.id} />

            {hasPersonalization(connectedStore?.shop_id) && grade && !(grade as { personalization_used?: boolean }).personalization_used && (
              <div className="rounded-md border border-amber-300/50 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                This grade was calculated without your shop personalization.
                <Button size="sm" variant="link" className="h-auto px-1 py-0 text-xs" disabled={isGrading(listing.id)} onClick={() => void gradeNow(listing.id)}>
                  {isGrading(listing.id) ? 'Re-grading…' : 'Re-grade with personalization'}
                </Button>
              </div>
            )}
          </div>

        </div>
      </div>

      <RejectModal
        open={!!rejectTarget}
        listingTitle={listing.title}
        onClose={() => setRejectTarget(null)}
        onReject={async (category: RejectionCategory, comment: string) => {
          if (!rejectTarget) return
          const reason = comment.trim() ? `${category}: ${comment.trim()}` : category
          setRejectedIds(prev => new Map([...prev, [rejectTarget, category]]))
          const { error } = await supabase
            .from('optimizations')
            .update({ status: 'rejected', rejected_at: new Date().toISOString(), reject_reason: reason })
            .eq('id', rejectTarget)
          if (error) {
            toast({ title: 'Failed to save feedback', description: error.message, variant: 'destructive' })
          } else {
            void recordOptimizationFeedback({
              optimizationId: rejectTarget,
              listingId: listing.id,
              action: 'rejected',
              reasonCategory: category,
              reasonText: comment.trim() || null,
            })
            toast({ title: 'Feedback saved', description: 'The AI will use this to improve future optimizations.' })
          }
          setRejectTarget(null)
        }}
        onRejectAndReoptimize={async (instructions: string) => {
          if (!rejectTarget || !listing) return
          setRejectTarget(null)
          const result = await rejectAndReoptimize(rejectTarget, listing.id, instructions)
          if (result?.optimization_id) {
            // Reload optimizations so the new pending one appears immediately
            const { data } = await supabase
              .from('optimizations')
              .select('id, created_at, status, original_title, original_description, original_tags, original_materials, optimized_title, optimized_description, optimized_tags, optimized_materials, original_grade, new_grade, grade_improvement, latest_grade, latest_grade_at, reject_reason')
              .eq('listing_id', listing.id)
              .order('created_at', { ascending: false })
            if (data) setOptimizations(data as typeof optimizations)
            setReviewOptId(result.optimization_id)
          }
        }}
      />

      {/* Image lightbox */}
      {lightboxIdx !== null && (listing.image_urls?.length ?? 0) > 0 && (() => {
        const urls = listing.image_urls ?? []
        const idx = ((lightboxIdx % urls.length) + urls.length) % urls.length
        const prev = () => setLightboxIdx(idx === 0 ? urls.length - 1 : idx - 1)
        const next = () => setLightboxIdx(idx === urls.length - 1 ? 0 : idx + 1)
        return (
          <Dialog open onOpenChange={(o) => !o && setLightboxIdx(null)}>
            <DialogContent
              className="max-w-5xl w-[95vw] p-0 bg-black/95 border-0 overflow-hidden"
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') prev()
                if (e.key === 'ArrowRight') next()
              }}
            >
              <div className="relative flex items-center justify-center" style={{ height: 'min(80vh, 720px)' }}>
                <img src={urls[idx]} alt={`Image ${idx + 1}`} className="max-h-full max-w-full object-contain" />
                <button
                  type="button"
                  onClick={() => setLightboxIdx(null)}
                  className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/10 text-foreground hover:bg-white/20 flex items-center justify-center"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
                {urls.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prev}
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 text-foreground hover:bg-white/20 flex items-center justify-center"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      type="button"
                      onClick={next}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 text-foreground hover:bg-white/20 flex items-center justify-center"
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-foreground text-xs">
                      {idx + 1} / {urls.length}
                    </div>
                  </>
                )}
              </div>
              {urls.length > 1 && (
                <div className="flex gap-2 overflow-x-auto p-3 bg-black/50">
                  {urls.map((u, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setLightboxIdx(i)}
                      className={`shrink-0 h-14 w-14 rounded overflow-hidden border-2 transition ${i === idx ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'}`}
                    >
                      <img src={u} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>
        )
      })()}

      <SelectiveRewriteReviewDialog
        open={!!reviewOptId}
        optimizationId={reviewOptId}
        onOpenChange={(o) => { if (!o) setReviewOptId(null) }}
        onResolved={() => { void loadListings() }}
      />

      <OptimizationReviewDialog
        open={!!pendingReviewRow}
        optimization={pendingReviewRow}
        onOpenChange={(o) => { if (!o) { setPendingReviewRow(null); setLastRun(null) } }}
        onResolved={() => { void reloadOpts(); void loadListings() }}
        peerRecVerdicts={lastRun && pendingReviewRow && lastRun.optimizationId === pendingReviewRow.id ? lastRun.verdicts : undefined}
        sessionAnswers={lastRun && pendingReviewRow && lastRun.optimizationId === pendingReviewRow.id ? lastRun.sessionAnswers : null}
      />

      <OptimizationPreflightModal
        open={!!preflightModal?.open}
        questions={preflightModal?.questions ?? []}
        busy={!!listing && isOptimizing(listing.id)}
        onCancel={() => setPreflightModal(null)}
        onSubmit={async ({ session_answers, skipped_questions }) => {
          setPreflightModal(null)
          await runOptimize({ session_answers, skipped_questions })
        }}
      />

      <PhotoAnalysisPanel
        open={photoPanelOpen}
        onOpenChange={setPhotoPanelOpen}
        loading={photoAnalysisLoading}
        result={photoAnalysis}
        photoUrls={listing.image_urls ?? []}
        onReanalyze={() => void handleAnalyzePhotos()}
      />
    </div>
  )
}

function MarketInsightsBlock({
  listingUuid, etsyListingId, currentTitle, currentTags, tier, listingPrice, photoCount,
}: {
  listingUuid: string
  etsyListingId: string
  currentTitle: string
  currentTags: string[]
  tier?: string | null
  listingPrice?: number | null
  photoCount?: number | null
}) {
  const { data: score, isLoading } = useMarketScore(etsyListingId || null)
  const { data: niche, isLoading: nicheLoading } = useResolveNiche(listingUuid)
  const [lifecycleRows, setLifecycleRows] = useState<FixLifecycleRow[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('fix_lifecycle')
        .select('*')
        .eq('listing_id', listingUuid)
      if (!cancelled) setLifecycleRows((data ?? []) as FixLifecycleRow[])
    })()
    return () => { cancelled = true }
  }, [listingUuid, score?.id])

  const indicators = useMemo(
    () => computeGaps({ score, listingPrice, photoCount, lifecycleRows }).indicators,
    [score, listingPrice, photoCount, lifecycleRows],
  )

  if (!etsyListingId) return null
  // Treat niche as unknown only after the waterfall has actually run and
  // come back empty — avoids a flash of "Detecting niche…" while the cache
  // lookup is still in flight.
  const nicheUnknown = !score && !isLoading && !nicheLoading &&
    (!niche || niche.status === 'needs_input')
  return (
    <div className="space-y-3">
      <MarketScoreCard
        score={score}
        tier={tier}
        loading={isLoading || nicheLoading}
        nicheUnknown={nicheUnknown}
        listingPrice={listingPrice}
        indicators={indicators}
        listingUuid={listingUuid}
      />


      {score && (
        <div className="grid gap-3 md:grid-cols-2">
          <GuidedFixFlow
            type="tags"
            listingId={listingUuid}
            listingEtsyId={etsyListingId}
            marketScore={score}
            currentTags={currentTags}
            currentTitle={currentTitle}
            tier={tier}
          />
          <GuidedFixFlow
            type="title"
            listingId={listingUuid}
            listingEtsyId={etsyListingId}
            marketScore={score}
            currentTags={currentTags}
            currentTitle={currentTitle}
            tier={tier}
          />
        </div>
      )}
    </div>
  )
}

