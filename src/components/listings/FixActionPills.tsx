/**
 * Filter pills shown on the Listings page below the search bar.
 * Counts come from pending fix_actions (the rows that are NOT structural —
 * structural rows belong in Shop Health, not here).
 *
 * Clicking a pill sets ?fix_factor=<pillKey>; Listings.tsx applies it as a
 * client-side filter over the listings the user already has loaded.
 */

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { LISTING_FILTER_PILLS, isShopHealthAction, type PillKey, type FilterPill } from '@/lib/shopHealthCategories'
import { cn } from '@/lib/utils'

type Row = { id: string; factor_key: string; listing_id: string | null; current_value: unknown }

/** Returns counts per pill AND the listing IDs that match each pill. */
export function useFixActionPills() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    if (!user?.id) { setRows([]); return }
    let cancelled = false
    const run = async () => {
      const { data } = await supabase
        .from('fix_actions')
        .select('id, factor_key, listing_id, current_value')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .not('listing_id', 'is', null)
        .limit(2000)
      if (!cancelled) setRows((data ?? []) as Row[])
    }
    run()
    const ch = supabase
      .channel(`fix-actions-pills-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'fix_actions', filter: `user_id=eq.${user.id}` }, run)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [user?.id])

  return useMemo(() => {
    // Exclude structural rows — those live in Shop Health.
    const listingRows = rows.filter(r => !isShopHealthAction(r))
    const counts: Record<PillKey, number> = {
      title_weak: 0, under_tagged: 0, low_images: 0, missing_materials: 0, needs_optimization: 0,
    }
    const listingIdsByPill: Record<PillKey, Set<string>> = {
      title_weak: new Set(), under_tagged: new Set(), low_images: new Set(),
      missing_materials: new Set(), needs_optimization: new Set(),
    }
    for (const r of listingRows) {
      if (!r.listing_id) continue
      for (const pill of LISTING_FILTER_PILLS) {
        if (pill.factors.includes(r.factor_key) && !listingIdsByPill[pill.key].has(r.listing_id)) {
          listingIdsByPill[pill.key].add(r.listing_id)
          counts[pill.key] += 1
        }
      }
    }
    return { counts, listingIdsByPill }
  }, [rows])
}

interface Props {
  activeKey: PillKey | null
  onSelect: (key: PillKey | null) => void
}

export function FixActionPills({ activeKey, onSelect }: Props) {
  const { counts } = useFixActionPills()
  const visible = LISTING_FILTER_PILLS.filter(p => counts[p.key] > 0)
  if (visible.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Needs fixing:</span>
      {visible.map((p: FilterPill) => {
        const active = activeKey === p.key
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onSelect(active ? null : p.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            {p.label}
            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{counts[p.key]}</Badge>
          </button>
        )
      })}
      {activeKey && (
        <button
          onClick={() => onSelect(null)}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <X className="h-2.5 w-2.5" /> Clear
        </button>
      )}
    </div>
  )
}
