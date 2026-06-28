import { useMemo, useRef } from 'react'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts'

export interface ImpactSnapshot {
  recorded_on: string // YYYY-MM-DD
  views: number
  favorites: number
  quantity?: number
}

export interface ImpactOptimization {
  id: string
  approved_at: string // ISO date
}

export interface VacationPeriod {
  started_on: string // YYYY-MM-DD
  ended_on: string | null // null = still on vacation
}

interface Props {
  snapshots: ImpactSnapshot[]
  optimizations: ImpactOptimization[]
  vacationPeriods?: VacationPeriod[]
}

function toDayKey(d: string | Date): string {
  return new Date(d).toISOString().slice(0, 10)
}

function fmtTickDate(s: string) {
  const d = new Date(s + 'T00:00:00Z')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function OptimizationImpactChart({ snapshots, optimizations, vacationPeriods = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const { data, optMarkers, baselineViews, todayKey, vacationOverlays } = useMemo(() => {
    // Etsy reports lifetime totals, so consecutive snapshots barely differ on a
    // 0–N axis. Convert to per-day deltas (views gained that day) so the line
    // actually moves and the "before vs after optimization" story is visible.
    const sortedSnaps = [...snapshots].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on))
    const deltas: Array<{ recorded_on: string; views: number; favorites: number }> = []
    for (let i = 1; i < sortedSnaps.length; i++) {
      const prev = sortedSnaps[i - 1]
      const cur = sortedSnaps[i]
      deltas.push({
        recorded_on: cur.recorded_on,
        views: Math.max(0, (cur.views ?? 0) - (prev.views ?? 0)),
        favorites: Math.max(0, (cur.favorites ?? 0) - (prev.favorites ?? 0)),
      })
    }

    const todayKey = toDayKey(new Date())
    const sortedOpts = [...optimizations]
      .map(o => ({ ...o, day: toDayKey(o.approved_at) }))
      .sort((a, b) => a.day.localeCompare(b.day))

    const firstOptDay = sortedOpts[0]?.day
    const startDate = firstOptDay
      ? new Date(new Date(firstOptDay + 'T00:00:00Z').getTime() - 14 * 86400000).toISOString().slice(0, 10)
      : deltas[0]?.recorded_on
    const filtered = deltas.filter(s => !startDate || s.recorded_on >= startDate)

    // Group opts by day
    const grouped = new Map<string, number>()
    for (const o of sortedOpts) grouped.set(o.day, (grouped.get(o.day) ?? 0) + 1)
    let i = 1
    const optMarkers: Array<{ day: string; label: string; count: number }> = []
    for (const [day, count] of grouped.entries()) {
      optMarkers.push({ day, label: count > 1 ? `${count} optimizations` : `Opt #${i}`, count })
      i += count
    }

    // Baseline: average daily views over the 7 days BEFORE first optimization.
    let baselineViews: number | null = null
    if (firstOptDay) {
      const before = deltas.filter(s => s.recorded_on < firstOptDay).slice(-7)
      if (before.length) {
        baselineViews = before.reduce((sum, s) => sum + s.views, 0) / before.length
      }
    }

    // Vacation overlays clipped to visible data range. Merge overlapping or
    // adjacent periods so we don't render a stack of labels on top of each
    // other when sync writes a new row per day.
    const rangeStart = filtered[0]?.recorded_on
    const rangeEnd = filtered[filtered.length - 1]?.recorded_on ?? todayKey
    const rawOverlays: Array<{ x1: string; x2: string }> = []
    if (rangeStart) {
      for (const p of vacationPeriods) {
        const start = p.started_on < rangeStart ? rangeStart : p.started_on
        const end = p.ended_on ?? todayKey
        const clippedEnd = end > rangeEnd ? rangeEnd : end
        if (start <= clippedEnd && clippedEnd >= rangeStart && start <= rangeEnd) {
          rawOverlays.push({ x1: start, x2: clippedEnd })
        }
      }
    }
    rawOverlays.sort((a, b) => a.x1.localeCompare(b.x1))
    const addDay = (d: string) => {
      const t = new Date(d + 'T00:00:00Z').getTime() + 86400000
      return new Date(t).toISOString().slice(0, 10)
    }
    const vacationOverlays: Array<{ x1: string; x2: string }> = []
    for (const o of rawOverlays) {
      const last = vacationOverlays[vacationOverlays.length - 1]
      if (last && o.x1 <= addDay(last.x2)) {
        if (o.x2 > last.x2) last.x2 = o.x2
      } else {
        vacationOverlays.push({ ...o })
      }
    }

    return { data: filtered, optMarkers, baselineViews, todayKey, vacationOverlays }
  }, [snapshots, optimizations, vacationPeriods])

  if (snapshots.length < 3) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
        Building your performance trend — check back as we collect more daily data.
      </div>
    )
  }

  return (
    <div ref={containerRef} className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Optimization impact</h4>
          <p className="text-[10px] text-muted-foreground">Daily views & favorites gained</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-3 bg-primary" />Views / day</span>
          <span className="flex items-center gap-1"><span className="inline-block h-[1.5px] w-3 border-t border-dashed border-primary/70" />Favorites / day</span>
        </div>
      </div>
      <div style={{ width: '100%', height: 160 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="recorded_on" tickFormatter={fmtTickDate} fontSize={10} stroke="hsl(var(--muted-foreground))" />
            <YAxis yAxisId="left" fontSize={10} stroke="hsl(var(--muted-foreground))" allowDecimals={false} domain={[0, 'auto']} />
            <YAxis yAxisId="right" orientation="right" fontSize={10} stroke="hsl(var(--muted-foreground))" allowDecimals={false} domain={[0, 'auto']} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
              labelFormatter={(label) => fmtTickDate(String(label))}
            />
            {baselineViews != null && (
              <ReferenceLine yAxisId="left" y={baselineViews} stroke="#1A6B5A" strokeDasharray="2 4" opacity={0.5}
                label={{ value: 'before', position: 'insideTopLeft', fill: '#1A6B5A', fontSize: 10, opacity: 0.7 }} />
            )}
            {vacationOverlays.map((v, idx) => (
              <ReferenceArea
                key={`vac-${idx}`}
                yAxisId="left"
                x1={v.x1}
                x2={v.x2}
                fill="hsl(var(--muted-foreground))"
                fillOpacity={0.12}
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity={0.2}
              />
            ))}
            {optMarkers.map(m => (
              <ReferenceLine
                key={m.day}
                yAxisId="left"
                x={m.day}
                stroke="#1A6B5A"
                strokeDasharray="4 4"
                opacity={0.3}
                label={{ value: m.label, position: 'top', fill: '#1A6B5A', fontSize: 10, opacity: 0.85 }}
              />
            ))}
            <ReferenceLine yAxisId="left" x={todayKey} stroke="hsl(var(--muted-foreground))" opacity={0.25} />
            <Line yAxisId="left" type="monotone" dataKey="views" stroke="#1A6B5A" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line yAxisId="right" type="monotone" dataKey="favorites" stroke="#1A6B5A" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {vacationOverlays.length > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-3 rounded-sm"
            style={{ background: 'hsl(var(--muted-foreground) / 0.18)', border: '1px solid hsl(var(--muted-foreground) / 0.3)' }}
          />
          Shaded periods: shop on vacation
        </p>
      )}
    </div>
  )
}

interface MilestoneStripProps {
  firstOptDate: string | null // ISO
}

export function MilestoneStrip({ firstOptDate }: MilestoneStripProps) {
  if (!firstOptDate) return null
  const base = new Date(firstOptDate).getTime()
  const today = Date.now()
  const milestones = [
    { label: 'Est. 7-day signal', date: base + 7 * 86400000 },
    { label: 'Est. 30-day signal', date: base + 30 * 86400000 },
  ]
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
      {milestones.map((m, idx) => {
        const passed = today >= m.date
        const dateStr = new Date(m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        return (
          <span key={idx} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${passed ? 'bg-primary' : 'border border-muted-foreground/50'}`}
              aria-hidden
            />
            <span className={passed ? 'text-foreground' : ''}>{m.label} {dateStr}</span>
          </span>
        )
      })}
    </div>
  )
}
