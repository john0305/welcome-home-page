import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, ExternalLink, ChevronDown, ChevronRight, RefreshCw, Undo2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  useSanityFlags, runSanityCheck, FLAG_TYPE_LABEL, type SanityFlag, type SanityFlagType, type SanityFlagStatus,
} from '@/hooks/useSanityFlags'

const TYPE_ORDER: SanityFlagType[] = ['placeholder', 'price_outlier', 'internal_note', 'profanity', 'text_mismatch']

type TabKey = 'active' | 'resolved' | 'dismissed'

export function SanityCheckPanel() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [tab, setTab] = useState<TabKey>('active')

  const activeQ = useSanityFlags('active')
  const resolvedQ = useSanityFlags('resolved')
  const dismissedQ = useSanityFlags(['dismissed', 'ignored_permanently'])

  const current = tab === 'active' ? activeQ : tab === 'resolved' ? resolvedQ : dismissedQ

  const [running, setRunning] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const grouped = useMemo(() => {
    const map = new Map<SanityFlagType, SanityFlag[]>()
    for (const f of current.flags) {
      if (!map.has(f.flag_type)) map.set(f.flag_type, [])
      map.get(f.flag_type)!.push(f)
    }
    return TYPE_ORDER
      .filter((t) => map.has(t))
      .map((t) => [t, map.get(t)!] as const)
  }, [current.flags])

  const handleScan = async () => {
    setRunning(true)
    setScanMessage('Starting scan…')
    try {
      const r = await runSanityCheck('all', setScanMessage)
      const message = `${r.scanned} listings scanned · ${r.inserted} new flags · ${r.resolved} resolved`
      setScanMessage(message)
      toast({ title: 'Sanity check complete', description: message })
      await Promise.all([activeQ.reload(), resolvedQ.reload(), dismissedQ.reload()])
    } catch (e) {
      const message = (e as Error).message || 'The sanity check could not be started.'
      setScanMessage(`Scan failed: ${message}`)
      toast({ title: 'Scan failed', description: message, variant: 'destructive' })
    } finally { setRunning(false) }
  }

  const restoreToActive = async (id: string) => {
    await current.updateStatus(id, 'active')
    await activeQ.reload()
    toast({ title: 'Restored', description: 'Flag moved back to Active.' })
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Sanity Check
            {activeQ.flags.length > 0 && <Badge className="h-4 px-1.5 text-[10px]">{activeQ.flags.length}</Badge>}
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">Quick check for things that look unintentional — placeholders, internal notes, price typos, mismatched copy.</p>
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={handleScan} disabled={running} aria-busy={running}>
          <RefreshCw className={cn('h-3 w-3 mr-1', running && 'animate-spin')} />
          {running ? 'Scanning…' : 'Run now'}
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {scanMessage && (
          <p className="mb-2 text-xs text-muted-foreground" role="status">{scanMessage}</p>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
          <TabsList className="h-9 w-full justify-start gap-1 p-1 mb-2 border border-border bg-surface-2">
            <TabsTrigger value="active" className="text-xs h-7 px-3 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300 text-muted-foreground">
              Active ({activeQ.flags.length})
            </TabsTrigger>
            <TabsTrigger value="resolved" className="text-xs h-7 px-3 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300 text-muted-foreground">
              Resolved ({resolvedQ.flags.length})
            </TabsTrigger>
            <TabsTrigger value="dismissed" className="text-xs h-7 px-3 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300 text-muted-foreground">
              Dismissed ({dismissedQ.flags.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-3">
            {current.loading ? (
              <p className="text-xs text-muted-foreground/60 italic">Loading…</p>
            ) : current.flags.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {tab === 'active' && 'Nothing to flag right now. Your listings look clean.'}
                {tab === 'resolved' && 'No resolved flags yet. When you fix a flagged issue, it will show up here after the next scan.'}
                {tab === 'dismissed' && 'No dismissed flags. Anything you dismiss or mark as intentional will appear here.'}
              </p>
            ) : (
              <div className="space-y-2">
                {grouped.map(([type, items]) => {
                  const isOpen = open[`${tab}:${type}`] ?? true
                  return (
                    <div key={type} className="rounded-lg border border-border bg-surface-2">
                      <button
                        type="button"
                        onClick={() => setOpen((p) => ({ ...p, [`${tab}:${type}`]: !isOpen }))}
                        className="w-full flex items-center justify-between px-3 py-2 text-left"
                      >
                        <span className="text-[12px] font-medium text-foreground flex items-center gap-2">
                          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {FLAG_TYPE_LABEL[type]}
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{items.length}</Badge>
                        </span>
                      </button>
                      {isOpen && (
                        <div className="px-2 pb-2 space-y-2">
                          {items.map((f) => (
                            <FlagItem
                              key={f.id}
                              flag={f}
                              tab={tab}
                              onView={() => navigate(`/app/listings/${f.internal_listing_id}`)}
                              onDismiss={() => current.updateStatus(f.id, 'dismissed')}
                              onIgnore={() => current.updateStatus(f.id, 'ignored_permanently')}
                              onRestore={() => restoreToActive(f.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function statusLabel(s: SanityFlagStatus): string {
  if (s === 'resolved') return 'Resolved by rescan'
  if (s === 'dismissed') return 'Dismissed'
  if (s === 'ignored_permanently') return 'Marked as intentional'
  return ''
}

function FlagItem({ flag, tab, onView, onDismiss, onIgnore, onRestore }: {
  flag: SanityFlag; tab: TabKey; onView: () => void; onDismiss: () => void; onIgnore: () => void; onRestore: () => void;
}) {
  const isHistory = tab !== 'active'
  return (
    <div className="rounded-md border border-border bg-surface-1 p-2.5 flex gap-3">
      {flag.listing?.thumbnail_url ? (
        <img src={flag.listing.thumbnail_url} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" />
      ) : (
        <div className="h-10 w-10 rounded bg-surface-2 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-foreground truncate">{flag.listing?.title ?? 'Listing'}</p>
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mt-0.5">{flag.field}</p>
        <p className="text-[11px] text-amber-300 mt-1 italic">"{flag.flagged_text}"</p>
        <p className="text-[11px] text-muted-foreground mt-1">{flag.detail}</p>
        {isHistory && (
          <p className="text-[10px] text-muted-foreground/60 mt-1">{statusLabel(flag.status)}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-2">
          <Button size="sm" variant="secondary" className="h-6 px-2 text-[10px]" onClick={onView}>View listing</Button>
          {flag.listing?.etsy_listing_id && (
            <a href={`https://www.etsy.com/listing/${flag.listing.etsy_listing_id}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 h-6 px-2 text-[10px] rounded border border-border text-muted-foreground hover:bg-surface-2">
              Etsy <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          {tab === 'active' ? (
            <>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={onDismiss}>Dismiss</Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={onIgnore}>Mark as intentional</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={onRestore}>
              <Undo2 className="h-3 w-3 mr-1" /> Undo
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
