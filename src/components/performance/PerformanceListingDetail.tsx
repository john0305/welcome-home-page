import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { confidenceFor, formatPct, formatDelta, daysUntilWindow } from '@/lib/attribution'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export function PerformanceListingDetail({
  attribution, listing, allWindows, onClose,
}: {
  attribution: any
  listing: { id: string; title: string; thumbnail_url: string | null } | null
  allWindows: any[]
  onClose: () => void
}) {
  const [opt, setOpt] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [snaps, setSnaps] = useState<any[]>([])
  const [showDebug, setShowDebug] = useState(false)
  const [activeAttribution, setActiveAttribution] = useState<any>(attribution)

  useEffect(() => {
    setActiveAttribution(attribution)
  }, [attribution])

  useEffect(() => {
    void (async () => {
      const [o, v, s] = await Promise.all([
        supabase.from('optimizations').select('*').eq('id', attribution.optimization_id).maybeSingle(),
        supabase.from('listing_versions').select('*').eq('listing_id', attribution.listing_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('listing_snapshots').select('*').eq('listing_id', attribution.listing_id).order('recorded_on', { ascending: true }),
      ])
      setOpt(o.data); setVersion(v.data); setSnaps(s.data ?? [])
    })()
  }, [attribution])

  const confidence = confidenceFor({
    windowDays: activeAttribution.window_days,
    isSufficient: activeAttribution.is_sufficient_data,
    preViews: activeAttribution.pre_views ?? 0,
  })

  const fieldsChanged: string[] = []
  if (opt) {
    if (opt.optimized_title && opt.optimized_title !== opt.original_title) fieldsChanged.push('Title')
    if (opt.optimized_description && opt.optimized_description !== opt.original_description) fieldsChanged.push('Description')
    if (opt.optimized_tags) fieldsChanged.push('Tags')
    if (opt.optimized_materials) fieldsChanged.push('Materials')
  }

  // Deduplicate windows by window_days, preferring sufficient data, else most recent
  const uniqueWindows = Object.values(
    allWindows.reduce((acc: Record<number, any>, w) => {
      const existing = acc[w.window_days]
      const isBetter = !existing
        || (w.is_sufficient_data && !existing.is_sufficient_data)
        || (w.is_sufficient_data === existing.is_sufficient_data
            && new Date(w.optimized_at).getTime() > new Date(existing.optimized_at).getTime())
      if (isBetter) acc[w.window_days] = w
      return acc
    }, {})
  ).sort((a: any, b: any) => a.window_days - b.window_days)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto px-4 sm:px-6">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3 pr-6">
            {listing?.thumbnail_url && <img src={listing.thumbnail_url} alt="" className="h-10 w-10 rounded object-cover shrink-0" />}
            <span className="flex-1 min-w-0 text-sm sm:text-base leading-snug break-words line-clamp-2">{listing?.title ?? 'Listing'}</span>
            <Badge variant={confidence === 'high' ? 'default' : confidence === 'medium' ? 'secondary' : 'outline'} className="shrink-0 text-[10px]">
              {confidence}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Window selector — horizontally scrollable pill row on mobile */}
        <div className="-mx-1 overflow-x-auto scrollbar-thin">
          <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1 gap-1 mx-1 whitespace-nowrap">
            {uniqueWindows.map((w: any) => {
              const active = w.id === activeAttribution.id
              const ready = w.is_sufficient_data
              const daysLeft = ready ? 0 : daysUntilWindow(w.optimized_at, w.window_days)
              return (
                <button
                  key={w.id}
                  onClick={() => setActiveAttribution(w)}
                  title={ready ? `${w.window_days}-day window — ready` : `${w.window_days}-day window — ${daysLeft}d left`}
                  className={`shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {w.window_days}d {ready ? '✓' : `· ${daysLeft}d`}
                </button>
              )
            })}
          </div>
        </div>

        {/* Metrics */}
        {activeAttribution.is_sufficient_data ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricBox label="Views" pre={activeAttribution.pre_views} post={activeAttribution.post_views} pct={activeAttribution.views_pct} />
            <MetricBox label="Favorites" pre={activeAttribution.pre_favorites} post={activeAttribution.post_favorites} pct={activeAttribution.favorites_pct} />
            <MetricBox label="Sales" pre={activeAttribution.pre_sales} post={activeAttribution.post_sales} pct={activeAttribution.sales_pct} />
            <MetricBox label="Score" pre={activeAttribution.pre_score} post={activeAttribution.post_score} pct={null} delta={activeAttribution.score_delta} />
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-300">
            Data pending — check back in {daysUntilWindow(activeAttribution.optimized_at, activeAttribution.window_days)} days for the {activeAttribution.window_days}-day window.
          </div>
        )}

        {/* Fields changed */}
        {fieldsChanged.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Fields changed</p>
            <div className="flex gap-1 flex-wrap">
              {fieldsChanged.map(f => <Badge key={f} variant="outline" className="text-xs">{f}</Badge>)}
            </div>
          </div>
        )}

        {/* Stacked on mobile, side-by-side on sm+ */}
        {opt && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 min-w-0">
              <p className="text-xs uppercase text-muted-foreground">Original</p>
              <div className="rounded border p-3 text-sm space-y-2 min-w-0">
                <p className="font-medium break-words">{opt.original_title}</p>
                <p className="text-muted-foreground text-xs whitespace-pre-wrap line-clamp-6 break-words">{opt.original_description}</p>
                <div className="flex gap-1 flex-wrap">
                  {(opt.original_tags ?? []).map((t: string) => <Badge key={t} variant="outline" className="text-xs max-w-full break-words">{t}</Badge>)}
                </div>
              </div>
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-xs uppercase text-primary">Optimized</p>
              <div className="rounded border border-primary/30 bg-primary/5 p-3 text-sm space-y-2 min-w-0">
                <p className="font-medium break-words">{opt.optimized_title}</p>
                <p className="text-muted-foreground text-xs whitespace-pre-wrap line-clamp-6 break-words">{opt.optimized_description}</p>
                <div className="flex gap-1 flex-wrap">
                  {(opt.optimized_tags ?? []).map((t: string) => <Badge key={t} variant="outline" className="text-xs max-w-full break-words">{t}</Badge>)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Timeline chart */}
        {snaps.length > 1 && (
          <div className="min-w-0">
            <p className="text-sm font-medium mb-2">Timeline</p>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snaps}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="recorded_on" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={<ChartTooltip />}
                    animationDuration={200}
                    animationEasing="ease-out"
                  />
                  <Line type="monotone" dataKey="views" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="favorites" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}


        {/* Debug */}
        <div className="border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => setShowDebug(s => !s)} className="text-xs">
            {showDebug ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
            Debug — raw API values
          </Button>
          {showDebug && (
            <pre className="mt-2 p-2 rounded bg-muted text-[10px] overflow-x-auto">
              {JSON.stringify({ attribution: activeAttribution, snaps_count: snaps.length, last_snap: snaps[snaps.length - 1] }, null, 2)}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MetricBox({ label, pre, post, pct, delta }: { label: string; pre: any; post: any; pct: number | null; delta?: number | null }) {
  const display = pct != null ? formatPct(pct) : (delta != null ? formatDelta(delta) : '—')
  const positive = (pct ?? delta ?? 0) > 0
  return (
    <div className="rounded border p-3">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${positive ? 'text-emerald-400' : ''}`}>{display}</p>
      <p className="text-[10px] text-muted-foreground">{pre ?? 0} → {post ?? 0}</p>
    </div>
  )
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg animate-fade-in">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="text-xs font-medium" style={{ color: entry.color }}>
          {entry.name ?? entry.dataKey}: {entry.value}
        </p>
      ))}
    </div>
  )
}
