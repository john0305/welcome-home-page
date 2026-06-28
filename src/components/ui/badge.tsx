import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:     'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:   'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive/20 text-red-400 border-destructive/30',
        outline:     'border-border text-foreground',

        // Status — dark-mode correct alpha backgrounds
        success: 'border-transparent bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
        warning: 'border-transparent bg-amber-500/15 text-amber-400 border border-amber-500/25',
        danger:  'border-transparent bg-red-500/15 text-red-400 border border-red-500/25',
        info:    'border-transparent bg-blue-500/15 text-blue-400 border border-blue-500/25',

        // Grade variants — dark-mode correct
        'grade-aplus': 'border-transparent bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
        'grade-a':     'border-transparent bg-green-500/15 text-green-400 border border-green-500/25',
        'grade-b':     'border-transparent bg-primary/15 text-primary border border-primary/25',
        'grade-c':     'border-transparent bg-amber-500/15 text-amber-400 border border-amber-500/25',
        'grade-d':     'border-transparent bg-orange-500/15 text-orange-400 border border-orange-500/25',
        'grade-f':     'border-transparent bg-red-500/15 text-red-400 border border-red-500/25',

        // Product / plan badges
        etsy:  'border-transparent bg-etsy/15 text-etsy-light border border-etsy/25',
        free:  'border-transparent bg-border/60 text-muted-foreground',
        pro:   'border-transparent bg-primary/15 text-primary border border-primary/25',
        admin: 'border-transparent bg-amber-500/15 text-amber-400',
        count: 'rounded-md bg-muted text-muted-foreground px-1.5 text-[10px]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

/** Maps a numeric grade score (0–100) to the correct Badge variant. */
export function gradeVariant(score: number): BadgeVariant {
  if (score >= 90) return 'grade-aplus'
  if (score >= 80) return 'grade-a'
  if (score >= 70) return 'grade-b'
  if (score >= 60) return 'grade-c'
  if (score >= 50) return 'grade-d'
  return 'grade-f'
}

/** Maps a letter grade string to the correct Badge variant. */
export function gradeLetterVariant(grade: string): BadgeVariant {
  switch (grade?.toUpperCase()) {
    case 'A+': return 'grade-aplus'
    case 'A':  return 'grade-a'
    case 'B':  return 'grade-b'
    case 'C':  return 'grade-c'
    case 'D':  return 'grade-d'
    case 'F':  return 'grade-f'
    default:   return 'outline'
  }
}

export { Badge, badgeVariants }
