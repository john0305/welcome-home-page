import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, Image, Tag, Clock, ChevronRight, Target, Sparkles, Zap } from 'lucide-react'
import type { StoreHealthScore } from '@/lib/healthScore'
import { subScoreColor, healthGradeColor, healthJourneyLabel } from '@/lib/healthScore'
import { usePendingFixActions } from '@/hooks/useFixActions'
import { momentumSweepDuration, type MomentumTier } from '@/lib/momentum'

interface Props {
  score: StoreHealthScore
  /** Score trend from shop_intelligence — shows ↑/→/↓ badge on the ring */
  scoreTrend?: 'improving' | 'declining' | 'stable' | null
  /** Competitive market score from shop_intelligence — shown as muted subtitle under the ring */
  marketScore?: number | null
  /** Momentum tier — controls radar sweep speed/glow. Defaults to 'steady'. */
  momentumTier?: MomentumTier
}


const SUB_ITEMS = [
  { key: 'content' as const,    label: 'Content Quality',   icon: Star,  note: 'Avg listing grade × graded ratio',     weight: '35%', dimension: 'content' as const },
  { key: 'media' as const,      label: 'Media Coverage',    icon: Image, note: '10-photo (60%) + video listings (40%)', weight: '25%', dimension: 'media' as const },
  { key: 'tags' as const,       label: 'Tag Utilization',   icon: Tag,   note: 'Avg tags used vs max 13',               weight: '20%', dimension: 'tags' as const },
  { key: 'freshness' as const,  label: 'Listing Freshness', icon: Clock, note: 'Average listing age (older = lower)',   weight: '20%', dimension: null },
]

// Grade thresholds — match healthScore.ts grade()
// Grade thresholds — match healthScore.ts grade(). Lower bands use warm amber
// instead of pure red so the visual feels like a journey stage, not a failure.
const THRESHOLDS: { grade: StoreHealthScore['grade']; min: number; color: string }[] = [
  { grade: 'F',  min: 0,  color: '#fb923c' },
  { grade: 'D',  min: 50, color: '#f97316' },
  { grade: 'C',  min: 60, color: '#f59e0b' },
  { grade: 'B',  min: 70, color: 'hsl(var(--primary))' },
  { grade: 'A',  min: 80, color: '#10b981' },
  { grade: 'A+', min: 90, color: '#059669' },
]

function nextGradeTarget(overall: number): typeof THRESHOLDS[number] | null {
  return THRESHOLDS.find(t => t.min > overall) ?? null
}

export function StoreHealthScoreCard({ score, scoreTrend, marketScore, momentumTier = 'steady' }: Props) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const { rows: fixActions } = usePendingFixActions()

  // Total pts still on the table from pending fixes (auto + guided)
  const pendingPotential = useMemo(() => {
    const total = fixActions.reduce((sum, f) => sum + (f.score_delta ?? 0), 0)
    return Math.round(total * 10) / 10
  }, [fixActions])
  const gradeC = healthGradeColor(score.grade)
  const ungradedCount = score.totalListings - score.gradedListings
  const next = nextGradeTarget(score.overall)
  const fixCountByDim = fixActions.reduce<Record<string, number>>((acc, r) => {
    acc[r.dimension] = (acc[r.dimension] ?? 0) + 1
    return acc
  }, {})

  const trackGradient = `conic-gradient(${THRESHOLDS.map((t, i) => {
    const start = t.min
    const end = THRESHOLDS[i + 1]?.min ?? 100
    return `${t.color}55 ${start}% ${end}%`
  }).join(', ')})`

  const ringSize = 128
  const uid = `health-${Math.round(score.overall)}`


  return (
    <div
      className="rounded-xl border overflow-hidden animate-fade-in shadow-warm"
      style={{
        background: 'hsl(var(--surface-1))',
        borderColor: `${gradeC}40`,
      }}
    >
      <div
        style={{
          height: 2,
          background: `linear-gradient(90deg, transparent 0%, ${gradeC} 20%, ${gradeC} 80%, transparent 100%)`,
        }}
      />

      <div className="px-5 py-4">
        {/* Strict 50/50 grid so both columns fill their space on mobile */}
        <div className="grid grid-cols-2 gap-4 items-start">
          {/* LEFT: ring + sub-point progress + market score */}
          <div className="flex flex-col items-center gap-2">
          <div className="relative" style={{ width: ringSize, height: ringSize }}>
            {/* Score trend badge — floating top-right, populated from shop_intelligence */}
            {scoreTrend && (
              <div
                className="absolute -top-2 -right-2 z-10 flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none pointer-events-none select-none"
                style={{
                  background: scoreTrend === 'improving' ? 'rgba(16,185,129,0.18)' : scoreTrend === 'declining' ? 'rgba(239,68,68,0.18)' : 'rgba(100,116,139,0.18)',
                  color: scoreTrend === 'improving' ? '#10b981' : scoreTrend === 'declining' ? '#ef4444' : '#64748b',
                  border: `1px solid ${scoreTrend === 'improving' ? 'rgba(16,185,129,0.4)' : scoreTrend === 'declining' ? 'rgba(239,68,68,0.35)' : 'rgba(100,116,139,0.3)'}`,
                }}
                aria-label={`7-day trend: ${scoreTrend}`}
              >
                {scoreTrend === 'improving' ? '↑' : scoreTrend === 'declining' ? '↓' : '→'}
              </div>
            )}
            {/* Threshold track */}
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: trackGradient }}
              aria-hidden
            />
            {/* Animated progress overlay (uses @property --p for conic tween) */}
            <div
              className={`absolute inset-0 rounded-full ${uid}-arc`}
              style={{ mixBlendMode: 'screen' }}
              aria-hidden
            />

            {/* Tick markers */}
            {THRESHOLDS.slice(1).map(t => {
              const angle = (t.min / 100) * 360 - 90
              const rad = (angle * Math.PI) / 180
              const r = ringSize / 2
              const x = r + Math.cos(rad) * r
              const y = r + Math.sin(rad) * r
              return (
                <div
                  key={t.grade}
                  className="absolute"
                  style={{
                    left: x, top: y,
                    width: 10, height: 2.5,
                    background: "hsl(var(--surface-1))",
                    transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                  }}
                  aria-hidden
                />
              )
            })}
            {/* Radar scan sweep — communicates "we're actively monitoring"
                even when the integer score hasn't moved. CSS-only, low opacity. */}
            <div
              className={`absolute inset-0 rounded-full pointer-events-none ${uid}-radar`}
              aria-hidden
            />
            {/* Center disc with score + journey label INSIDE */}
            <div
              className="absolute rounded-full flex flex-col items-center justify-center"
              style={{
                inset: 12,
                background: 'hsl(var(--background))',
                border: `1.5px solid ${gradeC}55`,
              }}
            >
              <span
                className="text-4xl font-bold leading-none"
                style={{ color: gradeC, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}
              >
                {score.overall}
              </span>
              <span
                className="text-[9px] font-semibold mt-1 px-1.5 text-center leading-tight opacity-80"
                style={{ color: gradeC }}
              >
                {healthJourneyLabel(score.overall)}
              </span>
            </div>
            <style>{`
              @property --${uid}-p {
                syntax: '<percentage>';
                inherits: false;
                initial-value: 0%;
              }
              @keyframes ${uid}-sweep {
                from { --${uid}-p: 0%; }
                to   { --${uid}-p: ${score.overall}%; }
              }
              @keyframes ${uid}-pulse {
                0%, 100% { filter: drop-shadow(0 0 3px ${gradeC}66); opacity: 0.92; }
                50%      { filter: drop-shadow(0 0 10px ${gradeC}cc); opacity: 1; }
              }
              @keyframes ${uid}-radar-spin {
                from { transform: rotate(0deg); }
                to   { transform: rotate(360deg); }
              }
              .${uid}-arc {
                --${uid}-p: ${score.overall}%;
                background: conic-gradient(${gradeC} var(--${uid}-p), transparent 0);
                animation:
                  ${uid}-sweep 1.5s cubic-bezier(0.22, 1, 0.36, 1) both,
                  ${uid}-pulse 3.2s ease-in-out 1.6s infinite;
              }
              .${uid}-radar {
                background: conic-gradient(from 0deg, transparent 0deg, transparent 320deg, ${gradeC}66 355deg, ${gradeC}aa 360deg);
                mask: radial-gradient(circle, transparent 38%, #000 40%, #000 49%, transparent 51%);
                -webkit-mask: radial-gradient(circle, transparent 38%, #000 40%, #000 49%, transparent 51%);
                opacity: ${momentumTier === 'quiet' ? 0.35 : momentumTier === 'hot' ? 0.95 : 0.65};
                animation: ${uid}-radar-spin ${momentumSweepDuration(momentumTier)} linear infinite;
                ${momentumTier === 'hot' ? `filter: drop-shadow(0 0 6px ${gradeC}cc);` : ''}
              }
              @supports not (background: conic-gradient(red var(--x, 0%), transparent 0)) {
                .${uid}-arc { background: conic-gradient(${gradeC} ${score.overall}%, transparent 0); }
              }
            `}</style>

          </div>
          {/* Sub-point progress: makes fractional gains visible. */}
          {(() => {
            const exact = score.overallExact ?? score.overall
            const floor = Math.floor(exact)
            const pct = Math.max(0, Math.min(100, (exact - floor) * 100))
            const target = Math.min(100, floor + 1)
            if (score.overall >= 100) return null
            return (
              <div style={{ width: ringSize }}>
                <div
                  className="h-1 rounded-full overflow-hidden bg-border"
                  title={`Next point: ${exact.toFixed(1)} / ${target}`}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: gradeC }}
                  />
                </div>
                <p className="text-[9px] mt-1 text-muted-foreground">
                  Next point: <span className="text-foreground/60">{exact.toFixed(1)}</span> / {target}
                </p>
              </div>
            )
          })()}
          {typeof marketScore === 'number' && (
            <p
              className="text-[10px] uppercase tracking-wider text-muted-foreground"
              title="Competitive market position from nightly intelligence scan"
            >
              Market Score <span className="font-semibold text-foreground/70">{marketScore}</span>
            </p>
          )}
          {pendingPotential > 0 && (
            <p
              className="text-[10px] text-center text-amber-600"
              title="Points available from pending fix actions"
            >
              +{pendingPotential} pts available
            </p>
          )}
          </div>{/* end left column */}

          {/* RIGHT: all text + actions — centered in its column */}
          <div className="min-w-0 flex flex-col justify-center">
            <p
              className="text-base font-semibold text-foreground"
              style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}
            >
              Store Health Score
            </p>

            {next && ungradedCount > 0 ? (
              <button
                onClick={() => navigate('/app/listings')}
                className="mt-1 flex items-center gap-2 text-left"
              >
                <Target className="h-4 w-4 shrink-0" style={{ color: next.color }} />
                <span className="text-sm text-foreground">
                  Reach a <span className="font-bold" style={{ color: next.color }}>{next.grade}</span> by grading{' '}
                  <span
                    className="font-bold text-sm px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(245,158,11,0.18)', color: '#f59e0b' }}
                  >
                    {ungradedCount} ungraded
                  </span>{' '}
                  listing{ungradedCount === 1 ? '' : 's'}
                </span>
              </button>
            ) : next ? (
              <p className="mt-1 text-sm text-muted-foreground">
                <Target className="inline h-3.5 w-3.5 mr-1" style={{ color: next.color }} />
                {next.min - score.overall} pt{next.min - score.overall === 1 ? '' : 's'} to grade <span className="font-bold" style={{ color: next.color }}>{next.grade}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm font-semibold" style={{ color: gradeC }}>
                🎉 Top tier — keep it shining.
              </p>
            )}

            <p className="mt-0.5 text-xs text-muted-foreground">
              {score.gradedListings} of {score.totalListings} listings graded
            </p>

            <button
              onClick={() => setExpanded(e => !e)}
              className="mt-1 flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ color: 'hsl(var(--primary))' }}
            >
              {expanded ? 'Hide breakdown' : 'View breakdown'}
              <ChevronRight
                className="h-3 w-3 transition-transform duration-200"
                style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
              />
            </button>

            {/* Avg listing score — informational chip, not interactive */}
            <div className="mt-3 flex items-center gap-2.5 rounded-md px-3 py-2 w-full bg-surface-2 border border-border">
              <div className="flex h-7 w-7 items-center justify-center rounded-md shrink-0 bg-primary/10">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-[9px] uppercase tracking-wide font-medium text-muted-foreground">
                  Avg listing score
                </span>
                <span
                  className="text-base font-bold text-foreground"
                  style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}
                >
                  {score.subScores.content}
                  <span className="text-[10px] font-normal ml-1 text-muted-foreground">/ 100</span>
                </span>
              </div>
            </div>

            {/* Action buttons — stack in the column */}
            <div className="mt-2 flex flex-col gap-1.5">
              {ungradedCount > 0 && (
                <button
                  onClick={() => navigate('/app/listings')}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-md border transition-all hover:bg-amber-400/10 active:scale-95"
                  style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#f59e0b' }}
                >
                  Grade {ungradedCount} listings
                </button>
              )}
              <button
                onClick={() => navigate('/app/score-roadmap')}
                className="w-full text-xs font-semibold px-3 py-2 rounded-md transition-all active:scale-95 shadow-sm text-primary-foreground"
                style={{
                  background: 'hsl(var(--primary))',
                  boxShadow: '0 2px 12px hsl(var(--primary) / 0.3)',
                }}
              >
                Improve score →
              </button>
            </div>
          </div>
        </div>

        {/* Sub-score breakdown — items with available fixes first, then info-only */}
        {expanded && (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 justify-items-center">
            {[...SUB_ITEMS]
              .sort((a, b) => {
                const aHas = a.dimension && (fixCountByDim[a.dimension] ?? 0) > 0 ? 1 : 0
                const bHas = b.dimension && (fixCountByDim[b.dimension] ?? 0) > 0 ? 1 : 0
                return bHas - aHas
              })
              .map(item => {
              const val = score.subScores[item.key]
              const c = subScoreColor(val)
              const Icon = item.icon
              const fixCount = item.dimension ? (fixCountByDim[item.dimension] ?? 0) : 0
              return (
                <div
                  key={item.key}
                  className="rounded-lg p-3 flex flex-col w-full max-w-[180px] bg-surface-2 border border-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3 w-3" style={{ color: c }} />
                      <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
                        {item.label}
                      </span>
                    </div>
                    <span className="text-[9px] text-muted-foreground/60">{item.weight}</span>
                  </div>

                  <p
                    className="text-2xl font-bold"
                    style={{ color: c, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}
                  >
                    {val}
                  </p>

                  <div className="mt-1.5 h-1 rounded-full overflow-hidden bg-border">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${val}%`, background: c }}
                    />
                  </div>

                  <p className="text-[10px] mt-1.5 leading-relaxed flex-1 text-muted-foreground">
                    {item.note}
                  </p>

                  {fixCount > 0 && item.dimension && (
                    <button
                      onClick={() => navigate(`/app/actions?dimension=${item.dimension}`)}
                      className="mt-2 flex items-center justify-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-[hsl(var(--primary))]/20 transition-colors"
                    >
                      <Zap className="h-2.5 w-2.5" />
                      Fix {fixCount} issue{fixCount === 1 ? '' : 's'} →
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
