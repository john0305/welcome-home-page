import { ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GradeBadge } from '@/components/listings/GradeBadge'
import type { OptimizationRecord } from '@/types'

export function OptimizationDiff({ record }: { record: OptimizationRecord }) {
  const isAccepted = ['accepted', 'pushed', 'approved'].includes(record.status as string)
  const fallbackGrade = (record as any).latest_grade as number | null | undefined
  const effectiveNewGrade = record.new_grade ?? fallbackGrade ?? null
  const hasNewGrade = effectiveNewGrade != null

  return (
    <div className="space-y-4">
      {/* Grade improvement */}
      <div className="flex items-center gap-4 rounded-lg bg-muted p-4">
        <div className="text-center">
          <GradeBadge score={record.original_grade} size="lg" />
          <p className="mt-1 text-xs text-muted-foreground">Before</p>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
        <div className="text-center">
          {hasNewGrade ? (
            <>
              <GradeBadge score={effectiveNewGrade!} size="lg" />
              <p className="mt-1 text-xs text-muted-foreground">{isAccepted ? 'After' : 'Estimated'}</p>
            </>
          ) : (
            <>
              <div className="flex h-10 min-w-[3rem] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground px-2">
                {isAccepted ? 'Recalculating' : '—'}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{isAccepted ? 'Score recalculates after sync' : 'Updates after applying'}</p>
            </>
          )}
        </div>

        {hasNewGrade && effectiveNewGrade! > record.original_grade && (
          <div className="ml-auto rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
            +{effectiveNewGrade! - record.original_grade} pts {isAccepted ? 'improvement' : 'projected'}
          </div>
        )}
      </div>

      {/* Title diff */}
      <DiffSection
        label="Title"
        before={record.original_title}
        after={record.optimized_title}
      />

      {/* Description diff — label lives outside the scroll box */}
      {record.optimized_description && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Description</p>
          <div className="grid grid-cols-2 gap-3">
            <ScrollBox label="Before" labelColor="red">
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{record.original_description}</p>
            </ScrollBox>
            <ScrollBox label="After" labelColor="green">
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{record.optimized_description}</p>
            </ScrollBox>
          </div>
        </div>
      )}

      {/* Tags diff */}
      {record.optimized_tags && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Tags</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Before ({record.original_tags.length}/13)</p>
              <div className="flex flex-wrap gap-1">
                {record.original_tags.map(t => (
                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">After ({record.optimized_tags.length}/13)</p>
              <div className="flex flex-wrap gap-1">
                {record.optimized_tags.map(t => (
                  <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Materials diff */}
      {record.optimized_materials && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Materials</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Before</p>
              <div className="flex flex-wrap gap-1">
                {record.original_materials.map(m => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">After</p>
              <div className="flex flex-wrap gap-1">
                {record.optimized_materials.map(m => <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * ScrollBox — label sits ABOVE the scroll container as a normal element.
 * Avoids the sticky-inside-overflow z-index bleed where text appears to
 * float through the label during scrolling.
 */
function ScrollBox({
  label,
  labelColor,
  children,
}: {
  label: string
  labelColor: 'red' | 'green'
  children: React.ReactNode
}) {
  const isRed = labelColor === 'red'
  return (
    <div className="flex flex-col min-h-0">
      {/* Label is a normal block — outside the scroll container, never overlaps */}
      <p
        className="text-[10px] font-medium uppercase tracking-wide px-3 py-1.5 rounded-t-md shrink-0"
        style={{
          background: isRed ? '#fef2f2' : '#f0fdf4',
          color: isRed ? '#b91c1c' : '#15803d',
          borderBottom: isRed ? '1px solid #fecaca' : '1px solid #bbf7d0',
        }}
      >
        {label}
      </p>
      {/* Scroll container — no sticky needed, label is always above */}
      <div
        className="overflow-y-auto p-3 rounded-b-md max-h-64"
        style={{ background: isRed ? '#fef2f2' : '#f0fdf4' }}
      >
        {children}
      </div>
    </div>
  )
}

function DiffSection({ label, before, after }: { label: string; before: string; after?: string }) {
  if (!after) return null
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <ScrollBox label="Before" labelColor="red">
          <p className="text-xs text-slate-700">{before}</p>
        </ScrollBox>
        <ScrollBox label="After" labelColor="green">
          <p className="text-xs text-slate-700">{after}</p>
        </ScrollBox>
      </div>
    </div>
  )
}
