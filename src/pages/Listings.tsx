import { useState, useMemo, useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import { Sparkles, LayoutGrid, LayoutList, ChevronLeft, ChevronRight, X } from 'lucide-react'

import { Header } from '@/components/layout/Header'
import { ListingCard } from '@/components/listings/ListingCard'
import { SearchSortBar } from '@/components/listings/SearchSortBar'
import { QuickFiltersBar } from '@/components/listings/QuickFiltersBar'
import { StatTabs, type StatTabId } from '@/components/listings/StatTabs'
import { applyFilterPreset, PRESETS } from '@/components/listings/AdvancedFilters'
import { BulkActionBar } from '@/components/listings/BulkActionBar'
import { FixActionPills, useFixActionPills } from '@/components/listings/FixActionPills'
import { RoadmapContextBanner } from '@/components/listings/RoadmapContextBanner'
import { RoadmapFilterDropdown } from '@/components/listings/RoadmapFilterDropdown'
import { ListingsInsightHeader } from '@/components/listings/ListingsInsightHeader'
import { useViewMode } from '@/hooks/useViewMode'
import { useRoadmapFilters } from '@/hooks/useRoadmapFilters'
import { getRoadmapFilter } from '@/lib/roadmapFilterMap'
import { useListingActions } from '@/hooks/useListingActions'
import { useFixProgress } from '@/hooks/useFixProgress'
import type { PillKey } from '@/lib/shopHealthCategories'
import { EmptyListings } from '@/components/empty-states/EmptyListings'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useApp } from '@/contexts/AppContext'
import { SampleDataBanner } from '@/components/SampleDataBanner'
import type { FilterPreset } from '@/components/listings/AdvancedFilters'
import type { ListingFilters, EtsyListing } from '@/types'

const DEFAULT_FILTERS: ListingFilters = {
  sort_by: 'oldest',
  state: 'active',
  grade_range: [0, 100],
  search: '',
  optimization_status: 'any',
  age_bucket: 'any',
  grade_bucket: 'any',
}

const MS_DAY = 86400000
function ageDays(l: EtsyListing): number | null {
  if (!l.etsy_created_at) return null
  return (Date.now() - new Date(l.etsy_created_at).getTime()) / MS_DAY
}

function matchesAgeBucket(l: EtsyListing, b: ListingFilters['age_bucket']): boolean {
  if (b === 'any') return true
  const d = ageDays(l)
  if (d == null) return false
  switch (b) {
    case 'lt_1m': return d < 30
    case '1_3m': return d >= 30 && d < 90
    case '3_6m': return d >= 90 && d < 180
    case '6_12m': return d >= 180 && d < 365
    case '1_2y': return d >= 365 && d < 730
    case 'gt_2y': return d >= 730
    case 'gte_90': return d >= 90
    case 'gte_180': return d >= 180
    default: return true
  }
}

function matchesGradeBucket(l: EtsyListing, b: ListingFilters['grade_bucket']): boolean {
  if (b === 'any') return true
  const g = l.current_grade
  if (b === 'ungraded') return g == null
  if (g == null) return false
  switch (b) {
    case 'zero': return g === 0
    case '0_25': return g < 25
    case '25_50': return g >= 25 && g < 50
    case '50_75': return g >= 50 && g < 75
    case '75_100': return g >= 75
    case 'lt_60': return g < 60
    case '60_79': return g >= 60 && g < 80
    case '80_plus': return g >= 80
    default: return true
  }
}

function applyFilters(
  listings: EtsyListing[],
  filters: ListingFilters,
  pendingIds: Set<string>,
): EtsyListing[] {
  let result = [...listings]

  if (filters.state !== 'all') {
    result = result.filter(l => l.state === filters.state)
  }

  if (filters.search) {
    const q = filters.search.toLowerCase()
    result = result.filter(l =>
      (l.title ?? '').toLowerCase().includes(q) ||
      (l.tags ?? []).some(t => t.toLowerCase().includes(q)) ||
      (l.materials ?? []).some(m => m.toLowerCase().includes(q))
    )
  }

  switch (filters.optimization_status) {
    case 'never':
      result = result.filter(l => (l.optimization_count ?? 0) === 0)
      break
    case 'pending':
      result = result.filter(l => pendingIds.has(l.id))
      break
    case 'optimized':
      result = result.filter(l => (l.optimization_count ?? 0) > 0 && !pendingIds.has(l.id))
      break
  }

  result = result.filter(l => matchesAgeBucket(l, filters.age_bucket))
  result = result.filter(l => matchesGradeBucket(l, filters.grade_bucket))

  // Legacy slider range still respected; defaults to full range so it's a no-op
  // unless something explicitly sets it.
  result = result.filter(l => {
    const g = l.current_grade ?? 0
    return g >= filters.grade_range[0] && g <= filters.grade_range[1]
  })


  result.sort((a, b) => {
    switch (filters.sort_by) {
      case 'oldest': return new Date(a.etsy_created_at).getTime() - new Date(b.etsy_created_at).getTime()
      case 'newest': return new Date(b.etsy_created_at).getTime() - new Date(a.etsy_created_at).getTime()
      case 'recently_optimized': {
        // Items that have never been optimized sink to the bottom regardless of
        // sort direction so "Recently optimized" reads as a chronological feed
        // of actual optimization activity, not a list padded with N/A rows.
        const at = a.last_optimized_at ? new Date(a.last_optimized_at).getTime() : 0
        const bt = b.last_optimized_at ? new Date(b.last_optimized_at).getTime() : 0
        if (at === 0 && bt === 0) return 0
        if (at === 0) return 1
        if (bt === 0) return -1
        return bt - at
      }
      case 'lowest_grade': return (a.current_grade ?? 0) - (b.current_grade ?? 0)
      case 'highest_grade': return (b.current_grade ?? 0) - (a.current_grade ?? 0)
      case 'most_views': return b.views - a.views
      case 'least_views': return a.views - b.views
      case 'most_favorites': return b.favorites - a.favorites
      case 'most_sales': return b.sales_count - a.sales_count
      case 'highest_price': return (b.price ?? 0) - (a.price ?? 0)
      case 'lowest_price': return (a.price ?? 0) - (b.price ?? 0)
      case 'most_missing_tags': return (a.tags?.length ?? 0) - (b.tags?.length ?? 0)
      case 'least_missing_tags': return (b.tags?.length ?? 0) - (a.tags?.length ?? 0)
      default: return 0
    }
  })

  return result
}

// Maps a stat tab to a partial filter override applied on selection.
const TAB_FILTERS: Record<Exclude<StatTabId, 'all'>, Partial<ListingFilters>> = {
  active: { state: 'active' },
  never_optimized: { optimization_status: 'never' },
  low_grade: { grade_bucket: 'lt_60', sort_by: 'lowest_grade' },
  pending: { optimization_status: 'pending' },
  optimized: { optimization_status: 'optimized', sort_by: 'recently_optimized' },
}

export default function Listings() {
  const { listings, loadListings, isSyncing, isLoadingListings, syncListings, pendingReviewListingIds } = useApp()
  const { startBulkOptimize, bulkRun } = useListingActions()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const needsAnswersFilter = searchParams.get('needs_answers') === '1'
  const pillParam = (searchParams.get('fix_factor') as PillKey | null) ?? null
  const roadmapParam = searchParams.get('roadmap_filter')
  const fromRoadmap = searchParams.get('source') === 'roadmap'
  const roadmapFilter = getRoadmapFilter(roadmapParam)
  const [filters, setFilters] = useState<ListingFilters>(DEFAULT_FILTERS)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const { isAdvanced } = useViewMode()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activePreset, setActivePreset] = useState<FilterPreset>('none')
  const [activeTab, setActiveTab] = useState<StatTabId>('all')
  const [pageSize, setPageSize] = useState<24 | 48 | 96>(24)
  const [page, setPage] = useState(1)
  const { listingIdsByPill } = useFixActionPills()
  const { pillListingIds: roadmapListingIds } = useRoadmapFilters()
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const setPill = (key: PillKey | null) => {
    if (key) searchParams.set('fix_factor', key)
    else searchParams.delete('fix_factor')
    setSearchParams(searchParams)
  }

  const setRoadmap = (key: string | null) => {
    if (key) searchParams.set('roadmap_filter', key)
    else {
      searchParams.delete('roadmap_filter')
      searchParams.delete('source')
    }
    setSearchParams(searchParams)
  }

  const dismissBanner = () => {
    searchParams.delete('source')
    searchParams.delete('roadmap_filter')
    setSearchParams(searchParams)
    setBannerDismissed(true)
  }


  // Full listing rows are only loaded when this page mounts. The dashboard uses
  // a slim 13-column query so it never needs this payload. Keeping the full load
  // here means navigating back within the same session is instant — no re-fetch.
  useEffect(() => {
    if (listings.length === 0) void loadListings()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply preset / optimization-status filter passed via navigation
  // state from the dashboard or sidebar shortcuts (e.g. "Needs Attention" or
  // "View optimized listings" both deep-link into this page pre-filtered).
  const [navListingIds, setNavListingIds] = useState<Set<string> | null>(null)
  useEffect(() => {
    const navState = location.state as {
      preset?: FilterPreset
      optimizationStatus?: ListingFilters['optimization_status']
      sortBy?: ListingFilters['sort_by']
      listingIds?: string[]
    } | null
    if (!navState) return
    if (navState.preset) setActivePreset(navState.preset)
    if (Array.isArray(navState.listingIds) && navState.listingIds.length > 0) {
      setNavListingIds(new Set(navState.listingIds))
    }
    setFilters(f => ({
      ...f,
      ...(navState.optimizationStatus ? { optimization_status: navState.optimizationStatus } : {}),
      ...(navState.sortBy ? { sort_by: navState.sortBy } : {}),
    }))
    if (navState.preset || navState.optimizationStatus || navState.sortBy || navState.listingIds) {
      window.history.replaceState({}, '')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let base = applyFilters(listings, filters, pendingReviewListingIds)
    if (activePreset !== 'none') base = applyFilterPreset(base, activePreset)
    if (needsAnswersFilter) {
      base = base.filter(l => Array.isArray((l as { clarifying_questions?: string[] | null }).clarifying_questions) && ((l as { clarifying_questions?: string[] | null }).clarifying_questions?.length ?? 0) > 0)
    }
    if (pillParam && listingIdsByPill[pillParam]) {
      const allow = listingIdsByPill[pillParam]
      base = base.filter(l => allow.has(l.id))
    }
    if (roadmapFilter && roadmapListingIds[roadmapFilter.pill_key]) {
      const allow = roadmapListingIds[roadmapFilter.pill_key]
      base = base.filter(l => allow.has(l.id))
    }
    if (navListingIds) {
      base = base.filter(l => navListingIds.has(l.id) || navListingIds.has(String((l as { etsy_listing_id?: number | string }).etsy_listing_id ?? '')))
    }
    return base
  }, [listings, filters, activePreset, pendingReviewListingIds, needsAnswersFilter, pillParam, listingIdsByPill, roadmapFilter, roadmapListingIds, navListingIds])

  useEffect(() => { setPage(1) }, [filters, activePreset, pageSize])

  // Bulk-fetch fix lifecycle progress for the filtered set so we can render
  // a per-card progress bar AND sort zero-open listings to the bottom.
  const fixProgressMap = useFixProgress(useMemo(() => filtered.map(l => l.id), [filtered]))
  const sorted = useMemo(() => {
    const arr = [...filtered]
    // When the user explicitly sorted by grade (preset or sort field), keep
    // that ordering intact — don't reshuffle by open-fix count.
    const explicitGradeSort = activePreset === 'lowest_grade'
      || filters.sort_by === 'lowest_grade'
      || filters.sort_by === 'highest_grade'
    if (explicitGradeSort) return arr
    arr.sort((a, b) => {
      const aOpen = fixProgressMap[a.id]?.open ?? 0
      const bOpen = fixProgressMap[b.id]?.open ?? 0
      if ((aOpen === 0) !== (bOpen === 0)) return aOpen === 0 ? 1 : -1
      return 0
    })
    return arr
  }, [filtered, fixProgressMap, activePreset, filters.sort_by])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageItems = sorted.slice(pageStart, pageStart + pageSize)

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(filtered.map(l => l.id)))
  const clearSelection = () => setSelected(new Set())

  // Tab counts derived from the unfiltered listing set so they're stable
  // regardless of what the user currently has selected below.
  const tabCounts = useMemo(() => ({
    all: listings.length,
    active: listings.filter(l => l.state === 'active').length,
    never_optimized: listings.filter(l => (l.optimization_count ?? 0) === 0).length,
    low_grade: listings.filter(l => (l.current_grade ?? 100) < 60).length,
    pending: pendingReviewListingIds.size,
    optimized: listings.filter(l => (l.optimization_count ?? 0) > 0 && !pendingReviewListingIds.has(l.id)).length,
  }), [listings, pendingReviewListingIds])

  const handleTabSelect = (id: StatTabId) => {
    setActiveTab(id)
    setActivePreset('none')
    if (id === 'all') {
      setFilters(DEFAULT_FILTERS)
    } else {
      setFilters({ ...DEFAULT_FILTERS, ...TAB_FILTERS[id] })
    }
  }

  const clearAll = () => {
    setFilters(DEFAULT_FILTERS)
    setActivePreset('none')
    setActiveTab('all')
    if (needsAnswersFilter) searchParams.delete('needs_answers')
    if (pillParam) searchParams.delete('fix_factor')
    if (needsAnswersFilter || pillParam) setSearchParams(searchParams)
  }

  // Build active-filter mini-badge labels for the results count line.
  const activeBadges = useMemo(() => {
    const out: string[] = []
    if (activePreset !== 'none') {
      const preset = PRESETS.find(p => p.id === activePreset)
      if (preset) out.push(preset.label)
    }
    if (filters.optimization_status !== 'any') {
      out.push({ never: 'Never optimized', pending: 'Pending approval', optimized: 'Optimized' }[filters.optimization_status] ?? '')
    }
    if (filters.age_bucket !== 'any') {
      out.push({
        lt_1m: 'Under 30 days', '1_3m': '30–90 days', '3_6m': '3–6 months', '6_12m': '6–12 months',
        '1_2y': '1–2 years', gt_2y: 'Over 2 years', gte_90: '90+ days', gte_180: '180+ days',
      }[filters.age_bucket] ?? '')
    }
    if (filters.grade_bucket !== 'any') {
      out.push({
        ungraded: 'Never graded', zero: 'Grade = 0', '0_25': '0–25', '25_50': '25–50', '50_75': '50–75', '75_100': '75–100',
        lt_60: 'Grade < 60', '60_79': 'Grade 60–79', '80_plus': 'Grade 80+',
      }[filters.grade_bucket] ?? '')
    }
    if (filters.search) out.push(`"${filters.search}"`)
    return out.filter(Boolean)
  }, [activePreset, filters])

  const hasActive = activeBadges.length > 0 || activeTab !== 'all' || !!pillParam

  return (
    <div className="flex flex-col">
      <Header
        title="Listings"
        description="Browse, filter, and manage your Etsy listings"
        actions={
          selected.size > 0 ? (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!!bulkRun && !bulkRun.done}
              onClick={() => { startBulkOptimize(Array.from(selected)); clearSelection() }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Optimize {Math.min(selected.size, 20)} selected{selected.size > 20 ? ` (of ${selected.size})` : ''}
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 p-6 space-y-4">
        <SampleDataBanner />

        {/* Radar's read — the intelligence layer leads; filters/table are the
            drill-down, not the landing experience. */}
        <ListingsInsightHeader listings={listings} onSelectTab={handleTabSelect} />

        {/* Roadmap context banner — only when navigated in from Score Roadmap. */}
        {fromRoadmap && !bannerDismissed && roadmapFilter && (
          <RoadmapContextBanner
            filter={roadmapFilter}
            filteredCount={filtered.length}
            onDismiss={dismissBanner}
          />
        )}
        {/* Show a non-blocking notice when the URL has an unknown roadmap_filter. */}
        {roadmapParam && !roadmapFilter && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Filter not found — showing all listings.
          </div>
        )}

        {/* SECTION 1 — Stat tabs */}
        <StatTabs
          selected={activeTab}
          onSelect={handleTabSelect}
          tabs={[
            { id: 'all', label: 'All', count: tabCounts.all },
            { id: 'active', label: 'Active', count: tabCounts.active },
            { id: 'never_optimized', label: 'Never optimized', count: tabCounts.never_optimized },
            { id: 'low_grade', label: 'Grade < 60', count: tabCounts.low_grade },
            { id: 'pending', label: 'Pending approval', count: tabCounts.pending },
            { id: 'optimized', label: 'Optimized', count: tabCounts.optimized },
          ]}
        />

        {/* SECTION 2 — Filter zones. In the default (simple) view the dense
            machinery lives behind a disclosure so the page reads as insight →
            cards, not insight → control panel; advanced mode shows it all. */}
        {!isAdvanced && !filtersOpen ? (
          <div className="flex items-center justify-between gap-2">
            <SearchSortBar filters={filters} onChange={setFilters} />
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              Fine-tune filters{hasActive ? ' •' : ''}
            </button>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-border/60 bg-card/30 p-3">
            <SearchSortBar filters={filters} onChange={setFilters} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FixActionPills activeKey={pillParam} onSelect={setPill} />
              <RoadmapFilterDropdown activeKey={roadmapFilter?.pill_key ?? null} onSelect={setRoadmap} />
            </div>
            <div className="h-px bg-border/60" />
            <QuickFiltersBar
              listings={listings}
              filters={filters}
              onChangeFilters={setFilters}
              activePreset={activePreset}
              onPreset={setActivePreset}
              onClearAll={clearAll}
              hasActive={hasActive}
            />
            {!isAdvanced && (
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Hide filters
              </button>
            )}
          </div>
        )}

        {/* SECTION 3 — Results count line */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {hasActive ? (
            <>
              <span>
                <span className="font-medium text-foreground">{filtered.length}</span> of{' '}
                <span className="font-medium text-foreground">{listings.length}</span> listings
              </span>
              {activeBadges.length > 0 && <span className="text-border">·</span>}
              <div className="flex flex-wrap items-center gap-1.5">
                {activeBadges.map((b, i) => (
                  <span
                    key={`${b}-${i}`}
                    className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                  >
                    {b}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
              >
                <X className="h-2.5 w-2.5" />
                Clear
              </button>
            </>
          ) : (
            <span>
              <span className="font-medium text-foreground">{filtered.length}</span> listing{filtered.length !== 1 ? 's' : ''} found
            </span>
          )}
        </div>

        {/* Select & view-mode row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selected.size > 0 ? (
              <>
                <span className="text-sm text-muted-foreground">{selected.size} selected</span>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>Clear</Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={selectAll}>Select all ({filtered.length})</Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={selectAll}>
                Select all
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Listing grid/list */}
        {isSyncing || (isLoadingListings && listings.length === 0) ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 rounded-[var(--radius-lg)] bg-surface-1 skeleton-shimmer" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <EmptyListings
            onSync={syncListings}
            isSyncing={isSyncing}
          />
        ) : filtered.length === 0 ? (
          <EmptyListings
            hasFilters
            onClearFilters={() => { setFilters(DEFAULT_FILTERS); setActivePreset('none') }}
          />
        ) : (
          <>
            <div className={`grid gap-3 ${viewMode === 'grid' ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' : 'grid-cols-1 max-w-2xl'}`}>
              {pageItems.map(listing => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  selected={selected.has(listing.id)}
                  onSelect={toggleSelect}
                  showMissingTagsBadge={activePreset === 'missing_tags' || filters.sort_by === 'most_missing_tags' || filters.sort_by === 'least_missing_tags'}
                  activeIssue={roadmapFilter ? { label: roadmapFilter.fix_cta, tone: roadmapFilter.tone } : undefined}
                  fixProgress={fixProgressMap[listing.id]}
                />
              ))}
            </div>

            {/* Pagination bar — only shown when there's more than one page. Page-size
                selector lets power users widen the view without losing predictability. */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-xs text-muted-foreground">
                Showing <span className="font-medium text-foreground">{pageStart + 1}</span>–
                <span className="font-medium text-foreground">{Math.min(pageStart + pageSize, filtered.length)}</span>
                {' '}of <span className="font-medium text-foreground">{filtered.length}</span>
              </p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Per page:</span>
                  {([24, 48, 96] as const).map(n => (
                    <Button
                      key={n}
                      size="sm"
                      variant={pageSize === n ? 'secondary' : 'ghost'}
                      className="h-7 px-2 text-xs"
                      onClick={() => setPageSize(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon" variant="outline" className="h-7 w-7"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground px-2">
                      Page {safePage} of {totalPages}
                    </span>
                    <Button
                      size="icon" variant="outline" className="h-7 w-7"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <BulkActionBar
        selectedIds={selected}
        listings={listings}
        onClear={clearSelection}
      />
    </div>
  )
}
