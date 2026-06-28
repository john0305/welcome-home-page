import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ChevronRight, TrendingUp, TrendingDown, Zap, User } from 'lucide-react'
import type { DashboardListingRow } from '@/types'
import type { StoreHealthScore } from '@/lib/healthScore'
import { usePendingFixActions } from '@/hooks/useFixActions'

interface Props {
  rows: DashboardListingRow[]
  health: StoreHealthScore
  /** Confirmed delta (from store_health_history). null if not enough history yet. */
  confirmedDelta: number | null
  /** Number of fix_lifecycle 'applied' rows since the last history snapshot. */
  pendingFixCount: number
}

const TEAL = 'hsl(var(--primary))'
const EMERALD = '#10b981'
const SLATE = '#64748b'

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/**
 * Splits the single Store Health score into "Optimized" vs "Not yet optimized"
 * progress bars so the user can see which cohort is dragging the blended
 * number down. Tap header to expand and reveal counts.
 */
export function OptimizationScoreCard({ rows, health, confirmedDelta, pendingFixCount }: Props) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const { rows: fixActions } = usePendingFixActions()

  // Split pending fix_actions into what RadarIQ can auto-apply vs what requires user effort
  const { autoDelta, guidedDelta } = useMemo(() => {
    let auto = 0, guided = 0
    for (const f of fixActions) {
      if (f.score_delta == null || f.score_delta <= 0) continue
      if (f.mode === 'auto') auto += f.score_delta
      else guided += f.score_delta  // 'guided' or 'inform' — photos, videos, manual tasks
    }
    return { autoDelta: Math.round(auto * 10) / 10, guidedDelta: Math.round(guided * 10) / 10 }
  }, [fixActions])

  const currentScore = health.overallExact
  const ceiling = Math.min(100, currentScore + autoDelta + guidedDelta)

  const { optAvg, notAvg, optCount, notCount, optPotentialAvg } = useMemo(() => {
    const active = rows.filter(r => r.state === 'active')
    const opt = active.filter(r => (r.optimization_count ?? 0) > 0 && r.current_grade != null)
    const not = active.filter(r => (r.optimization_count ?? 0) === 0 && r.current_grade != null)

    // Build listing_id → total pending score_delta from fix_actions
    const deltaMap = new Map<string, number>()
    for (const f of fixActions) {
      if (f.listing_id == null || (f.score_delta ?? 0) <= 0) continue
      deltaMap.set(f.listing_id, (deltaMap.get(f.listing_id) ?? 0) + f.score_delta!)
    }

    // Estimate per-listing ceiling using fix_actions deltas + attribute gaps.
    // Even with no pending fix_actions, listings missing media or tags have real room to grow.
    function ceiling(l: typeof opt[0]): number {
      let uplift = deltaMap.get(l.id) ?? 0
      if ((l.video_count ?? 0) === 0) uplift += 8
      const photoGap = 10 - Math.min(10, l.photo_count ?? 0)
      if (photoGap > 0) uplift += Math.min(5, photoGap * 1.2)
      const tagGap = 13 - Math.min(13, l.tags?.length ?? 0)
      if (tagGap > 0) uplift += (tagGap / 13) * 5
      return Math.min(100, l.current_grade! + uplift)
    }

    const rawPotentialAvg = Math.round(avg(opt.map(ceiling)))

    return {
      optAvg: Math.round(avg(opt.map(l => l.current_grade!))),
      notAvg: Math.round(avg(not.map(l => l.current_grade!))),
      optCount: active.filter(r => (r.optimization_count ?? 0) > 0).length,
      notCount: active.filter(r => (r.optimization_count ?? 0) === 0).length,
      optPotentialAvg: rawPotentialAvg,
    }
  }, [rows, fixActions])

  const gap = optAvg - notAvg

  const deltaColor = confirmedDelta == null ? SLATE : confirmedDelta > 0 ? EMERALD : confirmedDelta < 0 ? '#f87171' : SLATE
  const DeltaIcon = confirmedDelta == null || confirmedDelta === 0 ? null : confirmedDelta > 0 ? TrendingUp : TrendingDown

  return (
    <section
      className="rounded-xl border overflow-hidden"
      style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}
    >
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start justify-between gap-3 px-5 pt-4 pb-2 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
            Optimization score
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Average grade by cohort
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Blended <span className="font-semibold text-foreground">{health.overallExact.toFixed(1)}</span>
          </span>
          <ChevronRight
            className="h-4 w-4 transition-transform"
            style={{ color: 'hsl(var(--muted-foreground))', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />
        </div>
      </button>

      <div className="px-5 pb-3 space-y-3">
        <Bar label="Optimized listings" value={optAvg} count={optCount} color={EMERALD} expanded={expanded} potential={optPotentialAvg > optAvg ? optPotentialAvg : undefined} />
        <Bar label="Not yet optimized" value={notAvg} count={notCount} color={SLATE} expanded={expanded} />

        {/* Opportunity pills — sit right under the bars so the "left on the table" value is always visible */}
        {(autoDelta > 0 || guidedDelta > 0) && (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {autoDelta > 0 && (
              <button
                onClick={() => navigate('/app/actions')}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80"
                style={{ background: 'hsl(var(--primary) / 0.12)', border: '1px solid hsl(var(--primary) / 0.3)', color: TEAL }}
              >
                <Zap className="h-3 w-3" />
                +{autoDelta} pts — 1-click fixes ready
              </button>
            )}
            {guidedDelta > 0 && (
              <button
                onClick={() => navigate('/app/actions')}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80"
                style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.28)', color: '#f59e0b' }}
              >
                <User className="h-3 w-3" />
                +{guidedDelta} pts — waiting on you
              </button>
            )}
          </div>
        )}
      </div>

      <div className="px-5 pb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        {confirmedDelta == null ? (
          <span style={{ color: 'hsl(var(--muted-foreground))' }}>Score history starting — check back after your next sync</span>
        ) : (
          <span className="flex items-center gap-1" style={{ color: deltaColor }}>
            {DeltaIcon && <DeltaIcon className="h-3 w-3" />}
            {confirmedDelta > 0 ? '+' : ''}{confirmedDelta.toFixed(1)} pts since last sync
          </span>
        )}
        {gap > 0 && notCount > 0 && (
          <span style={{ color: 'hsl(var(--muted-foreground))' }}>
            <span className="font-semibold text-foreground">{gap}-pt gap</span> once optimized
          </span>
        )}
        {pendingFixCount > 0 && (
          <span className="flex items-center gap-1" style={{ color: 'rgba(16,185,129,0.7)' }}>
            <Sparkles className="h-3 w-3" />
            +{pendingFixCount} fix{pendingFixCount === 1 ? '' : 'es'} pending next sync
          </span>
        )}
      </div>

      {expanded && (
        <div
          className="px-5 py-3 grid grid-cols-2 gap-3 border-t text-[11px]"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          <SubScore label="Content quality" value={health.subScores.content} />
          <SubScore label="Media coverage" value={health.subScores.media} />
          <SubScore label="Tag utilization" value={health.subScores.tags} />
          {!health.freshnessExempt && (
            <SubScore label="Listing freshness" value={health.subScores.freshness} />
          )}
          <button
            type="button"
            onClick={() => navigate('/app/score-roadmap')}
            className="col-span-2 mt-1 text-[11px] font-semibold py-2 rounded-md border transition-colors hover:bg-primary/10"
            style={{ borderColor: 'hsl(var(--primary) / 0.4)', color: TEAL }}
          >
            Improve score →
          </button>
        </div>
      )}
    </section>
  )
}

function Bar({ label, value, count, color, expanded, potential }: { label: string; value: number; count: number; color: string; expanded: boolean; potential?: number }) {
  // Animate fill from 0 → value on mount and whenever value changes. Brief
  // (~700ms via the existing transition class) and guarded so unrelated
  // re-renders don't restart the animation.
  const [displayValue, setDisplayValue] = useState(0)
  const prevValueRef = useRef<number | null>(null)
  useEffect(() => {
    if (prevValueRef.current === value) return
    prevValueRef.current = value
    setDisplayValue(0)
    const id = window.requestAnimationFrame(() => setDisplayValue(value))
    return () => window.cancelAnimationFrame(id)
  }, [value])

  const showPotential = potential != null && potential > value && count > 0

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px]" style={{ color: 'hsl(var(--foreground))' }}>
          {label}
          {expanded && count > 0 && (
            <span className="ml-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>· {count}</span>
          )}
        </span>
        <span className="text-sm font-bold tabular-nums" style={{ color, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
          {count === 0 ? '—' : value}
          {showPotential && (
            <span className="text-[11px] font-normal ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>→ {potential}</span>
          )}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden relative"
        style={{ background: 'hsl(var(--surface-2))' }}
      >
        {showPotential && (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${Math.max(2, potential!)}%`, background: `${color}33` }}
          />
        )}
        <div
          className="absolute inset-y-0 left-0 rounded-full motion-reduce:transition-none"
          style={{
            width: `${count === 0 ? 0 : Math.max(2, displayValue)}%`,
            background: color,
            transition: 'width 700ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        />
      </div>
    </div>
  )
}

function SubScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</span>
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  )
}
