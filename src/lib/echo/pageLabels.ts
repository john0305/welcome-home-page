/**
 * Static map from `/app/*` routes to friendly page labels for Echo's page context.
 */
export const PAGE_LABELS: Record<string, string> = {
  '/app/dashboard': 'Dashboard',
  '/app/intelligence': 'Intelligence',
  '/app/listings': 'Listings',
  '/app/review': 'Pending Optimizations',
  '/app/performance': 'Performance',
  '/app/ab-testing': 'A/B Testing',
  '/app/new-listing': 'New Listing',
  '/app/store-profile': 'Personalize AI',
  '/app/settings': 'Settings',
  '/app/affiliate': 'Affiliate',
  '/app/connect-etsy': 'Connect Etsy',
}

export function labelForRoute(pathname: string): string {
  if (/^\/app\/listings\/[^/]+$/.test(pathname)) return 'Listing Detail'
  return PAGE_LABELS[pathname] ?? 'Radar IQ'
}
