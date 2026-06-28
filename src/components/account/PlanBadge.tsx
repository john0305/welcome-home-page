import { Crown, Sparkles, Rocket, Star, Shield, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { UserTier } from '@/types'

const TIER_META: Record<UserTier, {
  label: string
  icon: typeof Crown
  gradient: string
  ring: string
  tagline: string
}> = {
  free: {
    label: 'Free',
    icon: Sparkles,
    gradient: 'from-slate-500 to-slate-700',
    ring: 'ring-slate-400/30',
    tagline: 'Upgrade to unlock more',
  },
  starter: {
    label: 'Starter',
    icon: Zap,
    gradient: 'from-sky-500 to-cyan-500',
    ring: 'ring-sky-400/40',
    tagline: 'You\'re on your way',
  },
  pro: {
    label: 'Pro',
    icon: Rocket,
    gradient: 'from-violet-500 via-fuchsia-500 to-pink-500',
    ring: 'ring-fuchsia-400/40',
    tagline: 'Power seller mode',
  },
  agency: {
    label: 'Agency',
    icon: Crown,
    gradient: 'from-amber-400 via-orange-500 to-rose-500',
    ring: 'ring-amber-400/50',
    tagline: 'Top tier — unlimited everything',
  },
  admin: {
    label: 'Admin',
    icon: Shield,
    gradient: 'from-emerald-400 to-teal-600',
    ring: 'ring-emerald-400/40',
    tagline: 'Platform administrator',
  },
}

export function PlanBadge({
  tier,
  size = 'md',
  showUpgrade = true,
}: {
  tier: UserTier
  size?: 'sm' | 'md' | 'lg'
  showUpgrade?: boolean
}) {
  const meta = TIER_META[tier] ?? TIER_META.free
  const Icon = meta.icon

  const sizing = {
    sm: { wrap: 'px-2 py-1.5 gap-1.5', icon: 'h-3.5 w-3.5', label: 'text-[11px]', tagline: 'text-[9px]' },
    md: { wrap: 'p-3 gap-3', icon: 'h-5 w-5', label: 'text-sm', tagline: 'text-xs' },
    lg: { wrap: 'p-4 gap-4', icon: 'h-6 w-6', label: 'text-base', tagline: 'text-sm' },
  }[size]

  const compact = size === 'sm'

  return (
    <div
      className={cn(
        'relative inline-flex items-center rounded-lg bg-gradient-to-r text-white shadow-sm ring-1 overflow-hidden max-w-full',
        meta.gradient,
        meta.ring,
        sizing.wrap,
      )}
    >
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
      <div className="relative flex items-center gap-1.5 min-w-0">
        <Icon className={cn(sizing.icon, 'shrink-0 drop-shadow')} />
        <div className="leading-tight min-w-0">
          <p className={cn('font-bold uppercase tracking-wide truncate', sizing.label)}>
            {meta.label}{compact ? '' : ' Plan'}
          </p>
          {!compact && <p className={cn('opacity-90 truncate', sizing.tagline)}>{meta.tagline}</p>}
        </div>
      </div>
      {!compact && showUpgrade && (tier === 'free' || tier === 'starter') && (
        <Link
          to="/app/settings?tab=billing"
          className="relative ml-3 rounded-md bg-white/20 hover:bg-white/30 px-2.5 py-1 text-xs font-semibold backdrop-blur transition-colors"
        >
          {tier === 'free' ? 'Upgrade' : 'Go Pro'}
          <Star className="inline-block h-3 w-3 ml-1 -mt-0.5" />
        </Link>
      )}
    </div>
  )
}

