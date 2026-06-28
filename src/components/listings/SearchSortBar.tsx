/**
 * SearchSortBar — Zone A of the Listings filter area.
 * Search input (left, ~60%) + sort dropdown (right, ~38%).
 */
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ListingFilters } from '@/types'

interface Props {
  filters: ListingFilters
  onChange: (filters: ListingFilters) => void
}

export function SearchSortBar({ filters, onChange }: Props) {
  const update = <K extends keyof ListingFilters>(key: K, value: ListingFilters[K]) => {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-[0_0_60%]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search listings..."
          value={filters.search}
          onChange={e => update('search', e.target.value)}
          className="h-9 pl-9 pr-8"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => update('search', '')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1">
        <Select value={filters.sort_by} onValueChange={v => update('sort_by', v as ListingFilters['sort_by'])}>
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lowest_grade">Lowest grade</SelectItem>
            <SelectItem value="highest_grade">Highest grade</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="recently_optimized">Recently optimized</SelectItem>
            <SelectItem value="most_views">Most views</SelectItem>
            <SelectItem value="least_views">Fewest views</SelectItem>
            <SelectItem value="most_favorites">Most favorites</SelectItem>
            <SelectItem value="most_sales">Most sales</SelectItem>
            <SelectItem value="highest_price">Highest price</SelectItem>
            <SelectItem value="lowest_price">Lowest price</SelectItem>
            <SelectItem value="most_missing_tags">Most missing tags</SelectItem>
            <SelectItem value="least_missing_tags">Fewest missing tags</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
