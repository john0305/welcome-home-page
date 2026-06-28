import * as React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

/** Grid of KPI metric card skeletons */
export function KPIRowSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn(`grid gap-3 grid-cols-2 lg:grid-cols-${count}`, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[var(--radius-lg)] border border-border overflow-hidden">
          <Skeleton className="h-0.5 w-full rounded-none" />
          <div className="p-5 space-y-3">
            <Skeleton className="h-8 w-8 rounded-[var(--radius-sm)]" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Vertical list of card skeletons with a thumbnail */
export function CardListSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[var(--radius-lg)] border border-border p-4">
          <div className="flex gap-3">
            <Skeleton className="h-12 w-12 rounded-[var(--radius-sm)] shrink-0" />
            <div className="flex-1 space-y-2 py-0.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-14 rounded-full shrink-0 self-center" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Simple full-width block skeletons for charts and panels */
export function PanelSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  )
}
