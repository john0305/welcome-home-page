import { useMemo } from 'react'
import { Sparkles, ArrowRight } from 'lucide-react'
import { usePendingFixActions } from '@/hooks/useFixActions'
import type { EtsyListing } from '@/types'
import type { StatTabId } from '@/components/listings/StatTabs'

interface Props {
  listings: EtsyListing[]
  onSelectTab: (id: StatTabId) => void
}

/**
 * "Echo's read" — the intelligence layer stays the first thing a seller sees
 * when they land on Listings, instead of dropping them straight into filter
 * machinery. One warm synthesis line + tappable opportunity chips that ARE
 * the drill-down filters (they drive the same tab handlers as the stat tabs).
 */
export function ListingsInsightHeader({ listings, onSelectTab }: Props) {
  const { rows: pendingActions } = usePendingFixActions()

  const read = useMemo(() => {
    const active = listings.filter(l => l.state === 'active')
    if (active.length === 0) return null

    const lowGrade = active.filter(l => (l.current_grade ?? 100) < 60).length
    const neverOptimized = active.filter(l => (l.optimization_count ?? 0) === 0).length
    const quickWins = pendingActions.filter(a => a.mode === 'auto').length
    const strong = active.filter(l => (l.current_grade ?? 0) >= 80).length

    // One sentence, leading with what's working, then the next move.
    let line: string
    if (quickWins > 0) {
      line = `${strong > 0 ? `${strong} of your listings are already in great shape — and ` : ''}I've lined up ${quickWins} one-tap fix${quickWins === 1 ? '' : 'es'} that could lift the rest without you touching Etsy.`
    } else if (lowGrade > 0) {
      line = `${strong > 0 ? `${strong} listings are pulling their weight. ` : ''}${lowGrade} could use some love — start with the ones below and I'll walk you through each fix.`
    } else if (neverOptimized > 0) {
      line = `Your shop's in solid shape. ${neverOptimized} listing${neverOptimized === 1 ? ' hasn\'t' : 's haven\'t'} been through an optimization pass yet — good next place to look.`
    } else {
      line = `Everything's looking healthy right now. I'll flag it here the moment something needs your eyes.`
    }

    const chips: { label: string; tab: StatTabId }[] = []
    if (lowGrade > 0) chips.push({ label: `${lowGrade} need attention`, tab: 'low_grade' })
    if (neverOptimized > 0) chips.push({ label: `${neverOptimized} never optimized`, tab: 'never_optimized' })

    return { line, chips }
  }, [listings, pendingActions])

  if (!read) return null

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 shrink-0 mt-0.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground leading-relaxed">{read.line}</p>
          {read.chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {read.chips.map(chip => (
                <button
                  key={chip.tab}
                  type="button"
                  onClick={() => onSelectTab(chip.tab)}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-background px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                >
                  {chip.label} <ArrowRight className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
