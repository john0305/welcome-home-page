/**
 * AdvancedFilters — Smart filter groups for the Listings page.
 * Pre-built filter presets that surface the right listings fast.
 */

import { useState } from 'react'
import { Clock, Tag, Image, TrendingDown, AlertTriangle, Sparkles, Star, Check, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { EtsyListing } from '@/types'


export type FilterPreset =
  | 'no_views_7'
  | 'no_views_30'
  | 'missing_tags'
  | 'missing_materials'
  | 'low_images'
  | 'needs_video'
  | 'lowest_grade'
  | 'never_optimized'
  | 'stale_90d'
  | 'old_listings'
  | 'high_favorites_low_sales'
  | 'top_sellers'
  | 'none'

export const PRESETS: Array<{
  id: FilterPreset
  label: string
  icon: React.ElementType
  description: string
  activeClass: string        // solid-filled active style
  count?: (listings: EtsyListing[]) => number
}> = [
  {
    id: 'lowest_grade',
    label: 'Lowest grade',
    icon: TrendingDown,
    description: 'Worst-scoring listings — biggest improvement opportunity',
    activeClass: 'bg-red-600 text-foreground border-red-600 shadow-sm',
    count: (l) => l.filter(x => (x.current_grade ?? 100) < 60).length,
  },
  {
    id: 'never_optimized',
    label: 'Never optimized',
    icon: Sparkles,
    description: 'Fresh opportunities',
    activeClass: 'bg-amber-500 text-foreground border-amber-500 shadow-sm',
    count: (l) => l.filter(x => (x.optimization_count ?? 0) === 0).length,
  },
  {
    id: 'stale_90d',
    label: 'Stale 90+ days',
    icon: Clock,
    description: 'Active listings not refreshed in 90+ days',
    activeClass: 'bg-amber-500 text-foreground border-amber-500 shadow-sm',
    count: (l) => l.filter(x => x.state === 'active' && !!x.etsy_created_at && (Date.now() - new Date(x.etsy_created_at).getTime()) > 90 * 86400000).length,
  },
  {
    id: 'no_views_30',
    label: 'No views (30d)',
    icon: Clock,
    description: 'Stuck listings need help',
    activeClass: 'bg-orange-500 text-foreground border-orange-500 shadow-sm',
    count: (l) => l.filter(x => (x.views ?? 0) === 0).length,
  },
  {
    id: 'missing_tags',
    label: 'Missing tags',
    icon: Tag,
    description: 'Under 10 of 13 tags used',
    activeClass: 'bg-primary text-primary-foreground border-primary shadow-sm',
    count: (l) => l.filter(x => (x.tags?.length ?? 0) < 10).length,
  },
  {
    id: 'low_images',
    label: 'Few images',
    icon: Image,
    description: 'Under 5 product photos',
    activeClass: 'bg-blue-600 text-foreground border-blue-600 shadow-sm',
    count: (l) => l.filter(x => ((x as unknown as { photo_count?: number }).photo_count ?? x.image_urls?.length ?? 0) < 5).length,
  },
  {
    id: 'needs_video',
    label: 'No video',
    icon: Image,
    description: 'Listings without a product video',
    activeClass: 'bg-blue-600 text-foreground border-blue-600 shadow-sm',
    count: (l) => l.filter(x => ((x as unknown as { video_count?: number }).video_count ?? 0) === 0).length,
  },
  {
    id: 'missing_materials',
    label: 'Missing materials',
    icon: AlertTriangle,
    description: 'No materials listed',
    activeClass: 'bg-slate-600 text-foreground border-slate-600 shadow-sm',
    count: (l) => l.filter(x => (x.materials?.length ?? 0) === 0).length,
  },
  {
    id: 'old_listings',
    label: 'Old listings',
    icon: Clock,
    description: 'Created 1+ year ago',
    activeClass: 'bg-zinc-600 text-foreground border-zinc-600 shadow-sm',
    count: (l) => l.filter(x => x.etsy_created_at && (Date.now() - new Date(x.etsy_created_at).getTime()) > 365 * 86400000).length,
  },
  {
    id: 'high_favorites_low_sales',
    label: 'Wishlisted, not selling',
    icon: Star,
    description: 'Favorites ≥ 10, sales = 0',
    activeClass: 'bg-pink-600 text-foreground border-pink-600 shadow-sm',
    count: (l) => l.filter(x => (x.favorites ?? 0) >= 10 && (x.sales_count ?? 0) === 0).length,
  },
  {
    id: 'top_sellers',
    label: 'Top sellers',
    icon: TrendingDown,
    description: '5+ sales',
    activeClass: 'bg-emerald-600 text-foreground border-emerald-600 shadow-sm',
    count: (l) => l.filter(x => (x.sales_count ?? 0) >= 5).length,
  },
]

export function applyFilterPreset(listings: EtsyListing[], preset: FilterPreset): EtsyListing[] {
  switch (preset) {
    case 'lowest_grade': return listings
      .filter(l => (l.current_grade ?? 100) < 60)
      .sort((a, b) => (a.current_grade ?? 100) - (b.current_grade ?? 100))
    case 'never_optimized': return listings.filter(l => (l.optimization_count ?? 0) === 0)
    case 'stale_90d': return listings
      .filter(l => l.state === 'active' && !!l.etsy_created_at && (Date.now() - new Date(l.etsy_created_at).getTime()) > 90 * 86400000)
      .sort((a, b) => new Date(a.etsy_created_at).getTime() - new Date(b.etsy_created_at).getTime())
    case 'no_views_30': return listings.filter(l => (l.views ?? 0) === 0)
    case 'missing_tags': return listings.filter(l => (l.tags?.length ?? 0) < 10)
    case 'low_images': return listings.filter(l => ((l as { photo_count?: number }).photo_count ?? l.image_urls?.length ?? 0) < 5)
    case 'needs_video': return listings.filter(l => ((l as { video_count?: number }).video_count ?? 0) === 0)
    case 'missing_materials': return listings.filter(l => (l.materials?.length ?? 0) === 0)
    case 'old_listings': return listings.filter(l => !!l.etsy_created_at && (Date.now() - new Date(l.etsy_created_at).getTime()) > 365 * 86400000)
    case 'high_favorites_low_sales': return listings.filter(l => (l.favorites ?? 0) >= 10 && (l.sales_count ?? 0) === 0)
    case 'top_sellers': return [...listings].sort((a, b) => (b.sales_count ?? 0) - (a.sales_count ?? 0))
    default: return listings
  }
}

interface AdvancedFiltersProps {
  activePreset: FilterPreset
  onPreset: (preset: FilterPreset) => void
  listings: EtsyListing[]
}

// Top 4 most-used presets always visible; rest hidden behind "More filters"
// so the chip row doesn't dominate the listings page on small screens.
const PRIMARY_PRESETS: FilterPreset[] = ['lowest_grade', 'never_optimized', 'no_views_30', 'missing_tags']

export function AdvancedFilters({ activePreset, onPreset, listings }: AdvancedFiltersProps) {
  const [expanded, setExpanded] = useState(false)
  const visiblePresets = PRESETS.filter(p => {
    const count = p.count?.(listings) ?? 0
    if (count === 0) return false
    // Always show the active preset even if it's in the "more" group
    if (!expanded && !PRIMARY_PRESETS.includes(p.id) && p.id !== activePreset) return false
    return true
  })

  const hiddenCount = PRESETS.filter(p => {
    const count = p.count?.(listings) ?? 0
    return count > 0 && !PRIMARY_PRESETS.includes(p.id) && p.id !== activePreset
  }).length

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Smart Filters</p>
      <div className="flex flex-wrap items-center gap-2">
        {visiblePresets.map(p => {
          const count = p.count?.(listings) ?? 0
          const isActive = activePreset === p.id
          return (
            <button
              key={p.id}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-150',
                isActive
                  ? p.activeClass
                  : 'bg-secondary/40 text-muted-foreground border-border hover:bg-secondary/70'
              )}
              onClick={() => onPreset(isActive ? 'none' : p.id)}
            >
              {isActive ? (
                <Check className="h-3 w-3" />
              ) : (
                <p.icon className="h-3 w-3 opacity-70" />
              )}
              <span>{p.label}</span>
              <Badge
                className={cn(
                  'ml-0.5 h-4 min-w-[1rem] rounded-full px-1.5 text-[9px] font-bold border-0',
                  isActive
                    ? 'bg-white/25 text-foreground'
                    : 'bg-muted-foreground/15 text-muted-foreground'
                )}
              >
                {count}
              </Badge>
            </button>
          )
        })}
        {hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
          >
            <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
            {expanded ? 'Less' : `+${hiddenCount} more`}
          </button>
        )}
      </div>
    </div>
  )
}

