import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'

const TEAL = 'hsl(var(--primary))'

interface Row {
  listing_id: string
  title: string
  delta: number
}

interface FallbackRow {
  listing_id: string
  title: string
  value: number
}

interface Props {
  userId: string | undefined
  metric: 'views' | 'favorites'
  onNavigate?: () => void
}

export function SnapshotDeltaList({ userId, metric, onNavigate }: Props) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [fallback, setFallback] = useState<FallbackRow[] | null>(null)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      setRows(null)
      setFallback(null)
      setStale(false)

      // Pull recent rows with timestamps so we can compute snapshot age.
      // Limit is generous so the latest + prior day fit for shops with many listings.
      const { data: snaps } = await supabase
        .from('listing_snapshots')
        .select('listing_id, recorded_on, created_at, views, favorites, title')
        .eq('user_id', userId)
        .order('recorded_on', { ascending: false })
        .limit(4000)

      const allDates = Array.from(new Set((snaps ?? []).map(s => s.recorded_on))).sort().reverse()

      // Staleness: if newest snapshot is > 36h old, surface a refresh notice
      // instead of stale deltas.
      const newestTs = (snaps ?? [])
        .map(s => (s as { created_at?: string }).created_at)
        .filter((x): x is string => !!x)
        .sort()
        .reverse()[0]
      if (newestTs) {
        const ageHrs = (Date.now() - new Date(newestTs).getTime()) / 36e5
        if (ageHrs > 36) {
          if (!cancelled) { setStale(true); setLoading(false) }
          return
        }
      }

      if (allDates.length >= 2 && snaps) {
        const latestDate = allDates[0]
        // Group all snapshots per listing, sorted asc, so we can pick the most
        // recent snapshot strictly before the latest date as that listing's prior
        // baseline. Using a global "prev date" undercounts when a listing wasn't
        // snapshotted on that exact day, which is what caused multi-favorite
        // deltas (5 → 7) to render as "+1 favorite" instead of "+2".
        const perListing = new Map<string, Array<{ d: string; v: number; f: number; title: string }>>()
        for (const s of snaps) {
          const arr = perListing.get(s.listing_id) ?? []
          arr.push({ d: s.recorded_on, v: s.views ?? 0, f: s.favorites ?? 0, title: s.title ?? 'Untitled listing' })
          perListing.set(s.listing_id, arr)
        }
        const deltas: Row[] = []
        for (const [id, arr] of perListing.entries()) {
          arr.sort((a, b) => a.d.localeCompare(b.d))
          const cur = arr[arr.length - 1]
          if (cur.d !== latestDate) continue
          // Find the most recent snapshot strictly before the latest date.
          const prior = [...arr].reverse().find(s => s.d < latestDate)
          if (!prior) continue
          const delta = metric === 'views' ? cur.v - prior.v : cur.f - prior.f
          if (delta > 0) deltas.push({ listing_id: id, title: cur.title, delta })
        }
        deltas.sort((a, b) => b.delta - a.delta)
        if (!cancelled) {
          setRows(deltas)
          setLoading(false)
        }
        return
      }

      if (metric === 'views') {
        const { data: listings } = await supabase
          .from('listings')
          .select('id, title, views')
          .eq('user_id', userId)
          .eq('state', 'active')
          .order('views', { ascending: false })
          .limit(10)
        if (!cancelled) {
          setFallback(((listings ?? []) as Array<{ id: string; title: string | null; views: number | null }>)
            .filter(l => (l.views ?? 0) > 0)
            .map(l => ({ listing_id: l.id, title: l.title ?? 'Untitled listing', value: l.views ?? 0 })))
        }
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [userId, metric])

  const goToListing = async (listingId: string) => {
    onNavigate?.()
    // Try internal route first; falls back to Etsy URL if listing not found
    const { data } = await supabase
      .from('listings')
      .select('id, etsy_listing_id')
      .eq('id', listingId)
      .maybeSingle()
    if (data?.id) {
      navigate(`/app/listings/${data.id}`)
    } else if (data?.etsy_listing_id) {
      window.open(`https://www.etsy.com/listing/${data.etsy_listing_id}`, '_blank', 'noopener,noreferrer')
    } else {
      navigate(`/app/listings/${listingId}`)
    }
  }

  const HelperText = () => (
    <p className="text-[11px] text-muted-foreground/60 mt-3">
      Based on nightly snapshot comparison. Shop-wide total may differ.
    </p>
  )

  const RowButton = ({ id, title, badge }: { id: string; title: string; badge: string }) => (
    <button
      onClick={() => void goToListing(id)}
      className="w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-white/5"
      style={{ background: 'hsl(var(--surface-2))', borderColor: 'hsl(var(--border))' }}
    >
      <span className="truncate text-sm text-foreground/90 flex-1">{title}</span>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{ background: `${TEAL}1f`, color: TEAL }}
      >
        {badge}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
    </button>
  )

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Loading…</p>
  }

  if (stale) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Snapshot data is being refreshed — check back shortly.
      </p>
    )
  }


  if (rows) {
    if (rows.length === 0) {
      return (
        <>
          <p className="text-sm text-muted-foreground py-4">
            No listings gained {metric} since yesterday's snapshot.
          </p>
          <HelperText />
        </>
      )
    }
    return (
      <>
        <div className="space-y-1.5 py-2 max-h-[420px] overflow-y-auto">
          {rows.slice(0, 20).map((r) => (
            <RowButton
              key={r.listing_id}
              id={r.listing_id}
              title={r.title}
              badge={`+${r.delta} ${metric === 'views' ? 'views' : r.delta === 1 ? 'favorite' : 'favorites'}`}
            />
          ))}
        </div>
        <HelperText />
      </>
    )
  }

  if (fallback && fallback.length > 0) {
    return (
      <div className="py-2">
        <p className="text-[11px] uppercase tracking-wide font-medium mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Most viewed listings (all time)
        </p>
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto">
          {fallback.map((r) => (
            <RowButton
              key={r.listing_id}
              id={r.listing_id}
              title={r.title}
              badge={`${r.value.toLocaleString()} views`}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-3">
          We'll show per-listing daily {metric} once we have two days of snapshots to compare.
        </p>
      </div>
    )
  }

  return (
    <>
      <p className="text-sm text-muted-foreground py-4">
        Check back tomorrow — we'll show per-listing {metric} once we have two days of snapshots to compare.
      </p>
      <HelperText />
    </>
  )
}
