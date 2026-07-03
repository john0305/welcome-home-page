/**
 * MilestoneToast — bouncing celebration notification.
 * Appears when the user crosses a meaningful threshold (views, score, sales).
 * Persists in localStorage so it only fires once per milestone key.
 */
import { useEffect, useState } from 'react'
import { X, Trophy, TrendingUp, Eye, Star, Zap } from 'lucide-react'

export interface Milestone {
  key: string           // unique ID — stored in localStorage so it only fires once
  icon?: 'trophy' | 'views' | 'trending' | 'star' | 'zap'
  title: string
  body: string
  color?: 'teal' | 'amber' | 'violet'
}

const STORAGE_KEY = 'radariq_milestones_seen'

function getSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

function markSeen(key: string) {
  try {
    const seen = getSeen()
    seen.add(key)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]))
  } catch { /* noop */ }
}

const ICONS = {
  trophy: Trophy,
  views: Eye,
  trending: TrendingUp,
  star: Star,
  zap: Zap,
}

const COLORS = {
  teal:   { bg: 'bg-primary', text: 'text-primary-foreground', ring: 'ring-primary/30' },
  amber:  { bg: 'bg-amber-500', text: 'text-white', ring: 'ring-amber-400/30' },
  violet: { bg: 'bg-violet-600', text: 'text-white', ring: 'ring-violet-500/30' },
}

interface Props {
  milestone: Milestone | null
  onClose?: () => void
}

export function MilestoneToast({ milestone, onClose }: Props) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [current, setCurrent] = useState<Milestone | null>(null)

  useEffect(() => {
    if (!milestone) return
    const seen = getSeen()
    if (seen.has(milestone.key)) return
    // Small delay so it doesn't flash on first paint
    const t = setTimeout(() => {
      setCurrent(milestone)
      setVisible(true)
    }, 1200)
    return () => clearTimeout(t)
  }, [milestone?.key])

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => dismiss(), 8000)
    return () => clearTimeout(t)
  }, [visible])

  const dismiss = () => {
    setExiting(true)
    if (current) markSeen(current.key)
    setTimeout(() => {
      setVisible(false)
      setExiting(false)
      setCurrent(null)
      onClose?.()
    }, 350)
  }

  if (!visible || !current) return null

  const color = COLORS[current.color ?? 'teal']
  const Icon = ICONS[current.icon ?? 'trophy']

  return (
    <>
      <style>{`
        @keyframes milestone-bounce-in {
          0%   { transform: translateY(100%) scale(0.85); opacity: 0; }
          55%  { transform: translateY(-8px) scale(1.03); opacity: 1; }
          75%  { transform: translateY(4px) scale(0.99); }
          90%  { transform: translateY(-3px) scale(1.01); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes milestone-slide-out {
          0%   { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(110%); opacity: 0; }
        }
        @keyframes milestone-icon-spin {
          0%, 100% { transform: rotate(-8deg) scale(1); }
          50%       { transform: rotate(8deg) scale(1.1); }
        }
        .milestone-toast {
          animation: milestone-bounce-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .milestone-toast.exiting {
          animation: milestone-slide-out 0.35s ease-in both;
        }
        .milestone-icon-wiggle {
          animation: milestone-icon-spin 1.4s ease-in-out 0.7s 2;
        }
      `}</style>
      <div
        className={`milestone-toast fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] w-[320px] max-w-[90vw] md:left-auto md:translate-x-0 md:right-6 ${exiting ? 'exiting' : ''}`}
      >
        <div
          className={`${color.bg} ${color.text} rounded-2xl px-4 py-3.5 shadow-xl ring-4 ${color.ring} flex items-start gap-3`}
        >
          {/* Icon */}
          <div className="milestone-icon-wiggle shrink-0 mt-0.5">
            <Icon className="h-5 w-5 opacity-90" />
          </div>
          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-tight">
              {current.title}
            </p>
            <p className="text-xs mt-0.5 opacity-85 leading-snug">
              {current.body}
            </p>
          </div>
          {/* Close */}
          <button
            onClick={dismiss}
            className="shrink-0 rounded-full p-0.5 hover:bg-white/20 transition-colors mt-0.5"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * Hook that computes which milestone to show based on current store data.
 * Call this once in Dashboard and pass result to <MilestoneToast />.
 */
export function useMilestone(opts: {
  storeHealthScore?: number | null
  views30d?: number | null
  orders30d?: number | null
  optimizedCount?: number
  listingCount?: number | null
  isFirstLogin?: boolean
}): Milestone | null {
  const { storeHealthScore, views30d, orders30d, optimizedCount = 0, listingCount, isFirstLogin } = opts

  // Welcome — fires once on first login
  if (isFirstLogin) {
    return {
      key: 'welcome-first-login',
      icon: 'star',
      title: 'Welcome to Radar! 🎉',
      body: 'Your store is connected. Echo is analyzing your listings now — check back in a moment!',
      color: 'violet',
    }
  }

  // Health score milestones
  if (storeHealthScore != null && storeHealthScore >= 90) {
    return {
      key: `health-90-${Math.floor(storeHealthScore / 5) * 5}`,
      icon: 'trophy',
      title: 'You\'re crushing it!',
      body: `Shop health score: ${storeHealthScore}. You're in the top tier of Etsy sellers!`,
      color: 'teal',
    }
  }
  if (storeHealthScore != null && storeHealthScore >= 80) {
    return {
      key: 'health-80',
      icon: 'star',
      title: 'Grade A store!',
      body: 'Your health score crossed 80. You\'re outperforming most sellers in your niche!',
      color: 'teal',
    }
  }
  if (storeHealthScore != null && storeHealthScore >= 70) {
    return {
      key: 'health-70',
      icon: 'trending',
      title: 'On the rise!',
      body: 'Health score hit 70 — you\'re building real momentum. Keep going!',
      color: 'teal',
    }
  }
  if (storeHealthScore != null && storeHealthScore >= 50) {
    return {
      key: 'health-50',
      icon: 'zap',
      title: 'Halfway there!',
      body: 'Your store just crossed the 50-point mark. Every improvement from here has big impact.',
      color: 'teal',
    }
  }

  // Listing count milestones
  if (listingCount != null && listingCount >= 100) {
    return {
      key: `listings-100-${Math.floor(listingCount / 100) * 100}`,
      icon: 'star',
      title: 'Big catalog!',
      body: `${listingCount} listings connected — Radar has a lot of great data to work with!`,
      color: 'amber',
    }
  }
  if (listingCount != null && listingCount >= 50) {
    return {
      key: 'listings-50',
      icon: 'zap',
      title: 'Great catalog!',
      body: '50+ listings synced! Radar\'s pattern detection is firing on all cylinders.',
      color: 'amber',
    }
  }

  // Views milestones
  if (views30d != null && views30d >= 10000) {
    return {
      key: `views-10k-${Math.floor(views30d / 1000)}`,
      icon: 'views',
      title: 'Incredible reach!',
      body: `${views30d.toLocaleString()} shop views this month. Customers can\'t stop looking!`,
      color: 'teal',
    }
  }
  if (views30d != null && views30d >= 5000) {
    return {
      key: 'views-5k',
      icon: 'views',
      title: '5,000 views!',
      body: 'Your shop crossed 5,000 views this month. Your SEO work is paying off!',
      color: 'teal',
    }
  }
  if (views30d != null && views30d >= 1000) {
    return {
      key: 'views-1k',
      icon: 'trending',
      title: '1,000 views!',
      body: `${views30d.toLocaleString()} views this month — buyers are finding you!`,
      color: 'teal',
    }
  }
  if (views30d != null && views30d >= 100) {
    return {
      key: 'views-100',
      icon: 'trending',
      title: 'Getting noticed!',
      body: 'Over 100 views this month and climbing. Your listings are showing up!',
      color: 'teal',
    }
  }

  // Orders milestones
  if (orders30d != null && orders30d >= 50) {
    return {
      key: `orders-50-${Math.floor(orders30d / 25) * 25}`,
      icon: 'star',
      title: 'Sales machine!',
      body: `${orders30d} orders this month — your optimizations are clearly working!`,
      color: 'amber',
    }
  }
  if (orders30d != null && orders30d >= 10) {
    return {
      key: 'orders-10',
      icon: 'star',
      title: 'Sales are flowing!',
      body: '10+ orders this month. Radar loves seeing your hard work pay off!',
      color: 'amber',
    }
  }
  if (orders30d != null && orders30d >= 1) {
    return {
      key: 'orders-first',
      icon: 'trophy',
      title: 'First sale this month!',
      body: 'A sale rolled in! Every optimized listing is another chance to convert.',
      color: 'amber',
    }
  }

  // Optimization milestones
  if (optimizedCount >= 25) {
    return {
      key: `optimized-${Math.floor(optimizedCount / 25) * 25}`,
      icon: 'zap',
      title: 'Optimization beast!',
      body: `${optimizedCount} listings optimized. Your store is becoming unstoppable.`,
      color: 'violet',
    }
  }
  if (optimizedCount >= 10) {
    return {
      key: 'optimized-10',
      icon: 'zap',
      title: 'Power optimizer!',
      body: `${optimizedCount} listings optimized — Echo is seriously impressed.`,
      color: 'violet',
    }
  }
  if (optimizedCount >= 1) {
    return {
      key: 'optimized-first',
      icon: 'zap',
      title: 'First optimization!',
      body: 'You just optimized your first listing. That\'s where the magic starts!',
      color: 'violet',
    }
  }

  return null
}
