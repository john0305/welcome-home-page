import { useMemo, useRef, useState } from 'react'
import { Heart, Tag, DollarSign, AlertCircle, PackageMinus, TrendingUp, PencilLine } from 'lucide-react'
import { useTractionEvents, type TractionEvent, type TractionEventType } from '@/hooks/useTractionEvents'
import { formatRelative, cn, truncate } from '@/lib/utils'

const ACCENT = 'hsl(var(--primary))'

/** Group consecutive events on the same listing + type within this window. */
const GROUP_WINDOW_MS = 60 * 60 * 1000 // 60 minutes

const EVENT_META: Record<TractionEventType, { icon: typeof Heart; color: string; bg: string; label: (e: { previous_value: string | null; new_value: string | null; delta: number | null }) => string }> = {
  favorite_gained: {
    icon: Heart, color: '#f472b6', bg: 'rgba(244,114,182,0.15)',
    label: e => `+${e.delta ?? 0} favorite${(e.delta ?? 0) === 1 ? '' : 's'}`,
  },
  price_changed: {
    icon: DollarSign, color: '#60a5fa', bg: 'rgba(59,130,246,0.15)',
    label: e => {
      const d = Number(e.delta ?? 0)
      return `Price ${d < 0 ? 'dropped' : 'raised'} $${Math.abs(d).toFixed(2)}`
    },
  },
  tag_dropped: {
    icon: Tag, color: '#fbbf24', bg: 'rgba(245,158,11,0.15)',
    label: e => `Tags dropped (${e.previous_value} → ${e.new_value})`,
  },
  went_inactive: {
    icon: AlertCircle, color: '#f87171', bg: 'rgba(239,68,68,0.15)',
    label: e => `Went ${e.new_value ?? 'inactive'}`,
  },
  quantity_low: {
    icon: PackageMinus, color: '#fbbf24', bg: 'rgba(245,158,11,0.15)',
    label: e => `Stock low (${e.new_value} left)`,
  },
  views_spike: {
    icon: TrendingUp, color: '#34d399', bg: 'rgba(16,185,129,0.15)',
    label: e => `Views spike (+${Number(e.delta ?? 0)})`,
  },
  external_edit: {
    icon: PencilLine, color: '#a78bfa', bg: 'rgba(139,92,246,0.15)',
    label: () => 'Edited on Etsy',
  },
}

interface GroupedTractionEvent extends TractionEvent {
  count: number
}

/** Collapse adjacent rows with the same listing + event_type within the window. */
function groupEvents(events: TractionEvent[]): GroupedTractionEvent[] {
  const out: GroupedTractionEvent[] = []
  for (const ev of events) {
    const last = out[out.length - 1]
    const sameListing = last
      ? (last.internal_listing_id && ev.internal_listing_id
          ? last.internal_listing_id === ev.internal_listing_id
          : last.listing_id === ev.listing_id)
      : false
    const sameType = last && last.event_type === ev.event_type
    const withinWindow = last
      ? Math.abs(new Date(last.recorded_at).getTime() - new Date(ev.recorded_at).getTime()) <= GROUP_WINDOW_MS
      : false
    if (last && sameListing && sameType && withinWindow) {
      last.count += 1
      if (typeof last.delta === 'number' && typeof ev.delta === 'number') {
        last.delta = last.delta + ev.delta
      }
      continue
    }
    out.push({ ...ev, count: 1 })
  }
  return out
}

export function RecentTractionFeed() {
  const { events, loading } = useTractionEvents(null, 25)
  const [hovered, setHovered] = useState(false)

  // Track ids we've already rendered so newly-arriving entries get an
  // animated entrance without replaying on every re-render.
  const seenIdsRef = useRef<Set<string>>(new Set())
  const grouped = useMemo(() => groupEvents(events), [events])

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all duration-200"
      style={{ background: "hsl(var(--surface-1))", borderColor: hovered ? `${ACCENT}70` : "hsl(var(--border))" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        height: 2,
        background: `linear-gradient(90deg, transparent 0%, ${ACCENT} 15%, ${ACCENT} 85%, transparent 100%)`,
        opacity: hovered ? 1 : 0.75,
      }} />
      <div className="p-5">
        <p className="text-sm font-medium mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>Recent Activity</p>
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-center py-4" style={{ color: 'hsl(var(--muted-foreground))' }}>Loading…</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'hsl(var(--muted-foreground))' }}>No recent listing changes</p>
          ) : (
            grouped.slice(0, 15).map(ev => {
              const meta = EVENT_META[ev.event_type] ?? EVENT_META.external_edit
              const Icon = meta.icon
              const baseLabel = meta.label(ev)
              const titleSuffix = ev.listing_title ? ` — ${truncate(ev.listing_title, 48)}` : ''
              const countSuffix = ev.count > 1 ? ` · ${ev.count} changes` : ''
              const isNew = !seenIdsRef.current.has(ev.id)
              if (isNew) seenIdsRef.current.add(ev.id)
              return (
                <div
                  key={ev.id}
                  className={cn(
                    'flex items-start gap-3',
                    isNew && 'animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none',
                  )}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: meta.bg }}>
                    <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight text-foreground">
                      {baseLabel}{titleSuffix}{countSuffix}
                    </p>
                    <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{formatRelative(ev.recorded_at)}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
