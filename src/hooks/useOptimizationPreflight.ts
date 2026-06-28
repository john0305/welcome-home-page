import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

export type PreflightPeerRec = {
  category?: string
  impact?: 'high' | 'medium' | 'low'
  change?: string
  evidence?: string
}

export type PreflightOpenQuestion = { question: string }

export type PreflightData = {
  peer_recommendations: PreflightPeerRec[]
  peer_count: number
  top_peer_count: number
  open_questions: PreflightOpenQuestion[]
}

const EMPTY: PreflightData = {
  peer_recommendations: [],
  peer_count: 0,
  top_peer_count: 0,
  open_questions: [],
}

/**
 * Fetches the lightweight optimize "preflight" payload (peer recs + up to 3
 * open clarifying questions) for a listing. Used by:
 *   - the always-visible indicator pill near the listing title, and
 *   - the Optimize click handler to decide whether to show the questions modal.
 *
 * Failures are silent — the UI degrades to "no peer recs / no questions" and
 * the core Optimize action is never blocked by a preflight hiccup.
 */
export function useOptimizationPreflight(listingId: string | undefined) {
  const [data, setData] = useState<PreflightData | null>(null)
  const [loading, setLoading] = useState(false)
  const inFlight = useRef<Promise<PreflightData> | null>(null)

  const fetchPreflight = useCallback(async (): Promise<PreflightData> => {
    if (!listingId) return EMPTY
    if (inFlight.current) return inFlight.current
    setLoading(true)
    const p = (async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke('optimize-listing', {
          body: { listing_id: listingId, phase: 'preflight' },
        })
        if (error) throw error
        const r = (res ?? {}) as Partial<PreflightData>
        const next: PreflightData = {
          peer_recommendations: Array.isArray(r.peer_recommendations) ? r.peer_recommendations : [],
          peer_count: Number(r.peer_count ?? 0),
          top_peer_count: Number(r.top_peer_count ?? 0),
          open_questions: Array.isArray(r.open_questions) ? r.open_questions : [],
        }
        setData(next)
        return next
      } catch {
        // Silent — preflight must never block optimize.
        setData(EMPTY)
        return EMPTY
      } finally {
        setLoading(false)
        inFlight.current = null
      }
    })()
    inFlight.current = p
    return p
  }, [listingId])

  useEffect(() => {
    if (!listingId) return
    void fetchPreflight()
  }, [listingId, fetchPreflight])

  return { data, loading, refresh: fetchPreflight }
}
