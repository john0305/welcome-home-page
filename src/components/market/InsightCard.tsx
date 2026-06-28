import { type LucideIcon, ChevronRight, CheckCircle2, Clock, RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type InsightStatus = 'not_started' | 'in_progress' | 'done' | 'tracking'
export type InsightImpact = 'high' | 'medium' | 'low'

interface Props {
  icon: LucideIcon
  title: string
  impact: InsightImpact
  context: string
  action: string
  status?: InsightStatus
  onAction?: () => void
  actionDisabled?: boolean
  actionLoading?: boolean
  className?: string
}

const IMPACT_STYLES: Record<InsightImpact, { bg: string; fg: string; label: string }> = {
  high:   { bg: 'rgba(245,158,11,0.15)',  fg: '#f59e0b', label: 'HIGH IMPACT' },
  medium: { bg: 'hsl(var(--primary)/0.12)', fg: 'hsl(var(--primary))', label: 'MEDIUM' },
  low:    { bg: 'rgba(100,116,139,0.15)', fg: '#64748b', label: 'LOW' },
}

const STATUS_ITEMS: Record<InsightStatus, { icon: typeof CheckCircle2; label: string; color: string }> = {
  not_started: { icon: AlertTriangle,  label: 'Not started', color: 'hsl(var(--muted-foreground))' },
  in_progress: { icon: Clock,          label: 'In progress',  color: '#f59e0b' },
  done:        { icon: CheckCircle2,   label: 'Done',         color: '#10b981' },
  tracking:    { icon: RefreshCw,      label: 'Tracking',     color: 'hsl(var(--primary))' },
}

export function InsightCard({
  icon: Icon,
  title,
  impact,
  context,
  action,
  status = 'not_started',
  onAction,
  actionDisabled,
  actionLoading,
  className,
}: Props) {
  const impactStyle = IMPACT_STYLES[impact]
  const statusItem = STATUS_ITEMS[status]
  const StatusIcon = statusItem.icon

  return (
    <div
      className={cn(
        'rounded-xl border p-4 flex flex-col gap-3 transition-all duration-200 bg-surface-1',
        status === 'done' ? 'border-emerald-500/25' : 'border-border',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: impactStyle.bg, color: impactStyle.fg }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-sm font-medium text-foreground leading-snug">{title}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: impactStyle.bg, color: impactStyle.fg }}
        >
          {impactStyle.label}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{context}</p>

      <div className="flex items-center justify-between gap-3 mt-auto">
        {onAction ? (
          <button
            onClick={onAction}
            disabled={actionDisabled || actionLoading || status === 'done'}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold bg-primary text-background transition-all hover:opacity-90 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {actionLoading ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {action}
          </button>
        ) : (
          <p className="text-xs font-medium text-primary">{action}</p>
        )}

        <div className="flex items-center gap-1.5">
          <StatusIcon className="h-3 w-3" style={{ color: statusItem.color }} />
          <span className="text-[10px] font-medium" style={{ color: statusItem.color }}>
            {statusItem.label}
          </span>
        </div>
      </div>
    </div>
  )
}
