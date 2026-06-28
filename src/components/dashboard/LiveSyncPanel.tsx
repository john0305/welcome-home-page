import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, List, Star, Clock, Image as ImageIcon, DollarSign, ChevronDown, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { RadarSweep } from './RadarSweep'

function formatMDY(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${mm}/${dd}/${yy}`
}


function daysBetween(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}


/** Tiny count-up that animates whenever the displayed number changes. */
function AnimatedValue({ value }: { value: string | number }) {
  const [pulse, setPulse] = useState(false)
  const prev = useRef(value)
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value
      setPulse(true)
      const t = window.setTimeout(() => setPulse(false), 600)
      return () => window.clearTimeout(t)
    }
  }, [value])
  return (
    <span
      className="tabular-nums inline-block transition-all"
      style={{
        transform: pulse ? 'scale(1.08)' : 'scale(1)',
        color: pulse ? 'hsl(var(--primary))' : '#ffffff',
      }}
    >
      {value}
    </span>
  )
}

/**
 * Shown on the dashboard while we're pulling a user's Etsy listings into our DB.
 * Subscribes to Supabase realtime so KPI cards update the instant rows land,
 * with a radar animation to make the long-running first sync feel alive.
 */
export function LiveSyncPanel() {
  const { isSyncing, syncProgress, syncStats, refreshSyncStats, syncListings, connectedStore, lastSyncedAt } = useApp()
  const { user } = useAuth()

  useEffect(() => { void refreshSyncStats() }, [refreshSyncStats])

  // Realtime: when sync-listings upserts a row, refresh KPIs immediately.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    let cleanup: (() => void) | undefined
    void (async () => {
      const { supabase } = await import('@/integrations/supabase/client')
      const channel = supabase
        .channel(`listings-live-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'listings', filter: `user_id=eq.${user.id}` },
          () => { void refreshSyncStats() }
        )
        .subscribe()
      if (cancelled) {
        void supabase.removeChannel(channel)
      } else {
        cleanup = () => { void supabase.removeChannel(channel) }
      }
    })()
    return () => { cancelled = true; cleanup?.() }
  }, [user?.id, refreshSyncStats])

  if (!connectedStore) return null

  const stage = syncProgress.stage
  const indeterminatePct = Math.min(92, 8 + syncStats.listingCount * 0.5)
  const pct = stage === 'done' ? 100 : isSyncing ? indeterminatePct : (lastSyncedAt ? 100 : 0)

  const oldestDays = daysBetween(syncStats.oldestListingAt)
  const avgDays = syncStats.avgActiveAgeDays


  const m = syncStats.media
  const mediaScore = syncStats.listingCount > 0
    ? Math.round(((m.fullPhotos * 0.6 + m.hasVideo * 0.4) / syncStats.listingCount) * 100)
    : 0
  const kpis = [
    { key: 'count', icon: List, label: 'Listings indexed', value: syncStats.listingCount, sub: `${syncStats.activeCount} active` },
    { key: 'photos', icon: ImageIcon, label: 'Photo Quality Score', value: `${mediaScore}%`, sub: `${syncStats.withPhotosCount}/${syncStats.listingCount} have photos`, info: 'Measures completeness — full 10-photo coverage (60%) plus video presence (40%). High photo count alone is not enough for a high score.' },
    (() => {
      const rating = syncStats.shopRating
      const trend = syncStats.ratingTrend
      const delta = syncStats.ratingDelta
      const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
      const trendColor = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : trend === 'flat' ? 'text-primary' : 'text-muted-foreground'
      const subText = rating == null
        ? 'No reviews synced yet'
        : trend === 'flat'
          ? `Stable · ${syncStats.reviewCount} reviews`
          : trend && delta != null && delta !== 0
            ? `${delta > 0 ? '+' : ''}${delta.toFixed(2)} vs last sync · ${syncStats.reviewCount} reviews`
            : `${syncStats.reviewCount} reviews`
      return {
        key: 'rating',
        icon: Star,
        label: 'Shop rating',
        value: rating != null ? `${rating.toFixed(2)} ★` : '—',
        sub: subText,
        trendIcon: rating != null && trend ? TrendIcon : null,
        trendColor,
      }
    })(),
    {
      key: 'oldest',
      icon: Clock,
      label: 'Oldest active listing',
      value: syncStats.oldestListingAt ? formatMDY(syncStats.oldestListingAt) : '—',
      sub: oldestDays != null ? `${oldestDays}d ago${avgDays != null ? ` · avg ${avgDays}d across active` : ''}` : '',
    },

    {
      key: 'price',
      icon: DollarSign,
      label: 'Avg price',
      value: syncStats.avgPrice != null ? `$${syncStats.avgPrice.toFixed(2)}` : '—',
      sub: syncStats.minPrice != null && syncStats.maxPrice != null
        ? `Range $${syncStats.minPrice.toFixed(2)}–$${syncStats.maxPrice.toFixed(2)}`
        : '',
    },
  ]

  const [openKey, setOpenKey] = useState<string | null>(null)

  const renderBreakdown = (key: string) => {
    if (key !== 'photos') return null
    const rows: Array<{ label: string; value: number; tone: string }> = [
      { label: 'Missing all photos (0)', value: m.missingPhotos, tone: m.missingPhotos === 0 ? 'text-emerald-400' : 'text-red-400' },
      { label: 'Few photos (1–4)', value: m.fewPhotos, tone: 'text-amber-300' },
      { label: 'Under max (5–9)', value: m.underTenPhotos, tone: 'text-amber-200' },
      { label: 'Full 10 photos', value: m.fullPhotos, tone: 'text-emerald-400' },
      { label: 'Missing video', value: m.missingVideo, tone: m.missingVideo === 0 ? 'text-emerald-400' : 'text-red-400' },
      { label: 'Has a video', value: m.hasVideo, tone: 'text-emerald-400' },
      { label: 'Fully optimized (10 photos + video)', value: m.fullMediaCount, tone: 'text-primary' },
    ]
    return (
      <div className="mt-3 rounded-md border border-white/10 bg-black/30 p-3 space-y-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={`font-semibold tabular-nums ${r.tone}`}>{r.value}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <Card className="border-primary/30" style={{ background: 'linear-gradient(180deg, hsl(var(--primary) / 0.06) 0%, hsl(var(--primary) / 0.02) 100%)' }}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {isSyncing ? (
              <RadarSweep size={64} active />
            ) : stage === 'error' ? (
              <AlertTriangle className="h-8 w-8 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {isSyncing
                  ? 'Scanning your Etsy shop…'
                  : stage === 'done'
                    ? 'Shop synced'
                    : stage === 'error'
                      ? 'Sync hit a snag'
                      : lastSyncedAt
                        ? 'Shop snapshot'
                        : 'Your shop is on Radar'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {syncProgress.message
                  || (lastSyncedAt
                    ? `Auto-synced nightly · last refresh ${new Date(lastSyncedAt).toLocaleTimeString()}.`
                    : 'We auto-sync your listings every night — titles, tags, photos, and prices stay current with no action needed.')}
              </p>
            </div>
          </div>
          {!isSyncing && stage === 'error' && (
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/app/connect-etsy"
                className="text-xs font-semibold px-3 py-1.5 rounded-md border border-amber-400/40 text-amber-300 hover:bg-amber-400/10"
              >
                Fix credentials
              </Link>
            </div>
          )}

        </div>

        {stage === 'error' && syncProgress.message && (
          <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200 leading-relaxed">
            {syncProgress.message}
          </div>
        )}

        {(isSyncing || stage === 'done') && (
          <Progress value={pct} className="h-1.5" />
        )}


        <TooltipProvider delayDuration={100}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {kpis.map(k => {
            const clickable = k.key === 'photos'
            const isOpen = openKey === k.key
            const info = (k as { info?: string }).info
            return (
              <button
                type="button"
                key={k.key}
                onClick={() => clickable && setOpenKey(isOpen ? null : k.key)}
                className={`text-left rounded-lg border p-3 transition-all ${clickable ? 'cursor-pointer hover:border-primary/40' : 'cursor-default'} ${isOpen ? 'border-primary/50' : 'border-white/5'}`}
                style={{ background: 'hsl(var(--surface-2))' }}
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <k.icon className="h-3 w-3" />
                  <span>{k.label}</span>
                  {info && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span onClick={e => e.stopPropagation()} className="inline-flex">
                          <Info className="h-3 w-3 opacity-60 hover:opacity-100" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">{info}</TooltipContent>
                    </Tooltip>
                  )}
                  {clickable && <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                </div>
                <p className="mt-1 text-lg font-semibold flex items-center gap-1.5">
                  <AnimatedValue value={k.value} />
                  {'trendIcon' in k && k.trendIcon && (
                    <k.trendIcon className={`h-4 w-4 ${(k as { trendColor?: string }).trendColor ?? ''}`} />
                  )}
                </p>
                {k.sub && <p className="text-[10px] text-muted-foreground">{k.sub}</p>}
              </button>
            )
          })}
        </div>
        </TooltipProvider>


        {openKey && renderBreakdown(openKey)}
      </CardContent>
    </Card>
  )
}
