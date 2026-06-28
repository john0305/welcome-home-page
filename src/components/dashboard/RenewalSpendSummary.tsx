/**
 * Compact one-line renewal spend summary for Zone 3.
 * Replaces the full RenewalCostCard on the dashboard to avoid duplicating
 * the Zone 2 "Renewal Waste" lever. Detail lives on the listings page.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coins, ArrowRight } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

interface Totals {
  total: number
  perMonth: number
}

export function RenewalSpendSummary({ etsyShopId }: { etsyShopId: string | null }) {
  const navigate = useNavigate()
  const [totals, setTotals] = useState<Totals | null>(null)

  useEffect(() => {
    if (!etsyShopId) { setTotals(null); return }
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('listing_renewal_summary')
        .select('total_renewal_cost_usd, first_seen_date')
        .eq('etsy_shop_id', etsyShopId)
      if (cancelled || !data || data.length === 0) { setTotals(null); return }
      const total = data.reduce((s, r: any) => s + Number(r.total_renewal_cost_usd ?? 0), 0)
      const earliest = data
        .map((r: any) => r.first_seen_date)
        .filter(Boolean)
        .sort()[0]
      let months = 1
      if (earliest) {
        const ms = Date.now() - new Date(earliest).getTime()
        months = Math.max(1, ms / (1000 * 60 * 60 * 24 * 30.4375))
      }
      if (!cancelled) setTotals({ total, perMonth: total / months })
    })()
    return () => { cancelled = true }
  }, [etsyShopId])

  if (!totals || totals.total === 0) return null

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
      style={{ background: 'hsl(var(--surface-2))', borderColor: 'hsl(var(--border))' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Coins className="h-4 w-4 shrink-0" style={{ color: '#f59e0b' }} />
        <p className="text-xs text-foreground truncate">
          <span className="font-semibold">Renewal Spend:</span>{' '}
          <span style={{ color: 'hsl(var(--foreground))' }}>
            ${totals.total.toFixed(2)} total · ${totals.perMonth.toFixed(2)}/mo
          </span>
        </p>
      </div>
      <button
        onClick={() => navigate('/app/listings', { state: { preset: 'renewal_spend', fromLabel: 'Renewal spend' } })}
        className="shrink-0 flex items-center gap-1 text-xs font-semibold"
        style={{ color: 'hsl(var(--primary))' }}
      >
        View details <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  )
}
