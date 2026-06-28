import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export interface ResolveNicheResult {
  niche: string | null
  source:
    | 'listing_cache'
    | 'shared_cache'
    | 'shop_niche'
    | 'ai_scan'
    | 'keyword_cluster_backfill'
    | 'needs_input'
  confidence: number | null
  status: 'resolved' | 'scanning' | 'needs_input'
  cache_hit: boolean
}

/**
 * Walk the niche resolution waterfall for a listing. Hits the per-listing
 * cache first (instant), then cross-user cache, then shop fallback, only
 * falling back to a full AI scan when every other level misses.
 */
export function useResolveNiche(listingUuid?: string | null) {
  const { user } = useAuth()
  const qc = useQueryClient()

  return useQuery({
    queryKey: ['resolve_niche', user?.id, listingUuid],
    enabled: !!user?.id && !!listingUuid,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ResolveNicheResult | null> => {
      const { data, error } = await supabase.functions.invoke('resolve-niche', {
        body: { listing_id: listingUuid },
      })
      if (error) throw error
      const result = data as ResolveNicheResult

      // If a cache level resolved the niche, the market score row may now be
      // stale (a fresh score is keyed off the new niche). Nudge the score
      // query so the card re-renders without a manual refresh.
      if (result?.status === 'resolved' && result.cache_hit) {
        qc.invalidateQueries({ queryKey: ['market_score', user?.id] })
        qc.invalidateQueries({ queryKey: ['niche_profile', user?.id] })
      }
      if (result?.status === 'scanning') {
        qc.invalidateQueries({ queryKey: ['pipeline_status', user?.id] })
      }
      return result
    },
  })
}
