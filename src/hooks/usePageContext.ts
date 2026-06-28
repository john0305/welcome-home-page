import { useMemo } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useApp } from '@/contexts/AppContext'
import type { EtsyListing } from '@/types'

export interface PageContext {
  route: string
  pathname: string
  pageLabel: string
  listingId?: string
  listingTitle?: string
  listingGrade?: number
  listing?: EtsyListing | null
  shopHealthScore?: number | null
  shopId?: string | null
}

const ROUTE_LABELS: Record<string, string> = {
  '/app/dashboard': 'Dashboard',
  '/app/listings': 'Listings',
  '/app/optimizations': 'Optimizations',
  '/app/review': 'Review',
  '/app/performance': 'Performance',
  '/app/intelligence': 'Intelligence',
  '/app/ab-testing': 'A/B Testing',
  '/app/store-profile': 'Personalize AI',
  '/app/settings': 'Settings',
  '/app/new-listing': 'New Listing',
}

function getPageLabel(pathname: string): string {
  // Exact match first
  if (ROUTE_LABELS[pathname]) {
    return ROUTE_LABELS[pathname]
  }

  // Listing detail: /app/listings/:id
  if (/^\/app\/listings\/[^/]+$/.test(pathname)) {
    return 'Listing Detail'
  }

  return 'RadarIQ'
}

export function usePageContext(): PageContext {
  const { pathname } = useLocation()
  const params = useParams<{ id?: string }>()
  const { listings, dashboardStats, connectedStore } = useApp()

  const pageLabel = getPageLabel(pathname)

  const listingId = params.id

  const { listing, listingTitle, listingGrade } = useMemo(() => {
    if (!listingId || !listings.length) {
      return { listing: null, listingTitle: undefined, listingGrade: undefined }
    }
    const match = listings.find((l) => l.id === listingId)
    return {
      listing: match ?? null,
      listingTitle: match?.title,
      listingGrade: match?.current_grade ?? undefined,
    }
  }, [listingId, listings])

  const shopHealthScore = dashboardStats?.avg_listing_grade ?? null
  const shopId = connectedStore?.shop_id ?? null

  return {
    route: pathname,
    pathname,
    pageLabel,
    listingId,
    listingTitle,
    listingGrade,
    listing,
    shopHealthScore,
    shopId,
  }
}
