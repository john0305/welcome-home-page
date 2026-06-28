import { useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'

const SEEN_KEY = 'radariq_traction_seen_at'

/**
 * Polls listing_traction_events on mount + every 5 min and emits in-app
 * notifications for high-priority types (went_inactive, tag_dropped). Uses
 * localStorage to remember the last "seen" timestamp so we don't re-notify
 * across reloads.
 */
export function useTractionNotifications() {
  const { user } = useAuth()
  const { add } = useNotifications()
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!user) return

    const seedSeen = () => {
      const stored = localStorage.getItem(SEEN_KEY)
      return stored ? new Date(stored) : new Date(Date.now() - 24 * 3600_000)
    }

    const tick = async () => {
      const since = seedSeen()
      const { data } = await supabase
        .from('listing_traction_events')
        .select('id, listing_id, internal_listing_id, event_type, new_value, previous_value, recorded_at')
        .eq('user_id', user.id)
        .in('event_type', ['went_inactive', 'tag_dropped'])
        .gt('recorded_at', since.toISOString())
        .order('recorded_at', { ascending: false })
        .limit(10)

      const events = data ?? []
      if (events.length === 0) return

      for (const ev of events) {
        if (ev.event_type === 'went_inactive') {
          add({
            type: 'error',
            severity: 'error',
            title: 'Listing went inactive',
            body: `A listing is no longer active on Etsy (${ev.new_value ?? 'inactive'}).`,
            action_label: 'View listing',
            action_route: ev.internal_listing_id ? `/app/listings/${ev.internal_listing_id}` : '/app/listings',
            listing_id: ev.internal_listing_id ?? undefined,
          })
        } else if (ev.event_type === 'tag_dropped') {
          add({
            type: 'error',
            severity: 'warning',
            title: 'Tags dropped below 13',
            body: `A listing now has ${ev.new_value} tags (was ${ev.previous_value}).`,
            action_label: 'Review listing',
            action_route: ev.internal_listing_id ? `/app/listings/${ev.internal_listing_id}` : '/app/listings',
            listing_id: ev.internal_listing_id ?? undefined,
          })
        }
      }
      localStorage.setItem(SEEN_KEY, events[0].recorded_at)
    }

    void tick()
    timer.current = setInterval(() => void tick(), 5 * 60_000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [user, add])
}
