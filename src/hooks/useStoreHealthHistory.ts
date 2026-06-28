import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export interface StoreHealthHistoryRow {
  id: string
  score_overall: number
  score_exact: number
  sub_scores: Record<string, number>
  recorded_at: string
}

interface SubScores {
  content: number
  media: number
  tags: number
  freshness: number
}

/**
 * Reads the most recent store_health_history rows for the signed-in user
 * and exposes a `record` helper that writes a new row when:
 *   - no row yet today, OR
 *   - the live score has moved by >= 0.5 since the latest row.
 *
 * Returns the latest two rows so callers can compute a true delta.
 */
export function useStoreHealthHistory() {
  const { user } = useAuth()
  const [rows, setRows] = useState<StoreHealthHistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user?.id) { setRows([]); setLoading(false); return }
    const { data } = await supabase
      .from('store_health_history')
      .select('id, score_overall, score_exact, sub_scores, recorded_at')
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: false })
      .limit(10)
    setRows(((data ?? []) as unknown as StoreHealthHistoryRow[]))
    setLoading(false)
  }, [user?.id])

  useEffect(() => { void refresh() }, [refresh])

  const record = useCallback(async (
    scoreOverall: number,
    scoreExact: number,
    subScores: SubScores,
    shopId: string | null,
  ) => {
    if (!user?.id) return
    const latest = rows[0]
    const today = new Date().toISOString().slice(0, 10)
    const latestDay = latest ? new Date(latest.recorded_at).toISOString().slice(0, 10) : null
    const sameDay = latestDay === today
    const moved = !latest || Math.abs(Number(latest.score_exact) - scoreExact) >= 0.5
    if (sameDay && !moved) return
    await supabase.from('store_health_history').insert({
      user_id: user.id,
      shop_id: shopId,
      score_overall: scoreOverall,
      score_exact: scoreExact,
      sub_scores: { ...subScores } as Record<string, number>,
    })
    await refresh()
  }, [user?.id, rows, refresh])

  const latest = rows[0] ?? null
  const prior = rows[1] ?? null
  const delta = latest && prior ? Number(latest.score_exact) - Number(prior.score_exact) : null

  return { rows, latest, prior, delta, loading, refresh, record }
}

/**
 * Count of fix_lifecycle rows applied AFTER the latest history row's
 * recorded_at. Used to surface "N fixes pending next sync".
 */
export function usePendingFixCountSince(sinceIso: string | null) {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!user?.id) { setCount(0); return }
    let cancelled = false
    void (async () => {
      let q = supabase
        .from('fix_lifecycle')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'applied')
      if (sinceIso) q = q.gt('applied_at', sinceIso)
      const { count: c } = await q
      if (!cancelled) setCount(c ?? 0)
    })()
    return () => { cancelled = true }
  }, [user?.id, sinceIso])

  return count
}
