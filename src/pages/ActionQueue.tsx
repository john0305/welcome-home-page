import { useMemo, useState } from 'react'
import { ShieldCheck, Loader2, ChevronDown, Check, CheckCircle2, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageContainer } from '@/components/layout/PageContainer'
import { FixActionCard } from '@/components/actions/FixActionCard'
import { MostExpensiveList } from '@/components/actions/MostExpensiveList'
import { usePendingFixActions, useTodaySummary, applyFixAction, type FixActionRow } from '@/hooks/useFixActions'
import { getFactorMeta, humanizeFactorKey } from '@/lib/etsyRankingFactors'
import { useToast } from '@/hooks/use-toast'
import {
  SHOP_HEALTH_CATEGORIES,
  isShopHealthAction,
  categorizeAction,
  highestSeverity,
  type ShopHealthCategoryId,
} from '@/lib/shopHealthCategories'
import { cn } from '@/lib/utils'

type TabKey = 'all' | 'echo' | 'high_impact' | 'quick_wins' | 'expensive'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'echo',        label: 'Echo Picks' },
  { key: 'high_impact', label: 'High Impact' },
  { key: 'quick_wins',  label: 'Quick Wins' },
  { key: 'expensive',   label: 'Most Expensive' },
  { key: 'all',         label: 'All Fixes' },
]

const SEVERITY_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  critical: { bg: 'bg-red-500/15', fg: 'text-red-400', label: 'Critical' },
  high:     { bg: 'bg-amber-500/15', fg: 'text-amber-400', label: 'High' },
  medium:   { bg: 'bg-primary/15', fg: 'text-primary', label: 'Medium' },
  low:      { bg: 'bg-slate-500/15', fg: 'text-muted-foreground', label: 'Low' },
}

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }

export default function ActionQueue() {
  const { rows, loading, refresh, setRows } = usePendingFixActions()
  const summary = useTodaySummary()
  const { toast } = useToast()

  const [tab, setTab] = useState<TabKey>('echo')
  const [expanded, setExpanded] = useState<ShopHealthCategoryId | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; failed: number } | null>(null)

  // Only structural issues belong in the category grid.
  const shopHealthRows = useMemo(() => rows.filter(isShopHealthAction), [rows])

  // Filtered list for non-"all" tabs.
  const tabRows = useMemo<FixActionRow[]>(() => {
    if (tab === 'all') return []
    if (tab === 'echo') {
      // Echo Picks = curated, max 10. Prefer rows tagged with an echo source,
      // otherwise fall back to top-severity items so the tab is never empty
      // for users whose first scan hasn't tagged sources yet.
      const tagged = rows.filter(r => (r.source ?? '').toLowerCase().includes('echo'))
      const pool = tagged.length > 0 ? tagged : [...rows].sort(
        (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
      )
      return pool.slice(0, 10)
    }
    if (tab === 'high_impact') {
      return [...rows]
        .filter(r => r.severity === 'critical' || r.severity === 'high')
        .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0))
    }
    if (tab === 'quick_wins') {
      // Auto-apply + single field changes / tag fills.
      return rows.filter(r => r.mode === 'auto')
    }
    // 'expensive' — requires per-listing renewal data not present on fix_actions row.
    return []
  }, [rows, tab])

  const byCategory = useMemo(() => {
    const map = new Map<ShopHealthCategoryId, FixActionRow[]>()
    for (const r of shopHealthRows) {
      const c = categorizeAction(r)
      if (!c) continue
      if (!map.has(c)) map.set(c, [])
      map.get(c)!.push(r)
    }
    return map
  }, [shopHealthRows])

  const expandedRows = expanded ? (byCategory.get(expanded) ?? []) : []

  const applyAllInCategory = async () => {
    const autoRows = expandedRows.filter(r => r.mode === 'auto')
    if (autoRows.length === 0) return
    setConfirming(false)
    setBulkBusy(true)
    setBulkProgress({ done: 0, total: autoRows.length, failed: 0 })
    let ok = 0, fail = 0
    for (const r of autoRows) {
      try {
        const res = await applyFixAction(r.id)
        if (res.ok) {
          ok += 1
          setRows(prev => prev.filter(x => x.id !== r.id))
        } else { fail += 1 }
      } catch { fail += 1 }
      setBulkProgress({ done: ok + fail, total: autoRows.length, failed: fail })
    }
    if (fail === 0) toast({ title: `${ok} fix${ok === 1 ? '' : 'es'} applied ✓` })
    else toast({ title: `${ok} applied, ${fail} need attention`, variant: 'destructive' })
    await refresh()
    setBulkBusy(false)
    setTimeout(() => setBulkProgress(null), 2500)
  }

  return (
    <PageContainer>
      <div className="space-y-6 pb-12">
        <header className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
              Shop Health
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Structural issues — things that are missing or broken on your shop. Fix once and move on.
            </p>
          </div>
        </header>

        {/* Tabs — sticky so they stay thumb-reachable on mobile */}
        <div
          className="sticky top-[44px] z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 border-b border-white/5 backdrop-blur"
          style={{ background: 'rgba(3,13,13,0.92)' }}
        >
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setExpanded(null); setConfirming(false) }}
                className={cn(
                  'shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  tab === t.key
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-2/60',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tab === 'all' ? (
          // ── "All" tab: keep the original Shop Health category grid ──
          shopHealthRows.length === 0 ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
              <p className="text-base font-semibold text-foreground">Your shop is structurally healthy 🎉</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No missing icon, banner, policies, or empty fields. Head over to{' '}
                <a href="/app/listings" className="text-primary hover:underline">Listings</a> to keep optimizing.
              </p>
            </div>
          ) : (
            <>
              {(() => {
                const sorted = [...SHOP_HEALTH_CATEGORIES]
                  .map(cat => ({ cat, items: byCategory.get(cat.id) ?? [] }))
                  .sort((a, b) => b.items.length - a.items.length)
                const active = sorted.filter(s => s.items.length > 0)
                const clear = sorted.filter(s => s.items.length === 0)
                return (
                  <>
                    {active.length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {active.map(({ cat, items }) => {
                          const count = items.length
                          const sev = highestSeverity(items)
                          const sevStyle = SEVERITY_STYLES[sev] ?? SEVERITY_STYLES.low
                          const isOpen = expanded === cat.id
                          return (
                            <button
                              key={cat.id}
                              onClick={() => { setExpanded(isOpen ? null : cat.id); setConfirming(false) }}
                              className={cn(
                                'group rounded-xl border p-4 text-left transition-all',
                                isOpen
                                  ? 'border-primary bg-primary/8 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]'
                                  : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <cat.icon className={cn('h-5 w-5', isOpen ? 'text-primary' : 'text-muted-foreground')} />
                                <Badge className={`${sevStyle.bg} ${sevStyle.fg} border-transparent text-[10px] uppercase`}>
                                  {sevStyle.label}
                                </Badge>
                              </div>
                              <p className="mt-3 text-sm font-semibold text-foreground">{cat.label}</p>
                              <p className="text-[11px] text-muted-foreground/60">{cat.description}</p>
                              <div className="mt-3 flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">
                                  {count} issue{count === 1 ? '' : 's'}
                                </span>
                                <span className={cn('text-xs font-medium', isOpen ? 'text-primary' : 'text-foreground/80 group-hover:text-primary')}>
                                  {isOpen ? 'Hide' : 'Fix all →'}
                                </span>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {clear.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {clear.map(({ cat }) => (
                          <div
                            key={cat.id}
                            className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.01] px-3 py-1.5"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80 shrink-0" />
                            <span className="text-xs font-medium text-foreground/80">{cat.label}</span>
                            <span className="text-[11px] text-muted-foreground/60">All clear</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}

              {expanded && expandedRows.length > 0 && (
                <section className="rounded-xl border border-white/10 bg-white/[0.015] p-4 animate-fade-in mt-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ChevronDown className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold text-foreground">
                        {SHOP_HEALTH_CATEGORIES.find(c => c.id === expanded)?.label}
                        <Badge variant="outline" className="ml-2 text-[10px]">{expandedRows.length}</Badge>
                      </p>
                    </div>
                    {expandedRows.some(r => r.mode === 'auto') && !confirming && (
                      <Button size="sm" onClick={() => setConfirming(true)} disabled={bulkBusy} className="h-7 text-xs">
                        {bulkBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                        Apply all in this category
                      </Button>
                    )}
                  </div>
                  {confirming && (
                    <ConfirmationPanel
                      rows={expandedRows.filter(r => r.mode === 'auto')}
                      onConfirm={applyAllInCategory}
                      onCancel={() => setConfirming(false)}
                    />
                  )}
                  {bulkProgress && (
                    <p className="mb-3 text-xs text-primary">
                      {bulkProgress.done < bulkProgress.total
                        ? `Applying ${bulkProgress.done + 1} of ${bulkProgress.total}…`
                        : `Done — ${bulkProgress.done - bulkProgress.failed} applied${bulkProgress.failed ? `, ${bulkProgress.failed} need attention` : ''}.`}
                    </p>
                  )}
                  <div className="space-y-2">
                    {expandedRows.map(r => (
                      <FixActionCard key={r.id} row={r} onChange={() => refresh()} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )
        ) : (
          // ── Filtered tabs ──
          <TabResults
            tab={tab}
            rows={tabRows}
            onChanged={refresh}
            onBulkApply={async (rows) => {
              if (rows.length === 0) return
              setBulkBusy(true)
              setBulkProgress({ done: 0, total: rows.length, failed: 0 })
              let ok = 0, fail = 0
              for (const r of rows) {
                try {
                  const res = await applyFixAction(r.id)
                  if (res.ok) { ok += 1; setRows(prev => prev.filter(x => x.id !== r.id)) }
                  else { fail += 1 }
                } catch { fail += 1 }
                setBulkProgress({ done: ok + fail, total: rows.length, failed: fail })
              }
              if (fail === 0) toast({ title: `${ok} fix${ok === 1 ? '' : 'es'} applied ✓` })
              else toast({ title: `${ok} applied, ${fail} need attention`, variant: 'destructive' })
              await refresh()
              setBulkBusy(false)
              setTimeout(() => setBulkProgress(null), 2500)
            }}
            bulkBusy={bulkBusy}
            bulkProgress={bulkProgress}
          />
        )}

        {/* Fixed-this-week footer */}
        <FixedThisWeek summary={summary} />
      </div>
    </PageContainer>
  )
}

function ConfirmationPanel({
  rows, onConfirm, onCancel,
}: { rows: FixActionRow[]; onConfirm: () => void; onCancel: () => void }) {
  // Summarize changes by factor for a friendlier preview.
  const byFactor = new Map<string, number>()
  for (const r of rows) byFactor.set(r.factor_key, (byFactor.get(r.factor_key) ?? 0) + 1)
  const labelFor = (k: string) => {
    switch (k) {
      case 'tags_complete': return 'Add tags to'
      case 'materials_present': return 'Fill materials on'
      case 'title_length': return 'Update titles on'
      case 'return_policy_present': return 'Add return policy on'
      case 'market_title_length': return 'Lengthen titles on'
      case 'market_tag_gap': return 'Add missing tags to'
      case 'market_price_position': return 'Review price on'
      case 'market_photo_gap': return 'Add more photos to'
      default: {
        const meta = getFactorMeta(k)
        return `${meta?.label ?? humanizeFactorKey(k)} on`
      }
    }
  }
  return (
    <div className="mb-3 rounded-lg border border-primary/40 bg-primary/8 p-3 animate-accordion-down">
      <p className="text-sm font-semibold text-foreground">
        About to apply {rows.length} change{rows.length === 1 ? '' : 's'} to your Etsy listings:
      </p>
      <ul className="mt-2 space-y-0.5 text-xs text-foreground/80">
        {Array.from(byFactor.entries()).map(([k, n]) => (
          <li key={k}>• {labelFor(k)} {n} listing{n === 1 ? '' : 's'}</li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        These changes go live on Etsy immediately. You can revert any change from the listing detail.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={onConfirm} className="h-7 text-xs">
          <Check className="h-3 w-3 mr-1" />
          Apply {rows.length} change{rows.length === 1 ? '' : 's'} →
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 text-xs">Cancel</Button>
      </div>
    </div>
  )
}

function FixedThisWeek({ summary }: { summary: { auto_applied: number } | null }) {
  const [open, setOpen] = useState(false)
  const count = summary?.auto_applied ?? 0
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.015] p-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <p className="text-sm font-medium text-foreground">
            Fixed recently <span className="text-muted-foreground font-normal">— {count} issue{count === 1 ? '' : 's'} resolved</span>
          </p>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <p className="mt-3 text-xs text-muted-foreground/60">
          {count === 0
            ? 'Nothing applied yet. Auto-apply can resolve safe fixes overnight — enable it in Settings.'
            : 'History view coming soon.'}
        </p>
      )}
    </section>
  )
}

function TabResults({
  tab, rows, onChanged, onBulkApply, bulkBusy, bulkProgress,
}: {
  tab: TabKey
  rows: FixActionRow[]
  onChanged: () => void
  onBulkApply: (rows: FixActionRow[]) => Promise<void>
  bulkBusy: boolean
  bulkProgress: { done: number; total: number; failed: number } | null
}) {
  if (tab === 'expensive') {
    return <MostExpensiveList />
  }
  if (rows.length === 0) {
    const copy: Record<TabKey, { title: string; body: string }> = {
      all:         { title: 'Nothing here', body: '' },
      echo:        { title: 'Echo is building your picks', body: "Check back after tonight's scan — Echo curates priority fixes once a day." },
      high_impact: { title: 'No high-impact fixes pending', body: 'Try Quick Wins or All Fixes.' },
      quick_wins:  { title: 'No quick wins available', body: 'Single-click auto-fixes will show up here when found.' },
      expensive:   { title: '', body: '' },
    }
    const c = copy[tab]
    return <EmptyTab title={c.title} body={c.body} />
  }
  const autoRows = rows.filter(r => r.mode === 'auto')
  return (
    <div className="space-y-2">
      {tab === 'quick_wins' && autoRows.length > 0 && (
        <div
          className="sticky top-[92px] z-10 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-1 px-3 py-2"
          style={{ borderColor: 'hsl(var(--primary) / 0.25)' }}
        >
          <div className="flex items-center gap-2">
            <Badge className="bg-primary/15 text-primary border-transparent">{autoRows.length}</Badge>
            <p className="text-xs text-foreground/80">single-field fixes ready</p>
          </div>
          <Button
            size="sm"
            onClick={() => onBulkApply(autoRows)}
            disabled={bulkBusy}
            className="h-7 text-xs"
          >
            {bulkBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
            Apply all Quick Wins
          </Button>
        </div>
      )}
      {bulkProgress && (
        <p className="text-xs text-primary px-1">
          {bulkProgress.done < bulkProgress.total
            ? `Applying ${bulkProgress.done + 1} of ${bulkProgress.total}…`
            : `Done — ${bulkProgress.done - bulkProgress.failed} applied${bulkProgress.failed ? `, ${bulkProgress.failed} need attention` : ''}.`}
        </p>
      )}
      {tab === 'echo' && (
        <p className="px-1 text-[11px] text-muted-foreground/60">
          Curated by Echo — top {rows.length} fix{rows.length === 1 ? '' : 'es'} for your store right now.
        </p>
      )}
      {rows.map(r => (
        <FixActionCard key={r.id} row={r} onChange={onChanged} />
      ))}
    </div>
  )
}

function EmptyTab({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
      <Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {body && <p className="mt-1 text-xs text-muted-foreground">{body}</p>}
    </div>
  )
}

