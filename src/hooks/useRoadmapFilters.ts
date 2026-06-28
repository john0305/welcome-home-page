/**
 * Live counts + listing-id sets for the Score Roadmap filter system.
 *
 * Single source of truth: a direct query against `fix_actions` (status=pending)
 * for the current user. Uses React Query for caching + interval refresh, and a
 * realtime subscription so counts decrement as fixes are applied.
 *
 * Exposes:
 *   - factorCounts   : Record<factor_key, count>            (raw — used by ScoreRoadmap items)
 *   - pillCounts     : Record<pill_key,  count>             (aggregated — Listings dropdown)
 *   - pillListingIds : Record<pill_key,  Set<listing_id>>   (which listings match a pill)
 */

import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { ROADMAP_FILTERS } from '@/lib/roadmapFilterMap'

type Row = { id: string; factor_key: string; listing_id: string | null }

export function useRoadmapFilters() {
  const { user } = useAuth()
  const userId = user?.id
  const qc = useQueryClient()
  const queryKey = ['roadmap-fix-actions', userId] as const

  const { data: rows = [] } = useQuery({
    queryKey,
    enabled: !!userId,
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from('fix_actions')
        .select('id, factor_key, listing_id')
        .eq('user_id', userId!)
        .eq('status', 'pending')
        .limit(5000)
      if (error) throw error
      return (data ?? []) as Row[]
    },
  })

  // Realtime: invalidate on any change to this user's fix_actions
  useEffect(() => {
    if (!userId) return
    const ch = supabase
      .channel(`roadmap-fix-actions-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'fix_actions', filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey }),
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, qc])

  return useMemo(() => {
    const factorCounts: Record<string, number> = {}
    for (const r of rows) {
      factorCounts[r.factor_key] = (factorCounts[r.factor_key] ?? 0) + 1
    }

    const pillCounts: Record<string, number> = {}
    const pillListingIds: Record<string, Set<string>> = {}
    for (const filter of ROADMAP_FILTERS) {
      const set = new Set<string>()
      let total = 0
      for (const r of rows) {
        if (!filter.factor_keys.includes(r.factor_key)) continue
        total += 1
        if (r.listing_id) set.add(r.listing_id)
      }
      pillCounts[filter.pill_key] = total
      pillListingIds[filter.pill_key] = set
    }

    return { factorCounts, pillCounts, pillListingIds }
  }, [rows])
}
