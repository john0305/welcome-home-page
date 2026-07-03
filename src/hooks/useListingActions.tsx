/**
 * Optimize / Grade actions for a listing — fire-and-forget edge function
 * invocations with in-memory progress state so the rest of the UI can show
 * spinners without blocking the user from navigating away.
 *
 * Bulk runs live in this context too, so a long-running 20-item grade or
 * optimize keeps progressing even when the user navigates to another page —
 * the progress panel is rendered from <AppLayout> which also mounts this
 * provider, so the run survives across all in-app routes.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { readStorePersonality } from '@/lib/personalization'
import { recordOptimizationFeedback } from '@/lib/optimizationFeedback'

// Tier-aware bulk concurrency. Read once at the start of a run.
export const BATCH_SIZE_FREE = 1
export const BATCH_SIZE_STARTER = 1
export const BATCH_SIZE_PRO = 3
export const BATCH_SIZE_AGENCY = 5

function batchSizeForTier(tier?: string) {
  switch (tier) {
    case 'agency': return BATCH_SIZE_AGENCY
    case 'admin':  return BATCH_SIZE_AGENCY
    case 'pro':    return BATCH_SIZE_PRO
    default:       return BATCH_SIZE_FREE // free + starter
  }
}

const RATE_LIMIT_RE = /429|rate.?limit|too many requests/i
async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  const backoffs = [800, 1600]
  let lastErr: unknown
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      if (attempt >= backoffs.length || !RATE_LIMIT_RE.test(msg)) throw err
      await new Promise(r => setTimeout(r, backoffs[attempt]))
    }
  }
  throw lastErr
}

/**
 * Fetch the most recent market-score row for a listing (by internal UUID),
 * shaped as the `market_context` payload the optimize-listing edge function
 * understands. Returns null if no score exists yet so the function can fall
 * back to its standard prompt.
 */
async function fetchMarketContext(listingUuid: string): Promise<
  | { missing_tags: string[]; missing_tags_detail: Array<{ tag: string; pct: number }>; niche_avg_price: number | null; price_score: number | null; tag_score: number | null; listing_price: number | null }
  | null
> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: listing } = await db
      .from('listings')
      .select('etsy_listing_id, price')
      .eq('id', listingUuid)
      .maybeSingle()
    if (!listing?.etsy_listing_id) return null
    const { data: score } = await db
      .from('listing_market_scores')
      .select('missing_tags, missing_tags_detail, niche_avg_price, price_score, tag_score')
      .eq('listing_id', String(listing.etsy_listing_id))
      .order('scored_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!score) return null
    return {
      missing_tags: (score.missing_tags ?? []) as string[],
      missing_tags_detail: (score.missing_tags_detail ?? []) as Array<{ tag: string; pct: number }>,
      niche_avg_price: score.niche_avg_price ?? null,
      price_score: score.price_score ?? null,
      tag_score: score.tag_score ?? null,
      listing_price: listing.price ?? null,
    }
  } catch {
    return null
  }
}




type FunctionErrorWithContext = Error & { context?: { json?: () => Promise<unknown> } }

async function getFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : String(error)
  const context = (error as FunctionErrorWithContext | null)?.context
  if (!context?.json) return fallback

  try {
    const payload = await context.json()
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const message = (payload as { error?: unknown }).error
      if (typeof message === 'string' && message.trim()) return message
    }
  } catch {
    // Keep the SDK fallback when the function body is not JSON.
  }

  return fallback
}

export const MAX_BULK = 20

export type BulkRunKind = 'grade' | 'optimize'
export type BulkItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface BulkItem {
  listing_id: string
  title: string
  status: BulkItemStatus
  prev_grade?: number | null
  new_grade?: number | null
  error?: string
}

export interface BulkRun {
  id: string
  kind: BulkRunKind
  started_at: number
  total: number
  completed: number
  failed: number
  done: boolean
  cancelled: boolean
  items: BulkItem[]
}

export type RewriteFieldType = 'title' | 'description' | 'tags' | 'materials'

export interface PhotoAnalysisResult {
  id: string
  created_at: string
  analysis: {
    overall_score: number
    photo_count: number
    max_photos: number
    photos: Array<{
      index: number; score: number; grade: 'A'|'B'|'C'|'D'|'F'
      issues: string[]; suggestions: string[]
      /** keep = working; edit = fixable in software; retake = reshoot (or recreate, for digital previews) */
      action?: 'keep' | 'edit' | 'retake'
      action_reason?: string
      edit_guidance?: string
    }>
    /** 1-based photo indexes in recommended display order (conversion-first). */
    recommended_order?: number[]
    reorder_reason?: string
    /** Which type lens the analysis used (digital, made_to_order, vintage, …). */
    listing_kind?: string
    /** Aggregate niche photo-count benchmark (never names competitors). */
    benchmark?: { peer_median_photos: number; peer_top_quartile_photos: number; sample_size: number }
    missing_shots: string[]
    metadata_mismatches?: Array<{ field: 'title'|'description'|'tags'|'materials'; claim: string; issue: string }>
    metadata_gaps?: Array<{ field: 'title'|'description'|'tags'|'materials'; visible_in_photos: string; suggestion: string }>
    top_recommendations: string[]
    cover_photo_feedback: string
  }
}

export type PeerRecVerdict = {
  peer_rec_summary: string
  peer_rec_category: string | null
  peer_rec_impact: string | null
  status: string
  reason: string | null
}
export type OptimizeOptions = {
  session_answers?: Record<string, string> | null
  skipped_questions?: string[] | null
}
export type OptimizeResult = {
  ok: boolean
  error?: string
  quotaReached?: boolean
  creditsExhausted?: boolean
  noChanges?: boolean
  optimizationId?: string
  peerRecVerdicts?: PeerRecVerdict[]
  sessionAnswers?: Record<string, string> | null
}
export type GradeResult = { ok: boolean; error?: string; newScore?: number | null }

interface ListingActionsValue {
  optimizingIds: Set<string>
  gradingIds: Set<string>
  isOptimizing: (id: string) => boolean
  isGrading: (id: string) => boolean
  optimizeNow: (ids: string[], options?: OptimizeOptions) => Promise<OptimizeResult>
  gradeNow: (id: string) => Promise<GradeResult>
  rewriteField: (id: string, type: RewriteFieldType) => Promise<{ optimization_id: string } | null>
  analyzePhotos: (id: string) => Promise<PhotoAnalysisResult | null>
  /**
   * Reject an existing optimization and immediately re-run it with the
   * seller's specific instructions baked into the prompt as hard constraints.
   * Instructions apply to ALL fields: title, description, tags, materials.
   */
  rejectAndReoptimize: (optimizationId: string, listingId: string, instructions: string) => Promise<{ optimization_id: string } | null>
  /**
   * Discard an existing pending optimization and re-run a fresh one with no
   * extra constraints. Used when a previous run is stale or something went
   * wrong and the seller just wants to try again.
   */
  rerunOptimization: (optimizationId: string, listingId: string) => Promise<{ optimization_id: string } | null>
  bulkRun: BulkRun | null
  startBulkGrade: (ids: string[]) => void
  startBulkOptimize: (ids: string[]) => void
  cancelBulkRun: () => void
  dismissBulkRun: () => void
}

const Ctx = createContext<ListingActionsValue | null>(null)

export function ListingActionsProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const { listings, loadListings, loadDashboardData, refreshPendingReviewIds, connectedStore } = useApp()
  const shopId = connectedStore?.shop_id ?? null
  const { user } = useAuth()
  const tier = user?.tier

  const [optimizingIds, setOptimizingIds] = useState<Set<string>>(new Set())
  const [gradingIds, setGradingIds] = useState<Set<string>>(new Set())
  const [bulkRun, setBulkRun] = useState<BulkRun | null>(null)
  const cancelRef = useRef(false)

  const mark = (setter: typeof setOptimizingIds, ids: string[], on: boolean) => {
    setter(prev => {
      const next = new Set(prev)
      ids.forEach(id => (on ? next.add(id) : next.delete(id)))
      return next
    })
  }

  const optimizeNow = useCallback(async (ids: string[], options?: OptimizeOptions): Promise<OptimizeResult> => {
    if (ids.length === 0) return { ok: false, error: 'No listings selected' }
    const personalization = readStorePersonality(shopId)
    mark(setOptimizingIds, ids, true)

    toast({
      title: ids.length === 1 ? 'Optimizing listing…' : `Optimizing ${ids.length} listings…`,
      description: 'You can keep working — we\'ll let you know when it\'s ready.',
    })

    const makeReviewAction = (optimizationId?: string) => (
      <ToastAction
        altText="Review now"
        onClick={() => navigate(optimizationId ? `/app/review?id=${optimizationId}` : '/app/review')}
      >
        Review now →
      </ToastAction>
    )

    try {
      if (ids.length === 1) {
        const marketContext = await fetchMarketContext(ids[0])
        const sessionAnswers = options?.session_answers && Object.keys(options.session_answers).length
          ? options.session_answers : null
        const skippedQuestions = Array.isArray(options?.skipped_questions) && options!.skipped_questions!.length
          ? options!.skipped_questions! : null
        const { data, error } = await supabase.functions.invoke('optimize-listing', {
          body: {
            listing_id: ids[0],
            personalization,
            etsy_shop_id: shopId,
            market_context: marketContext,
            ...(sessionAnswers ? { session_answers: sessionAnswers } : {}),
            ...(skippedQuestions ? { skipped_questions: skippedQuestions } : {}),
          },
        })
        if (error) throw new Error(await getFunctionErrorMessage(error))
        if (data?.no_changes) {
          toast({
            title: 'Already optimized',
            description: data.message ?? 'No improvements suggested. Your credit was refunded.',
          })
          return { ok: true, noChanges: true }
        }
        toast({
          title: 'Optimization ready for review',
          description: 'Tap Review to see the before/after and push to Etsy.',
          variant: 'success',
          action: makeReviewAction(data?.optimization_id),
        })
        return {
          ok: true,
          optimizationId: data?.optimization_id,
          peerRecVerdicts: Array.isArray(data?.peer_rec_verdicts) ? data.peer_rec_verdicts : [],
          sessionAnswers,
        }
      } else {
        const { data, error } = await supabase.functions.invoke('bulk-optimize-listings', {
          body: { listing_ids: ids, personalization, etsy_shop_id: shopId },
        })
        if (error) throw new Error(await getFunctionErrorMessage(error))
        const ok = data?.created?.length ?? 0
        const failed = data?.failed?.length ?? 0
        const firstId = Array.isArray(data?.created) && data.created.length > 0
          ? (typeof data.created[0] === 'string' ? data.created[0] : data.created[0]?.optimization_id ?? data.created[0]?.id)
          : undefined
        toast({
          title: `${ok} optimization${ok === 1 ? '' : 's'} ready for review${failed > 0 ? ` · ${failed} failed` : ''}`,
          description: ok > 0 ? 'Tap Review to approve and push to Etsy.' : undefined,
          variant: failed > 0 ? 'destructive' : 'success',
          action: ok > 0 ? makeReviewAction(ok === 1 ? firstId : undefined) : undefined,
        })
        return { ok: failed === 0, optimizationId: firstId }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const lower = msg.toLowerCase()
      const isCreditsExhausted = lower.includes('ai credits') || lower.includes('credits exhausted') || lower.includes('upgrade_required')
      const isLimitReached = msg === 'limit_reached' || lower.includes('limit_reached')
      if (isLimitReached) {
        toast({
          title: 'You\'ve used your 10 free optimizations this month',
          description: 'Your monthly free credits reset on the 1st. Upgrade to a paid plan for unlimited optimizations.',
          action: (
            <ToastAction altText="Upgrade" onClick={() => navigate('/app/settings?tab=billing')}>
              Upgrade
            </ToastAction>
          ),
        })
        return { ok: false, quotaReached: true, error: 'Daily optimization limit reached — resets at midnight' }
      } else if (isCreditsExhausted) {
        toast({
          title: 'AI credits exhausted',
          description: 'The Lovable AI workspace is out of credits. Add credits in the Lovable AI settings, then try again.',
          variant: 'destructive',
          duration: 12000,
        })
        return { ok: false, creditsExhausted: true, error: 'AI credits exhausted — add credits and try again' }
      } else {
        toast({
          title: 'Optimization failed',
          description: msg,
          variant: 'destructive',
          duration: 8000,
        })
        return { ok: false, error: msg }
      }
    } finally {
      mark(setOptimizingIds, ids, false)
      void refreshPendingReviewIds()
    }
  }, [toast, navigate, refreshPendingReviewIds, shopId])

  const gradeNow = useCallback(async (id: string): Promise<GradeResult> => {
    const personalization = readStorePersonality(shopId)
    mark(setGradingIds, [id], true)
    try {
      const { data, error } = await supabase.functions.invoke('grade-listing', {
        body: { listing_id: id, personalization, etsy_shop_id: shopId },
      })
      if (error) throw new Error(await getFunctionErrorMessage(error))
      await Promise.all([loadListings(), loadDashboardData()])
      const newScore = typeof data?.score === 'number' ? data.score : (typeof data?.overall_score === 'number' ? data.overall_score : null)
      toast({ title: 'Grade updated', variant: 'success' })
      return { ok: true, newScore }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Grading failed',
        description: msg,
        variant: 'destructive',
      })
      return { ok: false, error: msg }
    } finally {
      mark(setGradingIds, [id], false)
    }
  }, [toast, loadListings, loadDashboardData, shopId])

  // Common limit-reached / error toast for selective + photo flows.
  const handleSelectiveError = useCallback((err: unknown, failTitle: string) => {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'limit_reached' || msg.toLowerCase().includes('limit_reached')) {
      toast({
        title: 'You\'ve used your 10 free optimizations this month',
        description: 'Your monthly free credits reset on the 1st. Upgrade to a paid plan for unlimited optimizations.',
        action: (
          <ToastAction altText="Upgrade" onClick={() => navigate('/app/settings?tab=billing')}>
            Upgrade
          </ToastAction>
        ),
      })
    } else {
      toast({ title: failTitle, description: msg, variant: 'destructive' })
    }
  }, [toast, navigate])

  const rewriteField = useCallback(async (id: string, type: RewriteFieldType) => {
    mark(setOptimizingIds, [id], true)
    toast({
      title: `Rewriting ${type}…`,
      description: 'You can keep working — we\'ll let you know when it\'s ready.',
    })
    try {
      const { data, error } = await supabase.functions.invoke('rewrite-listing', {
        body: { listing_id: id, type },
      })
      if (error) throw new Error(await getFunctionErrorMessage(error))
      toast({
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} suggestion ready`,
        description: 'Review the change to push it to Etsy.',
        variant: 'success',
      })
      return data as { optimization_id: string }
    } catch (err) {
      handleSelectiveError(err, 'Rewrite failed')
      return null
    } finally {
      mark(setOptimizingIds, [id], false)
    }
  }, [toast, handleSelectiveError])

  const analyzePhotos = useCallback(async (id: string) => {
    mark(setOptimizingIds, [id], true)
    try {
      const { data, error } = await supabase.functions.invoke('analyze-photos', {
        body: { listing_id: id },
      })
      if (error) throw new Error(await getFunctionErrorMessage(error))
      return data as PhotoAnalysisResult
    } catch (err) {
      handleSelectiveError(err, 'Photo analysis failed')
      return null
    } finally {
      mark(setOptimizingIds, [id], false)
    }
  }, [handleSelectiveError])



  // ── Bulk runner ──────────────────────────────────────────────────────────
  // Sequential to avoid hammering the edge function / AI gateway. Updates the
  // in-context bulkRun state after each item so the floating progress panel
  // can render live status across page navigations.
  const updateItem = useCallback((listing_id: string, patch: Partial<BulkItem>) => {
    setBulkRun(prev => {
      if (!prev) return prev
      const items = prev.items.map(it => it.listing_id === listing_id ? { ...it, ...patch } : it)
      const completed = items.filter(it => it.status === 'done' || it.status === 'failed' || it.status === 'skipped').length
      const failed = items.filter(it => it.status === 'failed').length
      return { ...prev, items, completed, failed }
    })
  }, [])

  const startBulkRun = useCallback((kind: BulkRunKind, ids: string[]) => {
    if (ids.length === 0) return
    if (bulkRun && !bulkRun.done) {
      toast({ title: 'A bulk run is already in progress', variant: 'destructive' })
      return
    }
    const capped = ids.slice(0, MAX_BULK)
    const lookup = new Map(listings.map(l => [l.id, l]))
    const items: BulkItem[] = capped.map(id => ({
      listing_id: id,
      title: lookup.get(id)?.title ?? 'Untitled listing',
      status: 'pending',
      prev_grade: lookup.get(id)?.current_grade ?? null,
    }))
    cancelRef.current = false
    const run: BulkRun = {
      id: `${kind}-${Date.now()}`,
      kind,
      started_at: Date.now(),
      total: items.length,
      completed: 0,
      failed: 0,
      done: false,
      cancelled: false,
      items,
    }
    setBulkRun(run)

    void (async () => {
      const personalization = readStorePersonality(shopId)
      const concurrency = batchSizeForTier(tier)
      mark(kind === 'grade' ? setGradingIds : setOptimizingIds, capped, true)

      // Shared queue + worker pool. Each worker pulls the next id and
      // processes it independently — a failure in one worker cannot stop
      // the others, so per-batch failure isolation is built-in.
      const queue = [...capped]

      const processOne = async (id: string) => {
        if (cancelRef.current) {
          updateItem(id, { status: 'skipped' })
          return
        }
        updateItem(id, { status: 'running' })
        try {
          if (kind === 'grade') {
            const data = await withRateLimitRetry(async () => {
              const res = await supabase.functions.invoke('grade-listing', {
                body: { listing_id: id, personalization, etsy_shop_id: shopId },
              })
              if (res.error) throw new Error(await getFunctionErrorMessage(res.error))
              return res.data
            })
            const newGrade = typeof data?.score === 'number' ? data.score : null
            updateItem(id, { status: 'done', new_grade: newGrade })
          } else {
            const data = await withRateLimitRetry(async () => {
              const res = await supabase.functions.invoke('optimize-listing', {
                body: { listing_id: id, personalization, etsy_shop_id: shopId },
              })
              if (res.error) throw new Error(await getFunctionErrorMessage(res.error))
              return res.data
            })
            const newGrade = typeof data?.new_grade === 'number' ? data.new_grade : null
            updateItem(id, { status: 'done', new_grade: newGrade })
          }
        } catch (err) {
          updateItem(id, { status: 'failed', error: err instanceof Error ? err.message : String(err) })
        }
      }

      const worker = async () => {
        while (queue.length > 0) {
          const id = queue.shift()
          if (id === undefined) return
          await processOne(id)
          // Small yield so we don't pin the event loop tight on the AI gateway.
          await new Promise(r => setTimeout(r, 100))
        }
      }

      await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()))

      mark(kind === 'grade' ? setGradingIds : setOptimizingIds, capped, false)
      setBulkRun(prev => prev ? { ...prev, done: true, cancelled: cancelRef.current } : prev)

      // Refresh app state once at the end instead of after every item.
      if (kind === 'grade') {
        await Promise.all([loadListings(), loadDashboardData()])
      } else {
        void refreshPendingReviewIds()
      }
    })()
  }, [bulkRun, listings, toast, updateItem, loadListings, loadDashboardData, refreshPendingReviewIds, tier, shopId])

  const startBulkGrade = useCallback((ids: string[]) => startBulkRun('grade', ids), [startBulkRun])
  const startBulkOptimize = useCallback((ids: string[]) => startBulkRun('optimize', ids), [startBulkRun])

  const cancelBulkRun = useCallback(() => {
    cancelRef.current = true
  }, [])

  const dismissBulkRun = useCallback(() => {
    setBulkRun(null)
  }, [])

  const rejectAndReoptimize = useCallback(async (
    optimizationId: string,
    listingId: string,
    instructions: string,
  ): Promise<{ optimization_id: string; no_changes?: boolean } | null> => {
    // Re-optimize FIRST. We only reject the existing row once we have a
    // replacement, so a failure or "no changes" outcome doesn't leave the
    // seller with nothing to review.
    mark(setOptimizingIds, [listingId], true)
    toast({
      title: 'Re-optimizing with your instructions…',
      description: 'Applying your changes to all fields. Give it a moment.',
    })

    try {
      const personalization = readStorePersonality(shopId)
      const { data, error } = await supabase.functions.invoke('optimize-listing', {
        body: {
          listing_id: listingId,
          personalization,
          etsy_shop_id: shopId,
          rewrite_instructions: instructions,
        },
      })
      if (error) throw new Error(await getFunctionErrorMessage(error))

      if (data?.no_changes) {
        // Keep the original pending row in place — nothing new to show.
        toast({
          title: 'No new changes suggested',
          description: data.message ?? 'The AI didn\'t find anything different to change. Your credit was refunded — the original suggestion is still here for review.',
        })
        return { optimization_id: optimizationId, no_changes: true }
      }
      if (!data?.optimization_id) throw new Error('No optimization ID returned')

      // New optimization succeeded — now retire the old one.
      await supabase
        .from('optimizations')
        .update({
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          reject_reason: `rewrite_instructions: ${instructions}`,
        })
        .eq('id', optimizationId)
      void recordOptimizationFeedback({
        optimizationId,
        listingId,
        action: 'rejected',
        reasonCategory: 'rewrite_instructions',
        reasonText: instructions,
      })

      await Promise.all([loadDashboardData(), refreshPendingReviewIds()])

      toast({
        title: 'Re-optimization ready',
        description: 'Review the updated version — your instructions were applied to all fields.',
      })

      return { optimization_id: data.optimization_id }
    } catch (e) {
      toast({
        title: 'Re-optimization failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
      return null
    } finally {
      mark(setOptimizingIds, [listingId], false)
    }
  }, [shopId, toast, loadDashboardData, refreshPendingReviewIds])

  const rerunOptimization = useCallback(async (
    optimizationId: string,
    listingId: string,
  ): Promise<{ optimization_id: string; no_changes?: boolean } | null> => {
    // Fresh optimize run FIRST. We only retire the prior pending row once we
    // have a successful replacement so the seller never ends up with nothing
    // to review (which previously happened on no_changes / errors).
    mark(setOptimizingIds, [listingId], true)
    toast({
      title: 'Re-running optimization…',
      description: 'Generating a fresh suggestion. Give it a moment.',
    })

    try {
      const personalization = readStorePersonality(shopId)
      const marketContext = await fetchMarketContext(listingId)
      const { data, error } = await supabase.functions.invoke('optimize-listing', {
        body: {
          listing_id: listingId,
          personalization,
          etsy_shop_id: shopId,
          market_context: marketContext,
        },
      })
      if (error) throw new Error(await getFunctionErrorMessage(error))
      if (data?.no_changes) {
        toast({
          title: 'No new changes suggested',
          description: data.message ?? 'The AI didn\'t find anything different to improve. Your credit was refunded — the original suggestion is still here for review.',
        })
        return { optimization_id: optimizationId, no_changes: true }
      }
      if (!data?.optimization_id) throw new Error('No optimization ID returned')

      // New optimization succeeded — retire the old one.
      await supabase
        .from('optimizations')
        .update({
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          reject_reason: 'rerun_requested',
        })
        .eq('id', optimizationId)
      void recordOptimizationFeedback({
        optimizationId,
        listingId,
        action: 'rejected',
        reasonCategory: 'rerun_requested',
        reasonText: null,
      })

      await Promise.all([loadDashboardData(), refreshPendingReviewIds()])

      toast({
        title: 'Fresh optimization ready',
        description: 'Review the new suggestion before pushing to Etsy.',
        variant: 'success',
      })
      return { optimization_id: data.optimization_id }
    } catch (e) {
      toast({
        title: 'Re-run failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
      return null
    } finally {
      mark(setOptimizingIds, [listingId], false)
    }
  }, [shopId, toast, loadDashboardData, refreshPendingReviewIds])

  const value = useMemo<ListingActionsValue>(() => ({
    optimizingIds,
    gradingIds,
    isOptimizing: (id: string) => optimizingIds.has(id),
    isGrading: (id: string) => gradingIds.has(id),
    optimizeNow,
    gradeNow,
    rewriteField,
    analyzePhotos,
    rejectAndReoptimize,
    rerunOptimization,
    bulkRun,
    startBulkGrade,
    startBulkOptimize,
    cancelBulkRun,
    dismissBulkRun,
  }), [optimizingIds, gradingIds, optimizeNow, gradeNow, rewriteField, analyzePhotos, rejectAndReoptimize, rerunOptimization, bulkRun, startBulkGrade, startBulkOptimize, cancelBulkRun, dismissBulkRun])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useListingActions() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useListingActions must be used within ListingActionsProvider')
  return v
}
