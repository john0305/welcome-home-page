/**
 * Most Expensive tab — highest-priced unsold listings.
 *
 * "Revenue at risk" view: expensive items that haven't sold yet deserve
 * priority optimization because the upside per fix is bigger than on a $5 item.
 *
 * Definition of "unsold": no row in listing_sales_events for the listing.
 * Falls back gracefully if velocity hasn't been computed yet (no events
 * table populated) by treating active listings as unsold candidates.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Sparkles, ArrowRight, AlertTriangle, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useApp } from '@/contexts/AppContext'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Row {
  id: string
  title: string | null
  price: number | null
  views: number | null
  favorites: number | null
  etsy_created_at: string | null
  optimization_count: number | null
  state: string | null
}

function ageDays(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export function MostExpensiveList() {
  const { user } = useAuth()
  const { connectedStore } = useApp()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      // 1. Listings sold according to velocity events (if populated)
      const { data: soldEvents } = await supabase
        .from('listing_sales_events')
        .select('listing_id')
        .eq('user_id', user.id)
      const soldIds = new Set(((soldEvents ?? []) as Array<{ listing_id: string }>).map(r => r.listing_id))

      // 2. Top-priced active listings
      const { data: listings } = await supabase
        .from('listings')
        .select('id, title, price, views, favorites, etsy_created_at, optimization_count, state')
        .eq('user_id', user.id)
        .eq('state', 'active')
        .order('price', { ascending: false, nullsFirst: false })
        .limit(60)

      const filtered = ((listings ?? []) as Row[])
        .filter(l => !soldIds.has(l.id))
        .slice(0, 20)
      if (!cancelled) {
        setRows(filtered)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
        <DollarSign className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-semibold text-foreground">No unsold listings to show</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Every active listing has at least one detected sale, or no priced listings were found.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] text-muted-foreground/60">
        Highest-priced active listings that haven't sold yet — biggest revenue upside per fix.
      </p>
      {rows.map(r => {
        const days = ageDays(r.etsy_created_at)
        const isStale = days !== null && days > 180
        const neverOptimized = (r.optimization_count ?? 0) === 0
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => navigate(`/app/listings/${r.id}`)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/[0.04]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{r.title ?? 'Untitled listing'}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {days !== null && <span>{days} days listed</span>}
                  <span>{(r.views ?? 0).toLocaleString()} views</span>
                  <span>{(r.favorites ?? 0).toLocaleString()} favorites</span>
                </div>
                {isStale && (
                  <p
                    className={cn(
                      'mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                    )}
                    style={{ background: 'rgba(245,158,11,0.10)', color: '#d97706' }}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {days} days listed — never sold
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                  {r.price != null
                    ? formatCurrency(Number(r.price), connectedStore?.currency_code ?? 'USD')
                    : '—'}
                </p>
              </div>
            </div>
            {neverOptimized && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/8 px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 text-[11px] text-primary">
                  <Sparkles className="h-3 w-3" /> Never optimized
                </span>
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); navigate(`/app/listings/${r.id}?optimize=1`) }}
                  className="h-6 gap-1 text-[11px]"
                  style={{ background: 'hsl(var(--primary))', color: '#000' }}
                >
                  Optimize All <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
