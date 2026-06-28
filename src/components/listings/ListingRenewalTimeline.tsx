import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Coins, Plane } from 'lucide-react'

interface EventRow {
  id: string
  detected_at: string
  previous_ending_timestamp: number
  new_ending_timestamp: number
  days_extended: number
  renewal_type: 'auto' | 'manual' | 'relist' | 'unknown'
  shop_on_vacation_at_renewal: boolean
  renewal_fee_usd: number
  notes: string | null
}

interface SummaryRow {
  total_renewals: number
  total_renewal_cost_usd: number
  data_confidence: 'inferred' | 'partial' | 'observed'
}

const TYPE_BADGE: Record<EventRow['renewal_type'], { label: string; cls: string }> = {
  auto:    { label: 'Auto',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  manual:  { label: 'Manual',  cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  relist:  { label: 'Relist',  cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  unknown: { label: 'Unknown', cls: 'bg-muted text-muted-foreground border-border' },
}

function fmtDate(epoch: number) {
  if (!epoch) return '—'
  return new Date(epoch * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ListingRenewalTimeline({ etsyListingId }: { etsyListingId: string | null }) {
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [summary, setSummary] = useState<SummaryRow | null>(null)

  useEffect(() => {
    if (!etsyListingId) { setEvents([]); return }
    let cancelled = false
    ;(async () => {
      const [{ data: evs }, { data: sum }] = await Promise.all([
        supabase
          .from('listing_renewal_events')
          .select('id, detected_at, previous_ending_timestamp, new_ending_timestamp, days_extended, renewal_type, shop_on_vacation_at_renewal, renewal_fee_usd, notes')
          .eq('etsy_listing_id', etsyListingId)
          .order('detected_at', { ascending: true }),
        supabase
          .from('listing_renewal_summary')
          .select('total_renewals, total_renewal_cost_usd, data_confidence')
          .eq('etsy_listing_id', etsyListingId)
          .maybeSingle(),
      ])
      if (cancelled) return
      setEvents((evs ?? []) as EventRow[])
      setSummary((sum as SummaryRow | null) ?? null)
    })()
    return () => { cancelled = true }
  }, [etsyListingId])

  if (!etsyListingId || events === null) return null
  if (events.length === 0) return null

  // Running cost
  let running = 0
  const rows = events.map(e => {
    running += Number(e.renewal_fee_usd ?? 0.2)
    return { ...e, running }
  })

  // Avg days between renewals
  let avgDays: number | null = null
  if (events.length >= 2) {
    const first = new Date(events[0].detected_at).getTime()
    const last = new Date(events[events.length - 1].detected_at).getTime()
    avgDays = Math.round((last - first) / 86400000 / (events.length - 1))
  }

  const confidence = summary?.data_confidence ?? 'observed'
  const firstObservedIdx = rows.findIndex(r => r.notes !== 'inferred_backfill')
  const firstObserved = firstObservedIdx >= 0 ? rows[firstObservedIdx].detected_at : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4 text-muted-foreground" />
          Renewal History
          <Badge
            variant="outline"
            className="ml-auto text-[10px]"
            title={`Data confidence: ${confidence}`}
          >
            {confidence === 'inferred' && '🟡 Estimated'}
            {confidence === 'partial' && '🔵 Partial'}
            {confidence === 'observed' && '🟢 Observed'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5 text-sm">
          {rows.map(e => {
            const inferred = e.notes === 'inferred_backfill'
            const type = TYPE_BADGE[e.renewal_type]
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 border-b border-border/40 last:border-0">
                <div className="text-xs text-muted-foreground shrink-0">
                  {inferred ? '~' : ''}{e.detected_at}
                </div>
                <div className="shrink-0">
                  {inferred ? (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 opacity-60">Estimated</Badge>
                  ) : (
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${type.cls}`}>{type.label}</Badge>
                  )}
                </div>
                {e.shop_on_vacation_at_renewal && (
                  <Plane className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                )}
                <div className="text-xs text-muted-foreground shrink-0 ml-auto">
                  ${Number(e.renewal_fee_usd).toFixed(2)}
                </div>
                <div className="text-xs font-medium shrink-0 text-right">
                  ${e.running.toFixed(2)}
                </div>
                <div className="basis-full text-xs text-muted-foreground min-w-0">
                  {fmtDate(e.previous_ending_timestamp)} → {fmtDate(e.new_ending_timestamp)}
                  <span className="ml-2">(+{e.days_extended}d)</span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground pt-2 border-t">
          <span>{events.length} renewal{events.length === 1 ? '' : 's'}</span>
          <span>Total ${(summary?.total_renewal_cost_usd ?? running).toFixed(2)}</span>
          {avgDays !== null && <span>Avg {avgDays}d apart</span>}
        </div>
        {confidence !== 'observed' && firstObserved && (
          <p className="text-[11px] text-muted-foreground italic">
            Renewal history before {firstObserved} is estimated from listing age. Accuracy improves with each nightly sync.
          </p>
        )}
        {confidence === 'inferred' && !firstObserved && (
          <p className="text-[11px] text-muted-foreground italic">
            All renewal history shown is estimated from listing age. Accuracy improves with each nightly sync.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
