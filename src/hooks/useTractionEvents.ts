import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

export type TractionEventType =
  | 'favorite_gained'
  | 'price_changed'
  | 'tag_dropped'
  | 'went_inactive'
  | 'quantity_low'
  | 'views_spike'
  | 'external_edit'

export interface TractionEvent {
  id: string
  listing_id: string
  internal_listing_id: string | null
  shop_id: string | null
  event_type: TractionEventType
  previous_value: string | null
  new_value: string | null
  delta: number | null
  recorded_at: string
  /** Title pulled from the embedded `listings` row (null when listing not joined). */
  listing_title: string | null
  listing_thumbnail: string | null
}

interface RawTractionEvent {
  id: string
  listing_id: string
  internal_listing_id: string | null
  shop_id: string | null
  event_type: TractionEventType
  previous_value: string | null
  new_value: string | null
  delta: number | null
  recorded_at: string
  listings?: { id: string; title: string | null; thumbnail_url: string | null } | null
}

/**
 * Fetches recent listing_traction_events for the signed-in user. Pass an
 * internal listing uuid to scope to a single listing, otherwise returns the
 * shop-wide feed (sorted newest first). Embeds the related listing's title
 * and thumbnail so feeds can render a meaningful label per row.
 */
export function useTractionEvents(listingId?: string | null, limit = 25) {
  const [events, setEvents] = useState<TractionEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    let q = supabase
      .from('listing_traction_events')
      .select(
        'id, listing_id, internal_listing_id, shop_id, event_type, previous_value, new_value, delta, recorded_at, listings:internal_listing_id ( id, title, thumbnail_url )'
      )
      .order('recorded_at', { ascending: false })
      .limit(limit)
    if (listingId) q = q.eq('internal_listing_id', listingId)
    q.then(({ data }) => {
      if (cancelled) return
      const rows = (data ?? []) as unknown as RawTractionEvent[]
      setEvents(
        rows.map(r => ({
          id: r.id,
          listing_id: r.listing_id,
          internal_listing_id: r.internal_listing_id,
          shop_id: r.shop_id,
          event_type: r.event_type,
          previous_value: r.previous_value,
          new_value: r.new_value,
          delta: r.delta,
          recorded_at: r.recorded_at,
          listing_title: r.listings?.title ?? null,
          listing_thumbnail: r.listings?.thumbnail_url ?? null,
        })),
      )
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [listingId, limit])

  return { events, loading }
}

export interface SnapshotChange {
  recorded_on: string
  changed_fields: string[] | null
  price: number | null
  tag_count: number | null
  state: string | null
  views: number | null
  favorites: number | null
}

/** Most recent snapshot with non-empty changed_fields for one listing. */
export function useListingChangelog(listingId: string | null | undefined) {
  const [change, setChange] = useState<SnapshotChange | null>(null)
  const [prev, setPrev] = useState<SnapshotChange | null>(null)

  useEffect(() => {
    if (!listingId) return
    let cancelled = false
    supabase
      .from('listing_snapshots')
      .select('recorded_on, changed_fields, price, tag_count, state, views, favorites')
      .eq('listing_id', listingId)
      .order('recorded_on', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data ?? []) as SnapshotChange[]
        const latest = rows.find(r => (r.changed_fields ?? []).length > 0) ?? null
        setChange(latest)
        if (latest) {
          const idx = rows.indexOf(latest)
          setPrev(rows[idx + 1] ?? null)
        }
      })
    return () => { cancelled = true }
  }, [listingId])

  return { change, prev }
}
