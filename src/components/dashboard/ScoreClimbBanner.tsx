import { useEffect, useState } from 'react'
import { TrendingUp, X } from 'lucide-react'

const STORAGE_KEY = 'radariq_last_seen_blended'

interface Props {
  blended: number | null
  pendingFixCount: number
}

/**
 * Compares the current blended score to the last value the user saw (stored
 * in localStorage). If it climbed, shows a dismissible banner at the top of
 * the dashboard. Auto-hides after 8s.
 */
export function ScoreClimbBanner({ blended, pendingFixCount }: Props) {
  const [delta, setDelta] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (blended == null) return
    let prev: number | null = null
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) prev = Number(raw)
    } catch { /* ignore */ }
    if (prev != null && Number.isFinite(prev)) {
      const d = blended - prev
      if (d >= 0.5) setDelta(Number(d.toFixed(1)))
    }
    try { localStorage.setItem(STORAGE_KEY, String(blended)) } catch { /* ignore */ }
  }, [blended])

  useEffect(() => {
    if (delta == null) return
    const t = window.setTimeout(() => setDismissed(true), 8000)
    return () => window.clearTimeout(t)
  }, [delta])

  if (delta == null || dismissed || blended == null) return null

  return (
    <div
      role="status"
      className="rounded-xl border flex items-center gap-3 px-4 py-3 animate-fade-in"
      style={{
        background: 'linear-gradient(90deg, rgba(16,185,129,0.10) 0%, hsl(var(--primary) / 0.06) 100%)',
        borderColor: 'rgba(16,185,129,0.35)',
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: 'rgba(16,185,129,0.20)' }}
      >
        <TrendingUp className="h-4 w-4" style={{ color: '#10b981' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
          Optimization score climbed to {blended.toFixed(1)} — up +{delta.toFixed(1)} since your last visit
        </p>
        {pendingFixCount > 0 && (
          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(16,185,129,0.85)' }}>
            +{pendingFixCount} more fix{pendingFixCount === 1 ? '' : 'es'} pending next sync
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded-md p-1 hover:bg-white/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
      </button>
    </div>
  )
}
