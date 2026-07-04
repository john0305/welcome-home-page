/**
 * EchoPicksPanel — dashboard-embedded guided action queue.
 * Three tabs: Echo Picks / Quick Wins / Big Impact.
 * Each card shows listing + dimension + score delta + Apply/Review CTA.
 * Mirrors the ActionQueue tab logic but is compact and dashboard-native.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Sparkles, Zap, TrendingUp, ArrowRight, Loader2 } from 'lucide-react'
import { usePendingFixActions, applyFixAction, type FixActionRow } from '@/hooks/useFixActions'
import { splitTabs, TAB_MEANINGS, type ActionTab } from '@/lib/actionCategories'
import { useToast } from '@/hooks/use-toast'

const TEAL = 'hsl(var(--primary))'

type Tab = ActionTab
const TABS: { key: Tab; label: string; icon: typeof Sparkles }[] = [
  { key: 'echo',   label: 'Echo Picks', icon: Sparkles   },
  { key: 'quick',  label: 'Quick Wins', icon: Zap        },
  { key: 'impact', label: 'Big Impact', icon: TrendingUp },
]

const DIMENSION_LABELS: Record<string, string> = {
  title: 'Title', tags: 'Tags', description: 'Description',
  photos: 'Photos', media: 'Media', materials: 'Materials',
  freshness: 'Freshness', pricing: 'Pricing', returns: 'Returns',
  review_health: 'Reviews',
}

const DIMENSION_COLORS: Record<string, string> = {
  title: 'hsl(var(--primary))', tags: '#f59e0b', description: '#6366f1',
  photos: '#10b981', media: '#10b981', materials: '#ec4899',
  freshness: '#94a3b8', pricing: '#f97316', returns: '#94a3b8',
  review_health: '#f59e0b',
}

export function EchoPicksPanel() {
  const { rows, loading, setRows } = usePendingFixActions()
  const [tab, setTab] = useState<Tab>('echo')
  const [applying, setApplying] = useState<string | null>(null)
  const { toast } = useToast()
  const navigate = useNavigate()

  // Tab logic lives in lib/actionCategories so the dashboard panel and the
  // Fix Actions page can never drift apart (they previously did — Echo Picks
  // and Big Impact showed identical lists for high-severity-heavy accounts).
  const tabbed = useMemo(() => splitTabs(rows, 8), [rows])
  const displayed = tabbed[tab]

  const openListing = (row: FixActionRow) => {
    const id = row.listing?.id ?? row.listing_id
    if (id) navigate(`/app/listings/${id}`)
    else navigate('/app/actions')
  }

  const handleApply = async (row: FixActionRow) => {
    if (row.mode !== 'auto') {
      openListing(row)
      return
    }
    setApplying(row.id)
    try {
      await applyFixAction(row.id)
      setRows(prev => prev.filter(r => r.id !== row.id))
      toast({
        title: 'Fix applied',
        description: row.listing?.title
          ? `${row.listing.title.slice(0, 40)} updated.`
          : 'Listing updated.',
        variant: 'success',
      })
    } catch {
      toast({ title: 'Could not apply fix', variant: 'destructive' })
    } finally {
      setApplying(null)
    }
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-primary" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
            Your path forward
          </h3>
        </div>
        <button
          onClick={() => navigate('/app/actions')}
          className="text-[11px] transition-opacity hover:opacity-80 flex items-center gap-1 text-primary"
        >
          See all <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 pt-2.5 pb-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
              tab === key
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Why-this-tab explanation (Section 4: explain the category itself) */}
      <p className="px-4 pb-1 text-[10px] leading-snug text-muted-foreground/80">
        {TAB_MEANINGS[tab]}
      </p>

      {/* Cards */}
      <div className="px-3 pb-3 pt-1 space-y-2">
        {loading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-xs text-muted-foreground">
              {rows.length === 0
                ? 'Your queue is clear — nothing needs your approval right now. New finds land here after the nightly scan.'
                : tab === 'quick'
                ? 'No one-tap fixes right now — the other tabs have items that need a quick review.'
                : 'Nothing fits this view — peek at the other tabs.'}
            </p>
          </div>
        ) : (
          displayed.map(row => {
            const dimKey = row.dimension?.toLowerCase() ?? ''
            const dimLabel = DIMENSION_LABELS[dimKey] ?? row.dimension ?? 'Fix'
            const dimColor = DIMENSION_COLORS[dimKey] ?? TEAL
            const pts = row.score_delta ?? null
            const isAuto = row.mode === 'auto'
            const busy = applying === row.id

            return (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => openListing(row)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openListing(row) } }}
                className="rounded-lg flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors bg-surface-2 border border-border hover:bg-surface-3 active:scale-[0.99]"
              >
                {/* Thumbnail */}
                <div className="h-8 w-8 rounded-md shrink-0 overflow-hidden flex items-center justify-center mt-0.5 bg-border">
                  {row.listing?.thumbnail_url ? (
                    <img src={row.listing.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">
                    {row.listing?.title ?? 'Listing'}
                  </p>
                  <div className="flex items-start gap-1.5 mt-1 flex-wrap">
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0 rounded shrink-0"
                      style={{ background: `${dimColor}18`, color: dimColor }}
                    >
                      {dimLabel}
                    </span>
                    {row.rationale && (
                      <span className="text-[10px] leading-snug flex-1 min-w-[100px] text-muted-foreground">
                        {row.rationale}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: pts + action */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {pts !== null && pts > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                      +{pts} pts
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleApply(row) }}
                    disabled={busy}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-md transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center gap-1 bg-primary text-primary-foreground"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {busy ? '' : isAuto ? 'Apply →' : 'Review →'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
