import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, AlertCircle, Info, Lightbulb } from 'lucide-react'
import type { ListingGrade } from '@/types'
import { getGradeLabel, getGradeColor } from '@/types'
import { cn } from '@/lib/utils'

interface InlineAction {
  label: string
  onClick: () => void
  disabled?: boolean
}

interface GradeDisplayProps {
  grade: ListingGrade | {
    overall_score: number
    title_score: number
    description_score: number
    tags_score: number
    image_score: number
    strengths?: string[]
    weaknesses?: string[]
    recommendations?: string[]
    summary?: string
  }
  compact?: boolean
  /** Optional per-factor inline links (Title / Description / Tags / Images / Materials). */
  factorActions?: {
    title?: InlineAction
    description?: InlineAction
    tags?: InlineAction
    image?: InlineAction
    materials?: InlineAction
  }
}

const SCORE_LABELS = [
  { key: 'title_score', actionKey: 'title' as const, label: 'Title', max: 25 },
  { key: 'description_score', actionKey: 'description' as const, label: 'Description', max: 25 },
  { key: 'tags_score', actionKey: 'tags' as const, label: 'Tags', max: 25 },
  { key: 'image_score', actionKey: 'image' as const, label: 'Images', max: 25 },
]

function scoreColor(score: number, max: number): string {
  const pct = (score / max) * 100
  if (pct >= 88) return 'bg-emerald-500'
  if (pct >= 72) return 'bg-blue-500'
  if (pct >= 56) return 'bg-amber-500'
  return 'bg-red-500'
}

export function GradeDisplay({ grade, compact = false, factorActions }: GradeDisplayProps) {
  const label = getGradeLabel(grade.overall_score)
  const colorClass = getGradeColor(grade.overall_score)

  if (compact) {
    return (
      <div className="flex items-center gap-4">
        <div className={cn('flex h-14 w-14 items-center justify-center rounded-full border-2 text-xl font-bold', colorClass)}>
          {label}
        </div>
        <div className="space-y-1.5 flex-1">
          {SCORE_LABELS.map(s => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="w-20 text-xs text-muted-foreground">{s.label}</span>
              <Progress
                value={(grade[s.key as keyof typeof grade] as number / s.max) * 100}
                className="h-1.5 flex-1"
              />
              <span className="text-xs font-medium w-8 text-right">
                {grade[s.key as keyof typeof grade] as number}/{s.max}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Overall score */}
      <div className="flex items-center gap-5">
        <div className={cn('flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 text-2xl font-extrabold', colorClass)}>
          {label}
          <span className="text-xs font-normal mt-0.5">{grade.overall_score}/100</span>
        </div>
        <div className="space-y-2 flex-1">
          {SCORE_LABELS.map(s => {
            const val = grade[s.key as keyof typeof grade] as number
            const pct = (val / s.max) * 100
            const action = factorActions?.[s.actionKey]
            return (
              <div key={s.key} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{s.label}</span>
                  <span className="flex items-center gap-2">
                    {action && (
                      <button
                        type="button"
                        onClick={action.onClick}
                        disabled={action.disabled}
                        className="text-[10px] font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                      >
                        {action.label} →
                      </button>
                    )}
                    <span className="text-muted-foreground">{val}/{s.max}</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full transition-all rounded-full', scoreColor(val, s.max))}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
          {factorActions?.materials && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-border mt-2">
              <span className="font-medium">Materials</span>
              <button
                type="button"
                onClick={factorActions.materials.onClick}
                disabled={factorActions.materials.disabled}
                className="text-[10px] font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {factorActions.materials.label} →
              </button>
            </div>
          )}
        </div>
      </div>


      {/* Feedback sections */}
      {grade.strengths && grade.strengths.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Strengths
          </div>
          <ul className="space-y-0.5">
            {grade.strengths.map((s, i) => (
              <li key={i} className="text-xs text-muted-foreground pl-5">• {s}</li>
            ))}
          </ul>
        </div>
      )}

      {grade.weaknesses && grade.weaknesses.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" />
            Weaknesses
          </div>
          <ul className="space-y-0.5">
            {grade.weaknesses.map((s, i) => (
              <li key={i} className="text-xs text-muted-foreground pl-5">• {s}</li>
            ))}
          </ul>
        </div>
      )}

      {grade.recommendations && grade.recommendations.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
            <Lightbulb className="h-3.5 w-3.5" />
            Recommendations
          </div>
          <ul className="space-y-0.5">
            {grade.recommendations.map((s, i) => (
              <li key={i} className="text-xs text-muted-foreground pl-5">• {s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
