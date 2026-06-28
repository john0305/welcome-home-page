/**
 * BulkProgressPanel — floating panel rendered from <AppLayout> so a bulk
 * grade/optimize run stays visible while the user navigates between pages.
 * Replaces the per-item toast spam with a single progress bar + a scrolling
 * log of "prev → new" grade changes.
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, X, Loader2, Check, AlertTriangle, Sparkles, Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useListingActions } from '@/hooks/useListingActions'
import { cn } from '@/lib/utils'

function GradeDelta({ prev, next }: { prev?: number | null; next?: number | null }) {
  const p = typeof prev === 'number' ? Math.round(prev) : null
  const n = typeof next === 'number' ? Math.round(next) : null
  if (p == null && n == null) return null
  const delta = p != null && n != null ? n - p : null
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {p ?? '—'} → <span className="text-foreground font-medium">{n ?? '…'}</span>
      {delta != null && (
        <span className={cn('ml-1', delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-red-500' : 'text-muted-foreground')}>
          ({delta > 0 ? '+' : ''}{delta})
        </span>
      )}
    </span>
  )
}

export function BulkProgressPanel() {
  const { bulkRun, cancelBulkRun, dismissBulkRun } = useListingActions()
  const [collapsed, setCollapsed] = useState(false)

  if (!bulkRun) return null

  const pct = bulkRun.total > 0 ? Math.round((bulkRun.completed / bulkRun.total) * 100) : 0
  const Icon = bulkRun.kind === 'grade' ? Gauge : Sparkles
  const label = bulkRun.kind === 'grade' ? 'Bulk grading' : 'Bulk optimizing'

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-2xl animate-fade-in">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">
            {label} {bulkRun.completed}/{bulkRun.total}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          {bulkRun.done ? (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={dismissBulkRun}>
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={cancelBulkRun}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="px-3 pt-2">
        <Progress value={pct} className="h-1.5" />
        <p className="mt-1 text-xs text-muted-foreground">
          {bulkRun.done
            ? bulkRun.cancelled
              ? `Cancelled · ${bulkRun.completed} processed${bulkRun.failed > 0 ? `, ${bulkRun.failed} failed` : ''}`
              : `Done · ${bulkRun.completed - bulkRun.failed} succeeded${bulkRun.failed > 0 ? `, ${bulkRun.failed} failed` : ''}`
            : `${bulkRun.total - bulkRun.completed} remaining — keep working, this runs in the background`}
        </p>
      </div>

      {!collapsed && (
        <div className="mt-2 max-h-64 overflow-y-auto px-3 pb-3 space-y-1.5">
          {bulkRun.items.map(item => (
            <div key={item.listing_id} className="flex items-center gap-2 text-xs">
              <span className="shrink-0">
                {item.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                {item.status === 'done' && <Check className="h-3.5 w-3.5 text-emerald-500" />}
                {item.status === 'failed' && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                {item.status === 'pending' && <span className="block h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />}
                {item.status === 'skipped' && <X className="h-3.5 w-3.5 text-muted-foreground" />}
              </span>
              <span className="flex-1 truncate" title={item.title}>{item.title}</span>
              {bulkRun.kind === 'grade' && item.status === 'done' && (
                <GradeDelta prev={item.prev_grade} next={item.new_grade} />
              )}
              {item.status === 'failed' && (
                <span className="text-xs text-red-500 truncate max-w-[140px]" title={item.error}>
                  {item.error ?? 'failed'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
