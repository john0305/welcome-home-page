/**
 * Dropdown filter for Score Roadmap items, shown alongside the FixActionPills
 * on the Listings page. Selecting an item activates the corresponding roadmap
 * filter (URL: ?roadmap_filter=<pill_key>) without setting source=roadmap, so
 * the roadmap context banner only appears when the user actually came from the
 * roadmap page.
 */

import { ChevronDown, Target, Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRoadmapFilters } from '@/hooks/useRoadmapFilters'
import { ROADMAP_FILTERS, getRoadmapFilter } from '@/lib/roadmapFilterMap'
import { cn } from '@/lib/utils'

interface Props {
  activeKey: string | null
  onSelect: (key: string | null) => void
}

export function RoadmapFilterDropdown({ activeKey, onSelect }: Props) {
  const { pillCounts } = useRoadmapFilters()
  const active = getRoadmapFilter(activeKey)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
            active
              ? 'border-primary bg-primary/15 text-foreground'
              : 'border-border/60 bg-card text-muted-foreground hover:border-border hover:text-foreground',
          )}
        >
          <Target className={cn('h-3 w-3', active ? 'text-primary' : 'opacity-70')} />
          <span>{active ? active.label : 'Roadmap filters'}</span>
          {active && (
            <Badge className="ml-0.5 h-4 min-w-[1rem] rounded-full border-0 bg-primary px-1.5 text-[9px] font-bold text-primary-foreground">
              1
            </Badge>
          )}
          <ChevronDown className={cn('h-3 w-3', active ? 'text-primary' : 'opacity-70')} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-[240px]">
        {active && (
          <>
            <DropdownMenuItem onClick={() => onSelect(null)} className="text-xs text-muted-foreground">
              <X className="mr-2 h-3.5 w-3.5" />
              Clear roadmap filter
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {ROADMAP_FILTERS.map(f => {
          const count = pillCounts[f.pill_key] ?? 0
          const isActive = activeKey === f.pill_key
          const Icon = f.icon
          const done = count === 0
          return (
            <DropdownMenuItem
              key={f.pill_key}
              disabled={done && !isActive}
              onClick={() => onSelect(isActive ? null : f.pill_key)}
              className={cn(
                'flex items-center gap-2 text-xs',
                isActive && 'bg-primary/10 text-foreground',
                done && 'opacity-60',
              )}
            >
              <Icon className="h-3.5 w-3.5 opacity-70" />
              <span className="flex-1">{f.label}</span>
              {done ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                  <Check className="h-3 w-3" />
                  Done
                </span>
              ) : (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                  {count}
                </Badge>
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
