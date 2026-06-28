import { Link } from 'react-router-dom'
import { TrendingUp, ArrowRight } from 'lucide-react'
import { useShopMarketOverview } from '@/hooks/useShopMarketOverview'

export function CompactMarketScore() {
  const { data, isLoading } = useShopMarketOverview()
  if (isLoading || !data || data.scored_listings === 0) return null

  const tags = (data.top_missing_tags ?? []).slice(0, 2)
  const score = Math.round(data.avg_market_score)
  const scoreColor =
    score >= 70 ? '#10b981' : score >= 50 ? 'hsl(var(--primary))' : score >= 30 ? '#f59e0b' : '#ef4444'

  return (
    <Link
      to="/app/intelligence"
      className="block rounded-xl border border-border bg-surface-1 p-4 transition-colors hover:border-primary/30 hover:bg-surface-2"
    >
      <div className="flex items-center gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[1.5px]"
          style={{ borderColor: scoreColor, background: `${scoreColor}1a` }}
        >
          <span className="text-sm font-bold" style={{ color: scoreColor }}>{score}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold text-foreground">Market score</p>
          </div>
          <p className="text-[11px] mt-1 text-muted-foreground">
            {tags.length === 0
              ? `${data.scored_listings} listings vs your niche`
              : <>Top missing tags: <span className="text-foreground font-medium">{tags.join(', ')}</span></>}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
      </div>
    </Link>
  )
}
