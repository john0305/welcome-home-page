import * as React from 'react'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface EmptyStateAction {
  label: string
  onClick: () => void
  variant?: 'teal' | 'default' | 'outline'
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  size?: 'sm' | 'default' | 'lg'
  className?: string
}

const sizeConfig = {
  sm: {
    wrapper:     'py-8',
    iconWrapper: 'h-8 w-8 rounded-[var(--radius)]',
    icon:        'h-4 w-4',
    title:       'text-xs font-medium',
    desc:        'text-xs max-w-[220px]',
  },
  default: {
    wrapper:     'py-12',
    iconWrapper: 'h-10 w-10 rounded-[var(--radius-lg)]',
    icon:        'h-5 w-5',
    title:       'text-sm font-medium',
    desc:        'text-xs max-w-[280px]',
  },
  lg: {
    wrapper:     'py-20',
    iconWrapper: 'h-14 w-14 rounded-[var(--radius-lg)]',
    icon:        'h-7 w-7',
    title:       'text-base font-semibold',
    desc:        'text-sm max-w-[340px]',
  },
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'default',
  className,
}: EmptyStateProps) {
  const s = sizeConfig[size]
  return (
    <div className={cn('flex flex-col items-center gap-3 text-center', s.wrapper, className)}>
      <div className={cn('flex items-center justify-center bg-primary/10', s.iconWrapper)}>
        <Icon className={cn('text-primary/70', s.icon)} />
      </div>
      <div className="space-y-1">
        <p className={cn('text-foreground', s.title)}>{title}</p>
        {description && (
          <p className={cn('text-muted-foreground mx-auto', s.desc)}>{description}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-1">
          {action && (
            <Button
              variant={action.variant ?? 'teal'}
              size="sm"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant ?? 'ghost'}
              size="sm"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
