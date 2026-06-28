/**
 * Momentum Gauge — secondary, activity-only indicator.
 *
 * Reads `shopSnapshotHistory` from AppContext and renders a compact semicircular
 * gauge with a tier label. Tapping opens a small modal with view/favorite
 * sparklines + 3-day vs 7-day averages.
 *
 * Important: this gauge does NOT alter the Store Health Score, grade, or any
 * scoring math. It's pure visualization.
 */
import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useApp } from '@/contexts/AppContext'
import {
  computeMomentum, momentumColor, momentumContextForScore,
} from '@/lib/momentum'


function Sparkline({ data, color }: { data: { date: string; value: number }[]; color: string }) {
  if (data.length < 2) {
    return <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>Not enough data yet.</p>
  }
  const w = 220, h = 36, pad = 2
  const max = Math.max(...data.map(d => d.value), 1)
  const step = (w - pad * 2) / Math.max(data.length - 1, 1)
  const pts = data.map((d, i) => {
    const x = pad + i * step
    const y = h - pad - (d.value / max) * (h - pad * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} className="block">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((d, i) => {
        const x = pad + i * step
        const y = h - pad - (d.value / max) * (h - pad * 2)
        return <circle key={i} cx={x} cy={y} r="1.6" fill={color} />
      })}
    </svg>
  )
}

export function MomentumGauge() {
  const { shopSnapshotHistory } = useApp()
  const [open, setOpen] = useState(false)

  const momentum = useMemo(() => computeMomentum(shopSnapshotHistory), [shopSnapshotHistory])
  const color = momentumColor(momentum.tier)
  const ctx = momentum.insufficient
    ? 'Building momentum data — check back in a few days'
    : momentumContextForScore(momentum.score, momentum.lowVolume)


  // Semicircular gauge geometry
  const W = 160, H = 86
  const cx = W / 2, cy = H - 6, r = 64
  // Needle angle: 0 score → -180° (left), 100 → 0° (right). We render in SVG
  // so 180° points left and 0° points right when measured from +x axis.
  const needleAngle = 180 - (momentum.score / 100) * 180
  const rad = (needleAngle * Math.PI) / 180
  const needleX = cx + Math.cos(rad) * (r - 6)
  const needleY = cy - Math.sin(rad) * (r - 6)

  // One fixed top-half arc. Momentum position is shown by the needle only,
  // not by drawing a second/progress arc.
  const trackPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border p-4 text-left transition-colors hover:bg-white/[0.03] w-full"
        style={{
          background: 'hsl(var(--surface-2))',
          borderColor: 'hsl(var(--border))',
        }}
        title="Tap for momentum breakdown"
      >
        <div className="flex items-start gap-4">
          <div className="relative shrink-0" style={{ width: W, height: H }}>
            <svg width={W} height={H} className="block overflow-visible">
              <defs>
                <linearGradient id="momentum-fill" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#475569" />
                  <stop offset="40%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
              </defs>
              {/* gauge arc */}
              <path d={trackPath} fill="none" stroke="url(#momentum-fill)" strokeWidth="6" strokeLinecap="round" />
              {/* center reference tick — "steady, no change vs last week" */}
              {(() => {
                const ar = (90 * Math.PI) / 180
                const x1 = cx + Math.cos(ar) * (r - 14)
                const y1 = cy - Math.sin(ar) * (r - 14)
                const x2 = cx + Math.cos(ar) * (r + 4)
                const y2 = cy - Math.sin(ar) * (r + 4)
                return (
                  <>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" />
                    <text x={cx} y={cy - r - 8} textAnchor="middle" fontSize="8"
                      fill="hsl(var(--muted-foreground))" style={{ letterSpacing: '0.05em' }}>
                      STEADY
                    </text>
                  </>
                )
              })()}
              {/* needle */}
              <line
                x1={cx} y1={cy} x2={needleX} y2={needleY}
                stroke={color} strokeWidth="2" strokeLinecap="round"
                style={{ transition: 'all 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}
              />
              <circle cx={cx} cy={cy} r="4" fill={color} />
            </svg>


          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Momentum
            </p>
            <p className="text-[13px] mt-1 leading-snug" style={{ color: 'hsl(var(--foreground))' }}>
              {ctx}
            </p>
            {!momentum.insufficient && (
              <p className="text-[10px] mt-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Tap for breakdown
              </p>
            )}
          </div>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-surface-1 border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Momentum — last 7 days</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2"
              style={{ background: 'hsl(var(--surface-2))', borderColor: 'hsl(var(--border))' }}>
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Trend</p>
                <p className="text-sm" style={{ color }}>{ctx}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>3-day vs 7-day avg</p>
                <p className="text-sm text-foreground">
                  {Math.round(momentum.threeDayAvg)} <span style={{ color: 'hsl(var(--muted-foreground))' }}>·</span>{' '}
                  {Math.round(momentum.sevenDayAvg)}
                </p>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Views (daily delta)
              </p>
              <Sparkline data={momentum.viewsSeries} color="hsl(var(--primary))" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Favorites (daily delta)
              </p>
              <Sparkline data={momentum.favsSeries} color="#f472b6" />
            </div>
            <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Momentum reflects short-term shop activity and decays naturally as days roll out of the
              window. It does not affect your Store Health Score.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
