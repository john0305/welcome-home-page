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
        destructive: 'border border-red-200 bg-red-50 text-red-700',
        outline:     'border-border text-foreground',

        // Status — warm, AA-compliant on the light surface (dark overrides in index.css remap the -700 text)
        success: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
        warning: 'border border-amber-200 bg-amber-50 text-amber-800',
        danger:  'border border-red-200 bg-red-50 text-red-700',
        info:    'border border-primary/25 bg-primary/10 text-primary',

        // Grade variants — warm encouraging ramp: emerald → teal → amber → clay.
        // F is warm clay (orange-800), never punishing red. All pass WCAG AA on
        // the light surface; index.css dark overrides handle dark mode.
        'grade-aplus': 'border border-emerald-300 bg-emerald-50 text-emerald-700',
        'grade-a':     'border border-emerald-200 bg-emerald-50 text-emerald-700',
        'grade-b':     'border border-primary/25 bg-primary/10 text-primary',
        'grade-c':     'border border-amber-200 bg-amber-50 text-amber-800',
        'grade-d':     'border border-orange-200 bg-orange-50 text-orange-700',
        'grade-f':     'border border-orange-300 bg-orange-50 text-orange-800',

        // Product / plan badges
        etsy:  'border border-etsy/25 bg-etsy/10 text-etsy-dark',
        free:  'border-transparent bg-border/60 text-muted-foreground',
        pro:   'border border-primary/25 bg-primary/10 text-primary',
        admin: 'border border-amber-200 bg-amber-50 text-amber-800',
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
