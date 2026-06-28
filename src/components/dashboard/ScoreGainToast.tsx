import { TrendingUp, TrendingDown } from 'lucide-react'
import { useScoreToast, dismissScoreChange } from '@/lib/scoreToast'

/**
 * Small, non-queueing toast that surfaces store-health score changes
 * the moment a fix is applied. Positioned bottom-right so it never
 * conflicts with the top-center AchievementToast.
 */
export function ScoreGainToast() {
  const { visible, delta, score } = useScoreToast()
  if (!visible) return null
  const positive = delta >= 0
  const Icon = positive ? TrendingUp : TrendingDown
  const accent = positive ? 'hsl(var(--primary))' : '#f59e0b'

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={dismissScoreChange}
      className="fixed z-[60] right-4 bottom-4 md:bottom-20 w-[240px] rounded-xl border px-3 py-2.5 cursor-pointer shadow-2xl animate-fade-in"
      style={{
        background: "hsl(var(--surface-1))",
        borderColor: `${accent}55`,
        boxShadow: `0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px ${accent}22`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${accent}22` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Store Score {positive ? '+' : ''}{delta} pts
          </p>
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
            Now: {score}
          </p>
        </div>
      </div>
    </div>
  )
}
