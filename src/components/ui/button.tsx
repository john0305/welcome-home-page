import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground hover:bg-primary/90 riq-btn-primary',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:     'border border-input bg-background hover:bg-primary/8 hover:text-primary hover:border-primary/50',
        secondary:   'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:       'hover:bg-accent hover:text-accent-foreground',
        link:        'text-primary underline-offset-4 hover:underline',
        etsy:        'bg-etsy text-white hover:bg-etsy-dark',
        /** Teal ghost — primary-tinted soft button */
        teal:        'bg-primary/15 text-primary border border-primary/35 hover:bg-primary/25 hover:border-primary/55',
        /** Surface button — sits on background, elevates on hover */
        surface:     'bg-surface-1 border border-border text-foreground hover:bg-surface-2 hover:border-border',
      },
      size: {
        xs:       'h-7 rounded-[var(--radius-sm)] px-2.5 text-xs',
        sm:       'h-8 rounded-[var(--radius-sm)] px-3 text-xs',
        default:  'h-9 rounded-[var(--radius)] px-4',
        lg:       'h-10 rounded-[var(--radius)] px-5',
        xl:       'h-12 rounded-[var(--radius)] px-8 text-base',
        icon:     'h-9 w-9 rounded-[var(--radius)]',
        'icon-sm':'h-7 w-7 rounded-[var(--radius-sm)]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
