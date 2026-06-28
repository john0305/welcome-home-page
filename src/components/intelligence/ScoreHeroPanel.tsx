import { healthGradeColor, healthJourneyLabel, type StoreHealthScore } from '@/lib/healthScore'

interface HistoryRow {
  score_overall: number
  score_exact: number
  recorded_at: string
}

interface Props {
  health: StoreHealthScore
  confirmedDelta: number | null
  historyRows: HistoryRow[]
}

const C = 2 * Math.PI * 60  // circumference for r=60

export function ScoreHeroPanel({ health, confirmedDelta, historyRows }: Props) {
  const score = health.overallExact
  const gradeColor = healthGradeColor(health.grade)
  const offset = C - (score / 100) * C

  const deltaColor = confirmedDelta == null ? 'hsl(var(--muted-foreground))'
    : confirmedDelta > 0 ? '#10b981' : '#f97316'
  const deltaLabel = confirmedDelta == null ? '—'
    : confirmedDelta > 0 ? `+${confirmedDelta.toFixed(1)} pts`
    : `${confirmedDelta.toFixed(1)} pts`

  const samples = [...historyRows]
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    .map(r => ({ score: r.score_overall }))

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-surface-2 via-surface-1 to-background p-5">
      <div className="flex items-center gap-5">
        {/* Score ring */}
        <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
          <svg width={140} height={140} viewBox="0 0 140 140">
            <circle cx={70} cy={70} r={60} fill="none" stroke="hsl(var(--border))" strokeWidth={10} strokeLinecap="round" />
            <circle
              cx={70} cy={70} r={60}
              fill="none"
              stroke={gradeColor}
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              transform="rotate(-90 70 70)"
              style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.25,0.46,0.45,0.94), stroke 0.4s' }}
            />
            <circle
              cx={70} cy={70} r={60}
              fill="none"
              stroke={gradeColor}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              transform="rotate(-90 70 70)"
              style={{
                transition: 'stroke-dashoffset 1s cubic-bezier(0.25,0.46,0.45,0.94)',
                filter: `drop-shadow(0 0 6px ${gradeColor}88)`,
                opacity: 0.5,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold leading-none text-foreground">{health.overall}</span>
            <span
              className="text-xs font-bold mt-1 px-2 py-0.5 rounded-full"
              style={{ background: `${gradeColor}20`, color: gradeColor }}
            >
              {health.grade}
            </span>
          </div>
        </div>

        {/* Right: label + delta + sparkline */}
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-foreground">Store Health Score</p>
          <p className="text-sm mt-0.5 text-muted-foreground">{healthJourneyLabel(health.overall)}</p>

          <div className="flex items-center gap-1.5 mt-3">
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full border"
              style={{ color: deltaColor, borderColor: `${deltaColor}40`, background: `${deltaColor}12` }}
            >
              {deltaLabel}
            </span>
            <span className="text-[11px] text-muted-foreground/60">since last check</span>
          </div>

          <p className="text-[11px] mt-2 text-muted-foreground/60">
            {health.gradedListings} of {health.totalListings} listing{health.totalListings !== 1 ? 's' : ''} graded
          </p>

          <div className="mt-3">
            <ScoreSparkline samples={samples} color={gradeColor} />
            {samples.length < 10 && (
              <p className="text-[10px] mt-1 text-muted-foreground/40">
                {samples.length} snapshot{samples.length !== 1 ? 's' : ''} collected
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ScoreSparkline({ samples, color }: { samples: { score: number }[]; color: string }) {
  if (samples.length === 0) return null

  const w = 200, h = 40, pad = 3

  if (samples.length === 1) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 40 }} preserveAspectRatio="none">
        <circle cx={w / 2} cy={h / 2} r={3} fill={color} />
      </svg>
    )
  }

  const scores = samples.map(s => s.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const range = Math.max(max - min, 1)
  const xs = scores.map((_, i) => pad + (i / (scores.length - 1)) * (w - pad * 2))
  const ys = scores.map(s => h - pad - ((s - min) / range) * (h - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  const area = `${d} L${xs[xs.length - 1].toFixed(1)} ${h} L${xs[0].toFixed(1)} ${h} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 40 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2.5} fill={color} />
    </svg>
  )
}
