import { useEffect, useRef, useState } from 'react'
import { type LucideIcon, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  loading?: boolean
  onClick?: () => void
  badge?: string
  sparkline?: number[]
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const w = 80
  const h = 22
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = w / (points.length - 1)
  const path = points
    .map((p, i) => {
      const x = i * step
      const y = h - ((p - min) / range) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const last = points[points.length - 1]
  const lastX = w
  const lastY = h - ((last - min) / range) * h
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden="true">
      <path d={path} fill="none" stroke="var(--kpi-line)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <circle cx={lastX} cy={lastY} r={2} fill="var(--kpi-line)" />
    </svg>
  )
}

export function KPICard({
  title, value, subtitle, icon: Icon, trend, variant = 'default',
  loading, onClick, badge, sparkline,
}: KPICardProps) {
  const isClickable = !!onClick

  const prevValueRef = useRef<string | number | undefined>(undefined)
  const [justUpdated, setJustUpdated] = useState(false)
  useEffect(() => {
    if (loading) return
    if (prevValueRef.current === undefined) { prevValueRef.current = value; return }
    if (prevValueRef.current !== value) {
      prevValueRef.current = value
      setJustUpdated(true)
      const t = setTimeout(() => setJustUpdated(false), 2200)
      return () => clearTimeout(t)
    }
  }, [value, loading])

  if (loading) {
    return (
      <div className="kpi-loading">
        <div className="kpi-loading-bar skeleton-shimmer" />
        <div className="p-5 space-y-3">
          <div className="h-9 w-9 rounded-[var(--radius)] skeleton-shimmer bg-surface-1" />
          <div className="h-7 w-20 rounded skeleton-shimmer bg-surface-1" />
          <div className="h-4 w-32 rounded skeleton-shimmer bg-surface-1" />
        </div>
      </div>
    )
  }

  return (
    <div
      data-kpi={variant}
      data-clickable={isClickable ? 'true' : undefined}
      className={cn('kpi-card', justUpdated && 'is-updated animate-kpi-pulse')}
      onClick={onClick}
    >
      {/* Updated badge */}
      {justUpdated && (
        <div className="absolute top-2 right-2 z-10 kpi-updated-badge animate-fade-in">
          <span className="kpi-updated-dot" />
          Updated
        </div>
      )}

      {/* Accent bar */}
      <div className="kpi-accent-bar" />

      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="kpi-icon-box">
            <Icon className="h-4 w-4" />
          </div>
          {badge ? (
            <span className="rounded-full px-2 py-0.5 text-xs font-medium kpi-updated-badge">
              {badge}
            </span>
          ) : isClickable ? (
            <div className="kpi-arrow" aria-hidden>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex items-end justify-between gap-2">
          <p className="text-kpi">{value}</p>
          {sparkline && sparkline.length >= 2 && <Sparkline points={sparkline} />}
        </div>
        <p className="mt-0.5 text-label text-muted-foreground/70">{title}</p>

        {(subtitle || trend) && (
          <div className="mt-2 flex items-center gap-2">
            {trend && (
              <span className={cn(
                'text-xs',
                trend.value > 0 ? 'kpi-trend-up' : trend.value < 0 ? 'kpi-trend-down' : 'kpi-trend-flat',
              )}>
                {trend.value > 0 ? '↑' : trend.value < 0 ? '↓' : '→'} {Math.abs(trend.value)}%
              </span>
            )}
            {subtitle && <p className="text-label-sm text-muted-foreground/50">{subtitle}</p>}
          </div>
        )}

        {isClickable && (
          <p className="mt-2 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--kpi-color)' }}>
            Click to view →
          </p>
        )}
      </div>
    </div>
  )
}
