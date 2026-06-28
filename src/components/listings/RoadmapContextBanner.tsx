/**
 * Shown at the top of the Listings page when the user navigates in from
 * the Score Roadmap via "Fix it". Reads the roadmap_filter + source query
 * params and displays a compact context strip with live filtered counts.
 *
 * When the filtered count reaches 0 it morphs into a success state and
 * auto-dismisses after 5 seconds.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, X } from 'lucide-react'
import { getRoadmapFilter, type RoadmapFilter } from '@/lib/roadmapFilterMap'
import { cn } from '@/lib/utils'

interface Props {
  filter: RoadmapFilter
  filteredCount: number
  onDismiss: () => void
}

export function RoadmapContextBanner({ filter, filteredCount, onDismiss }: Props) {
  const navigate = useNavigate()
  const [entered, setEntered] = useState(false)
  const isDone = filteredCount === 0

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 10)
    return () => clearTimeout(t)
  }, [])

  // Auto-dismiss the success state after 5s.
  useEffect(() => {
    if (!isDone) return
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [isDone, onDismiss])

  const Icon = filter.icon
  const accent = filter.tone === 'teal' ? 'border-l-primary' : 'border-l-amber-400'

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border border-l-4 bg-muted/50 px-3 py-2 text-sm transition-all duration-300 sm:flex-row sm:items-center sm:justify-between',
        accent,
        entered ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
      )}
    >
      {isDone ? (
        <>
          <div className="flex items-center gap-2 text-foreground">
            <Check className="h-4 w-4 text-emerald-500" />
            <span className="font-medium">All {filter.label.toLowerCase()} improved — great work!</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/app/score-roadmap')}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Score Roadmap
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <Icon className="h-4 w-4 text-muted-foreground" />
              Fixing: {filter.label}
            </span>
            <span className="inline-flex items-center rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {filteredCount} listing{filteredCount === 1 ? '' : 's'} need{filteredCount === 1 ? 's' : ''} attention
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/app/score-roadmap')}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Score Roadmap
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export { getRoadmapFilter }
