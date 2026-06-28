import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format, differenceInCalendarDays } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'

const TEAL = 'hsl(var(--primary))'

interface OrderRow {
  id: string
  listing_id: string | null
  sold_on: string
  units: number
  created_at: string
  title: string
  thumbnail_url: string | null
  price: number | null
}

interface Props {
  userId: string | undefined
  expectedOrderCount?: number
  onNavigate?: () => void
}

function relativeDate(soldOn: string): string {
  const d = new Date(soldOn + 'T00:00:00')
  const days = differenceInCalendarDays(new Date(), d)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return format(d, 'MMM d')
}

export function RecentOrdersList({ userId, expectedOrderCount = 0, onNavigate }: Props) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<OrderRow[]>([])
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const sinceStr = since.toISOString().slice(0, 10)

      const { data: orderItems, error: orderItemsError } = await supabase
        .from('order_line_items' as never)
        .select('id, listing_id, sold_on, units, created_at, title, thumbnail_url, unit_price')
        .eq('user_id', userId)
        .gte('sold_on', sinceStr)
        .order('sold_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100)

      if (cancelled) return

      if (!orderItemsError && orderItems && Array.isArray(orderItems) && orderItems.length > 0) {
        const merged = (orderItems as unknown as Array<{
          id: string; listing_id: string | null; sold_on: string; units: number | null;
          created_at: string; title: string | null; thumbnail_url: string | null; unit_price: number | null;
        }>).map(r => ({
          id: r.id,
          listing_id: r.listing_id,
          sold_on: r.sold_on,
          units: Number(r.units ?? 1),
          created_at: r.created_at,
          title: r.title ?? 'Etsy order item',
          thumbnail_url: r.thumbnail_url ?? null,
          price: r.unit_price != null ? Number(r.unit_price) : null,
        }))
        setRows(merged)
        setUnavailable(false)
        setLoading(false)
        return
      }

      const { data: events, error } = await supabase
        .from('listing_sales_events')
        .select('id, listing_id, sold_on, units, created_at')
        .eq('user_id', userId)
        .gte('sold_on', sinceStr)
        .order('sold_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100)

      if (cancelled) return

      if (error || !events || events.length === 0) {
        setRows([])
        setUnavailable(!!error || !events)
        setLoading(false)
        return
      }

      const ids = Array.from(new Set(events.map(e => e.listing_id)))
      const { data: listings } = await supabase
        .from('listings')
        .select('id, title, thumbnail_url, price')
        .in('id', ids)

      const lmap = new Map(
        (listings ?? []).map(l => [l.id, l as { id: string; title: string | null; thumbnail_url: string | null; price: number | null }])
      )

      const merged: OrderRow[] = events.map(e => {
        const l = lmap.get(e.listing_id)
        return {
          id: e.id,
          listing_id: e.listing_id,
          sold_on: e.sold_on,
          units: e.units,
          created_at: e.created_at,
          title: l?.title ?? 'Untitled listing',
          thumbnail_url: l?.thumbnail_url ?? null,
          price: l?.price ?? null,
        }
      })

      if (!cancelled) {
        setRows(merged)
        setUnavailable(false)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  const goToListing = (listingId: string | null) => {
    if (!listingId) return
    onNavigate?.()
    navigate(`/app/listings/${listingId}`)
  }

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>

  if (unavailable) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Order details are syncing — listing-level breakdown will appear after the next sync.
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {expectedOrderCount > 0
          ? `Etsy reports ${expectedOrderCount} orders in the last 30 days. Line items are still syncing.`
          : 'No orders recorded in the last 30 days.'}
      </p>
    )
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <>
      <div className="space-y-1.5 py-2 max-h-[420px] overflow-y-auto">
        {rows.map((r) => {
          const isToday = r.sold_on === todayStr
          return (
            <button
              key={r.id}
              onClick={() => goToListing(r.listing_id)}
              className="w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-white/5"
              style={{
                background: isToday ? `${TEAL}14` : 'hsl(var(--surface-2))',
                borderColor: isToday ? `${TEAL}55` : 'hsl(var(--border))',
              }}
            >
              {r.thumbnail_url ? (
                <img
                  src={r.thumbnail_url}
                  alt=""
                  className="h-10 w-10 rounded object-cover shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="h-10 w-10 rounded shrink-0" style={{ background: 'hsl(var(--surface-2))' }} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-foreground/90">{r.title}</span>
                  {isToday && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ background: TEAL, color: '#001818' }}
                    >
                      New
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                  {relativeDate(r.sold_on)}
                  {r.units > 1 && ` · ×${r.units}`}
                  {r.price != null && ` · ${formatCurrency(r.price)}`}
                </div>
              </div>
              {r.listing_id && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground/60 mt-3">
        Based on sales events synced from Etsy. Shop-wide totals may differ.
      </p>
    </>
  )
}
