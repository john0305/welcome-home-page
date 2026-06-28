import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Star, Image as ImageIcon, Tag as TagIcon, Clock, ArrowRight, Sparkles, Target, Check, ChevronDown, ChevronUp, ShoppingBag, ShieldCheck, RefreshCw, Camera, Video, AlertTriangle, X
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { useApp } from '@/contexts/AppContext'
import { computeStoreHealthScore, healthGradeColor, subScoreColor } from '@/lib/healthScore'
import { detectShopType } from '@/lib/shopType'
import { usePendingFixActions, groupActionsByListing } from '@/hooks/useFixActions'
import { FixActionCard } from '@/components/actions/FixActionCard'
import { Badge } from '@/components/ui/badge'
import type { DashboardListingRow } from '@/types'

// ─── Bucket filter system ────────────────────────────────────────────────────
type Bucket = {
  id: string
  label: string
  sublabel?: string
  count: number
  // Either an in-place filter (returns true if listing matches) or an external route.
  match?: (row: DashboardListingRow) => boolean
  route?: string
}

function buildBuckets(
  tab: 'content' | 'media' | 'tags' | 'freshness',
  rows: DashboardListingRow[],
): Bucket[] {
  const active = rows.filter(r => r.state === 'active')
  const total = active.length
  if (tab === 'media') {
    const b04  = active.filter(r => (r.photo_count ?? 0) < 5).length
    const b59  = active.filter(r => (r.photo_count ?? 0) >= 5 && (r.photo_count ?? 0) < 10).length
    const b10  = active.filter(r => (r.photo_count ?? 0) >= 10).length
    return [
      { id: 'photos_0_4', label: '0–4 photos',   sublabel: 'biggest exploration boost',     count: b04, match: r => (r.photo_count ?? 0) < 5 },
      { id: 'photos_5_9', label: '5–9 photos',   sublabel: 'add the rest to fill all 10',   count: b59, match: r => (r.photo_count ?? 0) >= 5 && (r.photo_count ?? 0) < 10 },
      { id: 'photos_10',  label: '10 photos',    sublabel: 'using every slot',              count: b10, match: r => (r.photo_count ?? 0) >= 10 },
      { id: 'no_video',   label: 'No video',     sublabel: 'add a short clip on Etsy',      count: active.filter(r => (r.video_count ?? 0) === 0).length, match: r => (r.video_count ?? 0) === 0 },
    ]
  }
  if (tab === 'tags') {
    const b0    = active.filter(r => (r.tags?.length ?? 0) === 0).length
    const b1_5  = active.filter(r => (r.tags?.length ?? 0) >= 1 && (r.tags?.length ?? 0) <= 5).length
    const b6_12 = active.filter(r => (r.tags?.length ?? 0) >= 6 && (r.tags?.length ?? 0) <= 12).length
    const b13   = active.filter(r => (r.tags?.length ?? 0) >= 13).length
    return [
      { id: 'tags_0',    label: '0 tags',         sublabel: 'no tag coverage',          count: b0,    match: r => (r.tags?.length ?? 0) === 0 },
      { id: 'tags_1_5',  label: '1–5 tags',       sublabel: 'under-tagged',             count: b1_5,  match: r => (r.tags?.length ?? 0) >= 1 && (r.tags?.length ?? 0) <= 5 },
      { id: 'tags_6_12', label: '6–12 tags',      sublabel: 'almost there',             count: b6_12, match: r => (r.tags?.length ?? 0) >= 6 && (r.tags?.length ?? 0) <= 12 },
      { id: 'tags_13',   label: '13 tags (full)', sublabel: 'using every slot',         count: b13,   match: r => (r.tags?.length ?? 0) >= 13 },
    ]
  }
  if (tab === 'content') {
    const never = active.filter(r => (r.optimization_count ?? 0) === 0).length
    const some  = active.filter(r => (r.optimization_count ?? 0) > 0).length
    return [
      { id: 'never_opt', label: 'Never optimized',     sublabel: 'no rewrites yet',          count: never, match: r => (r.optimization_count ?? 0) === 0 },
      { id: 'some_opt',  label: 'Previously optimized',sublabel: 'reviewed at least once',   count: some,  match: r => (r.optimization_count ?? 0) > 0 },
    ]
  }
  // freshness
  const now = Date.now()
  const ageDays = (r: DashboardListingRow) => {
    const ref = r.etsy_created_at
    if (!ref) return 0
    return (now - new Date(ref).getTime()) / 86400000
  }
  const stale = active.filter(r => ageDays(r) >= 180).length
  const mid   = active.filter(r => { const d = ageDays(r); return d >= 90 && d < 180 }).length
  const fresh = active.filter(r => ageDays(r) < 90).length
  return [
    { id: 'age_180',  label: '180+ days', sublabel: 'oldest — renew first', count: stale, match: r => ageDays(r) >= 180 },
    { id: 'age_90',   label: '90–180 days', sublabel: 'aging',              count: mid,   match: r => { const d = ageDays(r); return d >= 90 && d < 180 } },
    { id: 'age_fresh',label: '<90 days',  sublabel: 'fresh',                count: fresh, match: r => ageDays(r) < 90 },
  ]
}

function BucketStrip({
  buckets, activeId, onSelect, color,
}: { buckets: Bucket[]; activeId: string | null; onSelect: (b: Bucket) => void; color: string }) {
  if (buckets.length === 0) return null
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 pt-1 px-1 scrollbar-none">
      {buckets.map(b => {
        const isActive = activeId === b.id
        return (
          <button
            key={b.id}
            type="button"
            onClick={(e) => {
              const el = e.currentTarget
              el.classList.remove('riq-pulse')
              void el.offsetWidth
              el.classList.add('riq-pulse')
              window.setTimeout(() => el.classList.remove('riq-pulse'), 380)
              onSelect(b)
            }}
            aria-pressed={isActive}
            className="group shrink-0 min-w-[128px] rounded-xl border px-3 py-2.5 text-left transition-all select-none active:scale-[0.97] active:translate-y-px"
            style={{
              background: isActive ? `${color}1A` : undefined,
              borderColor: isActive ? color : undefined,
              boxShadow: isActive
                ? `inset 0 1px 0 0 ${color}66, 0 0 0 1px ${color}55, 0 6px 14px -8px ${color}88`
                : undefined,
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-foreground">{b.label}</span>
              <span
                className="text-[11px] font-bold tabular-nums"
                style={{ color: isActive ? color : undefined }}
              >
                {b.count}
              </span>
            </div>
            {b.sublabel && (
              <p className="mt-0.5 text-[10px] text-muted-foreground/60 leading-tight">{b.sublabel}</p>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Grade thresholds ─────────────────────────────────────────────────────────
type Grade = 'F' | 'D' | 'C' | 'B' | 'A' | 'A+'
const GRADE_THRESHOLDS: { min: number; grade: Grade }[] = [
  { min: 90, grade: 'A+' },
  { min: 80, grade: 'A' },
  { min: 70, grade: 'B' },
  { min: 60, grade: 'C' },
  { min: 50, grade: 'D' },
  { min: 0,  grade: 'F' },
]

function gradeForScore(score: number): Grade {
  return GRADE_THRESHOLDS.find(t => score >= t.min)!.grade
}

function nextGradeThreshold(score: number): { grade: Grade; min: number } | null {
  const above = [...GRADE_THRESHOLDS].reverse().find(t => t.min > score)
  return above ? { grade: above.grade, min: above.min } : null
}

// ─── Animated number ──────────────────────────────────────────────────────────
function useAnimatedNumber(target: number, durationMs = 400) {
  const [value, setValue] = useState(target)
  useEffect(() => {
    const start = value
    const delta = target - start
    if (delta === 0) return
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(start + delta * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return value
}

// ─── Circular gauge ───────────────────────────────────────────────────────────
function ScoreGauge({
  score, label, sublabel, hideGrade = false,
}: { score: number; label: string; sublabel?: string; hideGrade?: boolean }) {
  const animated = useAnimatedNumber(score)
  const grade = gradeForScore(animated)
  const color = healthGradeColor(grade)
  const r = 56
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.max(0, Math.min(100, animated)) / 100)

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {label}
      </p>
      <div className="relative">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
          <circle
            cx="70" cy="70" r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform="rotate(-90 70 70)"
            style={{ transition: 'stroke-dashoffset 400ms ease, stroke 400ms ease', filter: `drop-shadow(0 0 8px ${color}55)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold leading-none" style={{ color }}>
            {animated}
          </span>
          {!hideGrade && (
            <span className="text-xs font-bold uppercase tracking-wide mt-1" style={{ color }}>
              {grade}
            </span>
          )}
        </div>
      </div>
      {sublabel && <p className="text-xs text-center max-w-[200px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{sublabel}</p>}
    </div>
  )
}

// ─── Smaller Sub-Score circular gauge ─────────────────────────────────────────
function SubScoreGauge({ score, color }: { score: number; color: string }) {
  const animated = useAnimatedNumber(score)
  const r = 24
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.max(0, Math.min(100, animated)) / 100)

  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 28 28)"
          style={{ transition: 'stroke-dashoffset 400ms ease, stroke 400ms ease', filter: `drop-shadow(0 0 4px ${color}44)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-foreground">
          {animated}
        </span>
      </div>
    </div>
  )
}

// ─── Lean Listing Card (used when no automated action exists for a listing) ──
function LeanListingCard({
  row,
  onOpen,
  hint,
  etsyUrl,
}: {
  row: DashboardListingRow
  onOpen: () => void
  hint?: string
  etsyUrl?: string | null
}) {
  const triggerPulse = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget as HTMLElement
    el.classList.remove('riq-pulse')
    // force reflow so the animation re-runs on subsequent clicks
    void el.offsetWidth
    el.classList.add('riq-pulse')
    window.setTimeout(() => el.classList.remove('riq-pulse'), 380)
  }
  return (
    <div className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.06] hover:border-white/15 transition-all overflow-hidden flex items-center gap-3 p-4">
      <button
        type="button"
        onClick={(e) => { triggerPulse(e); onOpen() }}
        className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-lg"
      >
        <div className="h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-surface-2/40 border border-border/20 flex items-center justify-center">
          {row.thumbnail_url ? (
            <img src={row.thumbnail_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ShoppingBag className="h-5 w-5 text-muted-foreground/30" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{row.title}</p>
          {hint && (
            <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>
          )}
        </div>
      </button>
      {etsyUrl ? (
        <a
          href={etsyUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => { e.stopPropagation(); triggerPulse(e) }}
          className="shrink-0 inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold px-2.5 py-1.5 transition-all active:scale-95"
        >
          Etsy
          <ArrowRight className="h-3 w-3" />
        </a>
      ) : (
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
    </div>
  )
}

// ─── Grouped Listing Card component ──────────────────────────────────────────
function GroupedListingCard({
  listing,
  onRefresh,
  priorityTier,
}: {
  listing: ReturnType<typeof groupActionsByListing>[number]
  onRefresh: () => void
  priorityTier: 'high' | null
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl border border-border/20 bg-surface-1/60 hover:bg-surface-1 transition-all overflow-hidden">
      {/* Listing Header */}
      <div 
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
      >
        <div className="h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-surface-2/40 border border-border/20 flex items-center justify-center">
          {listing.thumbnail_url ? (
            <img src={listing.thumbnail_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ShoppingBag className="h-5 w-5 text-muted-foreground/30" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{listing.title}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-[11px] text-muted-foreground/60">
              {listing.actions.length} optimization{listing.actions.length === 1 ? '' : 's'} available
            </span>
            {priorityTier === 'high' && (
              <>
                <span className="text-xs text-muted-foreground/40">·</span>
                <Badge className="bg-amber-500/15 text-amber-400 border-transparent text-[9px] uppercase px-1.5 py-0 h-4">
                  High Priority
                </Badge>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3.5 shrink-0">
          {listing.total_score_delta > 0 && (
            <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25">
              +{listing.total_score_delta} pts
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded Actions List */}
      {expanded && (
        <div className="border-t border-border/20 bg-black/15 p-4 space-y-3">
          {listing.actions.map(action => (
            <FixActionCard 
              key={action.id} 
              row={action} 
              compact={true} 
              onChange={() => onRefresh()} 
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Default Informational Actions (Roadmap suggestions fallback) ─────────────
const DEFAULT_ACTIONS = {
  content: [
    { id: 'c1', label: 'Rewrite never-optimized listings', route: '/app/listings?filter=never-optimized' },
    { id: 'c2', label: 'Improve listings with thin descriptions', route: '/app/listings', pill_key: 'thin_descriptions' },
    { id: 'c3', label: 'Fix listings with weak titles', route: '/app/listings', pill_key: 'weak_titles' },
  ],
  media: [
    { id: 'm1', label: 'Add photos to listings with low image count', route: '/app/listings', pill_key: 'low_images' },
    { id: 'm2', label: 'Add video to listings with no video', route: '/app/listings', pill_key: 'needs_video' },
  ],
  tags: [
    { id: 't1', label: 'Fill empty tag slots on listings', route: '/app/listings', pill_key: 'under_tagged' },
    { id: 't2', label: 'Add materials to listings', route: '/app/listings', pill_key: 'missing_materials' },
  ],
  freshness: [
    { id: 'f1', label: 'Renew listings older than 180 days', route: '/app/listings?filter=stale' },
    { id: 'f2', label: 'Update stale titles', route: '/app/listings?filter=stale-titles' },
  ],
}

const TABS = [
  { key: 'content', label: 'Content', icon: Star, weightLabel: '35% of score' },
  { key: 'media', label: 'Media', icon: ImageIcon, weightLabel: '25% of score' },
  { key: 'tags', label: 'Tags', icon: TagIcon, weightLabel: '20% of score' },
  { key: 'freshness', label: 'Freshness', icon: Clock, weightLabel: '20% of score' },
] as const

// ─── Media manual fixes (derived from sync stats) ─────────────────────────────
interface MediaManualFix {
  id: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  cta: string
  pillKey: string
  severity: 'critical' | 'high' | 'medium' | 'low'
}

function buildMediaManualFixes(
  media: { missingPhotos: number; fewPhotos: number; underTenPhotos: number; fullPhotos: number; missingVideo: number; hasVideo: number },
  total: number,
): MediaManualFix[] {
  const fixes: MediaManualFix[] = []
  const underTen = media.missingPhotos + media.fewPhotos + media.underTenPhotos
  const underFive = media.missingPhotos + media.fewPhotos
  if (underTen > 0) {
    fixes.push({
      id: 'photo-count',
      icon: Camera,
      label: `${underTen} listing${underTen === 1 ? '' : 's'} have fewer than 10 photos`,
      description: underFive > 0
        ? `${underFive} have under 5 — these miss the biggest exploration boost. Using all 10 photo slots increases product exploration by ~30%.`
        : `All 10 photo slots boosts exploration by ~30%. Photos are manual — add them on Etsy.`,
      cta: 'View listings by photo count',
      pillKey: 'low_images',
      severity: underFive > 0 ? 'critical' : 'high',
    })
  }
  if (media.missingVideo > 0 && total > 0) {
    const pct = Math.round((media.missingVideo / total) * 100)
    fixes.push({
      id: 'video-gap',
      icon: Video,
      label: media.hasVideo === 0
        ? `No listings have a product video`
        : `${media.missingVideo} listing${media.missingVideo === 1 ? '' : 's'} have no video (${pct}%)`,
      description: 'Listings with even a short 5–15 second clip see higher search prominence on Etsy. Videos must be uploaded on Etsy directly.',
      cta: 'View listings without video',
      pillKey: 'needs_video',
      severity: media.hasVideo === 0 ? 'high' : 'medium',
    })
  }
  return fixes
}

interface MediaBreakdownRow { label: string; value: string; pct: number; lostPts: number }
function buildMediaBreakdown(
  media: { fullPhotos: number; hasVideo: number; missingPhotos: number; fewPhotos: number; underTenPhotos: number },
  total: number,
): { rows: MediaBreakdownRow[]; photoAvg: number } {
  const t = Math.max(total, 1)
  // Mirrors src/lib/healthScore.ts: photos = (fullPhotos/total)*60, video = (hasVideo/total)*40
  const photoPct = (media.fullPhotos / t) * 100
  const videoPct = (media.hasVideo / t) * 100
  const photoPts = (media.fullPhotos / t) * 60
  const videoPts = (media.hasVideo / t) * 40
  // Approximate photo avg per listing: 10 for fullPhotos, 7 underTen, 2.5 few, 0 missing
  const totalPhotos =
    media.fullPhotos * 10 + media.underTenPhotos * 7 + media.fewPhotos * 2.5
  const photoAvg = total > 0 ? totalPhotos / total : 0
  return {
    photoAvg,
    rows: [
      { label: 'Photo coverage', value: `${media.fullPhotos}/${total} use all 10 slots`, pct: photoPct, lostPts: Math.round(60 - photoPts) },
      { label: 'Video coverage', value: `${media.hasVideo} of ${total}`, pct: videoPct, lostPts: Math.round(40 - videoPts) },
    ],
  }
}

export default function ScoreRoadmap() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { dashboardRows, syncStats } = useApp()
  const { rows: dbRows, loading: dbLoading, refresh: dbRefresh } = usePendingFixActions()

  const activeTab = (searchParams.get('dimension') || 'content') as 'content' | 'media' | 'tags' | 'freshness'
  const setActiveTab = (tab: string) => {
    setBucketId(null)
    setSearchParams({ dimension: tab })
  }
  const [bucketId, setBucketId] = useState<string | null>(null)
  

  const shopType = useMemo(() => detectShopType(dashboardRows), [dashboardRows])
  const health = useMemo(
    () => computeStoreHealthScore(dashboardRows, syncStats.media, syncStats.listingCount, shopType),
    [dashboardRows, syncStats, shopType],
  )

  const tabActions = useMemo(() => {
    return dbRows.filter(r => {
      const dim = (r.dimension || '').toLowerCase()
      if (activeTab === 'content') {
        return dim === 'content' || dim === 'policies' || dim === 'shipping' || dim === 'shop' || !dim
      }
      if (activeTab === 'media') return dim === 'media'
      if (activeTab === 'tags') return dim === 'tags'
      if (activeTab === 'freshness') return dim === 'freshness'
      return false
    })
  }, [dbRows, activeTab])

  const allGroupedListings = useMemo(() => groupActionsByListing(tabActions), [tabActions])

  // Bucket filter: derived from dashboardRows (the "shop" view of all listings),
  // applied to the queue (groupActionsByListing output) via listing_id.
  const buckets = useMemo(() => buildBuckets(activeTab, dashboardRows), [activeTab, dashboardRows])
  const activeBucket = bucketId ? buckets.find(b => b.id === bucketId) ?? null : null
  const bucketMatchedIds = useMemo(() => {
    if (!activeBucket?.match) return null
    const ids = new Set<string>()
    for (const r of dashboardRows) if (activeBucket.match(r)) ids.add(r.id)
    return ids
  }, [activeBucket, dashboardRows])
  const groupedListings = useMemo(() => {
    if (!bucketMatchedIds) return allGroupedListings
    return allGroupedListings.filter(l => l.listing_id && bucketMatchedIds.has(l.listing_id))
  }, [allGroupedListings, bucketMatchedIds])
  const displayedListings = useMemo(() => groupedListings.slice(0, 5), [groupedListings])
  const remainingCount = Math.max(0, groupedListings.length - 5)

  // Priority threshold: reserve "High Priority" for the top ~15% by score-gain
  // potential across the current tab, with a minimum delta floor so we never
  // tag trivial fixes as high priority.
  const highPriorityThreshold = useMemo(() => {
    const deltas = groupedListings.map(l => l.total_score_delta).filter(d => d > 0)
    if (deltas.length === 0) return Infinity
    const sorted = [...deltas].sort((a, b) => b - a)
    const cutoffIdx = Math.max(0, Math.ceil(sorted.length * 0.15) - 1)
    return Math.max(sorted[cutoffIdx] ?? Infinity, 5)
  }, [groupedListings])

  // Cohort: optimized vs. not-yet-optimized — used for the "what's working" line.
  const cohort = useMemo(() => {
    const active = dashboardRows.filter(r => r.state === 'active')
    const opt = active.filter(r => (r.optimization_count ?? 0) > 0 && r.current_grade != null)
    const not = active.filter(r => (r.optimization_count ?? 0) === 0 && r.current_grade != null)
    const optAvg = opt.length ? opt.reduce((a, b) => a + (b.current_grade ?? 0), 0) / opt.length : 0
    const notAvg = not.length ? not.reduce((a, b) => a + (b.current_grade ?? 0), 0) / not.length : 0
    const lift = notAvg > 0 ? Math.round(((optAvg - notAvg) / notAvg) * 100) : 0
    return { optCount: opt.length, lift }
  }, [dashboardRows])

  // Weakest sub-dimension: if it's >=8 pts below the next-lowest, surface a callout
  // and use it as the default tab when the URL doesn't pin one.
  const weakestDim = useMemo(() => {
    const entries = (['content', 'media', 'tags', 'freshness'] as const).map(k => ({ k, v: health.subScores[k] }))
    const sorted = [...entries].sort((a, b) => a.v - b.v)
    const isOutlier = sorted.length > 1 && (sorted[1].v - sorted[0].v) >= 8
    return isOutlier ? sorted[0].k : null
  }, [health.subScores])

  // If no ?dimension= in the URL and a weakest dimension stands out, default to it.
  useEffect(() => {
    if (!searchParams.get('dimension') && weakestDim && weakestDim !== 'content') {
      setSearchParams({ dimension: weakestDim }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weakestDim])

  const mediaScore = health.subScores.media
  const mediaManualFixes = useMemo(
    () => activeTab === 'media' ? buildMediaManualFixes(syncStats.media, syncStats.listingCount) : [],
    [activeTab, syncStats.media, syncStats.listingCount],
  )
  const mediaBreakdown = useMemo(
    () => buildMediaBreakdown(syncStats.media, syncStats.listingCount),
    [syncStats.media, syncStats.listingCount],
  )

  const currentScore = health.overallExact
  const ungraded = health.totalListings - health.gradedListings
  const next = nextGradeThreshold(currentScore)
  const pointsToNext = next ? Math.max(0, Math.round((next.min - currentScore) * 10) / 10) : 0
  const progressPct = next
    ? Math.min(100, Math.max(0, ((currentScore - (next.min - 10)) / 10) * 100))
    : 100

  const activeTabColor = subScoreColor(health.subScores[activeTab])

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Score Roadmap"
        description="Plan and review improvements that lift your Store Health Score."
      />

      <div className="flex-1 p-3 sm:p-4 md:p-6 space-y-6 w-full pb-16 overflow-x-hidden">
        {/* ─── Compact score line (full summary lives on Intelligence) ─── */}
        <p className="-mt-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">{health.overall}</span>
          <span className="mx-2 text-muted-foreground/40">·</span>
          {next ? (
            <>
              <span className="tabular-nums text-foreground/80">{pointsToNext}</span> pt{pointsToNext === 1 ? '' : 's'} to next milestone
            </>
          ) : (
            <span className="text-emerald-400">Top milestone reached</span>
          )}
        </p>

        {/* ─── Dimension Tabs ─── */}
        <div className="space-y-4">
          <div className="border-b border-border">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-px">
              {TABS.map(t => {
                const Icon = t.icon
                const active = activeTab === t.key
                const tabColor = subScoreColor(health.subScores[t.key])
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className="flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold tracking-wide transition-all shrink-0 select-none whitespace-nowrap"
                    style={{
                      borderColor: active ? activeTabColor : 'transparent',
                      color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: active ? activeTabColor : 'hsl(var(--muted-foreground))' }} />
                    {t.label}
                    <span
                      className="ml-1 px-1.5 rounded-full text-[10px] font-bold leading-5"
                      style={{ background: `${tabColor}20`, color: tabColor }}
                      title={`${health.subScores[t.key]}/100 score`}
                    >
                      {health.subScores[t.key]}<span className="font-normal opacity-60">/100</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ─── Active Tab Content ─── */}
          <ActiveTabQueue
            activeTab={activeTab}
            buckets={buckets}
            bucketId={bucketId}
            setBucketId={setBucketId}
            navigate={navigate}
            activeTabColor={activeTabColor}
            dashboardRows={dashboardRows}
            allGroupedListings={allGroupedListings}
            highPriorityThreshold={highPriorityThreshold}
            dbLoading={dbLoading}
            dbRefresh={dbRefresh}
            mediaScore={mediaScore}
            health={health}
            mediaBreakdown={mediaBreakdown}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Active Tab Queue (unified bucket-driven list) ────────────────────────────
function ActiveTabQueue({
  activeTab, buckets, bucketId, setBucketId, navigate, activeTabColor,
  dashboardRows, allGroupedListings, highPriorityThreshold, dbLoading, dbRefresh,
  mediaScore, health, mediaBreakdown,
}: {
  activeTab: 'content' | 'media' | 'tags' | 'freshness'
  buckets: Bucket[]
  bucketId: string | null
  setBucketId: (id: string | null) => void
  navigate: (to: string) => void
  activeTabColor: string
  dashboardRows: DashboardListingRow[]
  allGroupedListings: ReturnType<typeof groupActionsByListing>
  highPriorityThreshold: number
  dbLoading: boolean
  dbRefresh: () => void
  mediaScore: number
  health: ReturnType<typeof computeStoreHealthScore>
  mediaBreakdown: ReturnType<typeof buildMediaBreakdown>
}) {
  // Default to highest-impact (first non-route bucket with count > 0).
  const defaultBucket = useMemo(
    () => buckets.find(b => b.match && b.count > 0) ?? null,
    [buckets],
  )
  const userSelected = bucketId ? buckets.find(b => b.id === bucketId) ?? null : null
  const requestedBucket = userSelected ?? defaultBucket

  // Listings matching the requested bucket (drawn from dashboardRows so we are
  // never empty just because there are no pending automated actions).
  const matchListings = (b: Bucket | null): DashboardListingRow[] => {
    if (!b?.match) return []
    return dashboardRows.filter(r => r.state === 'active' && b.match!(r))
  }
  const requestedListings = useMemo(() => matchListings(requestedBucket), [requestedBucket, dashboardRows])

  // Fallback: if user explicitly selected a bucket but it's empty, switch to
  // the next non-empty bucket and surface a "showing X instead" note.
  const fallbackBucket = useMemo(() => {
    if (!userSelected || requestedListings.length > 0) return null
    return buckets.find(b => b.id !== userSelected.id && b.match && b.count > 0) ?? null
  }, [userSelected, requestedListings.length, buckets])
  const finalBucket = fallbackBucket ?? requestedBucket
  const finalListings = fallbackBucket ? matchListings(fallbackBucket) : requestedListings

  // Pair each listing with its automated action group (if any).
  const actionByListingId = useMemo(() => {
    const m = new Map<string, ReturnType<typeof groupActionsByListing>[number]>()
    for (const g of allGroupedListings) if (g.listing_id) m.set(g.listing_id, g)
    return m
  }, [allGroupedListings])

  const [showAll, setShowAll] = useState(false)
  // Reset "show all" when the active tab or bucket changes
  useEffect(() => { setShowAll(false) }, [activeTab, bucketId])
  const PAGE_SIZE = 10
  const displayed = finalListings.slice(0, showAll ? finalListings.length : PAGE_SIZE)
  const remaining = Math.max(0, finalListings.length - displayed.length)

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
      {/* Main unified queue */}
      <div className="space-y-4 min-w-0">
        {/* Unified filter strip (buckets + manual-fix categories live here) */}
        <BucketStrip
          buckets={buckets}
          activeId={userSelected?.id ?? null}
          color={activeTabColor}
          onSelect={(b) => {
            if (b.route) { navigate(b.route); return }
            setBucketId(bucketId === b.id ? null : b.id)
          }}
        />

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {TABS.find(t => t.key === activeTab)?.label} Queue
            </h3>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              {finalListings.length === 0
                ? `No active listings in this tab yet.`
                : finalBucket
                  ? `${finalListings.length} listing${finalListings.length === 1 ? '' : 's'} in “${finalBucket.label}”.`
                  : `${finalListings.length} listing${finalListings.length === 1 ? '' : 's'} ready for quick wins.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Clear-filter chip — sits right next to the queue it affects */}
            {userSelected && (
              <button
                type="button"
                onClick={() => setBucketId(null)}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-slate-200 transition-all active:scale-95"
                style={{ borderColor: `${activeTabColor}55`, background: `${activeTabColor}14` }}
              >
                <span className="capitalize text-muted-foreground">{activeTab}</span>
                <span className="text-muted-foreground/60">→</span>
                <span className="font-semibold" style={{ color: activeTabColor }}>{userSelected.label}</span>
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
            {dbLoading && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
            )}
          </div>
        </div>

        {/* Fallback notice */}
        {fallbackBucket && userSelected && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-foreground/80">
            No items in <span className="font-semibold text-foreground">“{userSelected.label}”</span> — showing{' '}
            <span className="font-semibold" style={{ color: activeTabColor }}>“{fallbackBucket.label}”</span> instead.
          </div>
        )}

        {/* Media context banner (kept for low scores) */}
        {activeTab === 'media' && mediaScore < 70 && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
              <p className="text-xs text-foreground/80 leading-relaxed">
                <span className="font-semibold text-foreground">Media score is {mediaScore}/100.</span>{' '}
                Photos and video must be added on Etsy — tap the Etsy button on any listing below to jump straight there.
              </p>
            </div>
          </div>
        )}

        {displayed.length > 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
            {displayed.map(row => {
              const group = actionByListingId.get(row.id)
              if (group) {
                return (
                  <GroupedListingCard
                    key={row.id}
                    listing={group}
                    onRefresh={dbRefresh}
                    priorityTier={group.total_score_delta >= highPriorityThreshold ? 'high' : null}
                  />
                )
              }
              const hint =
                activeTab === 'media'
                  ? `${row.photo_count ?? 0}/10 photos${(row.video_count ?? 0) === 0 ? ' · no video' : ''}`
                  : activeTab === 'tags'
                    ? `${row.tags?.length ?? 0}/13 tags`
                    : activeTab === 'freshness'
                      ? `Listed ${Math.max(0, Math.round((Date.now() - new Date(row.etsy_created_at).getTime()) / 86400000))}d ago`
                      : (row.optimization_count ?? 0) === 0
                        ? 'Never optimized'
                        : `${row.optimization_count} optimization${row.optimization_count === 1 ? '' : 's'} applied`
              const etsyUrl = activeTab === 'media' && row.etsy_listing_id
                ? `https://www.etsy.com/listing/${row.etsy_listing_id}`
                : null
              return (
                <LeanListingCard
                  key={row.id}
                  row={row}
                  hint={hint}
                  etsyUrl={etsyUrl}
                  onOpen={() => navigate(`/app/listings/${row.id}`)}
                />
              )
            })}

            {remaining > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full mt-1 py-2.5 rounded-xl border border-border/60 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-border hover:bg-surface-2 transition-all"
              >
                Show {remaining} more listing{remaining === 1 ? '' : 's'} →
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border/20 bg-surface-1/30 p-8 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 mb-3">
              <Check className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-foreground">Nothing to action here right now.</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm mx-auto">
              Once your shop has active listings in this dimension, they'll surface here.
            </p>
          </div>
        )}
      </div>

      {/* Sidebar Stats & Context */}
      <ScoreRoadmapSidebar
        activeTab={activeTab}
        activeTabColor={activeTabColor}
        health={health}
        mediaBreakdown={mediaBreakdown}
      />
    </div>
  )
}

function ScoreRoadmapSidebar({
  activeTab, activeTabColor, health, mediaBreakdown,
}: {
  activeTab: 'content' | 'media' | 'tags' | 'freshness'
  activeTabColor: string
  health: ReturnType<typeof computeStoreHealthScore>
  mediaBreakdown: ReturnType<typeof buildMediaBreakdown>
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border p-4 flex items-center gap-4 bg-surface-1">
        <SubScoreGauge score={health.subScores[activeTab]} color={activeTabColor} />
        <div>
          <h4 className="text-xs font-semibold text-foreground">
            {TABS.find(t => t.key === activeTab)?.label} Score
          </h4>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Accounts for {TABS.find(t => t.key === activeTab)?.weightLabel} of the overall grade.
          </p>
        </div>
      </div>

      {activeTab === 'media' && (
        <div className="rounded-xl border border-border p-4 space-y-3 bg-surface-1">
          <h4 className="text-xs font-semibold text-foreground">Where the score comes from</h4>
          <div className="space-y-2.5">
            {mediaBreakdown.rows.map(row => (
              <div key={row.label} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-foreground/80 font-medium">{row.label}</span>
                  <span className="text-amber-400 font-semibold">−{row.lostPts} pts</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--border))" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(2, Math.min(100, row.pct))}%`,
                      background: row.pct >= 60 ? '#10b981' : row.pct >= 30 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/60">{row.value}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/60 leading-relaxed pt-1 border-t border-border/20">
            Avg photos per listing: <span className="text-foreground/80 font-semibold">{mediaBreakdown.photoAvg.toFixed(1)} / 10</span>
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border p-4 space-y-3 text-xs bg-surface-1">
        <h4 className="font-semibold text-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          Roadmap Tips
        </h4>
        {activeTab === 'content' && (
          <p className="text-muted-foreground leading-relaxed">
            Etsy grades descriptions and titles for ranking. Bullet points, short paragraphs, and rich descriptions with keyword density convert search traffic into sales.
          </p>
        )}
        {activeTab === 'media' && (
          <p className="text-muted-foreground leading-relaxed">
            Using all 10 photo slots increases product exploration by 30%. Listings with a short product video see higher search prominence on average.
          </p>
        )}
        {activeTab === 'tags' && (
          <p className="text-muted-foreground leading-relaxed">
            Etsy gives you 13 tags. Never leave tag slots empty. Use multi-word tags (e.g. "boho wall art" instead of "art") to target specific search intent.
          </p>
        )}
        {activeTab === 'freshness' && (
          <p className="text-muted-foreground leading-relaxed">
            Etsy gives recently renewed or newly posted listings a temporary ranking boost. Consider renewing stale listings (over 180 days) to re-index them.
          </p>
        )}
      </div>
    </div>
  )
}
