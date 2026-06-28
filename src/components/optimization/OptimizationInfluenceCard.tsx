import { useEffect, useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, Check, X, CircleDashed, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'

export type PeerRecVerdict = {
  peer_rec_summary: string
  peer_rec_category: string | null
  peer_rec_impact: string | null // 'high' | 'medium' | 'low'
  status: string // 'applied' | 'rejected' | 'partial'
  reason: string | null
}

const impactColor: Record<string, string> = {
  high: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  low: 'bg-muted text-muted-foreground border-border',
}

const statusMeta: Record<string, { label: string; cls: string; Icon: typeof Check }> = {
  applied:  { label: 'Applied',  cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', Icon: Check },
  partial:  { label: 'Partial',  cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',       Icon: CircleDashed },
  rejected: { label: 'Rejected', cls: 'bg-muted text-muted-foreground border-border',                                  Icon: X },
}

/**
 * Review-screen card showing transparency on what the AI used during this
 * optimization run: peer-driven recommendation verdicts + any clarifying
 * answers the seller supplied in the pre-flight modal.
 *
 * Collapsed by default so it doesn't push the before/after diff out of view
 * on mobile. Renders nothing when there's neither verdicts nor session
 * answers.
 */
export function OptimizationInfluenceCard({
  optimizationId,
  initialVerdicts,
  sessionAnswers,
}: {
  optimizationId: string
  initialVerdicts?: PeerRecVerdict[]
  sessionAnswers?: Record<string, string> | null
}) {
  const [verdicts, setVerdicts] = useState<PeerRecVerdict[]>(initialVerdicts ?? [])
  const [open, setOpen] = useState(false)
  const hasAnswers = !!(sessionAnswers && Object.keys(sessionAnswers).length)

  // If we weren't handed verdicts (e.g. the dialog opened from a stored
  // optimization rather than fresh from the optimize call), fetch them.
  useEffect(() => {
    if (initialVerdicts && initialVerdicts.length) return
    if (!optimizationId) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('peer_rec_applications')
        .select('peer_rec_summary, peer_rec_category, peer_rec_impact, status, reason')
        .eq('optimization_run_id', optimizationId)
      if (cancelled) return
      if (!error && Array.isArray(data)) setVerdicts(data as PeerRecVerdict[])
    })()
    return () => { cancelled = true }
  }, [optimizationId, initialVerdicts])

  if (verdicts.length === 0 && !hasAnswers) return null

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            What influenced this optimization
            <span className="text-xs font-normal text-muted-foreground">
              {verdicts.length > 0 && `${verdicts.length} peer ${verdicts.length === 1 ? 'rec' : 'recs'}`}
              {verdicts.length > 0 && hasAnswers && ' · '}
              {hasAnswers && `${Object.keys(sessionAnswers!).length} answer${Object.keys(sessionAnswers!).length === 1 ? '' : 's'}`}
            </span>
          </CardTitle>
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label={open ? 'Collapse' : 'Expand'}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {verdicts.length > 0 && (
            <ul className="space-y-2">
              {verdicts.map((v, i) => {
                const sm = statusMeta[v.status] ?? statusMeta.rejected
                const Icon = sm.Icon
                return (
                  <li key={i} className="rounded-md border border-border p-3 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className={`gap-1 ${sm.cls}`}>
                        <Icon className="h-3 w-3" />
                        {sm.label}
                      </Badge>
                      {v.peer_rec_impact && (
                        <Badge variant="outline" className={impactColor[v.peer_rec_impact] ?? impactColor.low}>
                          {v.peer_rec_impact} impact
                        </Badge>
                      )}
                      {v.peer_rec_category && (
                        <Badge variant="secondary" className="text-xs">{v.peer_rec_category}</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium">{v.peer_rec_summary}</p>
                    {v.reason && <p className="text-xs text-muted-foreground">{v.reason}</p>}
                  </li>
                )
              })}
            </ul>
          )}
          {hasAnswers && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />
                Your answers used in this run
              </p>
              <ul className="space-y-1.5">
                {Object.entries(sessionAnswers!).map(([q, a]) => (
                  <li key={q} className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                    <p className="font-medium">{q}</p>
                    <p className="text-muted-foreground mt-0.5">{a}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
