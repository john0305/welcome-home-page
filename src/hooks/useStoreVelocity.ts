import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'

export interface VelocityTrait {
  trait: string
  threshold?: number
  fast_avg?: number
  slow_avg?: number
  multiplier?: number | null
  sample_size?: number
  fast_days?: number
  slow_days?: number
}

export interface StoreVelocityStats {
  user_id: string
  avg_days_to_sell: number | null
  avg_days_optimized: number | null
  avg_days_not_optimized: number | null
  p20_days_to_sell: number | null
  monthly_trend: Array<{ month: string; avg_days: number }>
  active_count: number
  sold_last_90d: number
  sold_prior_90d: number
  sell_through_90d: number | null
  sell_through_prior_90d: number | null
  fast_seller_traits: VelocityTrait[]
  infinite_count: number
  infinite_sales_per_month: number | null
  sample_size: number
  computed_at: string | null
}

const STALE_HOURS = 24

export function useStoreVelocity(userId: string | undefined) {
  const [stats, setStats] = useState<StoreVelocityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const triggered = useRef(false)
  const pollTimer = useRef<number | null>(null)

  const fetchOnce = useCallback(async () => {
    if (!userId) return null
    const { data } = await supabase
      .from('store_velocity_stats' as never)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    return data as unknown as StoreVelocityStats | null
  }, [userId])

  const triggerCompute = useCallback(async () => {
    if (!userId || triggered.current) return
    triggered.current = true
    setComputing(true)
    try { await supabase.functions.invoke('compute-velocity') } catch { /* ignore */ }
    const fresh = await fetchOnce()
    if (fresh) setStats(fresh)
    setComputing(false)
  }, [userId, fetchOnce])

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let cancelled = false
    void (async () => {
      const row = await fetchOnce()
      if (cancelled) return
      setStats(row)
      setLoading(false)

      const stale = !row?.computed_at ||
        (Date.now() - new Date(row.computed_at).getTime()) > STALE_HOURS * 3600_000

      if (stale) {
        void triggerCompute()
        // Poll for first-load backfill
        if (!row?.computed_at) {
          pollTimer.current = window.setInterval(async () => {
            const next = await fetchOnce()
            if (next?.computed_at) {
              setStats(next)
              setComputing(false)
              if (pollTimer.current) window.clearInterval(pollTimer.current)
            }
          }, 5000)
        }
      }
    })()
    return () => {
      cancelled = true
      if (pollTimer.current) window.clearInterval(pollTimer.current)
    }
  }, [userId, fetchOnce, triggerCompute])

  return { stats, loading, computing }
}

export interface ListingVelocityInfo {
  sold: boolean
  sold_on: string | null
  days_to_first_sale: number | null
  listing_type: string | null
}

export function useListingVelocity(listingId: string | undefined) {
  const [info, setInfo] = useState<ListingVelocityInfo | null>(null)

  useEffect(() => {
    if (!listingId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('listing_sales_events' as never)
        .select('sold_on, days_to_first_sale, listing_type, was_first_sale')
        .eq('listing_id', listingId)
        .eq('was_first_sale', true)
        .maybeSingle()
      if (cancelled) return
      const row = data as unknown as { sold_on: string; days_to_first_sale: number | null; listing_type: string } | null
      setInfo({
        sold: !!row,
        sold_on: row?.sold_on ?? null,
        days_to_first_sale: row?.days_to_first_sale ?? null,
        listing_type: row?.listing_type ?? null,
      })
    })()
    return () => { cancelled = true }
  }, [listingId])

  return info
}
