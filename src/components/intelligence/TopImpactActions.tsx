import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ShoppingBag, ArrowRight, Loader2 } from 'lucide-react'
import { usePendingFixActions, applyFixAction, type FixActionRow } from '@/hooks/useFixActions'
import { useToast } from '@/hooks/use-toast'

const DIMENSION_LABELS: Record<string, string> = {
  title: 'Title', tags: 'Tags', description: 'Description',
  photos: 'Photos', media: 'Media', materials: 'Materials',
  freshness: 'Freshness', pricing: 'Pricing', returns: 'Returns',
  review_health: 'Reviews', content: 'Content',
}

const DIMENSION_COLORS: Record<string, string> = {
  title: 'hsl(var(--primary))', tags: '#f59e0b', description: '#6366f1',
  photos: '#10b981', media: '#10b981', materials: '#ec4899',
  freshness: '#94a3b8', pricing: '#f97316', returns: '#94a3b8',
  review_health: '#f59e0b', content: '#6366f1',
}

export function TopImpactActions() {
  const { rows, loading, setRows } = usePendingFixActions()
  const [applying, setApplying] = useState<string | null>(null)
  const { toast } = useToast()
  const navigate = useNavigate()

  // Rank by expected score impact but never hide pending actions: rows
  // without a score_delta (generator didn't estimate one) sort below scored
  // ones instead of being filtered out. Filtering them out made this panel
  // claim "no pending actions" while the Dashboard showed listings needing
  // attention for the same shop.
  const sevRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
  const topImpact = [...rows]
    .sort((a, b) =>
      (b.score_delta ?? 0) - (a.score_delta ?? 0) ||
      (sevRank[b.severity] ?? 0) - (sevRank[a.severity] ?? 0))
    .slice(0, 8)

  const handleApply = async (row: FixActionRow) => {
    if (row.mode !== 'auto') {
      navigate('/app/actions?tab=echo')
      return
    }
    setApplying(row.id)
    try {
      await applyFixAction(row.id)
      setRows(prev => prev.filter(r => r.id !== row.id))
      toast({
        title: 'Fix applied',
        description: row.listing?.title
          ? `${row.listing.title.slice(0, 40)} updated.`
          : 'Listing updated.',
        variant: 'success',
      })
    } catch {
      toast({ title: 'Could not apply fix', variant: 'destructive' })
    } finally {
      setApplying(null)
    }
  }

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-1">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Top actions to raise your score</h3>
        </div>
        <button
          onClick={() => navigate('/app/actions')}
          className="flex items-center gap-1 text-[11px] text-primary transition-opacity hover:opacity-80"
        >
          See all <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Content */}
      <div className="px-3 py-3 space-y-2 bg-background">
        {loading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
          </div>
        ) : topImpact.length === 0 ? (
          <div className="py-6 text-center">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-emerald-500/12 mb-3">
              <Sparkles className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-foreground">Nothing waiting in your queue</p>
            <p className="text-xs mt-1 text-muted-foreground/60">New opportunities land here after each nightly scan.</p>
          </div>
        ) : (
          topImpact.map(row => {
            const dimKey = (row.dimension ?? '').toLowerCase()
            const dimLabel = DIMENSION_LABELS[dimKey] ?? row.dimension ?? 'Fix'
            const dimColor = DIMENSION_COLORS[dimKey] ?? 'hsl(var(--primary))'
            const pts = row.score_delta ?? null
            const isAuto = row.mode === 'auto'
            const busy = applying === row.id

            return (
              <div
                key={row.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-border/50 bg-surface-1/40"
              >
                <div className="h-9 w-9 rounded-lg shrink-0 overflow-hidden flex items-center justify-center bg-surface-2">
                  {row.listing?.thumbnail_url ? (
                    <img src={row.listing.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground/40" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate leading-tight">
                    {row.listing?.title
                      ? `${row.listing.title.slice(0, 44)}${row.listing.title.length > 44 ? '…' : ''}`
                      : 'Listing'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0 rounded"
                      style={{ background: `${dimColor}18`, color: dimColor }}
                    >
                      {dimLabel}
                    </span>
                    {row.rationale && (
                      <span className="text-[10px] truncate text-muted-foreground">
                        {row.rationale.slice(0, 48)}{row.rationale.length > 48 ? '…' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {pts !== null && pts > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                      +{pts} pts
                    </span>
                  )}
                  <button
                    onClick={() => handleApply(row)}
                    disabled={busy}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-primary text-background transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center gap-1"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : isAuto ? 'Apply →' : 'Review →'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
