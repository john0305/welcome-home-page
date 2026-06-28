import { useNavigate } from 'react-router-dom'
import { Image, Tag, Sparkles, Clock, ArrowRight, Zap, TrendingUp } from 'lucide-react'
import type { DashboardListingRow } from '@/types'
import type { LiveSyncStats } from '@/contexts/AppContext'

interface QuickAction {
  id: string
  title: string
  description: string
  impact: 'high' | 'medium' | 'low'
  icon: typeof Image
  iconColor: string
  bgColor: string
  actionLabel: string
  route: string
  priority: number
}

export function computeQuickActions(
  rows: DashboardListingRow[],
  syncStats: LiveSyncStats,
  limit: number = 3,
): QuickAction[] {
  const active = rows.filter(l => l.state === 'active')
  const now = Date.now()
  const candidates: QuickAction[] = []

  if (syncStats.media.missingPhotos > 0) {
    candidates.push({
      id: 'missing_photos',
      title: `${syncStats.media.missingPhotos} listing${syncStats.media.missingPhotos > 1 ? 's' : ''} have no photos`,
      description: 'Listings without images are virtually invisible on Etsy — fix these first.',
      impact: 'high', icon: Image,
      iconColor: '#f87171', bgColor: 'rgba(239,68,68,0.12)',
      actionLabel: 'Fix now', route: '/app/listings', priority: 100,
    })
  }

  const neverOptLow = active.filter(
    l => l.optimization_count === 0 && (l.current_grade ?? 100) < 60,
  )
  if (neverOptLow.length > 0) {
    candidates.push({
      id: 'unoptimized_low_grade',
      title: `${neverOptLow.length} low-grade listing${neverOptLow.length > 1 ? 's' : ''} never optimized`,
      description: 'These have the most to gain. AI rewrites typically lift grades by 30–50 pts.',
      impact: 'high', icon: Sparkles,
      iconColor: 'hsl(var(--primary))', bgColor: 'hsl(var(--primary) / 0.12)',
      actionLabel: 'Start optimizing', route: '/app/listings', priority: 90,
    })
  }

  const underTagged = active.filter(l => (l.tags?.length ?? 0) < 13)
  if (underTagged.length > 0) {
    const avgTags = (active.reduce((s, l) => s + (l.tags?.length ?? 0), 0) / Math.max(active.length, 1)).toFixed(1)
    candidates.push({
      id: 'under_tagged',
      title: `${underTagged.length} listing${underTagged.length > 1 ? 's' : ''} not using all 13 tags`,
      description: `Shop average ${avgTags}/13 tags. Each empty slot is a missed Etsy search match.`,
      impact: 'high', icon: Tag,
      iconColor: '#a78bfa', bgColor: 'rgba(139,92,246,0.12)',
      actionLabel: 'Optimize tags', route: '/app/listings', priority: 75,
    })
  }

  const underTen = syncStats.media.fewPhotos + syncStats.media.underTenPhotos
  if (underTen > 0 && syncStats.media.missingPhotos === 0) {
    candidates.push({
      id: 'under_ten_photos',
      title: `${underTen} listing${underTen > 1 ? 's' : ''} under 10 photos`,
      description: 'Etsy ranks full 10-photo listings measurably higher in search results.',
      impact: 'medium', icon: Image,
      iconColor: '#fbbf24', bgColor: 'rgba(245,158,11,0.12)',
      actionLabel: 'View listings', route: '/app/listings', priority: 70,
    })
  }

  const noVideoCount = syncStats.media.missingVideo
  if (noVideoCount > 0 && syncStats.listingCount > 0) {
    const pct = Math.round((noVideoCount / syncStats.listingCount) * 100)
    candidates.push({
      id: 'no_video',
      title: `${pct}% of listings have no video`,
      description: 'Video increases listing click-through rate and signals quality to Etsy\'s algorithm.',
      impact: 'medium', icon: Image,
      iconColor: '#60a5fa', bgColor: 'rgba(59,130,246,0.12)',
      actionLabel: 'Add videos', route: '/app/listings', priority: 55,
    })
  }

  const stale = active.filter(
    l => (now - new Date(l.etsy_created_at).getTime()) > 90 * 86400000 && l.optimization_count === 0,
  )
  if (stale.length > 0) {
    candidates.push({
      id: 'stale_listings',
      title: `${stale.length} listing${stale.length > 1 ? 's' : ''} not updated in 90+ days`,
      description: 'Etsy deprioritizes stale listings. A quick AI refresh can revive search rankings.',
      impact: 'medium', icon: Clock,
      iconColor: '#f59e0b', bgColor: 'rgba(245,158,11,0.12)',
      actionLabel: 'Refresh with AI', route: '/app/listings', priority: 50,
    })
  }

  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
}

const impactColors = {
  high:   { label: 'High impact',   color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: Zap },
  medium: { label: 'Medium impact', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: TrendingUp },
  low:    { label: 'Low impact',    color: 'hsl(var(--muted-foreground))', bg: 'rgba(100,116,139,0.12)', icon: TrendingUp },
}

interface Props {
  rows: DashboardListingRow[]
  syncStats: LiveSyncStats
  /** Skip the first N actions (used when TopPriorityCard already shows the top one). */
  skip?: number
}

export function QuickActionsPanel({ rows, syncStats, skip = 0 }: Props) {
  const navigate = useNavigate()
  const allActions = computeQuickActions(rows, syncStats, 3 + skip)
  const actions = allActions.slice(skip)

  if (actions.length === 0) return null

  return (
    <div
      className="rounded-xl border overflow-hidden animate-fade-in"
      style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))", animationDelay: '80ms' }}
    >
      <div
        style={{
          height: 2,
          background: 'linear-gradient(90deg, transparent 0%, hsl(var(--primary)) 15%, hsl(var(--primary)) 85%, transparent 100%)',
          opacity: 0.75,
        }}
      />
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
            Quick Wins
          </p>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}
          >
            {actions.length} actions
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {actions.map((action, idx) => {
            const Icon = action.icon
            const impact = impactColors[action.impact]
            const ImpactIcon = impact.icon
            return (
              <div
                key={action.id}
                onClick={() => navigate(action.route)}
                role="button"
                tabIndex={0}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate(action.route)}
                className="group cursor-pointer text-left rounded-lg p-4 border transition-all duration-300 hover:border-white/25 hover:-translate-y-0.5 hover:shadow-lg animate-fade-in flex flex-col"
                style={{
                  background: action.bgColor,
                  border: '1px solid hsl(var(--border))',
                  animationDelay: `${120 + idx * 60}ms`,
                  boxShadow: '0 0 0 transparent',
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
                    style={{ background: `${action.iconColor}22` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: action.iconColor }} />
                  </div>
                  <span
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ background: impact.bg, color: impact.color }}
                  >
                    <ImpactIcon className="h-3 w-3" />
                    {impact.label}
                  </span>
                </div>

                <p className="text-sm font-semibold text-foreground mb-1 leading-snug">{action.title}</p>
                <p className="text-xs leading-relaxed mb-4 flex-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {action.description}
                </p>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); navigate(action.route) }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold border transition-all group-hover:gap-2"
                  style={{
                    borderColor: `${action.iconColor}55`,
                    background: `${action.iconColor}15`,
                    color: action.iconColor,
                  }}
                >
                  {action.actionLabel}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
