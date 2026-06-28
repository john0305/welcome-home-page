/**
 * OptimizationReviewDialog — modal wrapper around OptimizationDiff with Approve/Reject actions.
 * Used in the Pending Review queue and Listing Detail flows.
 */
import { useEffect, useState, useRef } from 'react'
import { Sparkles, AlertTriangle, ShieldCheck, Camera, Info, ChevronDown, ChevronUp, Pencil, X as XIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { OptimizationDiff } from './OptimizationDiff'
import { OptimizationInfluenceCard, type PeerRecVerdict } from './OptimizationInfluenceCard'
import { RejectModal, type RejectionCategory } from './RejectModal'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useListingActions } from '@/hooks/useListingActions'
import { useApp } from '@/contexts/AppContext'
import { applyFlag as applyListingFlag } from '@/lib/listingFlags'
import { recordOptimizationFeedback } from '@/lib/optimizationFeedback'
import { useAuth } from '@/contexts/AuthContext'
import type { OptimizationRecord } from '@/types'

type FunctionErrorWithContext = Error & { context?: { json?: () => Promise<unknown> } }

async function getFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : String(error)
  const context = (error as FunctionErrorWithContext | null)?.context
  if (!context?.json) return fallback

  try {
    const payload = await context.json()
    if (payload && typeof payload === 'object') {
      const message = (payload as { error?: unknown; message?: unknown }).error ?? (payload as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) return message
    }
  } catch {
    // Use the SDK fallback when the function body is not JSON.
  }

  return fallback
}

type DBRow = {
  id: string
  listing_id: string
  type?: string | null
  original_text?: string | null
  suggested_text?: string | null
  original_title: string | null
  original_description: string | null
  original_tags: string[] | null
  original_materials: string[] | null
  optimized_title: string | null
  optimized_description: string | null
  optimized_tags: string[] | null
  optimized_materials: string[] | null
  original_grade: number | null
  new_grade: number | null
  grade_improvement: number | null
  validation_warnings: {
    errors?: string[]
    warnings?: string[]
    valid?: boolean
    missing_photo_flags?: string[]
    fact_sources?: Array<{ claim: string; source: 'photo' | 'original_listing' | 'seller_answer'; detail: string }>
  } | null
}

function parseMaybeList(text: string | null | undefined): string[] | null {
  if (!text) return null
  // Strip ```json ... ``` or ``` ... ``` fences the model sometimes adds.
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  try {
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed.map(String) : null
  } catch {
    return null
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  optimization: DBRow | null
  onResolved: () => void
  /** Verdicts returned fresh from the most recent optimize call. If absent
   *  (e.g. dialog opened from history), OptimizationInfluenceCard will fetch
   *  them from peer_rec_applications. */
  peerRecVerdicts?: PeerRecVerdict[]
  /** Clarifying answers captured in the pre-flight modal during this run. */
  sessionAnswers?: Record<string, string> | null
}

export function OptimizationReviewDialog({ open, onOpenChange, optimization, onResolved, peerRecVerdicts, sessionAnswers }: Props) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [showSources, setShowSources] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  // Edit mode state
  const [editMode, setEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const newTagRef = useRef<HTMLInputElement>(null)
  // Local override so a successful re-run can swap in the freshly created
  // optimization row without waiting on the parent to refresh + reopen.
  const [override, setOverride] = useState<DBRow | null>(null)
  const { rejectAndReoptimize } = useListingActions()
  const { loadDashboardData, refreshSyncStats, refreshPendingReviewIds } = useApp()

  // Clear stale state when dialog closes.
  useEffect(() => {
    if (!open) {
      setOverride(null)
      setEditMode(false)
      setEditTitle('')
      setEditDesc('')
      setEditTags([])
      setNewTag('')
    }
  }, [open])

  const active = override ?? optimization
  if (!active) return null

  // Selective rewrites (type === 'title' | 'description' | 'tags' | 'materials')
  // store the change in original_text/suggested_text rather than the bulk
  // optimized_* columns. Overlay them so the diff renders correctly.
  const t = active.type
  const isSelective = t === 'title' || t === 'description' || t === 'tags' || t === 'materials'
  const suggestedList = parseMaybeList(active.suggested_text)
  const originalList = parseMaybeList(active.original_text)

  const optTitle = active.optimized_title ?? (t === 'title' ? active.suggested_text : (isSelective ? undefined : ''))
  const optDesc = active.optimized_description ?? (t === 'description' ? active.suggested_text : (isSelective ? undefined : ''))
  const optTags = active.optimized_tags ?? (t === 'tags' ? (suggestedList ?? []) : (isSelective ? undefined : undefined))
  const optMats = active.optimized_materials ?? (t === 'materials' ? (suggestedList ?? []) : (isSelective ? undefined : undefined))

  const record: OptimizationRecord = {
    id: active.id,
    listing_id: active.listing_id,
    original_title: active.original_title ?? (t === 'title' ? (active.original_text ?? '') : ''),
    optimized_title: optTitle as string,
    original_description: active.original_description ?? (t === 'description' ? (active.original_text ?? '') : ''),
    optimized_description: optDesc as string,
    original_tags: active.original_tags ?? (t === 'tags' ? (originalList ?? []) : []),
    optimized_tags: optTags as string[],
    original_materials: active.original_materials ?? (t === 'materials' ? (originalList ?? []) : []),
    optimized_materials: optMats as string[],
    original_grade: active.original_grade ?? 0,
    new_grade: active.new_grade ?? undefined,
    grade_improvement: active.grade_improvement ?? 0,
  } as OptimizationRecord



  const validation = active.validation_warnings
  const hasErrors = (validation?.errors?.length ?? 0) > 0
  const missingFlags = validation?.missing_photo_flags ?? []
  const factSources = validation?.fact_sources ?? []

  const enterEditMode = () => {
    setEditTitle(record.optimized_title ?? '')
    setEditDesc(record.optimized_description ?? '')
    setEditTags([...(record.optimized_tags ?? [])])
    setEditMode(true)
  }

  const pushToEtsy = async (optimizationId: string) => {
    const { error } = await supabase.functions.invoke('push-to-etsy', {
      body: { optimization_id: optimizationId },
    })
    if (error) {
      toast({ title: 'Push failed', description: await getFunctionErrorMessage(error), variant: 'destructive' })
      return false
    }
    toast({ title: 'Pushed to Etsy', description: 'Your listing is updated. Original saved — you can revert anytime.', variant: 'success' })
    if (user?.id) {
      await applyListingFlag({ listingId: active.listing_id, userId: user.id, flagType: 'optimized_monitoring' })
    }
    await Promise.all([loadDashboardData(), refreshSyncStats(), refreshPendingReviewIds()])
    onResolved()
    onOpenChange(false)
    return true
  }

  const handleApprove = async () => {
    if (hasErrors) {
      toast({ title: 'Cannot push', description: 'Resolve validation errors first.', variant: 'destructive' })
      return
    }
    setBusy('approve')
    await pushToEtsy(active.id)
    setBusy(null)
  }

  const handleEditApprove = async () => {
    setBusy('approve')
    const { error: updateErr } = await supabase
      .from('optimizations')
      .update({
        optimized_title: editTitle.trim() || null,
        optimized_description: editDesc.trim() || null,
        optimized_tags: editTags,
      })
      .eq('id', active.id)
    if (updateErr) {
      setBusy(null)
      toast({ title: 'Update failed', description: updateErr.message, variant: 'destructive' })
      return
    }
    await pushToEtsy(active.id)
    setBusy(null)
  }

  const handleDiscard = async () => {
    setBusy('reject')
    const { error } = await supabase
      .from('optimizations')
      .update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', active.id)
    setBusy(null)
    if (error) {
      toast({ title: 'Discard failed', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Optimization discarded' })
    onResolved()
    onOpenChange(false)
  }

  const handleSimpleReject = async (category: RejectionCategory, comment: string) => {
    setBusy('reject')
    const { error } = await supabase
      .from('optimizations')
      .update({ status: 'rejected', rejected_at: new Date().toISOString(), reject_reason: comment })
      .eq('id', active.id)
    setBusy(null)
    if (error) {
      toast({ title: 'Reject failed', description: error.message, variant: 'destructive' })
      return
    }
    void recordOptimizationFeedback({
      optimizationId: active.id,
      listingId: active.listing_id,
      action: 'rejected',
      reasonCategory: category,
      reasonText: comment || null,
    })
    toast({ title: 'Optimization rejected', description: 'Thanks for the feedback — we use it to improve future suggestions.' })
    onResolved()
    onOpenChange(false)
  }

  const handleRejectAndReoptimize = async (instructions: string) => {
    const result = await rejectAndReoptimize(active.id, active.listing_id, instructions)
    if (!result?.optimization_id) {
      throw new Error('Re-optimization failed')
    }
    // Swap the freshly created optimization into the dialog so the seller
    // sees the new before/after immediately without us closing the modal.
    const { data: fresh } = await supabase
      .from('optimizations')
      .select('id, listing_id, original_title, original_description, original_tags, original_materials, optimized_title, optimized_description, optimized_tags, optimized_materials, original_grade, new_grade, grade_improvement, validation_warnings')
      .eq('id', result.optimization_id)
      .maybeSingle()
    if (fresh) {
      setOverride(fresh as unknown as DBRow)
      onResolved()
    } else {
      onResolved()
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Review AI optimization
          </DialogTitle>
          <DialogDescription>
            Your original listing is already saved. Approve to push these changes to Etsy, or reject to discard.
          </DialogDescription>
        </DialogHeader>

        {hasErrors && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Etsy validation errors</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-xs">
                {validation!.errors!.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {validation?.warnings && validation.warnings.length > 0 && !hasErrors && (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-xs">
                {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {missingFlags.length > 0 && (
          <Alert className="border-amber-500/40 bg-amber-500/5">
            <Camera className="h-4 w-4 text-amber-600" />
            <AlertTitle>Add a photo to back these claims up</AlertTitle>
            <AlertDescription>
              <p className="text-xs mb-2">
                The AI kept these because your original listing mentions them, but it can&apos;t see them in any photo.
                Upload a clear close-up so buyers (and Etsy search) can verify:
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-xs">
                {missingFlags.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {factSources.length > 0 && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <button
              type="button"
              onClick={() => setShowSources(s => !s)}
              className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Why the AI wrote this ({factSources.length} source{factSources.length === 1 ? '' : 's'})
              </span>
              {showSources ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showSources && (
              <ul className="mt-2 space-y-1.5 text-xs">
                {factSources.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[10px] uppercase tracking-wide"
                    >
                      {s.source === 'photo' ? 'photo' : s.source === 'seller_answer' ? 'your answer' : 'original'}
                    </Badge>
                    <span>
                      <span className="font-medium">{s.claim}</span>
                      {s.detail ? <span className="text-muted-foreground"> — {s.detail}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Edit mode — inline editable fields */}
        {editMode ? (
          <div className="space-y-4 rounded-xl border p-4" style={{ borderColor: 'hsl(var(--primary) / 0.25)', background: 'hsl(var(--primary) / 0.04)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Pencil className="h-3.5 w-3.5" style={{ color: 'hsl(var(--primary))' }} />
              <span className="text-xs font-semibold" style={{ color: 'hsl(var(--primary))' }}>Edit mode — changes save to Etsy when you approve</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Title</label>
              <input
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:ring-1"
                style={{ borderColor: 'hsl(var(--border))' }}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                maxLength={140}
              />
              <p className="text-[10px] text-right" style={{ color: 'hsl(var(--muted-foreground))' }}>{editTitle.length}/140</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Description</label>
              <textarea
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:ring-1 resize-y"
                style={{ borderColor: 'hsl(var(--border))', minHeight: 120 }}
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Tags <span style={{ color: 'hsl(var(--muted-foreground))' }}>({editTags.length}/13)</span></label>
              <div className="flex flex-wrap gap-1.5 rounded-lg border p-2" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}>
                {editTags.map((tag, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))', border: '1px solid hsl(var(--primary) / 0.3)' }}>
                    {tag}
                    <button type="button" onClick={() => setEditTags(prev => prev.filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100">
                      <XIcon className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                {editTags.length < 13 && (
                  <input
                    ref={newTagRef}
                    className="flex-1 min-w-24 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/40"
                    placeholder="Add tag…"
                    value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === ',') && newTag.trim()) {
                        e.preventDefault()
                        const tag = newTag.trim().replace(/,$/, '')
                        if (tag && !editTags.includes(tag) && editTags.length < 13) {
                          setEditTags(prev => [...prev, tag])
                          setNewTag('')
                        }
                      }
                    }}
                  />
                )}
              </div>
              <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>Press Enter or comma to add a tag</p>
            </div>
          </div>
        ) : (
          <>
            <OptimizationDiff record={record} />
            <OptimizationInfluenceCard
              optimizationId={active.id}
              initialVerdicts={peerRecVerdicts}
              sessionAnswers={sessionAnswers}
            />
          </>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-1">
          {editMode ? (
            <>
              <Button variant="ghost" onClick={() => setEditMode(false)} disabled={!!busy} className="sm:mr-auto text-muted-foreground">
                Cancel
              </Button>
              <Button
                onClick={handleEditApprove}
                disabled={!!busy}
                style={{ background: 'hsl(var(--primary))', color: "hsl(var(--background))" }}
                className="gap-1.5 font-semibold"
              >
                {busy === 'approve' ? 'Pushing…' : 'Save & Send to Etsy'}
              </Button>
            </>
          ) : (
            <>
              {/* Discard — hard reject, no rerun */}
              <Button
                variant="ghost"
                onClick={handleDiscard}
                disabled={!!busy}
                className="sm:mr-auto text-muted-foreground hover:text-destructive gap-1.5"
              >
                {busy === 'reject' ? 'Discarding…' : 'Discard'}
              </Button>

              {/* Needs Changes — opens RejectModal with reoptimize flow */}
              <Button
                variant="outline"
                onClick={() => setRejectOpen(true)}
                disabled={!!busy}
                className="gap-1.5"
                style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#f59e0b' }}
              >
                Needs Changes
              </Button>

              {/* Edit — inline editing mode */}
              <Button
                variant="outline"
                onClick={enterEditMode}
                disabled={!!busy}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>

              {/* Approve — push to Etsy */}
              <Button
                onClick={handleApprove}
                disabled={!!busy || hasErrors}
                style={{ background: 'hsl(var(--primary))', color: "hsl(var(--background))" }}
                className="gap-1.5 font-semibold"
              >
                {busy === 'approve' ? 'Pushing…' : 'Approve → Etsy'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onReject={handleSimpleReject}
        onRejectAndReoptimize={handleRejectAndReoptimize}
        listingTitle={active.original_title ?? undefined}
      />
    </Dialog>
  )
}
