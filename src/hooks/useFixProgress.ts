/**
 * Bulk-fetches fix_lifecycle counts (open / resolved) for many listings at once.
 * Used by ListingCard to show a small "x open · y resolved" progress row.
 */
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export type FixProgress = { open: number; resolved: number }

export function useFixProgress(listingIds: string[]): Record<string, FixProgress> {
  const { user } = useAuth()
  const [map, setMap] = useState<Record<string, FixProgress>>({})

  useEffect(() => {
    if (!user?.id || listingIds.length === 0) { setMap({}); return }
    let cancelled = false
    const run = async () => {
      const { data } = await supabase
        .from('fix_lifecycle')
        .select('listing_id, status')
        .in('listing_id', listingIds)
      if (cancelled) return
      const next: Record<string, FixProgress> = {}
      for (const id of listingIds) next[id] = { open: 0, resolved: 0 }
      for (const r of (data ?? []) as Array<{ listing_id: string; status: string }>) {
        const slot = next[r.listing_id] ?? (next[r.listing_id] = { open: 0, resolved: 0 })
        if (r.status === 'open' || r.status === 'reopened') slot.open += 1
        else if (r.status === 'applied' || r.status === 'monitoring') slot.resolved += 1
      }
      setMap(next)
    }
    void run()
    const ch = supabase.channel(`fix-progress-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes' as never, { event: '*', schema: 'public', table: 'fix_lifecycle', filter: `user_id=eq.${user.id}` }, () => void run())
      .subscribe()
    return () => { cancelled = true; void supabase.removeChannel(ch) }
  }, [user?.id, listingIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return map
}
