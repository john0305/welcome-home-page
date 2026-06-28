import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const skeletonVariants = cva(
  'skeleton-shimmer rounded-[var(--radius)]',
  {
    variants: {
      variant: {
        default: 'bg-surface-1',
        subtle:  'bg-surface-1/60',
        strong:  'bg-surface-2',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {}

function Skeleton({ className, variant, ...props }: SkeletonProps) {
  return (
    <div className={cn(skeletonVariants({ variant }), className)} {...props} />
  )
}

export { Skeleton }
