/**
 * QuickFiltersBar — Zone B of the Listings filter area.
 *
 * Consolidates two chip families into one horizontally-scrolling row:
 *   1. Smart filter presets (from AdvancedFilters)
 *   2. Dropdown filters (optimization status / age / grade) — rendered as
 *      popover chips with a chevron that anchor below the chip itself.
 *
 * Selecting an active preset chip clears it. Choosing the "Any …" option in
 * a popover chip returns it to the unselected style.
 */
import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { PRESETS, type FilterPreset } from '@/components/listings/AdvancedFilters'
import type { EtsyListing, ListingFilters } from '@/types'

interface Props {
  listings: EtsyListing[]
  filters: ListingFilters
  onChangeFilters: (f: ListingFilters) => void
  activePreset: FilterPreset
  onPreset: (p: FilterPreset) => void
  onClearAll: () => void
  hasActive: boolean
}

const PRIMARY_PRESETS: FilterPreset[] = ['lowest_grade', 'never_optimized', 'no_views_30', 'missing_tags']

const OPT_STATUS = [
  { value: 'any', label: 'Any status' },
  { value: 'never', label: 'Never optimized' },
  { value: 'optimized', label: 'Optimized' },
  { value: 'pending', label: 'Pending approval' },
] as const

const AGE = [
  { value: 'any', label: 'Any age' },
  { value: 'lt_1m', label: 'Under 30 days' },
  { value: '1_3m', label: '30–90 days' },
  { value: 'gte_90', label: '90+ days' },
  { value: 'gte_180', label: '180+ days' },
] as const

const GRADE = [
  { value: 'any', label: 'Any grade' },
  { value: 'ungraded', label: 'Never graded' },
  { value: 'zero', label: 'Grade = 0' },
  { value: 'lt_60', label: 'Grade < 60' },
  { value: '60_79', label: 'Grade 60–79' },
  { value: '80_plus', label: 'Grade 80+' },
] as const

function labelFor<T extends { value: string; label: string }>(
  options: readonly T[],
  value: string,
  fallback: string,
): string {
  return options.find(o => o.value === value)?.label ?? fallback
}

export function QuickFiltersBar({
  listings,
  filters,
  onChangeFilters,
  activePreset,
  onPreset,
  onClearAll,
  hasActive,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  const presetChips = PRESETS.filter(p => {
    const count = p.count?.(listings) ?? 0
    if (count === 0) return false
    if (!expanded && !PRIMARY_PRESETS.includes(p.id) && p.id !== activePreset) return false
    return true
  })

  const hiddenCount = PRESETS.filter(p => {
    const count = p.count?.(listings) ?? 0
    return count > 0 && !PRIMARY_PRESETS.includes(p.id) && p.id !== activePreset
  }).length

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Quick filters
        </p>
        {hasActive && (
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>

      <div className="-mx-1 px-1">
        <div className="flex flex-wrap items-center gap-2 py-0.5">
          {/* Smart filter preset chips */}
          {presetChips.map(p => {
            const count = p.count?.(listings) ?? 0
            const isActive = activePreset === p.id
            const Icon = p.icon
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPreset(isActive ? 'none' : p.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                  isActive
                    ? 'border-primary bg-primary/15 text-foreground'
                    : 'border-border/60 bg-card text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                <Icon className={cn('h-3 w-3', isActive ? 'text-primary' : 'opacity-70')} />
                <span>{p.label}</span>
                <Badge
                  className={cn(
                    'ml-0.5 h-4 min-w-[1rem] rounded-full border-0 px-1.5 text-[9px] font-bold',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </Badge>
              </button>
            )
          })}

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              {expanded ? 'Less' : `+${hiddenCount} more`}
            </button>
          )}

          {/* Divider between presets and popover-chip dropdowns */}
          <div className="h-5 w-px shrink-0 bg-border/60" />

          <PopoverChip
            label={labelFor(OPT_STATUS, filters.optimization_status, 'Any status')}
            active={filters.optimization_status !== 'any'}
          >
            <DropdownMenuRadioGroup
              value={filters.optimization_status}
              onValueChange={v => onChangeFilters({ ...filters, optimization_status: v as ListingFilters['optimization_status'] })}
            >
              {OPT_STATUS.map(o => (
                <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </PopoverChip>

          <PopoverChip
            label={labelFor(AGE, filters.age_bucket, 'Any age')}
            active={filters.age_bucket !== 'any'}
          >
            <DropdownMenuRadioGroup
              value={filters.age_bucket}
              onValueChange={v => onChangeFilters({ ...filters, age_bucket: v as ListingFilters['age_bucket'] })}
            >
              {AGE.map(o => (
                <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </PopoverChip>

          <PopoverChip
            label={labelFor(GRADE, filters.grade_bucket, 'Any grade')}
            active={filters.grade_bucket !== 'any'}
          >
            <DropdownMenuRadioGroup
              value={filters.grade_bucket}
              onValueChange={v => onChangeFilters({ ...filters, grade_bucket: v as ListingFilters['grade_bucket'] })}
            >
              {GRADE.map(o => (
                <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </PopoverChip>
        </div>
      </div>
    </div>
  )
}

function PopoverChip({
  label,
  active,
  children,
}: {
  label: string
  active: boolean
  children: React.ReactNode
}) {
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
          <span>{label}</span>
          <ChevronDown className={cn('h-3 w-3', active ? 'text-primary' : 'opacity-70')} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="min-w-[180px]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
