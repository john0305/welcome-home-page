/**
 * Recent optimizations feed — last 10 accepted/applied optimizations.
 * Outcome line uses grade_improvement if present, otherwise notes that the
 * signal window is still open.
 */
import { Link } from 'react-router-dom'
import { format, addDays, isAfter, formatDistanceToNowStrict, differenceInHours, differenceInDays } from 'date-fns'
import { CheckCircle2, Clock } from 'lucide-react'
import { useApp } from '@/contexts/AppContext'

function relativeOptimizedLabel(date: Date): string {
  const now = new Date()
  const hours = differenceInHours(now, date)
  if (hours < 24) {
    return `${formatDistanceToNowStrict(date, { addSuffix: false })} ago`
  }
  const days = differenceInDays(now, date)
  if (days < 7) {
    return `${days} day${days === 1 ? '' : 's'} ago`
  }
  return format(date, 'MMM d')
}

export function OptimizationActivityFeed({ limit = 10 }: { limit?: number }) {
  const { recentOptimizations } = useApp()
  const items = recentOptimizations.slice(0, limit)

  return (
    <section className="rounded-xl border" style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: "hsl(var(--border))" }}>
        <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
          Optimization activity
        </h3>
      </div>
      <div className="max-h-[260px] overflow-y-auto scrollbar-thin">
        {items.length === 0 ? (
          <p className="px-5 py-8 text-xs text-center text-muted-foreground">
            No optimizations yet — head to the fix queue to start.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {items.map(o => (
              <ActivityRow key={o.id} item={o} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function ActivityRow({ item }: { item: import('@/types').OptimizationRecord }) {
  const appliedAt = item.accepted_at ?? (item as unknown as { created_at?: string }).created_at ?? null
  const date = appliedAt ? new Date(appliedAt) : null
  const improvement = item.grade_improvement ?? null
  const signalDate = date ? addDays(date, 7) : null
  const signalReady = signalDate ? isAfter(new Date(), signalDate) : false

  const outcome =
    improvement != null && improvement !== 0
      ? `score ${improvement > 0 ? 'up' : 'down'} ${Math.abs(improvement)} pts`
      : signalReady
      ? 'signal expected'
      : signalDate
      ? `signal expected ${format(signalDate, 'MMM d')}`
      : 'in progress'

  return (
    <li className="px-5 py-3">
      <Link
        to={`/app/listings/${item.listing_id}`}
        className="flex items-start gap-3 transition-opacity hover:opacity-80"
      >
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
          {improvement != null && improvement > 0 ? (
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'hsl(var(--primary))' }} />
          ) : (
            <Clock className="h-3.5 w-3.5" style={{ color: 'hsl(var(--primary))' }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground truncate">{item.listing_title}</p>
          <p className="text-[11px] mt-0.5 text-muted-foreground">
            {date ? `Optimized ${relativeOptimizedLabel(date)}` : 'Optimized'} · {outcome}
          </p>
        </div>
      </Link>
    </li>
  )
}
