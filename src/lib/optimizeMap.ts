/**
 * Maps fix_action factor keys to the unified Optimize action.
 *
 * The product principle: there is ONE way to fix listing-content issues —
 * the Optimize flow. Fix-action cards for these factors should not call
 * `apply-fix-action` directly (which was failing); they should route through
 * `useListingActions.optimizeNow` / `rewriteField` so the user gets the same
 * review-dialog experience as the dashboard Optimize button.
 *
 * Shop-level/structural factors (return policies, vacation mode, etc.) keep
 * the existing guided fix flow.
 */
import type { RewriteFieldType } from '@/hooks/useListingActions'

/** Listing-scope factors that should be handled by the unified Optimize flow. */
const FACTOR_TO_REWRITE_SCOPE: Record<string, RewriteFieldType | 'all'> = {
  title_length: 'title',
  market_title_length: 'title',
  tags_complete: 'tags',
  market_tag_gap: 'tags',
  materials_present: 'materials',
  description_quality: 'description',
}

export function getOptimizeScopeForFactor(
  factorKey: string,
): RewriteFieldType | 'all' | null {
  return FACTOR_TO_REWRITE_SCOPE[factorKey] ?? null
}

/**
 * True when this fix action should be handled by the unified Optimize flow
 * instead of the legacy apply-fix-action path.
 */
export function isOptimizableFactor(factorKey: string): boolean {
  return factorKey in FACTOR_TO_REWRITE_SCOPE
}
