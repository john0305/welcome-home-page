import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

export interface ShopIntelligence {
  id: string
  user_id: string
  overall_market_score: number | null
  score_delta_7d: number
  score_delta_30d: number
  score_trend: 'improving' | 'declining' | 'stable'
  open_fix_count: number
  applied_fix_count: number
  tracked_fix_count: number
  resolved_fix_count: number
  superseded_fix_count: number
  total_points_available: number
  total_points_gained: number
  top_opportunities: Array<{
    fix_action_id: string
    listing_id: string | null
    listing_title: string
    dimension: string
    issue: string
    impact_points: number
    suggested_fix: unknown
  }>
  active_competitor_alerts: number
  critical_competitor_alerts: number
  competitor_summary: {
    alerts_count: number
    critical_count: number
    top_moving_competitors: Array<{ listing_id: string; title: string | null; change_count: number; latest_change_type: string }>
    last_scan_at: string | null
  }
  total_listings: number
  analyzed_listings: number
  listings_needing_attention: number
  avg_listing_score: number | null
  best_performing_listings: Array<{ listing_id: string; title: string; score: number | null; pending_fix_count: number }>
  worst_performing_listings: Array<{ listing_id: string; title: string; score: number | null; top_issue: string | null }>
  last_fix_applied_at: string | null
  last_fix_category: string | null
  active_strategy: string
  listings_analyzed_this_month: number
  last_graded_at: string | null
  last_competitor_scan_at: string | null
  next_scheduled_scan: string | null
  rebuilt_at: string
  created_at: string
  updated_at: string
}

export function useShopIntelligence(userId: string | undefined) {
  const [intelligence, setIntelligence] = useState<ShopIntelligence | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    const load = async () => {
      const { data, error: queryError } = await supabase
        .from('shop_intelligence')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (queryError && queryError.code !== 'PGRST116') {
        setError(new Error(queryError.message))
      } else {
        setIntelligence(data as ShopIntelligence | null)
      }
      setLoading(false)
    }

    void load()

    // Realtime: update when nightly rebuild or fix_applied rebuild fires.
    const channel = supabase.channel(`shop-intelligence-${userId}-${Math.random().toString(36).slice(2)}`)
    channel
      .on(
        'postgres_changes' as never,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shop_intelligence',
          filter: `user_id=eq.${userId}`,
        },
        (payload: { new: ShopIntelligence }) => {
          setIntelligence(payload.new)
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [userId])

  return { intelligence, loading, error }
}
