import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface MarketScoreRow {
  id: string
  listing_id: string
  keyword_cluster: string
  market_score: number | null
  title_score: number | null
  tag_score: number | null
  price_score: number | null
  photo_score: number | null
  favorites_score: number | null
  description_score: number | null
  market_rank_estimate: number | null
  missing_tags: string[] | null
  missing_tags_detail: Array<{ tag: string; pct: number }> | null
  missing_tag_count: number | null
  niche_avg_price: number | null
  favorites_count: number | null
  scored_at: string

}

export interface NicheProfileRow {
  primary_niche: string | null
  niche_source: string | null
  niche_confidence: number | null
  keyword_clusters: string[] | null
}

export function useMarketScore(listingEtsyId?: string | null) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['market_score', user?.id, listingEtsyId],
    enabled: !!user?.id && !!listingEtsyId,
    queryFn: async () => {
      const { data, error } = await db
        .from('listing_market_scores')
        .select('*')
        .eq('user_id', user!.id)
        .eq('listing_id', listingEtsyId!)
        .order('scored_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as MarketScoreRow | null
    },
  })
}

export function useNicheProfile() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['niche_profile', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('user_niche_profiles')
        .select('primary_niche, niche_source, niche_confidence, keyword_clusters')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data as NicheProfileRow | null
    },
  })
}

export function usePipelineStatus() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['pipeline_status', user?.id],
    enabled: !!user?.id,
    refetchInterval: (query) => {
      const data = query.state.data as { status?: string } | null
      if (data?.status === 'running') return 5_000
      return false
    },
    queryFn: async () => {
      const { data, error } = await db
        .from('pipeline_run_log')
        .select('id, status, listings_processed, api_calls_made, cache_hits, started_at, completed_at, trigger_reason')
        .eq('user_id', user!.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as { id: string; status: string; listings_processed: number; started_at: string; completed_at: string | null; trigger_reason: string | null } | null
    },
  })
}

/** Trigger the onboarding pipeline manually (e.g., from a Refresh button). */
export async function triggerPipeline(force = false): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('onboarding-pipeline', {
    body: { run_type: 'on_demand', trigger_reason: 'user_refresh', force },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, ...data }
}
