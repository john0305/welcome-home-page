/**
 * TopPriorityCard — the single most important action above the fold.
 * Pulls the highest-priority Quick Action and renders it as a full-width hero.
 * The user should never have to scroll to find out what to do next.
 */
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Zap } from 'lucide-react'
import { computeQuickActions } from './QuickActionsPanel'
import type { DashboardListingRow } from '@/types'
import type { LiveSyncStats } from '@/contexts/AppContext'

interface Props {
  rows: DashboardListingRow[]
  syncStats: LiveSyncStats
}

export function TopPriorityCard({ rows, syncStats }: Props) {
  const navigate = useNavigate()
  const actions = computeQuickActions(rows, syncStats, 1)
  const top = actions[0]
  if (!top) return null

  const Icon = top.icon

  return (
    <div
      className="rounded-xl border overflow-hidden animate-fade-in"
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.03) 100%)',
        borderColor: 'rgba(245,158,11,0.30)',
        boxShadow: '0 4px 24px rgba(245,158,11,0.08)',
      }}
    >
      {/* Amber accent bar */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, transparent 0%, #F59E0B 15%, #F59E0B 85%, transparent 100%)' }} />

      <div className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Icon + label */}
          <div className="flex items-center gap-3 sm:shrink-0">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: `${top.iconColor}20` }}
            >
              <Icon className="h-6 w-6" style={{ color: top.iconColor }} />
            </div>
            <div className="sm:hidden">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}
              >
                <Zap className="h-2.5 w-2.5" /> Top Priority
              </span>
            </div>
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="hidden sm:flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}
              >
                <Zap className="h-2.5 w-2.5" /> Top Priority
              </span>
            </div>
            <p className="text-base font-bold text-white leading-snug mb-1" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
              {top.title}
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {top.description}
            </p>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-2 sm:shrink-0">
            <button
              onClick={() => navigate(top.route)}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.99]"
              style={{ background: '#F59E0B', color: '#000' }}
            >
              {top.actionLabel}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
