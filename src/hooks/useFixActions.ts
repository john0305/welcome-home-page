import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export type FixActionRow = {
  id: string
  user_id: string
  listing_id: string | null
  etsy_shop_id: string | null
  factor_key: string
  dimension: string
  mode: 'auto' | 'guided' | 'inform'
  status: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  current_value: unknown
  proposed_value: unknown
  rationale: string | null
  evidence: unknown
  guided_payload: { instructions?: string; copyable_content?: string; etsy_deep_link?: string } | null
  source: string
  applied_at: string | null
  applied_value: unknown
  failure_reason: string | null
  score_delta: number | null
  created_at: string
  updated_at: string
  listing?: { id: string; title: string | null; etsy_listing_id: string | number | null; thumbnail_url?: string | null } | null
}

/** Fetch all pending fix_actions for the current user (with joined listing). */
export function usePendingFixActions() {
  const { user } = useAuth()
  const [rows, setRows] = useState<FixActionRow[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user?.id) { setRows([]); setLoading(false); return }
    setLoading(true)
    // NOTE: do NOT order by `severity` in SQL — Postgres sorts it alphabetically
    // (critical < high < low < medium), which means a 500-row limit fills with
    // 'low'/'medium' and starves 'high'/'critical'. Sort client-side by rank.
    const { data } = await supabase
      .from('fix_actions')
      .select('*, listing:listings(id, title, etsy_listing_id, thumbnail_url)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1000)
    const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
    const sorted = ((data as unknown as FixActionRow[]) ?? [])
      .sort((a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0))
    setRows(sorted)
    setLoading(false)
  }, [user?.id])

  useEffect(() => { refresh() }, [refresh])

  return { rows, loading, refresh, setRows }
}

/**
 * Lightweight count hook for sidebar/bell badges.
 * Counts ONLY structural (Shop Health) actions — the number a seller can
 * actually achieve, not the 700+ optimization queue.
 */
export function usePendingFixCount(): number {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!user?.id) { setCount(0); return }
    let cancelled = false
    const run = async () => {
      // Fetch only the slim columns needed for the structural filter.
      const { data } = await supabase
        .from('fix_actions')
        .select('id, factor_key, current_value')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .limit(1000)
      if (cancelled) return
      const { isShopHealthAction } = await import('@/lib/shopHealthCategories')
      const rows = (data ?? []) as Array<{ id: string; factor_key: string; current_value: unknown }>
      setCount(rows.filter(r => isShopHealthAction(r)).length)
    }
    run()
    const ch = supabase.channel(`fix-actions-count-${user.id}-${Math.random().toString(36).slice(2)}`)
    ch.on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table: 'fix_actions', filter: `user_id=eq.${user.id}` },
      run,
    ).subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [user?.id])
  return count
}


/** Today's daily_action_summaries row for the morning toast. */
export function useTodaySummary() {
  const { user } = useAuth()
  const [row, setRow] = useState<{ actions_generated: number; auto_applied: number; status: string } | null>(null)
  useEffect(() => {
    if (!user?.id) return
    const today = new Date().toISOString().slice(0, 10)
    supabase
      .from('daily_action_summaries')
      .select('actions_generated, auto_applied, status')
      .eq('user_id', user.id)
      .eq('scan_date', today)
      .maybeSingle()
      .then(({ data }) => setRow(data as typeof row))
  }, [user?.id])
  return row
}

/** Apply / dismiss / mark-done via the apply-fix-action edge function. */
export async function applyFixAction(fix_action_id: string, edited_value?: unknown) {
  const { data, error } = await supabase.functions.invoke('apply-fix-action', {
    body: { fix_action_id, edited_value },
  })
  if (error) throw error
  return data as { ok: boolean; kind: string; fix_action: FixActionRow; reason?: string }
}

export type DismissReason = 'already_done' | 'not_relevant' | 'will_do_later'

export async function dismissFixAction(fix_action_id: string, reason?: DismissReason) {
  const { error } = await supabase
    .from('fix_actions')
    .update({ status: 'dismissed', applied_at: new Date().toISOString(), dismissal_reason: reason ?? null })
    .eq('id', fix_action_id)
  if (error) throw error
}

export type GroupedListing = {
  listing_id: string | 'shop'
  title: string | null
  thumbnail_url: string | null
  actions: FixActionRow[]
  max_severity: 'low' | 'medium' | 'high' | 'critical'
  total_score_delta: number
}

export function groupActionsByListing(rows: FixActionRow[]): GroupedListing[] {
  const groups: Record<string, GroupedListing> = {}
  const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }

  for (const r of rows) {
    const key = r.listing_id || 'shop'
    if (!groups[key]) {
      groups[key] = {
        listing_id: key,
        title: r.listing?.title ?? (key === 'shop' ? 'Shop-level settings' : 'Unknown listing'),
        thumbnail_url: r.listing?.thumbnail_url ?? null,
        actions: [],
        max_severity: 'low',
        total_score_delta: 0,
      }
    }
    groups[key].actions.push(r)
    
    // update max severity
    if (rank[r.severity] > rank[groups[key].max_severity]) {
      groups[key].max_severity = r.severity
    }
    
    // accumulate score_delta
    if (typeof r.score_delta === 'number') {
      groups[key].total_score_delta += r.score_delta
    }
  }

  // Convert to array and sort by max_severity desc, then total_score_delta desc
  return Object.values(groups).sort((a, b) => {
    const sevDiff = rank[b.max_severity] - rank[a.max_severity]
    if (sevDiff !== 0) return sevDiff
    return b.total_score_delta - a.total_score_delta
  })
}
