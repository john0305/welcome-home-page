/**
 * Score trend sparkline — last 30 days of avg listing grade.
 * We don't have server-side daily history, so we maintain a rolling buffer in
 * localStorage: one sample per day (latest sample for that day wins).
 * Falls back to a "Tracking…" message until we have 3+ days.
 */
import { useEffect, useMemo } from 'react'

const TEAL = 'hsl(var(--primary))'
const STORAGE_KEY = 'radariq_score_history_30d'

interface Sample { date: string; score: number }

function loadHistory(): Sample[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Sample[]) : []
  } catch { return [] }
}

function saveHistory(samples: Sample[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(samples)) } catch { /* noop */ }
}

function recordToday(score: number): Sample[] {
  const today = new Date().toISOString().slice(0, 10)
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const history = loadHistory().filter(s => s.date >= cutoff && s.date !== today)
  history.push({ date: today, score })
  history.sort((a, b) => a.date.localeCompare(b.date))
  saveHistory(history)
  return history
}

interface Props {
  currentScore: number | null
}

export function ScoreTrendMini({ currentScore }: Props) {
  // Append today's sample whenever the live score changes.
  useEffect(() => {
    if (currentScore == null) return
    recordToday(currentScore)
  }, [currentScore])

  const samples = useMemo(() => {
    if (currentScore == null) return loadHistory()
    return recordToday(currentScore)
  }, [currentScore])

  const hasData = samples.length >= 1
  const enough = samples.length >= 3

  return (
    <section className="rounded-xl border p-5" style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}>
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
          Store Health trend — last 30 days
        </h3>
        {currentScore != null && (
          <span className="text-xs font-bold" style={{ color: TEAL, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
            {currentScore}
          </span>
        )}
      </div>
      {hasData ? (
        <>
          <Sparkline samples={samples} />
          {!enough && (
            <p className="text-[11px] mt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Tracking — {samples.length} of 30 days collected.
            </p>
          )}
        </>
      ) : (
        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Tracking starts today — check back tomorrow.
        </p>
      )}
    </section>
  )
}

function Sparkline({ samples }: { samples: Sample[] }) {
  const w = 320, h = 56, pad = 4
  const TEAL_LOCAL = 'hsl(var(--primary))'
  if (samples.length === 1) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14" preserveAspectRatio="none">
        <circle cx={w / 2} cy={h / 2} r={3} fill={TEAL_LOCAL} />
      </svg>
    )
  }
  const xs = samples.map((_, i) => pad + (i / Math.max(samples.length - 1, 1)) * (w - pad * 2))
  const min = Math.min(...samples.map(s => s.score))
  const max = Math.max(...samples.map(s => s.score))
  const range = Math.max(max - min, 1)
  const ys = samples.map(s => h - pad - ((s.score - min) / range) * (h - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={TEAL_LOCAL} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {samples.length <= 5 && xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={2} fill={TEAL_LOCAL} />
      ))}
    </svg>
  )
}
