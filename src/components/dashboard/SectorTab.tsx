import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ShoppingBag, type LucideIcon } from 'lucide-react'
import type { DashboardListingRow } from '@/types'
import { GradeBadge } from '@/components/listings/GradeBadge'
import { subScoreColor } from '@/lib/healthScore'

export interface SectorTabProps {
  /** Sector name shown above the sub-score */
  label: string
  /** Sub-score 0-100 driving the headline color */
  subScore: number
  icon: LucideIcon
  /** One-line plain-language status under the sub-score */
  status: string
  /** Listings to surface, already filtered & sorted by the caller */
  listings: DashboardListingRow[]
  /** Short label for the per-listing metric column ("photos", "tags", "days old") */
  metricLabel: string
  /** How to render the metric for each listing */
  getMetric: (l: DashboardListingRow) => string | number
  /** CTA shown in the header right side */
  cta?: { label: string; onClick: () => void }
  /** Message when listings.length === 0 (default: celebratory check) */
  emptyMessage?: string
}

/**
 * Shared shell for the Content / Media / Tags / Freshness tabs. Keeps a
 * consistent visual rhythm and ensures each tab pulls its data from the same
 * place the badge counts come from.
 */
export function SectorTab({
  label, subScore, icon: Icon, status, listings, metricLabel, getMetric, cta, emptyMessage,
}: SectorTabProps) {
  const navigate = useNavigate()
  const c = subScoreColor(subScore)
  const visible = useMemo(() => listings.slice(0, 12), [listings])

  return (
    <div className="space-y-5">
      {/* Headline sub-score */}
      <div
        className="rounded-xl border p-5 flex flex-wrap items-center justify-between gap-4"
        style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full border-2"
            style={{ borderColor: c, background: `${c}1a` }}
          >
            <span className="text-xl font-bold leading-none" style={{ color: c, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
              {subScore}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Icon className="h-4 w-4" style={{ color: c }} />
              <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                {label}
              </p>
            </div>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{status}</p>
          </div>
        </div>
        {cta && (
          <button
            onClick={cta.onClick}
            className="text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors hover:bg-white/5 flex items-center gap-1.5"
            style={{ borderColor: `${c}66`, color: c }}
          >
            {cta.label} <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Filtered listings */}
      {visible.length === 0 ? (
        <div
          className="rounded-xl border p-8 text-center"
          style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}
        >
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {emptyMessage ?? '🎉 Nothing needs your attention in this sector.'}
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}
        >
          {visible.map((l, idx) => (
            <button
              key={l.id}
              onClick={() => navigate(`/app/listings/${l.id}`)}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/5"
              style={{ borderTop: idx === 0 ? 'none' : '1px solid hsl(var(--border))' }}
            >
              <div className="h-10 w-10 shrink-0 rounded overflow-hidden bg-surface-2">
                {l.thumbnail_url ? (
                  <img
                    src={l.thumbnail_url}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <ShoppingBag className="h-4 w-4 m-3 text-slate-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">{l.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {getMetric(l)} {metricLabel}
                </p>
              </div>
              <GradeBadge score={l.current_grade ?? 0} size="sm" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
