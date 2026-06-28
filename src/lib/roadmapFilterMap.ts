/**
 * Mapping from Score Roadmap items to Listings page filter context.
 *
 * Both the Score Roadmap (source of the "Fix it" CTAs) and the Listings page
 * (which applies the filter) import from this file so the contract stays in
 * sync. The pill_key is the value passed in the URL: ?roadmap_filter=<pill_key>.
 */

import {
  FileText, Type, Tag, Image as ImageIcon, Video, Package, Truck, RotateCcw,
  type LucideIcon,
} from 'lucide-react'

export type RoadmapFilter = {
  /** URL slug. Stable — used in query params and analytics. */
  pill_key: string
  /** Short label shown in dropdowns, banners, and badges. */
  label: string
  /** fix_actions.factor_key values that count toward this roadmap item. */
  factor_keys: string[]
  /** Lucide icon component for visual cues. */
  icon: LucideIcon
  /** Call-to-action verb shown on listing-card badges. */
  fix_cta: string
  /** Color family for the issue badge: 'amber' (content) vs 'teal' (structural). */
  tone: 'amber' | 'teal'
}

export const ROADMAP_FILTERS: RoadmapFilter[] = [
  {
    pill_key: 'thin_descriptions',
    label: 'Thin descriptions',
    factor_keys: ['description_quality', 'description_length'],
    icon: FileText,
    fix_cta: 'Improve description',
    tone: 'amber',
  },
  {
    pill_key: 'weak_titles',
    label: 'Weak titles',
    factor_keys: ['title_strength', 'title_length'],
    icon: Type,
    fix_cta: 'Improve title',
    tone: 'amber',
  },
  {
    pill_key: 'under_tagged',
    label: 'Under-tagged listings',
    factor_keys: ['tag_coverage', 'tags_complete'],
    icon: Tag,
    fix_cta: 'Add tags',
    tone: 'amber',
  },
  {
    pill_key: 'low_images',
    label: 'Low image count',
    factor_keys: ['photo_count'],
    icon: ImageIcon,
    fix_cta: 'Improve photos',
    tone: 'amber',
  },
  {
    pill_key: 'needs_video',
    label: 'No product video',
    factor_keys: ['video_present'],
    icon: Video,
    fix_cta: 'Add video on Etsy',
    tone: 'teal',
  },
  {
    pill_key: 'missing_materials',
    label: 'Missing materials',
    factor_keys: ['materials_present'],
    icon: Package,
    fix_cta: 'Add materials',
    tone: 'teal',
  },
  {
    pill_key: 'shipping_cost',
    label: 'High shipping cost',
    factor_keys: ['shipping_under_6_usd'],
    icon: Truck,
    fix_cta: 'Review shipping',
    tone: 'teal',
  },
  {
    pill_key: 'return_policy',
    label: 'Missing return policy',
    factor_keys: ['return_policy', 'return_policy_present'],
    icon: RotateCcw,
    fix_cta: 'Add return policy',
    tone: 'teal',
  },
]

export const ROADMAP_FILTER_MAP: Record<string, RoadmapFilter> =
  Object.fromEntries(ROADMAP_FILTERS.map(f => [f.pill_key, f]))

export function getRoadmapFilter(key: string | null | undefined): RoadmapFilter | null {
  if (!key) return null
  return ROADMAP_FILTER_MAP[key] ?? null
}
