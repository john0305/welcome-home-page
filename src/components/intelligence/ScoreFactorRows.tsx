import { useNavigate } from 'react-router-dom'
import { Star, Camera, Tag, Clock, ChevronRight } from 'lucide-react'
import { subScoreColor, type StoreHealthScore } from '@/lib/healthScore'
import type { DashboardListingRow } from '@/types'
import type { LiveSyncStats } from '@/contexts/AppContext'

interface Props {
  health: StoreHealthScore
  rows: DashboardListingRow[]
  syncStats: LiveSyncStats
}

// Honest but encouraging (Section 7a): the lower bands name the trajectory,
// not a verdict — a seller at 40 should feel "next step", not "report card".
function ratingLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 65) return 'Good'
  if (score >= 45) return 'Getting there'
  return 'Big upside here'
}

function FactorRing({ score }: { score: number }) {
  const r = 20
  const c = 2 * Math.PI * r
  const color = subScoreColor(score)
  const offset = c - (score / 100) * c
  return (
    <svg width={48} height={48} viewBox="0 0 48 48" className="shrink-0">
      <circle cx={24} cy={24} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={5} />
      <circle
        cx={24} cy={24} r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 24 24)"
        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.25,0.46,0.45,0.94)' }}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="11" fontWeight="700" fill={color} fontFamily="Bricolage Grotesque, system-ui, sans-serif">
        {score}
      </text>
    </svg>
  )
}

interface FactorRowProps {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  score: number
  weight: number
  explanation: string
  dim: string
  disabled?: boolean
}

function FactorRow({ icon: Icon, label, score, weight, explanation, dim, disabled }: FactorRowProps) {
  const navigate = useNavigate()
  const color = subScoreColor(score)
  const rating = ratingLabel(score)

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && navigate(`/app/score-roadmap?dimension=${dim}`)}
      className="w-full flex items-center gap-4 rounded-xl border border-border bg-surface-1 px-4 py-3.5 text-left transition-all hover:border-primary/30 hover:bg-surface-2 disabled:opacity-45 disabled:cursor-default"
    >
      <div
        className="flex items-center justify-center rounded-full shrink-0"
        style={{ width: 36, height: 36, background: `${color}18` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{label}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}18`, color }}>
            {rating}
          </span>
          <span className="text-[10px] text-muted-foreground/60">{weight}% of score</span>
        </div>
        <p className="text-[11px] mt-0.5 leading-relaxed text-muted-foreground">{explanation}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <FactorRing score={score} />
        {!disabled && <ChevronRight className="h-4 w-4 text-muted-foreground/30" />}
      </div>
    </button>
  )
}

export function ScoreFactorRows({ health, rows, syncStats }: Props) {
  const active = rows.filter(r => r.state === 'active')

  const W = health.freshnessExempt
    ? { content: 42, media: 30, tags: 28, freshness: 0 }
    : { content: 35, media: 25, tags: 20, freshness: 20 }

  const neverOpt = active.filter(r => (r.optimization_count ?? 0) === 0).length
  const contentExplanation = neverOpt === 0
    ? 'All active listings have been graded and optimized'
    : `${neverOpt} listing${neverOpt === 1 ? '' : 's'} never optimized — each one drags the score down`

  const underTen = syncStats.media.missingPhotos + syncStats.media.fewPhotos + syncStats.media.underTenPhotos
  const noVideo = syncStats.media.missingVideo
  const mediaParts: string[] = []
  if (underTen > 0) mediaParts.push(`${underTen} listing${underTen === 1 ? '' : 's'} under 10 photos`)
  if (noVideo > 0) mediaParts.push(`${noVideo} missing video`)
  const mediaExplanation = mediaParts.length === 0
    ? 'All listings have full photo and video coverage'
    : mediaParts.join(', ')

  const avgTags = active.length > 0
    ? active.reduce((s, r) => s + (r.tags?.length ?? 0), 0) / active.length
    : 0
  const tagsExplanation = `Avg ${avgTags.toFixed(1)} / 13 tags per listing`

  const now = Date.now()
  const staleCount = active.filter(r =>
    (now - new Date(r.etsy_created_at).getTime()) / 86400000 >= 180
  ).length
  const avgAgeDays = active.length > 0
    ? active.reduce((s, r) => s + (now - new Date(r.etsy_created_at).getTime()) / 86400000, 0) / active.length
    : 0
  const freshnessExplanation = health.freshnessExempt
    ? 'Not applicable — digital and supplies shops aren\'t penalized for listing age'
    : staleCount > 0
    ? `${staleCount} listing${staleCount === 1 ? '' : 's'} older than 180 days — renewing helps freshness`
    : `Avg age ${Math.round(avgAgeDays)} days — listings are relatively fresh`

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-surface-1">
        <h3 className="text-sm font-semibold text-foreground">What's affecting your score</h3>
        <p className="text-[11px] mt-0.5 text-muted-foreground/60">Tap a factor to see affected listings and fix them</p>
      </div>

      <div className="divide-y divide-border bg-background">
        <FactorRow icon={Star}   label="Content Quality"  score={health.subScores.content}   weight={W.content}   explanation={contentExplanation}   dim="content" />
        <FactorRow icon={Camera} label="Media Coverage"   score={health.subScores.media}     weight={W.media}     explanation={mediaExplanation}     dim="media" />
        <FactorRow icon={Tag}    label="Tag Utilization"  score={health.subScores.tags}      weight={W.tags}      explanation={tagsExplanation}      dim="tags" />
        <FactorRow icon={Clock}  label="Listing Freshness" score={health.subScores.freshness} weight={W.freshness} explanation={freshnessExplanation} dim="freshness" disabled={health.freshnessExempt} />
      </div>
    </div>
  )
}
