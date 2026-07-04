import { useState } from 'react'
import { Check, Copy, ExternalLink, Edit3, X, AlertTriangle, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { getFactorMeta, DIMENSION_LABEL, humanizeFactorKey } from '@/lib/etsyRankingFactors'
import { applyFixAction, dismissFixAction, type FixActionRow, type DismissReason } from '@/hooks/useFixActions'
import { getOptimizeScopeForFactor } from '@/lib/optimizeMap'
import { useListingActions } from '@/hooks/useListingActions'
import { useApp } from '@/contexts/AppContext'
import { useNavigate } from 'react-router-dom'


const SEVERITY_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  critical: { bg: 'bg-red-500/15', fg: 'text-red-600 dark:text-red-400', label: 'Critical' },
  high:     { bg: 'bg-amber-500/15', fg: 'text-amber-700 dark:text-amber-400', label: 'High' },
  medium:   { bg: 'bg-primary/15', fg: 'text-primary', label: 'Medium' },
  low:      { bg: 'bg-muted/40', fg: 'text-muted-foreground', label: 'Low' },
}

interface Props {
  row: FixActionRow
  compact?: boolean
  onChange?: (updated: FixActionRow | null) => void
}

function valueToString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.join(', ')
  return JSON.stringify(v, null, 2)
}

export function FixActionCard({ row, compact, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState<string>(valueToString(row.proposed_value))
  const [collapsed, setCollapsed] = useState<null | 'applied' | 'failed'>(null)
  const [localRow, setLocalRow] = useState(row)
  const [showDismissPicker, setShowDismissPicker] = useState(false)
  const [pendingOptimizationId, setPendingOptimizationId] = useState<string | null>(null)
  const { toast } = useToast()
  const navigate = useNavigate()
  const { optimizeNow, rewriteField, isOptimizing } = useListingActions()
  const { loadDashboardData } = useApp()

  const meta = getFactorMeta(localRow.factor_key)
  const sev = SEVERITY_STYLES[localRow.severity] ?? SEVERITY_STYLES.medium
  const factorLabel = meta?.label ?? humanizeFactorKey(localRow.factor_key)
  const dimLabel = DIMENSION_LABEL[localRow.dimension as keyof typeof DIMENSION_LABEL] ?? localRow.dimension
  const listingTitle = localRow.listing?.title

  // Route AI-rewrite factors through the unified Optimize flow so the user
  // gets the same review-dialog experience as the dashboard Optimize button.
  const optimizeScope = localRow.listing_id ? getOptimizeScopeForFactor(localRow.factor_key) : null
  const useUnifiedOptimize = optimizeScope !== null && localRow.listing_id !== null

  const handleOptimize = async () => {
    if (!localRow.listing_id || !optimizeScope) return
    setBusy(true)
    try {
      let optimizationId: string | undefined
      if (optimizeScope === 'all') {
        const result = await optimizeNow([localRow.listing_id])
        optimizationId = result.optimizationId
      } else {
        const result = await rewriteField(localRow.listing_id, optimizeScope)
        optimizationId = result?.optimization_id
      }
      if (optimizationId) {
        setPendingOptimizationId(optimizationId)
        toast({ title: 'Suggestion ready', description: 'Review and approve it before the score changes.' })
      }
      void loadDashboardData()
    } catch (e) {
      toast({ title: 'Optimize failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }


  const doApply = async (edited?: unknown) => {
    setBusy(true)
    // Optimistic: collapse the card immediately so the user sees instant resolution.
    setCollapsed('applied')
    try {
      const res = await applyFixAction(localRow.id, edited)
      if (res.ok) {
        void loadDashboardData()
        toast({ title: 'Fix applied', description: 'Score is recalculating now…' })
        onChange?.(null)
      } else if (res.kind === 'demoted_to_guided') {
        // Restore card in guided mode so user can act on it.
        setCollapsed(null)
        setLocalRow(res.fix_action)
        toast({ title: "Couldn't auto-apply", description: 'Switched to copy-and-paste mode.' })
      } else {
        // Restore card so user can retry.
        setCollapsed(null)
        toast({ title: 'Apply failed', description: res.reason ?? 'unknown', variant: 'destructive' })
      }
    } catch (e) {
      setCollapsed(null)
      toast({ title: 'Apply failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const openDismiss = () => setShowDismissPicker(true)
  const cancelDismiss = () => setShowDismissPicker(false)
  const doDismiss = async (reason: DismissReason) => {
    setBusy(true)
    try {
      await dismissFixAction(localRow.id, reason)
      void loadDashboardData()
      setCollapsed('applied')
      onChange?.(null)
    } finally { setBusy(false); setShowDismissPicker(false) }
  }

  const doCopy = async () => {
    const text = localRow.guided_payload?.copyable_content ?? valueToString(localRow.proposed_value)
    await navigator.clipboard.writeText(text)
    toast({ title: 'Copied', description: 'Paste it into Etsy.' })
  }

  if (collapsed === 'applied') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 animate-fade-in">
        <Check className="h-4 w-4" /> Done — {factorLabel}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-surface-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 pt-3">
        <div className="min-w-0 flex-1">
          {/* PRIMARY: listing name (or factor label if shop-level / compact) */}
          {listingTitle && !compact ? (
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
              {listingTitle}
            </p>
          ) : (
            <p className="text-sm font-semibold text-foreground truncate">{factorLabel}</p>
          )}
          {/* SECONDARY: factor key · dimension · mode + severity */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {listingTitle && !compact ? factorLabel : dimLabel}
            </span>
            {listingTitle && !compact && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">· {dimLabel}</span>
            )}
            {localRow.mode === 'guided' && (
              <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">· Guided</span>
            )}
            {localRow.mode === 'inform' && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">· Heads up</span>
            )}
            <Badge className={`${sev.bg} ${sev.fg} border-transparent text-[10px] uppercase tracking-wide ml-auto`}>{sev.label}</Badge>
          </div>
        </div>
        {!compact && (
          <button onClick={openDismiss} disabled={busy} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        {localRow.rationale && (
          <p className="text-xs leading-relaxed text-foreground/80">{localRow.rationale}</p>
        )}

        {/* AUTO mode — diff view (skip for unified-optimize: AI rewrites the value) */}
        {!useUnifiedOptimize && localRow.mode === 'auto' && !editing && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-surface-2 p-2">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">Current</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{valueToString(localRow.current_value) || '—'}</p>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/8 p-2">
              <p className="text-[9px] uppercase tracking-wide text-primary mb-1">Proposed</p>
              <p className="text-xs text-foreground whitespace-pre-wrap break-words">{valueToString(localRow.proposed_value) || '—'}</p>
            </div>
          </div>
        )}

        {!useUnifiedOptimize && localRow.mode === 'auto' && editing && (
          <div className="mt-2">
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={4}
              className="text-xs"
            />
          </div>
        )}

        {/* GUIDED mode — read-only content + copy (skip for unified-optimize) */}
        {!useUnifiedOptimize && localRow.mode === 'guided' && (
          <div className="mt-2 rounded-md border border-border bg-surface-2 p-2">
            <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words">
              {localRow.guided_payload?.copyable_content ?? valueToString(localRow.proposed_value)}
            </p>
            {localRow.guided_payload?.instructions && (
              <p className="mt-1.5 text-[10px] text-muted-foreground">{localRow.guided_payload.instructions}</p>
            )}
          </div>
        )}


        {localRow.failure_reason && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300">{localRow.failure_reason}</p>
          </div>
        )}
      </div>

      {/* Dismiss reason picker */}
      {showDismissPicker && (
        <div className="border-t border-amber-500/20 bg-amber-500/5 px-3 py-2 animate-accordion-down">
          <p className="text-[11px] text-foreground/80 mb-1.5">Why are you dismissing this?</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => doDismiss('already_done')} className="h-6 text-[11px] px-2">Already done</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => doDismiss('not_relevant')} className="h-6 text-[11px] px-2">Not relevant</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => doDismiss('will_do_later')} className="h-6 text-[11px] px-2">Will do later</Button>
            <button onClick={cancelDismiss} className="text-[11px] text-muted-foreground hover:text-foreground ml-1">Cancel</button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2 px-3 py-2">
        {useUnifiedOptimize ? (
          <>
            <Button
              size="sm"
              onClick={() => pendingOptimizationId ? navigate(`/app/review?id=${pendingOptimizationId}`) : handleOptimize()}
              disabled={busy || (localRow.listing_id ? isOptimizing(localRow.listing_id) : false)}
              className="h-7 text-xs"
              title={pendingOptimizationId ? 'Review and approve this suggestion' : 'Run the unified Optimize flow — same as the dashboard Optimize button'}
            >
              {busy || (localRow.listing_id && isOptimizing(localRow.listing_id))
                ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                : <Sparkles className="h-3 w-3 mr-1" />}
              {pendingOptimizationId ? 'Review suggestion' : `Optimize${optimizeScope !== 'all' ? ` ${optimizeScope}` : ''}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={openDismiss} disabled={busy} className="h-7 text-xs">
              Dismiss
            </Button>
          </>
        ) : (
          <>
            {localRow.mode === 'auto' && !editing && (
              <>
                <Button size="sm" onClick={() => doApply()} disabled={busy} className="h-7 text-xs">
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                  Apply
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy} className="h-7 text-xs">
                  <Edit3 className="h-3 w-3 mr-1" /> Edit first
                </Button>
                <Button size="sm" variant="ghost" onClick={openDismiss} disabled={busy} className="h-7 text-xs">
                  Dismiss
                </Button>
              </>
            )}

            {localRow.mode === 'auto' && editing && (
              <>
                <Button size="sm" onClick={() => { setEditing(false); doApply(editValue) }} disabled={busy} className="h-7 text-xs">
                  <Check className="h-3 w-3 mr-1" /> Apply edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs">Cancel</Button>
              </>
            )}

            {localRow.mode === 'guided' && (
              <>
                <Button size="sm" onClick={() => doApply()} disabled={busy} className="h-7 text-xs" title="Retry pushing this change to Etsy via API">
                  {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Retry API push
                </Button>
                <Button size="sm" variant="outline" onClick={doCopy} disabled={busy} className="h-7 text-xs">
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
                {localRow.guided_payload?.etsy_deep_link && (
                  <Button size="sm" variant="outline" asChild className="h-7 text-xs">
                    <a href={localRow.guided_payload.etsy_deep_link} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" /> Open in Etsy
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => doDismiss('already_done')} disabled={busy} className="h-7 text-xs">
                  Mark as done
                </Button>
              </>
            )}

            {localRow.mode === 'inform' && (
              <Button size="sm" onClick={() => doDismiss('already_done')} disabled={busy} className="h-7 text-xs">
                Got it
              </Button>
            )}
          </>
        )}
      </div>

    </div>
  )
}
