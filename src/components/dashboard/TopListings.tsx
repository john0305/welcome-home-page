import { useNavigate } from 'react-router-dom'
import { TrendingUp, ShoppingBag, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GradeBadge } from '@/components/listings/GradeBadge'
import { Badge } from '@/components/ui/badge'
import { formatNumber } from '@/lib/utils'
import type { DashboardListingRow } from '@/types'

function engagementScore(l: DashboardListingRow): number {
  return (l.views ?? 0) + (l.favorites ?? 0) * 8 + (l.sales_count ?? 0) * 50
}

interface Props {
  rows: DashboardListingRow[]
}

export function TopListings({ rows }: Props) {
  const navigate = useNavigate()

  const top = [...rows]
    .filter(l => l.state === 'active')
    .sort((a, b) => engagementScore(b) - engagementScore(a))
    .slice(0, 5)

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Top Performing Listings
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 gap-1"
          onClick={() => navigate('/app/listings', { state: { fromLabel: 'Dashboard' } })}
        >
          View all <ArrowRight className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {top.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-4">No listings synced yet</p>
        ) : (
          top.map((listing: DashboardListingRow) => (
            <button
              key={listing.id}
              className="flex w-full items-center gap-3 rounded-md p-2 hover:bg-muted text-left transition-all border-l-2 border-transparent hover:border-emerald-500"
              onClick={() => navigate(`/app/listings/${listing.id}`)}
            >
              <div className="h-10 w-10 shrink-0 rounded overflow-hidden bg-slate-100">
                {listing.thumbnail_url ? (
                  <img
                    src={listing.thumbnail_url}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <ShoppingBag className="h-4 w-4 m-3 text-slate-300" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{listing.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {formatNumber(listing.views ?? 0)} views
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatNumber(listing.favorites ?? 0)} ♥
                  </span>
                  {(listing.sales_count ?? 0) > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 h-4 border-emerald-300 text-emerald-600"
                    >
                      {listing.sales_count} sold
                    </Badge>
                  )}
                </div>
              </div>

              <GradeBadge score={listing.current_grade ?? 0} size="sm" />
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}
