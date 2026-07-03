/**
 * Photo Analysis slide-over panel.
 * Renders the result of the analyze-photos edge function: overall score gauge,
 * cover photo feedback, per-photo grades, missing-shot pills, and top recs.
 */
import { useState } from 'react'
import { Camera, Loader2, Plus, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { PhotoAnalysisResult } from '@/hooks/useListingActions'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  result: PhotoAnalysisResult['analysis'] | null
  photoUrls: string[]
  onReanalyze: () => void
}

const GRADE_COLOR: Record<string, string> = {
  A: 'bg-emerald-500 text-white',
  B: 'bg-blue-500 text-white',
  C: 'bg-amber-500 text-white',
  D: 'bg-orange-500 text-white',
  F: 'bg-red-500 text-white',
}

const ACTION_STYLE: Record<string, { label: string; cls: string }> = {
  keep: { label: 'Keep', cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  edit: { label: 'Quick edit', cls: 'bg-blue-100 text-blue-700 border-blue-300' },
  retake: { label: 'Retake', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
}

export function PhotoAnalysisPanel({ open, onOpenChange, loading, result, photoUrls, onReanalyze }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            Photo Analysis
          </DialogTitle>
          <DialogDescription>
            AI-graded feedback on your listing photos with specific improvement suggestions.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-16 flex flex-col items-center gap-4">
            <div className="relative h-20 w-20 rounded-lg border border-primary/40 bg-primary/5 flex items-center justify-center overflow-hidden">
              <Camera className="h-10 w-10 text-primary" />
              <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan-sweep" />
            </div>
            <p className="text-sm text-muted-foreground">Analyzing your photos with AI…</p>
            <style>{`
              @keyframes scanSweep { 0% { top: 0; } 100% { top: 100%; } }
              .animate-scan-sweep { animation: scanSweep 1.4s ease-in-out infinite; }
            `}</style>
          </div>
        )}

        {!loading && !result && (
          <div className="py-12 text-center text-sm text-muted-foreground">No analysis available yet.</div>
        )}

        {!loading && result && (
          <div className="space-y-6">
            {/* Overall + cover */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <div className="flex flex-col items-center gap-2 rounded-lg bg-muted p-4">
                <ScoreGauge score={result.overall_score} />
                <p className="text-xs text-muted-foreground">Overall photo score</p>
                <p className="text-xs">
                  <span className="font-medium">{result.photo_count}</span> of {result.max_photos} photos uploaded
                </p>
                {result.benchmark ? (
                  <p className="text-[11px] text-muted-foreground text-center leading-snug">
                    Shops in your niche typically show{' '}
                    <span className="font-semibold text-foreground">{result.benchmark.peer_median_photos}</span> photos
                    {result.photo_count < result.benchmark.peer_median_photos
                      ? ' — a few more would put you right alongside them'
                      : " — you're keeping pace nicely"}
                  </p>
                ) : result.photo_count < result.max_photos && (
                  <p className="text-[11px] text-amber-600 text-center">
                    Add {result.max_photos - result.photo_count} more photos to maximize your score
                  </p>
                )}
              </div>
              <div className="md:col-span-2 rounded-lg border border-border p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cover photo</p>
                <div className="flex gap-3">
                  {photoUrls[0] && (
                    <img
                      src={photoUrls[0]}
                      alt="Cover"
                      className="h-20 w-20 rounded object-cover bg-muted shrink-0"
                    />
                  )}
                  <p className="text-sm text-foreground/90">{result.cover_photo_feedback}</p>
                </div>
              </div>
            </div>

            {/* Per-photo breakdown */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Per-photo breakdown</p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {result.photos.map((p, i) => {
                  const url = photoUrls[p.index - 1] ?? photoUrls[i]
                  const active = expandedIdx === i
                  return (
                    <button
                      key={p.index}
                      type="button"
                      onClick={() => setExpandedIdx(active ? null : i)}
                      className={`relative h-20 w-20 shrink-0 rounded-md overflow-hidden border-2 transition ${
                        active ? 'border-primary ring-2 ring-primary/40' : 'border-transparent hover:border-primary/40'
                      }`}
                    >
                      {url ? (
                        <img src={url} alt={`Photo ${p.index}`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-muted" />
                      )}
                      <span className={`absolute top-1 right-1 h-5 w-5 rounded text-[10px] font-bold flex items-center justify-center ${GRADE_COLOR[p.grade] ?? 'bg-muted text-foreground'}`}>
                        {p.grade}
                      </span>
                      {p.action && p.action !== 'keep' && (
                        <span className={`absolute bottom-0 inset-x-0 text-[9px] font-bold text-center py-0.5 border-t ${ACTION_STYLE[p.action]?.cls ?? ''}`}>
                          {ACTION_STYLE[p.action]?.label}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Reorder recommendation */}
              {result.recommended_order && result.recommended_order.length > 1 &&
                result.recommended_order.some((idx, i) => idx !== i + 1) && (
                <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-foreground">Suggested photo order</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {result.recommended_order.map((idx, i) => (
                      <span key={i} className="flex items-center gap-1.5">
                        {photoUrls[idx - 1] ? (
                          <img src={photoUrls[idx - 1]} alt={`Position ${i + 1}`} className="h-10 w-10 rounded object-cover border border-border" />
                        ) : (
                          <span className="h-10 w-10 rounded bg-muted flex items-center justify-center text-[10px]">{idx}</span>
                        )}
                        {i < result.recommended_order!.length - 1 && (
                          <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                        )}
                      </span>
                    ))}
                  </div>
                  {result.reorder_reason && (
                    <p className="text-xs text-foreground/80">{result.reorder_reason}</p>
                  )}
                </div>
              )}

              {expandedIdx !== null && result.photos[expandedIdx] && (
                <div className="mt-3 rounded-md border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Photo {result.photos[expandedIdx].index}</p>
                    <div className="flex items-center gap-1.5">
                      {result.photos[expandedIdx].action && (
                        <Badge variant="outline" className={ACTION_STYLE[result.photos[expandedIdx].action!]?.cls ?? ''}>
                          {ACTION_STYLE[result.photos[expandedIdx].action!]?.label}
                        </Badge>
                      )}
                      <Badge className={GRADE_COLOR[result.photos[expandedIdx].grade] ?? ''}>
                        {result.photos[expandedIdx].grade} · {result.photos[expandedIdx].score}/100
                      </Badge>
                    </div>
                  </div>
                  {result.photos[expandedIdx].action_reason && (
                    <p className="text-xs text-foreground/80">{result.photos[expandedIdx].action_reason}</p>
                  )}
                  {result.photos[expandedIdx].action === 'edit' && result.photos[expandedIdx].edit_guidance && (
                    <p className="text-xs rounded bg-blue-50 border border-blue-200 text-blue-900 p-2">
                      How to fix it: {result.photos[expandedIdx].edit_guidance}
                    </p>
                  )}
                  {result.photos[expandedIdx].issues.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-red-700 mb-1">Issues</p>
                      <ul className="space-y-1">
                        {result.photos[expandedIdx].issues.map((it, j) => (
                          <li key={j} className="text-xs text-foreground/80 flex gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                            {it}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.photos[expandedIdx].suggestions.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-primary mb-1">Suggestions</p>
                      <ul className="space-y-1">
                        {result.photos[expandedIdx].suggestions.map((it, j) => (
                          <li key={j} className="text-xs text-foreground/80 flex gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                            {it}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Missing shots */}
            {result.missing_shots.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Missing shots</p>
                <div className="flex flex-wrap gap-2">
                  {result.missing_shots.map((s, i) => (
                    <Badge key={i} variant="outline" className="gap-1 border-primary/40 text-foreground">
                      <Plus className="h-3 w-3 text-primary" />
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata mismatches — photos contradict the listing text */}
            {result.metadata_mismatches && result.metadata_mismatches.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Listing vs photos — mismatches</p>
                <ul className="space-y-2">
                  {result.metadata_mismatches.map((m, i) => (
                    <li key={i} className="flex gap-2 items-start text-sm rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
                      <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <Badge variant="outline" className="mr-2 text-[10px] uppercase">{m.field}</Badge>
                        <span className="text-foreground/90">{m.issue}</span>
                        {m.claim && <span className="block text-xs text-muted-foreground mt-1">Claim: “{m.claim}”</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Metadata gaps — photos show things the listing text misses */}
            {result.metadata_gaps && result.metadata_gaps.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Visible in photos — missing from listing</p>
                <ul className="space-y-2">
                  {result.metadata_gaps.map((g, i) => (
                    <li key={i} className="flex gap-2 items-start text-sm rounded-md border border-primary/30 bg-primary/5 p-2">
                      <Plus className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <Badge variant="outline" className="mr-2 text-[10px] uppercase">{g.field}</Badge>
                        <span className="text-foreground/90">{g.suggestion}</span>
                        {g.visible_in_photos && <span className="block text-xs text-muted-foreground mt-1">Seen in photos: {g.visible_in_photos}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top recommendations */}
            {result.top_recommendations.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Top 3 recommendations</p>
                <ol className="space-y-2">
                  {result.top_recommendations.slice(0, 3).map((r, i) => (
                    <li key={i} className="flex gap-2 items-start text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="flex-1 font-medium">
                        <ArrowRight className="inline h-3.5 w-3.5 text-primary mr-1" />
                        {r}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onReanalyze} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Re-analyze (1 credit)
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score)) / 100
  const r = 30
  const c = 2 * Math.PI * r
  const offset = c * (1 - pct)
  const color = pct >= 0.85 ? '#10b981' : pct >= 0.7 ? '#3b82f6' : pct >= 0.5 ? '#f59e0b' : '#ef4444'
  return (
    <div className="relative h-20 w-20">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} stroke="hsl(var(--muted))" strokeWidth="7" fill="none" />
        <circle
          cx="40" cy="40" r={r}
          stroke={color} strokeWidth="7" fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-lg font-bold">
        {Math.round(score)}
      </div>
    </div>
  )
}
