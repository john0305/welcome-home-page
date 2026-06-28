import { cn } from '@/lib/utils'
import { getGradeLabel } from '@/types'
import { Badge, gradeVariant } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'

interface GradeBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showScore?: boolean
  className?: string
}

export function GradeBadge({ score, size = 'md', showScore = true, className }: GradeBadgeProps) {
  const label = getGradeLabel(score)
  const variant = gradeVariant(score)

  const sizeClass = {
    sm: 'text-[10px] px-1.5 py-0.5 min-w-[1.75rem]',
    md: 'text-xs px-2 py-0.5 min-w-[2.25rem]',
    lg: 'text-sm px-2.5 py-1 min-w-[2.75rem]',
  }[size]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={variant}
            className={cn('justify-center tabular-nums font-semibold', sizeClass, className)}
          >
            {showScore ? score : label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Grade: {label} ({score}/100)
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function GradeDot({ score }: { score: number }) {
  const colorMap = {
    high: 'bg-emerald-500',
    good: 'bg-green-500',
    ok: 'bg-primary',
    fair: 'bg-amber-500',
    poor: 'bg-orange-500',
    bad: 'bg-red-500',
  }
  const key = score >= 90 ? 'high' : score >= 80 ? 'good' : score >= 70 ? 'ok' : score >= 60 ? 'fair' : score >= 50 ? 'poor' : 'bad'
  return <span className={cn('inline-block h-2 w-2 rounded-full', colorMap[key])} />
}
