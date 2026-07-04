import { useEffect, useRef, useState } from 'react'
import { TrendingUp, X } from 'lucide-react'

const STORAGE_KEY = 'radariq_last_seen_blended'
// A "visit" only counts if the last stored value is at least this old.
// The blended score recomputes several times during a single page load as
// data trickles in — without this gap, the banner fired on plain refreshes
// claiming the score rose "since your last visit" when nothing had changed.
const MIN_VISIT_GAP_MS = 30 * 60 * 1000
const FADE_MS = 400

interface Stored { v: number; ts: number }

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Legacy format was a bare number with no timestamp — treat it as an
    // old visit so the comparison still works once, then upgrade the format.
    if (typeof parsed === 'number') return { v: parsed, ts: 0 }
    if (parsed && typeof parsed.v === 'number' && typeof parsed.ts === 'number') return parsed as Stored
    return null
  } catch { return null }
}

interface Props {
  blended: number | null
  pendingFixCount: number
}

/**
 * Compares the current blended score to the value from the user's LAST REAL
 * VISIT (stored with a timestamp; intra-pageload recomputes don't count).
 * If it climbed ≥0.5 since a visit 30+ minutes ago, shows a dismissible
 * banner that fades out gently. Auto-hides after 8s.
 */
export function ScoreClimbBanner({ blended, pendingFixCount }: Props) {
  const [delta, setDelta] = useState<number | null>(null)
  const [closing, setClosing] = useState(false)
  const [gone, setGone] = useState(false)
  // Snapshot of what was in storage when this page load began — compared
  // against once, so later writes during the same load can't fake a "visit".
  const initialRef = useRef<Stored | null | undefined>(undefined)

  useEffect(() => {
    if (blended == null) return
    if (initialRef.current === undefined) initialRef.current = readStored()
    const prev = initialRef.current
    if (prev && Number.isFinite(prev.v) && Date.now() - prev.ts >= MIN_VISIT_GAP_MS) {
      const d = blended - prev.v
      if (d >= 0.5) setDelta(Number(d.toFixed(1)))
    }
    // Always persist the latest settled value + time so the NEXT visit
    // compares against what the user is seeing right now.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: blended, ts: Date.now() } satisfies Stored)) } catch { /* ignore */ }
  }, [blended])

  useEffect(() => {
    if (delta == null) return
    const t = window.setTimeout(() => setClosing(true), 8000)
    return () => window.clearTimeout(t)
  }, [delta])

  // Gentle fade-out instead of vanishing instantly.
  useEffect(() => {
    if (!closing) return
    const t = window.setTimeout(() => setGone(true), FADE_MS)
    return () => window.clearTimeout(t)
  }, [closing])

  if (delta == null || gone || blended == null) return null

  return (
    <div
      role="status"
      className="rounded-xl border flex items-center gap-3 px-4 py-3 animate-fade-in"
      style={{
        background: 'linear-gradient(90deg, rgba(16,185,129,0.10) 0%, hsl(var(--primary) / 0.06) 100%)',
        borderColor: 'rgba(16,185,129,0.35)',
        opacity: closing ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: 'rgba(16,185,129,0.20)' }}
      >
        <TrendingUp className="h-4 w-4" style={{ color: '#10b981' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
          Your shop score climbed to {blended.toFixed(1)} — up +{delta.toFixed(1)} since your last visit
        </p>
        {pendingFixCount > 0 && (
          <p className="text-[11px] mt-0.5 text-emerald-700 dark:text-emerald-400">
            +{pendingFixCount} more fix{pendingFixCount === 1 ? '' : 'es'} pending next sync
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setClosing(true)}
        className="rounded-md p-1 hover:bg-foreground/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  )
}
