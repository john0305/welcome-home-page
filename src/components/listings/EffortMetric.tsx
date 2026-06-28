import { RefreshCw, Clock } from 'lucide-react'
import { daysSince } from '@/lib/utils'

/**
 * Compact "refresh effort" metric — how many times this listing has been
 * AI-optimized vs. how long it's been listed. Helps the seller judge whether
 * a low-performing listing has actually been given chances, or whether it
 * just hasn't been touched.
 */
export function EffortMetric({
  optimizationCount,
  etsyCreatedAt,
  lastOptimizedAt,
}: {
  optimizationCount: number
  etsyCreatedAt?: string
  lastOptimizedAt?: string
}) {
  const ageDays = etsyCreatedAt ? daysSince(etsyCreatedAt) : 0
  const lastDays = lastOptimizedAt ? daysSince(lastOptimizedAt) : null

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh effort
      </div>
      <p className="mt-1.5 text-sm">
        <span className="font-semibold">{optimizationCount}</span> refresh{optimizationCount === 1 ? '' : 'es'}{' '}
        over <span className="font-semibold">{ageDays}</span> days listed
      </p>
      {lastDays !== null && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          Last refresh {lastDays === 0 ? 'today' : `${lastDays}d ago`}
        </p>
      )}
      {optimizationCount === 0 && ageDays > 30 && (
        <p className="mt-1 text-xs text-amber-600">
          Listed {ageDays} days with no refreshes — consider optimizing.
        </p>
      )}
    </div>
  )
}
