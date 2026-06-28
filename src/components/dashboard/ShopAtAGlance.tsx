/**
 * Unified "Shop at a Glance" — merges the compact market score with the shop
 * snapshot KPIs (listings indexed, photo quality, rating, oldest active, avg
 * price). Replaces the standalone CompactMarketScore + LiveSyncPanel snapshot
 * card on the dashboard.
 */
import { Link } from 'react-router-dom'
import {
  TrendingUp, ArrowRight, List, Image as ImageIcon, Star, Clock, DollarSign,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { useApp } from '@/contexts/AppContext'
import { useShopMarketOverview } from '@/hooks/useShopMarketOverview'

const TEAL = 'hsl(var(--primary))'

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

export function ShopAtAGlance() {
  const { syncStats, lastSyncedAt } = useApp()
  const { data: market } = useShopMarketOverview()

  const m = syncStats.media
  const mediaScore = syncStats.listingCount > 0
    ? Math.round(((m.fullPhotos * 0.6 + m.hasVideo * 0.4) / syncStats.listingCount) * 100)
    : 0
  const oldestDays = daysBetween(syncStats.oldestListingAt)

  const score = market && market.scored_listings > 0 ? Math.round(market.avg_market_score) : null
  const scoreColor = score == null
    ? '#64748b'
    : score >= 70 ? '#10b981' : score >= 50 ? TEAL : score >= 30 ? '#f59e0b' : '#ef4444'
  const tags = (market?.top_missing_tags ?? []).slice(0, 2)

  const kpis = [
    {
      key: 'count', icon: List, label: 'Listings Indexed',
      value: syncStats.listingCount.toLocaleString(),
      sub: `${syncStats.activeCount} active`,
    },
    {
      key: 'photos', icon: ImageIcon, label: 'Photo Quality',
      value: `${mediaScore}%`,
      sub: syncStats.listingCount > 0
        ? `${m.fullPhotos} of ${syncStats.listingCount} meet quality threshold`
        : '',
    },
    {
      key: 'rating', icon: Star, label: 'Shop Rating',
      value: syncStats.shopRating != null ? `${syncStats.shopRating.toFixed(2)} ★` : '—',
      sub: syncStats.reviewCount > 0 ? `${syncStats.reviewCount} reviews` : 'No reviews yet',
    },
    {
      key: 'oldest', icon: Clock, label: 'Oldest Active',
      value: syncStats.oldestListingAt ? formatMDY(syncStats.oldestListingAt) : '—',
      sub: oldestDays != null ? `${oldestDays}d ago` : '',
    },
    {
      key: 'price', icon: DollarSign, label: 'Avg Price',
      value: syncStats.avgPrice != null ? `$${syncStats.avgPrice.toFixed(2)}` : '—',
      sub: syncStats.minPrice != null && syncStats.maxPrice != null
        ? `$${syncStats.minPrice.toFixed(2)}–$${syncStats.maxPrice.toFixed(2)}`
        : '',
    },
  ]

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}
    >
      {/* Market score header — clickable */}
      <Link
        to="/app/intelligence"
        className="flex items-center gap-4 p-4 transition-colors hover:bg-white/[0.02] border-b"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[1.5px]"
          style={{ borderColor: scoreColor, background: `${scoreColor}1a` }}
        >
          <span className="text-sm font-bold" style={{ color: scoreColor, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
            {score ?? '—'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5" style={{ color: TEAL }} />
            <p className="text-xs font-semibold text-foreground">Market score</p>
          </div>
          <p className="text-[11px] mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {score == null
              ? 'Awaiting market scoring'
              : tags.length === 0
                ? `${market!.scored_listings} listings vs your niche`
                : <>Top missing tags: <span className="text-foreground font-medium">{tags.join(', ')}</span></>}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
      </Link>

      {/* Snapshot KPI grid */}
      <TooltipProvider delayDuration={100}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4">
          {kpis.map(k => (
            <div
              key={k.key}
              className="rounded-lg border p-3"
              style={{ background: 'hsl(var(--surface-2))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                <k.icon className="h-3 w-3" />
                <span>{k.label}</span>
              </div>
              <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">{k.value}</p>
              {k.sub && <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{k.sub}</p>}
            </div>
          ))}
        </div>
      </TooltipProvider>

      {lastSyncedAt && (
        <p className="px-4 pb-3 text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Last synced {new Date(lastSyncedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
