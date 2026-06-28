import { Loader2, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PipelineStage = 'niche' | 'market' | 'scoring' | 'complete' | 'idle'

interface Props {
  stage?: PipelineStage
  listingsProcessed?: number
  className?: string
}

const STAGES: Array<{ key: PipelineStage; label: string; estimated: string }> = [
  { key: 'niche',    label: 'Detecting your niche…',    estimated: '~5 sec'  },
  { key: 'market',   label: 'Scanning your market…',    estimated: '~30 sec' },
  { key: 'scoring',  label: 'Scoring your listings…',   estimated: '~45 sec' },
  { key: 'complete', label: 'Your insights are ready!', estimated: '' },
]

const STAGE_ORDER: PipelineStage[] = ['niche', 'market', 'scoring', 'complete']

export function PipelineLoadingState({ stage = 'niche', listingsProcessed, className }: Props) {
  if (stage === 'idle') return null

  const currentIdx = STAGE_ORDER.indexOf(stage)
  const isComplete = stage === 'complete'

  return (
    <div
      className={cn('rounded-xl border p-5', className)}
      style={{ background: '#081015', borderColor: "hsl(var(--border))" }}
      role="status"
      aria-label={`Pipeline stage: ${stage}`}
    >
      <div className="flex items-center gap-2 mb-4">
        {isComplete
          ? <CheckCircle2 className="h-4 w-4" style={{ color: '#10b981' }} />
          : <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#00C4AF' }} />}
        <span className="text-sm font-semibold text-foreground">
          {isComplete ? 'Scan complete' : 'Scanning your market…'}
        </span>
        {listingsProcessed != null && listingsProcessed > 0 && (
          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {listingsProcessed} listing{listingsProcessed !== 1 ? 's' : ''} processed
          </span>
        )}
      </div>

      {/* Stage progress */}
      <div className="space-y-2">
        {STAGES.filter(s => s.key !== 'complete').map((s, idx) => {
          const isDone = idx < currentIdx || isComplete
          const isCurrent = idx === currentIdx && !isComplete

          return (
            <div key={s.key} className="flex items-center gap-3">
              <div className="shrink-0 relative flex items-center justify-center h-5 w-5">
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4" style={{ color: '#10b981' }} />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#00C4AF' }} />
                ) : (
                  <Clock className="h-4 w-4 opacity-30" style={{ color: 'hsl(var(--muted-foreground))' }} />
                )}
              </div>
              <div className="flex items-center justify-between flex-1 min-w-0">
                <span
                  className={cn('text-xs font-medium', isDone ? 'line-through opacity-50' : isCurrent ? 'text-foreground' : 'opacity-40 text-foreground')}
                >
                  {s.label}
                </span>
                {isCurrent && s.estimated && (
                  <span className="text-[10px] shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>{s.estimated}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      {!isComplete && (
        <div className="mt-4 h-1 rounded-full overflow-hidden" style={{ background: 'hsl(var(--border))' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.round((currentIdx / (STAGES.length - 1)) * 100)}%`,
              background: 'linear-gradient(90deg, #00C4AF, #10b981)',
            }}
          />
        </div>
      )}
    </div>
  )
}

/** Skeleton placeholder for individual sections while pipeline runs. */
export function SectionSkeleton({ label }: { label: string }) {
  return (
    <div
      className="rounded-xl border p-5 animate-pulse"
      style={{ background: '#081015', borderColor: "hsl(var(--border))" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-3.5 w-3.5 rounded-full" style={{ background: "hsl(var(--border))" }} />
        <div className="h-3.5 w-28 rounded" style={{ background: "hsl(var(--border))" }} />
      </div>
      <p className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>{label}</p>
    </div>
  )
}
