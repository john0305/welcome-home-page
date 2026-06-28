/**
 * Shop Health vs Listings categorization.
 *
 * Shop Health = structural problems (missing or broken). Fix once.
 * Listings    = ongoing content optimization (exists but could be better).
 *
 * The distinction is enforced client-side as a filter on top of the existing
 * fix_actions table. No edge function or schema changes.
 */

import { Store, Truck, MessageCircle, Tag, type LucideIcon } from 'lucide-react'
import type { FixActionRow } from '@/hooks/useFixActions'

/** Factor keys treated as structural ("Shop Health"). */
export const SHOP_HEALTH_FACTOR_KEYS = new Set<string>([
  'return_policy',
  'return_policy_present',
  'shipping_under_6_usd',
  'has_shop_icon',
  'has_banner',
  'message_response_rate',
  'case_rate',
  'on_time_shipping',
  // These three are structural ONLY when the current value is completely empty.
  // See isShopHealthAction() for the guard.
  'photo_count',
  'tags_complete',
  'materials_present',
])

/** "Empty" current_value: null, '', [], {}. */
function isEmptyValue(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  if (typeof v === 'number') return v === 0
  return false
}

/**
 * Predicate: is this fix_action a structural Shop Health issue?
 * Structural = factor is in the allowlist AND (for content factors) the field
 * is actually empty, not just incomplete.
 */
export function isShopHealthAction(row: Pick<FixActionRow, 'factor_key' | 'current_value'>): boolean {
  if (!SHOP_HEALTH_FACTOR_KEYS.has(row.factor_key)) return false
  // Content factors are only "structural" when the value is missing entirely.
  if (row.factor_key === 'tags_complete') return isEmptyValue(row.current_value)
  if (row.factor_key === 'materials_present') return isEmptyValue(row.current_value)
  if (row.factor_key === 'photo_count') {
    const v = row.current_value
    if (typeof v === 'number') return v < 3
    if (Array.isArray(v)) return v.length < 3
    return isEmptyValue(v)
  }
  return true
}

/** Listings-page filter pills (everything that's NOT structural). */
export type PillKey = 'title_weak' | 'under_tagged' | 'low_images' | 'missing_materials' | 'needs_optimization'

export interface FilterPill {
  key: PillKey
  label: string
  factors: string[]
}

export const LISTING_FILTER_PILLS: FilterPill[] = [
  { key: 'title_weak', label: 'Weak titles', factors: ['title_strength', 'title_length'] },
  { key: 'under_tagged', label: 'Under-tagged', factors: ['tag_coverage', 'tags_complete'] },
  { key: 'low_images', label: 'Low images', factors: ['photo_count'] },
  { key: 'missing_materials', label: 'No materials', factors: ['materials_present'] },
  { key: 'needs_optimization', label: 'Needs optimization', factors: ['title_strength', 'tag_coverage', 'description_quality'] },
]

/** Shop Health category groups. */
export type ShopHealthCategoryId = 'shop_setup' | 'shipping' | 'customer_service' | 'listing_basics'

export interface ShopHealthCategory {
  id: ShopHealthCategoryId
  label: string
  icon: LucideIcon
  factors: string[]
  description: string
}

export const SHOP_HEALTH_CATEGORIES: ShopHealthCategory[] = [
  {
    id: 'shop_setup',
    label: 'Shop Setup',
    icon: Store,
    factors: ['has_shop_icon', 'has_banner', 'return_policy', 'return_policy_present'],
    description: 'Icon, banner, policies',
  },
  {
    id: 'shipping',
    label: 'Shipping',
    icon: Truck,
    factors: ['shipping_under_6_usd', 'on_time_shipping'],
    description: 'Profiles and delivery promises',
  },
  {
    id: 'customer_service',
    label: 'Customer Service',
    icon: MessageCircle,
    factors: ['message_response_rate', 'case_rate'],
    description: 'Response rate and cases',
  },
  {
    id: 'listing_basics',
    label: 'Listing Basics',
    icon: Tag,
    factors: ['tags_complete', 'materials_present', 'photo_count'],
    description: 'Listings missing tags, materials, or images',
  },
]

export function categorizeAction(row: Pick<FixActionRow, 'factor_key'>): ShopHealthCategoryId | null {
  for (const c of SHOP_HEALTH_CATEGORIES) {
    if (c.factors.includes(row.factor_key)) return c.id
  }
  return null
}

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
export function highestSeverity(rows: Pick<FixActionRow, 'severity'>[]): string {
  let best = 0
  let label = 'low'
  for (const r of rows) {
    const n = SEVERITY_RANK[r.severity] ?? 0
    if (n > best) { best = n; label = r.severity }
  }
  return label
}
