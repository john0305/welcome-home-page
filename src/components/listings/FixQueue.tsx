/**
 * FixQueue — open/reopened fix_lifecycle rows merged with synthetic gaps
 * derived from the market score. Ensures the queue and the score never
 * disagree: any sub-score below threshold appears here as an actionable item.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2, AlertCircle, Tag, Image as ImageIcon, FileText, DollarSign,
  Package, Truck, RotateCcw, Lightbulb, Camera,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import {
  dismissFix, markApplied, openFix, type FixField, type FixLifecycleRow,
} from '@/lib/fixLifecycle'
import { useToast } from '@/hooks/use-toast'
import { useMarketScore } from '@/hooks/useMarketScore'
import { computeGaps, isHealthy, type SyntheticGap } from '@/lib/marketScoreGaps'

const FIELD_ICON: Record<FixField, React.ComponentType<{ className?: string }>> = {
  title: FileText, tags: Tag, photos: ImageIcon, description: FileText,
  price: DollarSign, quantity: Package, shipping: Truck,
}

const FIELD_LABEL: Record<FixField, string> = {
  title: 'Title', tags: 'Tags', photos: 'Photos', description: 'Description',
  price: 'Price', quantity: 'Quantity', shipping: 'Shipping',
}

interface Props {
  listingId: string
  shopId: string
  /** Etsy listing id to fetch market score for reconciliation */
  etsyListingId?: string | null
  listingPrice?: number | null
  photoCount?: number | null
  /** Optional: external handler to actually run the fix (e.g. open optimize dialog). */
  onApply?: (field: FixField, row: FixLifecycleRow | SyntheticGap) => void | Promise<void>
  /** Called whenever the open issue count changes (useful for tab badge/muting). */
  onCountChange?: (count: number) => void
}

type QueueItem =
  | { kind: 'row'; row: FixLifecycleRow; sortKey: number }
  | { kind: 'gap'; gap: SyntheticGap; sortKey: number }

export function FixQueue({ listingId, shopId, etsyListingId, listingPrice, photoCount, onApply, onCountChange }: Props) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [rows, setRows] = useState<FixLifecycleRow[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const { data: score } = useMarketScore(etsyListingId ?? null)

  const load = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('fix_lifecycle')
      .select('*')
      .eq('listing_id', listingId)
      .order('opened_at', { ascending: false })
    setRows((data ?? []) as FixLifecycleRow[])
  }, [listingId, user?.id])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!user?.id) return
    const ch = supabase.channel(`fix-lifecycle-${listingId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes' as never, { event: '*', schema: 'public', table: 'fix_lifecycle', filter: `listing_id=eq.${listingId}` }, load)
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [listingId, user?.id, load])

  const { gaps, priceAdvisory, openCount } = useMemo(
    () => computeGaps({ score, listingPrice, photoCount, lifecycleRows: rows }),
    [score, listingPrice, photoCount, rows],
  )

  // Side-effect: if an applied/monitoring row still has a low score, reopen it once.
  useEffect(() => {
    if (!user?.id || !score) return
    const lowFields = new Set<FixField>(gaps.map(g => g.field))
    for (const row of rows) {
      if (!lowFields.has(row.field)) continue
      if (row.status !== 'applied' && row.status !== 'monitoring') continue
      void supabase
        .from('fix_lifecycle')
        .update({
          status: 'reopened',
          reopened_count: (row.reopened_count ?? 0) + 1,
          issue_description: 'Score still low after last fix.',
        })
        .eq('id', row.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score?.id])

  const activeRows = rows.filter(r => r.status === 'open' || r.status === 'reopened')

  // Build merged queue: real DB rows take precedence, synthetic gaps fill missing fields
  const items: QueueItem[] = useMemo(() => {
    const seenFields = new Set<FixField>(activeRows.map(r => r.field))
    const list: QueueItem[] = []
    for (const r of activeRows) {
      const sort = r.status === 'reopened' ? 0 : 1
      list.push({ kind: 'row', row: r, sortKey: sort })
    }
    for (const g of gaps) {
      if (seenFields.has(g.field)) continue
      const sort = g.kind === 'user-action' ? 2 : 1
      list.push({ kind: 'gap', gap: g, sortKey: sort })
    }
    return list.sort((a, b) => a.sortKey - b.sortKey)
  }, [activeRows, gaps])

  const totalOpen = items.length + (priceAdvisory ? 1 : 0)
  const healthy = isHealthy({ score, openLifecycleCount: activeRows.length, openGapCount: openCount })

  useEffect(() => {
    onCountChange?.(totalOpen)
  }, [totalOpen, onCountChange])

  const handleApplyRow = async (row: FixLifecycleRow) => {
    try {
      if (onApply) await onApply(row.field, row)
      else {
        await markApplied({
          user_id: row.user_id, listing_id: row.listing_id, shop_id: row.shop_id,
          field: row.field, source: 'manual', after_value: row.suggested_fix ?? undefined,
        })
        toast({ title: 'Marked as applied' })
      }
      await load()
    } catch (e) {
      toast({ title: 'Could not apply fix', description: String(e), variant: 'destructive' })
    }
  }

  const handleApplyGap = async (gap: SyntheticGap) => {
    if (!user?.id) return
    try {
      if (gap.kind === 'user-action' || gap.field === 'photos') {
        // Photos: mark done now; future snapshots will reopen if the count regresses.
        await openFix({
          user_id: user.id, listing_id: listingId, shop_id: shopId,
          field: gap.field, source: 'market_score',
          issue_description: gap.issue_description, suggested_fix: gap.suggested_fix,
        })
        await markApplied({
          user_id: user.id, listing_id: listingId, shop_id: shopId,
          field: gap.field, source: 'market_score',
          before_value: photoCount != null ? String(photoCount) : undefined,
          after_value: photoCount != null ? String(photoCount + 1) : undefined,
        })
        toast({ title: 'Marked as done', description: 'We\'ll re-check this on the next sync.' })
      } else if (onApply) {
        await onApply(gap.field, gap as unknown as FixLifecycleRow)
      } else {
        await openFix({
          user_id: user.id, listing_id: listingId, shop_id: shopId,
          field: gap.field, source: 'market_score',
          issue_description: gap.issue_description, suggested_fix: gap.suggested_fix,
        })
        toast({ title: 'Fix queued', description: 'Use Optimize to apply this change.' })
      }
      await load()
    } catch (e) {
      toast({ title: 'Could not apply fix', description: String(e), variant: 'destructive' })
    }
  }

  const handleDismissRow = async (row: FixLifecycleRow) => {
    await dismissFix({
      user_id: row.user_id, listing_id: row.listing_id, shop_id: row.shop_id,
      field: row.field, source: 'manual',
    })
    await load()
  }

  const handleDismissPriceAdvisory = async () => {
    if (!user?.id) return
    await openFix({
      user_id: user.id, listing_id: listingId, shop_id: shopId,
      field: 'price', source: 'market_score',
      issue_description: 'User marked price as intentional',
    })
    await dismissFix({
      user_id: user.id, listing_id: listingId, shop_id: shopId,
      field: 'price', source: 'market_score',
    })
    toast({ title: 'Price excluded', description: 'We\'ll skip price gaps for this listing.' })
    await load()
  }

  if (totalOpen === 0 && healthy) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          No open issues — this listing is being monitored.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          {totalOpen > 0
            ? `${totalOpen} gap${totalOpen === 1 ? '' : 's'} still affecting your score — see below`
            : 'Fix Queue'}
          <Badge variant="secondary" className="ml-auto">{totalOpen}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => {
          if (item.kind === 'row') {
            const row = item.row
            const Icon = FIELD_ICON[row.field] ?? FileText
            const isExpanded = !!expanded[row.id]
            return (
              <div key={row.id} className="rounded-md border p-3">
                <div className="flex items-start gap-2">
                  <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{FIELD_LABEL[row.field]}</span>
                      {row.status === 'reopened' && (
                        <Badge variant="destructive" className="gap-1"><RotateCcw className="h-3 w-3" />Reopened</Badge>
                      )}
                    </div>
                    {row.issue_description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{row.issue_description}</p>
                    )}
                    {row.suggested_fix && (
                      <button
                        type="button"
                        onClick={() => setExpanded(s => ({ ...s, [row.id]: !s[row.id] }))}
                        className="text-xs text-primary underline-offset-2 hover:underline mt-1"
                      >
                        {isExpanded ? 'Hide suggested fix' : 'Show suggested fix'}
                      </button>
                    )}
                    {isExpanded && row.suggested_fix && (
                      <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{row.suggested_fix}</pre>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" onClick={() => void handleApplyRow(row)}>Apply</Button>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => void handleDismissRow(row)}>Dismiss</Button>
                  </div>
                </div>
              </div>
            )
          }
          const gap = item.gap
          const Icon = gap.field === 'photos' ? Camera : (FIELD_ICON[gap.field] ?? FileText)
          const isUserAction = gap.kind === 'user-action'
          const isExpanded = !!expanded[gap.id]
          return (
            <div
              key={gap.id}
              className={`rounded-md border p-3 ${isUserAction ? 'border-blue-500/40 bg-blue-500/5' : ''}`}
            >
              <div className="flex items-start gap-2">
                <Icon className={`h-4 w-4 mt-0.5 ${isUserAction ? 'text-blue-500' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{FIELD_LABEL[gap.field]}</span>
                    {gap.score != null && (
                      <Badge variant="outline" className="text-[10px]">{gap.score}/100</Badge>
                    )}
                    {isUserAction && <Badge variant="secondary" className="text-[10px]">Not auto-fixable — manual update</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{gap.issue_description}</p>
                  <button
                    type="button"
                    onClick={() => setExpanded(s => ({ ...s, [gap.id]: !s[gap.id] }))}
                    className="text-xs text-primary underline-offset-2 hover:underline mt-1"
                  >
                    {isExpanded ? 'Hide suggested fix' : 'Show suggested fix'}
                  </button>
                  {isExpanded && (
                    <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{gap.suggested_fix}</pre>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" onClick={() => void handleApplyGap(gap)}>
                    {isUserAction ? 'Mark as done' : 'Apply'}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}

        {priceAdvisory && (
          <div className="rounded-md border border-slate-500/40 bg-slate-500/5 p-3">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 mt-0.5 text-slate-400" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Consider reviewing — Price</span>
                  <Badge variant="outline" className="text-[10px]">Advisory</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{priceAdvisory.issue_description}</p>
                <p className="text-xs text-muted-foreground mt-1">{priceAdvisory.suggested_fix}</p>
              </div>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => void handleDismissPriceAdvisory()}>
                My price is intentional
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
