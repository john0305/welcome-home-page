import { CheckCircle2, Clock, XCircle, Sparkles } from 'lucide-react'
import type { OptimizationRecord } from '@/types'
import { formatRelative, truncate } from '@/lib/utils'

const statusConfig: Record<string, { icon: typeof CheckCircle2; iconColor: string; bg: string; label: string; labelColor: string }> = {
  accepted:    { icon: CheckCircle2, iconColor: '#34d399', bg: 'rgba(16,185,129,0.15)',  label: 'Accepted',  labelColor: '#34d399' },
  approved:    { icon: CheckCircle2, iconColor: '#34d399', bg: 'rgba(16,185,129,0.15)',  label: 'Approved',  labelColor: '#34d399' },
  completed:   { icon: Sparkles,     iconColor: '#60a5fa', bg: 'rgba(59,130,246,0.15)',  label: 'Ready',     labelColor: '#60a5fa' },
  pending:     { icon: Clock,        iconColor: '#fbbf24', bg: 'rgba(245,158,11,0.15)',  label: 'Pending',   labelColor: '#fbbf24' },
  in_progress: { icon: Sparkles,     iconColor: 'hsl(var(--primary))', bg: 'hsl(var(--primary) / 0.15)', label: 'Running', labelColor: 'hsl(var(--primary))' },
  rejected:    { icon: XCircle,      iconColor: '#f87171', bg: 'rgba(239,68,68,0.15)',   label: 'Rejected',  labelColor: '#f87171' },
  failed:      { icon: XCircle,      iconColor: '#f87171', bg: 'rgba(239,68,68,0.15)',   label: 'Failed',    labelColor: '#f87171' },
}
const DEFAULT_STATUS = statusConfig.pending

export function ActivityFeed({ records }: { records: OptimizationRecord[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden transition-colors hover:border-primary/30">
      <div className="h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <div className="p-5">
        <p className="text-sm font-medium text-muted-foreground mb-4">Recent AI Activity</p>
        <div className="space-y-3">
          {records.length === 0 ? (
            <p className="text-sm text-center py-4 text-muted-foreground/60">No optimizations yet</p>
          ) : (
            records.slice(0, 6).map(record => {
              const cfg = statusConfig[record.status] ?? DEFAULT_STATUS
              const Icon = cfg.icon
              const title = record.listing_title ?? 'Untitled listing'
              return (
                <div key={record.id} className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: cfg.bg }}>
                    <Icon className="h-3.5 w-3.5" style={{ color: cfg.iconColor }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight text-foreground">{truncate(title, 42)}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.labelColor }}>
                        {cfg.label}
                      </span>
                      {record.grade_improvement && record.grade_improvement > 0 && (
                        <span className="text-[10px] font-semibold text-emerald-400">+{record.grade_improvement} pts</span>
                      )}
                      <span className="text-[10px] text-muted-foreground/60">{formatRelative(record.created_at)}</span>
                    </div>
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
