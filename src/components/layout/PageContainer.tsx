import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
  noPadding?: boolean
}

export function PageContainer({ children, className, noPadding }: PageContainerProps) {
  return (
    <div className={cn('flex-1 min-h-full', !noPadding && 'page-content space-y-4', className)}>
      {children}
    </div>
  )
}

interface AppCardProps {
  children: React.ReactNode
  className?: string
  accentColor?: string
  style?: React.CSSProperties
}

export function AppCard({ children, className, accentColor, style }: AppCardProps) {
  return (
    <div
      className={cn('rounded-[var(--radius-lg)] border border-border bg-card overflow-hidden shadow-sm', className)}
      style={style}
    >
      {accentColor && (
        <div className="h-0.5 w-full" style={{ background: accentColor }} />
      )}
      {children}
    </div>
  )
}
