import { Eye, Heart, ShoppingBag, Sparkles, Gauge, CheckCircle2, Loader2, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import type { EtsyListing } from '@/types'
import { daysSince, formatCurrency, formatSales } from '@/lib/utils'
import { useListingActions } from '@/hooks/useListingActions'
import { useApp } from '@/contexts/AppContext'
import { useListingFlags } from '@/hooks/useListingFlags'
import { ListingFlagMenu } from './ListingFlagMenu'
import { format } from 'date-fns'

function gradeInfo(score: number | null | undefined): { letter: string; bg: string; text: string; ring: string } {
  if (score == null) return { letter: '—', bg: '#E5E7EB', text: '#6B7280', ring: '#D1D5DB' }
  if (score >= 90) return { letter: 'A+', bg: '#059669', text: '#fff', ring: '#34D399' }
  if (score >= 80) return { letter: 'A',  bg: '#10B981', text: '#fff', ring: '#6EE7B7' }
  if (score >= 70) return { letter: 'B',  bg: '#0D9488', text: '#fff', ring: '#5EEAD4' }
  if (score >= 60) return { letter: 'C',  bg: '#D97706', text: '#fff', ring: '#FCD34D' }
  if (score >= 50) return { letter: 'D',  bg: '#F59E0B', text: '#fff', ring: '#FDE68A' }
  return { letter: 'F', bg: '#EF4444', text: '#fff', ring: '#FCA5A5' }
}

function isTopPerformer(score: number | null | undefined): boolean {
  return (score ?? 0) >= 80
}

export function ListingCard({ listing, selected, onSelect, showMissingTagsBadge, activeIssue, fixProgress }: {
  listing: EtsyListing
  selected?: boolean
  onSelect?: (id: string) => void
  showMissingTagsBadge?: boolean
  activeIssue?: { label: string; tone: 'amber' | 'teal' }
  fixProgress?: { open: number; resolved: number }
}) {
  const navigate = useNavigate()
  const { optimizeNow, gradeNow, isOptimizing, isGrading } = useListingActions()
  const { pendingReviewListingIds } = useApp()
  const { flagsByListingId } = useListingFlags()
  const listingFlags = flagsByListingId.get(listing.id) ?? []
  const monitoringFlag = listingFlags.find(f => f.flag_type === 'optimized_monitoring') ?? null
  const deferredFlag = listingFlags.find(f => f.flag_type === 'deferred') ?? null
  const confirmedFlag = listingFlags.find(f => f.flag_type === 'optimized_confirmed') ?? null
  const hasPendingReview = pendingReviewListingIds.has(listing.id)
  const optimizing = isOptimizing(listing.id)
  const grading = isGrading(listing.id)
  const age = daysSince(listing.etsy_created_at)
  const sales = formatSales(listing)
  const missingTags = Math.max(0, 13 - (listing.tags?.length ?? 0))
  const grade = gradeInfo(listing.current_grade)
  const topPerformer = isTopPerformer(listing.current_grade)
  const photoCount = (listing as { photo_count?: number }).photo_count ?? listing.image_urls?.length ?? 0
  const isDigital = listing.is_digital === true
  const photoThreshold = isDigital ? 3 : 5
  const lowPhotos = photoCount < photoThreshold
  const needsAttention = (listing as { needs_attention?: boolean }).needs_attention

  // Build issue pills (capped at 3 for space)
  const issues: { label: string; color: 'red' | 'amber' | 'teal' | 'gray' }[] = []
  if (activeIssue) issues.push({ label: activeIssue.label, color: activeIssue.tone === 'amber' ? 'amber' : 'teal' })
  if (lowPhotos) issues.push({ label: `${photoCount} ${isDigital ? 'mockups' : 'photos'}`, color: 'red' })
  if (showMissingTagsBadge && missingTags > 0) issues.push({ label: `${missingTags} tags missing`, color: 'amber' })
  if (needsAttention) issues.push({ label: 'Needs attention', color: 'amber' })
  if (hasPendingReview) issues.push({ label: 'Pending review', color: 'teal' })
  if (confirmedFlag) issues.push({ label: 'Optimized ✓', color: 'teal' })
  if (deferredFlag) issues.push({ label: "Won't fix", color: 'gray' })
  if (monitoringFlag) issues.push({ label: `Monitoring${monitoringFlag.measurement_window_end ? ` · ${format(new Date(monitoringFlag.measurement_window_end), 'MMM d')}` : ''}`, color: 'teal' })
  if (listing.optimization_count === 0 && !hasPendingReview) issues.push({ label: 'Never optimized', color: 'amber' })
  const visibleIssues = issues.slice(0, 3)

  const PILL_COLORS = {
    red:   'bg-red-100 text-red-700 border-red-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    teal:  'bg-primary/10 text-primary border-primary/20',
    gray:  'bg-gray-100 text-gray-500 border-gray-200',
  }

  return (
    <div
      className={`group relative flex flex-col rounded-2xl overflow-hidden border transition-all cursor-pointer hover:shadow-warm hover:-translate-y-0.5 active:scale-[0.99] ${
        selected ? 'ring-2 ring-primary border-primary/40' : 'border-border bg-surface-1 shadow-warm-sm'
      } ${fixProgress && fixProgress.open === 0 && fixProgress.resolved > 0 ? 'opacity-80' : ''}`}
      onClick={() => navigate(`/app/listings/${listing.id}`)}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={e => { e.stopPropagation(); onSelect(listing.id) }}
          onClick={e => e.stopPropagation()}
          className="absolute left-3 top-3 h-4 w-4 z-20 rounded border-gray-300 accent-primary"
        />
      )}

      {/* ── Full image ── */}
      <div className="relative w-full bg-surface-2 overflow-hidden" style={{ height: '220px' }}>
        {listing.thumbnail_url ? (
          <img
            src={listing.thumbnail_url}
            alt={listing.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/20">
            <ShoppingBag className="h-10 w-10" />
          </div>
        )}

        {/* TOP PERFORMER banner */}
        {topPerformer && (
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-emerald-500/90 to-transparent px-2.5 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-white">⭐ Top Performer</p>
          </div>
        )}

        {/* Grade circle — top right */}
        <div className="absolute top-2.5 right-2.5 z-10">
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center font-black text-xs shadow-md border-2"
            style={{ background: grade.bg, color: grade.text, borderColor: grade.ring }}
          >
            {grading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : grade.letter}
          </div>
        </div>

        {/* Flag menu */}
        <div className="absolute left-2 top-2 z-10" onClick={e => e.stopPropagation()}>
          <ListingFlagMenu listingId={listing.id} />
        </div>

        {/* Issue pills — bottom of image */}
        {visibleIssues.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2 flex flex-wrap gap-1.5 bg-gradient-to-t from-black/30 to-transparent pt-4">
            {visibleIssues.map((issue, i) => (
              <span key={i} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold border ${PILL_COLORS[issue.color]} leading-tight`}>
                {issue.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Card body ── */}
      <div className="flex flex-col gap-2 p-3">
        {/* Title + price */}
        <div>
          <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
            {listing.title}
          </p>
          <p className="text-sm font-bold text-secondary mt-0.5">
            {formatCurrency(listing.price)}
          </p>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{(listing.views ?? 0).toLocaleString()}</span>
          <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{listing.favorites ?? 0}</span>
          <span className="flex items-center gap-1"><ShoppingBag className="h-3 w-3" />{sales.value}</span>
          <span className="ml-auto text-[10px] opacity-60">{age}d old</span>
        </div>

        {/* Fix progress bar */}
        {fixProgress && (fixProgress.open + fixProgress.resolved) > 0 && (() => {
          const total = fixProgress.open + fixProgress.resolved
          const pct = Math.round((fixProgress.resolved / total) * 100)
          return (
            <div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                {fixProgress.open === 0 ? (
                  <><CheckCircle2 className="h-3 w-3 text-emerald-500" /> All fixes resolved</>
                ) : (
                  <>{fixProgress.open} open · {fixProgress.resolved} resolved</>
                )}
              </div>
              <Progress value={pct} className="h-1" />
            </div>
          )
        })()}

        {/* ── Action buttons ── */}
        <div className="flex gap-2 mt-1" onClick={e => e.stopPropagation()}>
          {/* Optimize — solid teal */}
          <button
            disabled={optimizing}
            onClick={e => { e.stopPropagation(); void optimizeNow([listing.id]) }}
            className="flex-1 h-8 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 text-white"
            style={{ background: optimizing ? 'hsl(163 60% 26% / 0.6)' : 'hsl(163 60% 26%)' }}
          >
            {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {optimizing ? 'Optimizing…' : 'Optimize'}
          </button>

          {/* Review — outline */}
          <button
            disabled={grading}
            onClick={e => { e.stopPropagation(); void gradeNow(listing.id) }}
            className="h-8 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all active:scale-95 disabled:opacity-50 text-primary border-primary/30 hover:bg-primary/6"
          >
            {grading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gauge className="h-3 w-3" />}
            {grading ? '…' : 'Grade'}
          </button>

          {/* Open detail */}
          <button
            onClick={e => { e.stopPropagation(); navigate(`/app/listings/${listing.id}`) }}
            className="h-8 w-8 rounded-xl flex items-center justify-center border border-[#E8E4DF] text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
