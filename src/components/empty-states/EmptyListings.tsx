import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyListings({ hasFilters, onClearFilters, onSync, isSyncing }: {
  hasFilters?: boolean
  onClearFilters?: () => void
  onSync?: () => void
  isSyncing?: boolean
}) {
  const navigate = useNavigate()

  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <SlidersHorizontal className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-lg font-medium">No listings match your filters</p>
        <p className="text-sm text-muted-foreground">Try adjusting the filters or search query</p>
        <Button variant="outline" onClick={onClearFilters}>Clear all filters</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <Search className="h-10 w-10 text-muted-foreground/30" />
      <div>
        <p className="text-lg font-medium">No listings synced yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Sync your Etsy store to see all your listings here.
        </p>
      </div>
      <div className="flex gap-2">
        <Button className="gap-2" onClick={onSync} disabled={isSyncing}>
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync now'}
        </Button>
        <Button variant="outline" onClick={() => navigate('/app/settings')}>
          Connect store
        </Button>
      </div>
    </div>
  )
}
