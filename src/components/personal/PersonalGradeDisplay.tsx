import { useState } from 'react'
import { CheckCircle2, ArrowRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PersonalGradeResult {
  overall_score: number
  letter_grade: string
  headline?: string | null
  dimensions?: Record<string, { score: number; verdict?: string; detail?: string }>
  what_is_working?: string[]
  what_needs_attention?: string[]
  priority_action?: string | null
  competitive_context?: string | null
  listing?: {
    is_digital?: boolean
    primary_image_url?: string | null
    price?: string | null
    category?: string | null
  }
}

type Severity = 'green' | 'blue' | 'amber' | 'red'

function gradeSeverity(letter: string): Severity {
  const g = (letter || '').toUpperCase()
  if (g.startsWith('A')) return 'green'
  if (g.startsWith('B')) return 'blue'
  if (g.startsWith('C')) return 'amber'
  return 'red'
}

function scoreSeverity(score: number): Severity {
  if (score >= 80) return 'green'
  if (score >= 65) return 'blue'
  if (score >= 50) return 'amber'
  return 'red'
}

const SEVERITY_BADGE: Record<Severity, string> = {
  green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  blue: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  red: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
}

const SEVERITY_BAR: Record<Severity, string> = {
  green: 'bg-emerald-500',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

const DIM_ORDER: Array<{ key: string; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'tags', label: 'Tags' },
  { key: 'images', label: 'Images' },
  { key: 'description', label: 'Description' },
  { key: 'materials', label: 'Materials' },
]

export function PersonalGradeDisplay({ grade }: { grade: PersonalGradeResult }) {
  const sev = gradeSeverity(grade.letter_grade)
  const isDigital = !!grade.listing?.is_digital
  const dims = DIM_ORDER.filter(d => !(isDigital && d.key === 'images'))

  return (
    <div className="space-y-5 rounded-md border bg-card p-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-semibold tabular-nums leading-none">{grade.overall_score}</span>
          <span className={cn('rounded-md border px-2 py-0.5 text-sm font-semibold', SEVERITY_BADGE[sev])}>
            {grade.letter_grade}
          </span>
        </div>
        {grade.headline && (
          <p className="flex-1 self-center text-[14px] leading-snug text-muted-foreground">{grade.headline}</p>
        )}
      </div>

      {/* Dimension bars */}
      <div className="space-y-2">
        {dims.map(d => {
          const dim = grade.dimensions?.[d.key]
          if (!dim) return null
          return <DimensionRow key={d.key} label={d.label} score={dim.score} verdict={dim.verdict} detail={dim.detail} />
        })}
      </div>

      {/* Two-column working / attention */}
      {(grade.what_is_working?.length || grade.what_needs_attention?.length) ? (
        <div className="grid gap-4 md:grid-cols-2">
          {grade.what_is_working && grade.what_is_working.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What's working</p>
              <ul className="space-y-1.5">
                {grade.what_is_working.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground/90">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {grade.what_needs_attention && grade.what_needs_attention.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What needs attention</p>
              <ul className="space-y-1.5">
                {grade.what_needs_attention.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground/90">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {/* Priority action */}
      {grade.priority_action && (
        <div className="rounded-md border-l-4 border-primary bg-muted/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Highest impact move</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{grade.priority_action}</p>
        </div>
      )}

      {/* Competitive context */}
      {grade.competitive_context && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Context</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{grade.competitive_context}</p>
        </div>
      )}
    </div>
  )
}

function DimensionRow({ label, score, verdict, detail }: { label: string; score: number; verdict?: string; detail?: string }) {
  const [open, setOpen] = useState(false)
  const sev = scoreSeverity(score)
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => detail && setOpen(o => !o)}
        className={cn('group flex w-full items-center gap-3 text-left', detail ? 'cursor-pointer' : 'cursor-default')}
      >
        <span className="w-[100px] shrink-0 text-sm font-medium">{label}</span>
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all', SEVERITY_BAR[sev])}
            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          />
        </div>
        <span className="w-10 shrink-0 text-right text-sm tabular-nums">{score}</span>
        {detail && (
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        )}
      </button>
      {verdict && <p className="pl-[112px] text-[12px] text-muted-foreground">{verdict}</p>}
      {open && detail && (
        <p className="pl-[112px] text-[12px] leading-relaxed text-foreground/80">{detail}</p>
      )}
    </div>
  )
}
