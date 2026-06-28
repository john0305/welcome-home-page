import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Coins, AlertTriangle, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface SummaryRow {
  etsy_listing_id: string
  etsy_shop_id: string
  total_renewals: number
  total_renewal_cost_usd: number
  is_unique_item: boolean
  current_state: string
  days_since_creation: number | null
  vacation_adjusted_days: number | null
  estimated_stale_score: number
  data_confidence: 'inferred' | 'partial' | 'observed'
}

interface ListingTitleRow {
  etsy_listing_id: string
  title: string
  id: string
}

const CONFIDENCE_DOT: Record<SummaryRow['data_confidence'], { color: string; label: string }> = {
  inferred: { color: 'bg-amber-400', label: 'Estimated' },
  partial:  { color: 'bg-blue-400', label: 'Partial' },
  observed: { color: 'bg-emerald-500', label: 'Observed' },
}

export function RenewalCostCard({ etsyShopId }: { etsyShopId: string | null }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [rows, setRows] = useState<SummaryRow[] | null>(null)
  const [titles, setTitles] = useState<Map<string, ListingTitleRow>>(new Map())
  const [backfilling, setBackfilling] = useState(false)

  const runBackfill = async () => {
    setBackfilling(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Please sign in again before running the backfill.')

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backfill-renewal-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(etsyShopId ? { etsy_shop_id: etsyShopId } : {}),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? `Backfill failed with status ${response.status}`)
      toast({ title: 'Backfill complete', description: JSON.stringify(data).slice(0, 200) })
      // Refresh
      const { data: refreshed } = await supabase
        .from('listing_renewal_summary')
        .select('*')
        .eq('etsy_shop_id', etsyShopId!)
      setRows((refreshed as SummaryRow[]) ?? [])
    } catch (e: any) {
      toast({ title: 'Backfill failed', description: e?.message ?? String(e), variant: 'destructive' })
    } finally {
      setBackfilling(false)
    }
  }

  useEffect(() => {
    if (!etsyShopId) { setRows([]); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('listing_renewal_summary')
        .select('etsy_listing_id, etsy_shop_id, total_renewals, total_renewal_cost_usd, is_unique_item, current_state, days_since_creation, vacation_adjusted_days, estimated_stale_score, data_confidence')
        .eq('etsy_shop_id', etsyShopId)
        .order('estimated_stale_score', { ascending: false })
      if (cancelled) return
      const summary = (data ?? []) as SummaryRow[]
      setRows(summary)

      const top = summary.filter(r => r.is_unique_item && r.estimated_stale_score >= 60).slice(0, 5)
      if (top.length > 0) {
        const { data: ldata } = await supabase
          .from('listings')
          .select('id, etsy_listing_id, title')
          .in('etsy_listing_id', top.map(r => r.etsy_listing_id))
        const m = new Map<string, ListingTitleRow>()
        for (const l of (ldata ?? []) as ListingTitleRow[]) m.set(l.etsy_listing_id, l)
        if (!cancelled) setTitles(m)
      }
    })()
    return () => { cancelled = true }
  }, [etsyShopId])

  if (!etsyShopId || rows === null) return null
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-muted-foreground" />
            Renewal Spend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            No renewal history yet. Run a one-time backfill to estimate your renewal spend from listing creation dates.
          </p>
          <Button size="sm" onClick={runBackfill} disabled={backfilling}>
            {backfilling && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Run renewal backfill
          </Button>
        </CardContent>
      </Card>
    )
  }


  const totalSpend = rows.reduce((s, l) => s + Number(l.total_renewal_cost_usd ?? 0), 0)
  const uniqueRows = rows.filter(l => l.is_unique_item)
  const totalUniqueSpend = uniqueRows.reduce((s, l) => s + Number(l.total_renewal_cost_usd ?? 0), 0)
  const staleUnique = uniqueRows.filter(l => l.estimated_stale_score >= 60)
  const top = staleUnique.slice(0, 5)

  // Implied monthly burn: per-listing spend / days active * 30, summed across active listings.
  // Falls back to total_renewals × ~120 days (Etsy 4-month cycle) when day counts are missing.
  const avgMonthlyCost = rows.reduce((s, l) => {
    if (l.current_state && l.current_state !== 'active') return s
    const cost = Number(l.total_renewal_cost_usd ?? 0)
    if (cost <= 0) return s
    let days = Number(l.vacation_adjusted_days ?? l.days_since_creation ?? 0)
    if (days <= 0) days = Number(l.total_renewals ?? 0) * 120
    if (days <= 0) return s
    return s + (cost / days) * 30
  }, 0)

  // Aggregate confidence: worst-case wins so the card is honest.
  const hasInferred = rows.some(r => r.data_confidence === 'inferred')
  const hasPartial = rows.some(r => r.data_confidence === 'partial')
  const overallConfidence: SummaryRow['data_confidence'] =
    hasInferred && !hasPartial && !rows.some(r => r.data_confidence === 'observed') ? 'inferred'
    : hasInferred || hasPartial ? 'partial'
    : 'observed'
  const dot = CONFIDENCE_DOT[overallConfidence]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-muted-foreground" />
            Renewal Spend
          </CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`Data confidence: ${dot.label}`}>
            <span className={`inline-block h-2 w-2 rounded-full ${dot.color}`} />
            {dot.label}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Total spend</div>
            <div className="font-semibold text-base">${totalSpend.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground" title="Implied monthly run-rate from active listings: cost ÷ days active × 30, summed">
              Avg / month
            </div>
            <div className="font-semibold text-base">${avgMonthlyCost.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Unique-item spend</div>
            <div className="font-semibold text-base">${totalUniqueSpend.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Stale unique</div>
            <div className="font-semibold text-base flex items-center gap-1">
              {staleUnique.length}
              {staleUnique.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
            </div>
          </div>
        </div>

        {top.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Top stale unique items</div>
            <div className="space-y-1.5">
              {top.map(r => {
                const t = titles.get(r.etsy_listing_id)
                return (
                  <button
                    key={r.etsy_listing_id}
                    onClick={() => t?.id && navigate(`/app/listings/${t.id}`)}
                    className="w-full text-left text-sm flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
                  >
                    <span className="truncate flex-1 min-w-0">{t?.title ?? `Listing ${r.etsy_listing_id}`}</span>
                    <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{r.total_renewals}× renew</Badge>
                      <span>${Number(r.total_renewal_cost_usd).toFixed(2)}</span>
                      <span>· {r.vacation_adjusted_days ?? r.days_since_creation ?? 0}d</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => {
                const ids = staleUnique
                  .map(r => titles.get(r.etsy_listing_id)?.id)
                  .filter((x): x is string => !!x)
                navigate('/app/listings', { state: { listingIds: ids, fromLabel: 'Stale unique items' } })
              }}
            >
              Review these listings
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
