import { useEffect, useRef } from 'react'
import { supabase as typedSupabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'

// notify_worthy/priority_score land in generated types when Lovable applies
// migration 20260702000005; until then use the repo's untyped-client pattern.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = typedSupabase as any

const SEEN_KEY = 'radariq_proactive_seen'

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/**
 * Proactive assistant surfacing (Section 5): notification → conversation →
 * reveal. Only actions the SERVER flagged notify_worthy (priority gate:
 * top ≤3/day, score ≥70, outcome-history-weighted) ever reach this channel —
 * the client adds no findings of its own, so the gate can't be bypassed.
 * Teaser first ("I noticed something…"), full detail on tap.
 */
export function useProactiveInsights() {
  const { user } = useAuth()
  const { add } = useNotifications()
  const fired = useRef(false)

  useEffect(() => {
    if (!user?.id || fired.current) return
    fired.current = true

    const run = async () => {
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
      const { data } = await supabase
        .from('fix_actions')
        .select('id, rationale, listing_id, factor_key, listing:listings(id, title)')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .eq('notify_worthy', true)
        .gte('created_at', dayAgo)
        .order('priority_score', { ascending: false })
        .limit(3)

      const seen = readSeen()
      const fresh = ((data ?? []) as Array<{
        id: string
        rationale: string | null
        listing_id: string | null
        listing: { id: string; title: string | null } | null
      }>).filter(r => !seen.includes(r.id))
      if (fresh.length === 0) return

      for (const row of fresh) {
        const listingTitle = row.listing?.title
        add({
          type: 'trend_alert',
          severity: 'info',
          title: listingTitle
            ? `I noticed something about "${listingTitle.slice(0, 48)}${listingTitle.length > 48 ? '…' : ''}"`
            : 'I noticed something about your shop',
          body: row.rationale?.slice(0, 180) ?? 'Tap to see the full picture.',
          action_label: 'Show me',
          action_route: row.listing?.id ? `/app/listings/${row.listing.id}` : '/app/actions',
        })
      }

      try {
        localStorage.setItem(
          SEEN_KEY,
          JSON.stringify([...seen, ...fresh.map(r => r.id)].slice(-100)),
        )
      } catch { /* storage full/blocked — worst case a repeat teaser */ }
    }
    void run()
  }, [user?.id, add])
}
