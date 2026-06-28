/**
 * RADARIQ brand logo — animated radar sweep + wordmark.
 * Use `size` to scale the icon. `showText` shows the full wordmark.
 * `animated` adds the CSS sweep rotation (not used in static exports).
 */

import { cn } from '@/lib/utils'

interface LogoProps {
  size?: number
  showText?: boolean
  animated?: boolean
  className?: string
  textColor?: string
}

export function RadarIcon({ size = 32, animated = false, className }: {
  size?: number
  animated?: boolean
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background */}
      <circle cx="16" cy="16" r="16" fill="hsl(var(--primary))" />

      {/* Radar rings — white so they're visible on the teal background */}
      <circle cx="16" cy="16" r="13" stroke="white" strokeWidth="0.6" opacity="0.35" />
      <circle cx="16" cy="16" r="9"  stroke="white" strokeWidth="0.6" opacity="0.35" />
      <circle cx="16" cy="16" r="5"  stroke="white" strokeWidth="0.6" opacity="0.35" />

      {/* Crosshairs */}
      <line x1="16" y1="3"  x2="16" y2="29" stroke="white" strokeWidth="0.4" opacity="0.25" />
      <line x1="3"  y1="16" x2="29" y2="16" stroke="white" strokeWidth="0.4" opacity="0.25" />

      {/* Sweep group — white sweep on teal background */}
      <g
        transform-origin="16 16"
        className={animated ? 'radar-sweep' : undefined}
        style={animated
          ? { transformOrigin: '16px 16px', animation: 'radar-sweep 4s linear infinite' }
          : {}}
      >
        <path d="M16 16 L25.25 6.75 A13 13 0 0 0 16 3 Z" fill="white" opacity="0.18" />
        <line x1="16" y1="16" x2="25.25" y2="6.75" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
      </g>

      {/* Blips — white/light so they're visible */}
      <circle cx="22.5" cy="8.5"  r="1.6" fill="white" opacity="0.95" />
      <circle cx="10"   cy="22"   r="1.2" fill="white" opacity="0.65" />
      <circle cx="21"   cy="19.5" r="1.0" fill="white" opacity="0.50" />
      <circle cx="8.5"  cy="12"   r="0.9" fill="white" opacity="0.40" />
      <circle cx="18"   cy="13"   r="0.7" fill="#5DEEE5" opacity="0.85" />

      {/* Center */}
      <circle cx="16" cy="16" r="1.8" fill="white" opacity="0.95" />
    </svg>
  )
}

export function Logo({ size = 32, showText = true, animated = false, className, textColor }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <RadarIcon size={size} animated={animated} />
      {showText && (
        <div>
          <p className={cn('text-sm font-extrabold tracking-tight leading-none', textColor ?? 'text-sidebar-foreground')}>
            RADAR <span className="text-[hsl(var(--primary))]">IQ</span>
          </p>
          <p className="text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/40 mt-0.5">
            For Etsy Sellers
          </p>
        </div>
      )}
    </div>
  )
}
