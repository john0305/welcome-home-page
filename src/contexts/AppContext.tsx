import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { ConnectedStore, EtsyListing, QueueItem, DashboardStats, OptimizationRecord, DashboardListingRow } from '@/types'
import { isSupabaseConfigured } from '@/lib/supabase'
import { mockStore, mockListings, mockQueue, computeMockDashboardStats } from '@/data/mockData'
import { computeDashboardStatsFromListings } from '@/lib/stats'
import { useAuth } from './AuthContext'
import { hydrateOnboardingFromServer } from '@/lib/onboardingHydration'
import { completeOnboardingStep as _completeOnboardingStep } from '@/types/onboarding'

export interface MediaBreakdown {
  missingPhotos: number       // 0 images
  fewPhotos: number           // 1-4 images
  underTenPhotos: number      // 5-9 images
  fullPhotos: number          // 10 images
  missingVideo: number        // 0 videos
  hasVideo: number            // >=1 video
  fullMediaCount: number      // 10 images AND >=1 video
}

export interface LiveSyncStats {
  listingCount: number
  activeCount: number
  oldestListingAt: string | null
  newestListingAt: string | null
  avgActiveAgeDays: number | null
  uniqueTagCount: number
  withPhotosCount: number
  avgPrice: number | null
  minPrice: number | null
  maxPrice: number | null
  lastUpdatedAt: string | null
  media: MediaBreakdown
  shopRating: number | null
  reviewCount: number
  ratingTrend: 'up' | 'down' | 'flat' | null
  ratingDelta: number | null
}

export interface ShopSnapshotPoint {
  recorded_on: string
  total_views: number
  total_favorites: number
  total_sales: number
  orders_30d: number
  revenue_30d: number
}


interface AppContextValue {
  connectedStore: ConnectedStore | null
  setConnectedStore: (store: ConnectedStore | null) => void
  isStoreConnected: boolean
  storeStatus: 'unknown' | 'connected' | 'not_connected'

  // dashboardRows: slim 13-column rows always available after login. Used for all
  // dashboard KPIs, health score, and quick actions so the dashboard never needs
  // the heavy full-listing payload.
  dashboardRows: DashboardListingRow[]

  // listings: full EtsyListing rows. Populated lazily only when the Listings
  // page calls loadListings(). Kept in context so navigating back to the page
  // within the same session is instant — no re-fetch needed.
  listings: EtsyListing[]
  setListings: (listings: EtsyListing[]) => void
  loadListings: () => Promise<void>
  isLoadingListings: boolean
  loadDashboardData: () => Promise<void>


  isSyncing: boolean
  syncProgress: { stage: 'idle' | 'starting' | 'pulling' | 'done' | 'error'; message: string }
  lastSyncedAt: string | null
  syncCooldownUntil: number | null
  syncListings: () => Promise<void>
  syncStats: LiveSyncStats
  refreshSyncStats: () => Promise<void>
  refreshConnectedStore: () => Promise<void>


  queue: QueueItem[]
  addToQueue: (listingId: string) => void
  removeFromQueue: (queueId: string) => void

  dashboardStats: DashboardStats | null
  recentOptimizations: OptimizationRecord[]
  // Listing IDs that currently have at least one optimization awaiting the
  // user's review. Used to swap the "Never optimized" badge for a
  // "Pending review" reminder on cards and detail pages.
  pendingReviewListingIds: Set<string>
  refreshPendingReviewIds: () => Promise<void>
  // Last ~14 shop_snapshots oldest→newest, used for tiny trend sparklines.
  shopSnapshotHistory: ShopSnapshotPoint[]
  // Lifetime totals from the most recent shop_snapshot (Etsy returns these
  // cumulatively, so they only need the latest row).
  lifetimeSales: number | null

  isDbConnected: boolean
  setupStatus: SetupStatus
}

interface SetupStatus {
  supabase: boolean
  etsy: boolean
  gemini: boolean
  googleAnalytics: boolean
}


const AppContext = createContext<AppContextValue | null>(null)

const EMPTY_MEDIA: MediaBreakdown = {
  missingPhotos: 0, fewPhotos: 0, underTenPhotos: 0, fullPhotos: 0,
  missingVideo: 0, hasVideo: 0, fullMediaCount: 0,
}

const EMPTY_SYNC_STATS: LiveSyncStats = {
  listingCount: 0, activeCount: 0, oldestListingAt: null, newestListingAt: null,
  avgActiveAgeDays: null, uniqueTagCount: 0, withPhotosCount: 0, avgPrice: null,
  minPrice: null, maxPrice: null,
  lastUpdatedAt: null, media: EMPTY_MEDIA,
  shopRating: null, reviewCount: 0, ratingTrend: null, ratingDelta: null,
}


export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const usingMock = !isSupabaseConfigured

  const [connectedStore, setConnectedStore] = useState<ConnectedStore | null>(
    usingMock ? mockStore : null
  )
  const [storeStatus, setStoreStatus] = useState<'unknown' | 'connected' | 'not_connected'>(
    usingMock ? 'connected' : 'unknown'
  )

  // Full listing rows — only populated when the Listings page needs them.
  // Starts as mock data in dev, empty for real users until explicitly loaded.
  const [listings, setListings] = useState<EtsyListing[]>(usingMock ? mockListings : [])
  const [isLoadingListings, setIsLoadingListings] = useState(false)
  const listingsLoadedRef = useRef(false)

  // Slim dashboard rows — fetched on login and after every sync.
  // Selecting only 13 columns keeps this payload ~90% smaller than select('*'),
  // which matters most for shops with 200–500 listings.
  const [dashboardRows, setDashboardRows] = useState<DashboardListingRow[]>(
    // Map mock listings to the slim shape so dev mode works without a DB call.
    usingMock ? mockListings.map(l => ({
      id: l.id,
      title: l.title,
      thumbnail_url: l.thumbnail_url,
      state: l.state,
      current_grade: l.current_grade,
      views: l.views,
      favorites: l.favorites,
      sales_count: l.sales_count,
      price: l.price,
      tags: l.tags,
      photo_count: l.image_urls?.length ?? 0,
      optimization_count: l.optimization_count,
      etsy_created_at: l.etsy_created_at,
    })) : []
  )

  const [queue, setQueue] = useState<QueueItem[]>(usingMock ? mockQueue : [])
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ stage: 'idle' | 'starting' | 'pulling' | 'done' | 'error'; message: string }>(
    { stage: 'idle', message: '' }
  )
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    usingMock ? new Date().toISOString() : null
  )
  const [syncStats, setSyncStats] = useState<LiveSyncStats>(EMPTY_SYNC_STATS)
  const [recentOptimizations, setRecentOptimizations] = useState<OptimizationRecord[]>([])
  const [pendingReviewListingIds, setPendingReviewListingIds] = useState<Set<string>>(new Set())
  // Holds the latest syncListings fn so the auto-sync effect doesn't need it in deps.
  const syncListingsRef = useRef<(() => Promise<void>) | null>(null)
  // Epoch ms until which manual sync is rate-limited (from a 429 response). Null = no cooldown.
  const [syncCooldownUntil, setSyncCooldownUntil] = useState<number | null>(null)



  // Latest shop_snapshots row — written by snapshot-performance after each sync.
  // Used to fill the dashboard totals (views/sales/revenue) because Etsy's
  // per-listing endpoint doesn't return aggregate sales numbers.
  const [latestShopSnapshot, setLatestShopSnapshot] = useState<null | {
    total_views: number; total_sales: number; orders_30d: number;
    revenue_30d: number; total_favorites: number;
  }>(null)
  // Recent ~14 snapshots, oldest→newest, for tiny trend sparklines.
  const [shopSnapshotHistory, setShopSnapshotHistory] = useState<ShopSnapshotPoint[]>([])

  // Derived dashboard stats — recalculated only when dashboardRows or queue change,
  // not on every render, so 300 listings don't cause unnecessary recomputation.
  const dashboardStats = useMemo<DashboardStats | null>(() => {
    if (usingMock) return computeMockDashboardStats()
    if (dashboardRows.length === 0) return null
    return computeDashboardStatsFromListings(dashboardRows, queue, recentOptimizations, latestShopSnapshot)
  }, [usingMock, dashboardRows, queue, recentOptimizations, latestShopSnapshot])


  // ── refreshSyncStats ────────────────────────────────────────────────────────
  // Polled every 2.5s during an active sync so the radar animation and live
  // counters in LiveSyncPanel update in real time. Kept separate from
  // loadDashboardData because this runs while sync is still in progress.
  const refreshSyncStats = useCallback(async () => {
    if (usingMock || !user?.id) return
    const { supabase } = await import('@/integrations/supabase/client')
    const [{ data, error }, { data: snaps }] = await Promise.all([
      supabase
        .from('listings')
        .select('etsy_listing_id, state, tags, photo_count, video_count, price, created_at, etsy_created_at, last_synced')
        .eq('user_id', user.id)
        .limit(5000),
      supabase
        .from('shop_snapshots')
        .select('avg_rating, review_count, recorded_on')
        .eq('user_id', user.id)
        .order('recorded_on', { ascending: false })
        .limit(7),
    ])
    if (error || !data) return
    const tagSet = new Set<string>()
    let active = 0
    let priceSum = 0
    let priceCount = 0
    let priceMin: number | null = null
    let priceMax: number | null = null
    let withPhotos = 0

    let oldest: string | null = null
    let newest: string | null = null
    let activeAgeSumMs = 0
    let activeAgeCount = 0
    const nowMs = Date.now()
    const media: MediaBreakdown = { ...EMPTY_MEDIA }
    type Row = { state?: string | null; tags?: string[] | null; photo_count?: number | null; video_count?: number | null; price?: number | null; created_at?: string | null; etsy_created_at?: string | null }
    for (const row of data as Row[]) {
      const isActive = row.state === 'active'
      if (isActive) active++
      const pc = row.photo_count ?? 0
      const vc = row.video_count ?? 0
      if (pc > 0) withPhotos++
      if (pc === 0) media.missingPhotos++
      else if (pc < 5) media.fewPhotos++
      else if (pc < 10) media.underTenPhotos++
      else media.fullPhotos++
      if (vc === 0) media.missingVideo++; else media.hasVideo++
      if (pc >= 10 && vc >= 1) media.fullMediaCount++
      if (typeof row.price === 'number') {
        priceSum += row.price; priceCount++
        if (priceMin == null || row.price < priceMin) priceMin = row.price
        if (priceMax == null || row.price > priceMax) priceMax = row.price
      }
      for (const t of row.tags ?? []) tagSet.add(t)
      const createdRef = row.etsy_created_at ?? row.created_at
      if (createdRef && isActive) {
        if (!oldest || createdRef < oldest) oldest = createdRef
        if (!newest || createdRef > newest) newest = createdRef
        activeAgeSumMs += nowMs - new Date(createdRef).getTime()
        activeAgeCount++
      }
    }
    const avgActiveAgeDays = activeAgeCount
      ? Math.round(activeAgeSumMs / activeAgeCount / 86_400_000)
      : null

    const snapRows = (snaps ?? []) as Array<{ avg_rating: number | null; review_count: number | null }>
    const latestRating = snapRows[0]?.avg_rating ?? null
    // Find the most recent earlier snapshot whose rating actually differs, so a
    // string of identical snapshots reads as "Stable" instead of "no data".
    let prevRating: number | null = null
    for (let i = 1; i < snapRows.length; i++) {
      const r = snapRows[i]?.avg_rating
      if (r != null) { prevRating = r; break }
    }
    let ratingTrend: 'up' | 'down' | 'flat' | null = null
    let ratingDelta: number | null = null
    if (latestRating != null && prevRating != null) {
      ratingDelta = Number((latestRating - prevRating).toFixed(2))
      ratingTrend = ratingDelta > 0.005 ? 'up' : ratingDelta < -0.005 ? 'down' : 'flat'
    } else if (latestRating != null && snapRows.length >= 2) {
      // We have multiple snapshots but they all match — explicitly stable.
      ratingTrend = 'flat'
      ratingDelta = 0
    }

    setSyncStats({
      listingCount: data.length, activeCount: active, oldestListingAt: oldest,
      newestListingAt: newest, avgActiveAgeDays, uniqueTagCount: tagSet.size,
      withPhotosCount: withPhotos,
      avgPrice: priceCount ? priceSum / priceCount : null,
      minPrice: priceMin, maxPrice: priceMax,
      lastUpdatedAt: new Date().toISOString(),
      media,
      shopRating: latestRating,
      reviewCount: snapRows[0]?.review_count ?? 0,
      ratingTrend,
      ratingDelta,
    })
  }, [user?.id, usingMock])

  // ── loadDashboardData ───────────────────────────────────────────────────────
  // Fetches the minimum columns needed to power every dashboard metric. Selecting
  // 13 targeted columns instead of `*` cuts the payload from ~2KB/row to ~200
  // bytes/row — a 500-listing shop goes from ~1MB to ~100KB. Called once on
  // login and once after each sync; the dashboard is always fresh without
  // making the user wait on a full listing dump.
  const loadDashboardData = useCallback(async () => {
    if (usingMock || !user?.id) return
    try {
      const { supabase } = await import('@/integrations/supabase/client')
      const [{ data }, { data: snapHistoryData }] = await Promise.all([
        supabase
          .from('listings')
          .select('id, etsy_listing_id, title, thumbnail_url, state, score, price, tags, photo_count, video_count, etsy_created_at, updated_at, views, favorites, quantity, optimization_count')
          .eq('user_id', user.id)
          .order('etsy_created_at', { ascending: false })
          .limit(5000),
        // Pull up to ~14 most recent snapshots. The first row is "latest"
        // (used for the headline KPIs); the full series powers sparklines.
        supabase
          .from('shop_snapshots')
          .select('total_views, total_sales, orders_30d, revenue_30d, total_favorites, recorded_on')
          .eq('user_id', user.id)
          .order('recorded_on', { ascending: false })
          .limit(14),
      ])
      if (!data) return

      const snapsDesc = (snapHistoryData ?? []) as Array<{
        total_views: number; total_sales: number; orders_30d: number;
        revenue_30d: number; total_favorites: number; recorded_on: string;
      }>
      const snapshot = snapsDesc[0] ?? null
      // History is oldest→newest for the sparkline; drop the lifetime-only
      // "total_sales" since it's cumulative and not interesting as a trend.
      const history: ShopSnapshotPoint[] = [...snapsDesc].reverse().map(s => ({
        recorded_on: s.recorded_on,
        total_views: s.total_views ?? 0,
        total_favorites: s.total_favorites ?? 0,
        total_sales: s.total_sales ?? 0,
        orders_30d: s.orders_30d ?? 0,
        revenue_30d: Number(s.revenue_30d ?? 0),
      }))

      const rows: DashboardListingRow[] = (data as unknown as Array<Record<string, unknown>>).map(r => ({
        id: r.id as string,
        title: r.title as string,
        thumbnail_url: (r.thumbnail_url as string | null) ?? null,
        state: r.state as string,
        current_grade: r.score as number | null,
        views: (r.views as number) ?? 0,
        favorites: (r.favorites as number) ?? 0,
        sales_count: 0,
        price: (r.price as number) ?? 0,
        tags: (r.tags as string[]) ?? [],
        photo_count: (r.photo_count as number) ?? 0,
        video_count: (r.video_count as number | undefined) ?? 0,
        etsy_listing_id: (r.etsy_listing_id as string | number | null) ?? null,
        optimization_count: (r.optimization_count as number) ?? 0,
        etsy_created_at: r.etsy_created_at as string,
        updated_at: (r.updated_at as string | null) ?? null,
        quantity: (r.quantity as number | undefined) ?? undefined,
      }))
      setDashboardRows(rows)
      setLatestShopSnapshot(snapshot)
      setShopSnapshotHistory(history)
    } catch { /* non-fatal — dashboard degrades gracefully to empty state */ }
  }, [user?.id, usingMock])


  // ── loadListings ────────────────────────────────────────────────────────────
  // Full select('*') — only called when the Listings page mounts. Once loaded,
  // data stays in memory for the session so navigating back is instant. Not
  // called on login because the dashboard doesn't need the full payload.
  const loadListings = useCallback(async () => {
    if (usingMock || !user?.id) return
    setIsLoadingListings(true)
    try {
      const { supabase } = await import('@/integrations/supabase/client')
      const { data } = await supabase
        .from('listings')
        .select('*')
        .eq('user_id', user.id)
        .order('etsy_created_at', { ascending: false })
        .limit(5000)
      if (data) {
        const mapped = (data as unknown as Array<Record<string, unknown>>).map(r => ({
          ...r,
          current_grade: r.current_grade ?? r.score ?? null,
          sales_count: r.sales_count ?? 0,
          decay_points: r.decay_points ?? 0,
          needs_attention: r.needs_attention ?? false,
          clarifying_questions: r.clarifying_questions ?? null,
          clarifying_answers: r.clarifying_answers ?? null,
        }))
        setListings(mapped as unknown as EtsyListing[])
        listingsLoadedRef.current = true
      }
    } catch { /* silently ignore */ }
    finally { setIsLoadingListings(false) }
  }, [user?.id, usingMock])

  // ── loadRecentOptimizations ─────────────────────────────────────────────────
  // Populated after login and after sync so the activity feed reflects what the
  // AI has actually done. Kept at 10 rows — the feed only shows 6 at a time.
  const loadRecentOptimizations = useCallback(async () => {
    if (usingMock || !user?.id) return
    try {
      const { supabase } = await import('@/integrations/supabase/client')
      const { data } = await supabase
        .from('optimizations')
        .select('*, listings(title)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (data) {
        const mapped = (data as unknown as Array<Record<string, unknown> & { listings?: { title?: string } | null }>).map(r => ({
          ...r,
          listing_title: r.listings?.title ?? 'Untitled listing',
        }))
        setRecentOptimizations(mapped as unknown as OptimizationRecord[])
      }
    } catch { /* optimizations table may not exist on all environments yet */ }
  }, [user?.id, usingMock])

  // ── refreshPendingReviewIds ────────────────────────────────────────────────
  // Pulls every listing_id with a pending optimization so listing cards can
  // show a "Pending review" badge instead of "Never optimized" — a reminder
  // to the user that they have AI suggestions waiting for approval.
  const refreshPendingReviewIds = useCallback(async () => {
    if (usingMock || !user?.id) { setPendingReviewListingIds(new Set()); return }
    try {
      const { supabase } = await import('@/integrations/supabase/client')
      const { data } = await supabase
        .from('optimizations')
        .select('listing_id')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .limit(5000)
      const ids = new Set<string>()
      for (const row of (data ?? []) as Array<{ listing_id: string | null }>) {
        if (row.listing_id) ids.add(row.listing_id)
      }
      setPendingReviewListingIds(ids)
    } catch { /* non-fatal — badge just won't appear */ }
  }, [user?.id, usingMock])

  // ── Load connection status + initial data ───────────────────────────────────
  const loadConnectedStore = useCallback(async () => {
    if (usingMock || !user?.id) return
    const { supabase } = await import('@/integrations/supabase/client')
    const { data: token, error: tokenErr } = await supabase
      .from('etsy_connection_status')
      .select('shop_id, shop_name, expires_at, created_at')
      .eq('user_id', user.id)
      .maybeSingle()
    // Transient auth errors (e.g. expired JWT mid-refresh) must NOT mark the
    // store as disconnected — that would yank a paying user back to the
    // /connect-etsy onboarding screen on every nav click.
    if (tokenErr) {
      console.warn('loadConnectedStore: token query failed, leaving status unchanged', tokenErr)
      return
    }
    if (token) {
      const t = token as { shop_id: string; shop_name: string | null; expires_at: string; created_at: string }
      const { data: storeRow } = await supabase
        .from('stores')
        .select('is_vacation, vacation_message, vacation_autoreply, currency_code, listing_count, last_synced')
        .eq('user_id', user.id)
        .eq('etsy_shop_id', t.shop_id)
        .maybeSingle()
      const s = (storeRow ?? {}) as { is_vacation?: boolean; vacation_message?: string | null; vacation_autoreply?: string | null; currency_code?: string | null; listing_count?: number; last_synced?: string | null }
      setConnectedStore({
        id: t.shop_id, user_id: user.id, platform: 'etsy', shop_id: t.shop_id,
        shop_name: t.shop_name ?? 'Etsy Shop', token_expires_at: t.expires_at,
        is_connected: true, created_at: t.created_at,
        is_vacation: !!s.is_vacation,
        vacation_message: s.vacation_message ?? null,
        vacation_autoreply: s.vacation_autoreply ?? null,
        currency_code: s.currency_code ?? null,
        listing_count: s.listing_count,
        last_sync_at: s.last_synced ?? undefined,
      })
      setStoreStatus('connected')
    } else {
      setStoreStatus('not_connected')
    }
  }, [user?.id, usingMock])

  const loadedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (usingMock || !user?.id) return
    if (loadedForRef.current === user.id) return
    loadedForRef.current = user.id
    // Fire store check first; slim dashboard data and sync stats load in parallel
    // after we know whether the store is connected. Full listings wait until the
    // Listings page explicitly requests them.
    void loadConnectedStore().then(async () => {
      void Promise.all([loadDashboardData(), refreshSyncStats()])
      void loadRecentOptimizations()
      void refreshPendingReviewIds()
      void hydrateOnboardingFromServer(user.id)

      // ── Auto-sync (session-guarded) ────────────────────────────────────────
      // Fire a background sync if the store hasn't been synced in 6+ hours.
      // sessionStorage guard ensures this runs once per browser session even
      // if AppContext remounts during navigation.
      try {
        const guardKey = `radariq_autosync_checked_${user.id}`
        if (sessionStorage.getItem(guardKey)) return
        sessionStorage.setItem(guardKey, '1')
        const { supabase } = await import('@/integrations/supabase/client')
        const { data: store } = await supabase
          .from('stores').select('last_synced').eq('user_id', user.id).maybeSingle()
        const lastSync = (store as { last_synced?: string | null } | null)?.last_synced
        const sixHoursAgo = Date.now() - 6 * 3_600_000
        const stale = !lastSync || new Date(lastSync).getTime() < sixHoursAgo
        if (stale) {
          // Fire-and-forget; syncListings is gated by isSyncing internally.
          void syncListingsRef.current?.()
        }
      } catch { /* non-fatal */ }
    })
  }, [user?.id, usingMock, loadConnectedStore, loadDashboardData, refreshSyncStats, loadRecentOptimizations, loadListings, refreshPendingReviewIds])

  // Retry connection probe on tab focus when we don't yet have a confirmed
  // status — covers the case where the first probe hit an expired JWT before
  // Supabase finished its silent refresh.
  useEffect(() => {
    if (usingMock || !user?.id) return
    const retry = () => {
      if (storeStatus !== 'connected') void loadConnectedStore()
    }
    window.addEventListener('focus', retry)
    return () => window.removeEventListener('focus', retry)
  }, [usingMock, user?.id, storeStatus, loadConnectedStore])



  // Auto-complete onboarding steps based on live app state.
  // Uses completeOnboardingStep() so it correctly initialises localStorage
  // from scratch on a fresh browser instead of failing silently.
  useEffect(() => {
    if (!connectedStore) return
    _completeOnboardingStep('connect_store')
    window.dispatchEvent(new Event('radariq:onboarding-updated'))
  }, [connectedStore])

  const syncListings = useCallback(async () => {
    if (isSyncing) return
    // Don't even attempt if we're in a known cooldown window.
    if (syncCooldownUntil && Date.now() < syncCooldownUntil) return
    setIsSyncing(true)
    setSyncProgress({ stage: 'starting', message: 'Reaching out to Etsy…' })

    // Poll sync stats every 2.5s during the sync so the radar animation and
    // live counters in LiveSyncPanel feel real-time without hammering the DB.
    const poll = window.setInterval(() => {
      void refreshSyncStats()
      setSyncProgress({ stage: 'pulling', message: 'Downloading active listings…' })
    }, 2500)

    try {
      const { supabase } = await import('@/integrations/supabase/client')
      const { data, error } = await supabase.functions.invoke('sync-listings')

      let body: { error?: string; message?: string; synced?: number; shop_name?: string; retry_after_seconds?: number; reason?: string } | null = null
      if (error) {
        try {
          const ctx = (error as { context?: Response }).context
          if (ctx && typeof ctx.json === 'function') body = await ctx.json()
        } catch { /* fall through */ }
        // Rate-limit response: stash cooldown so the header button can disable.
        if (body?.error === 'rate_limited' && body.retry_after_seconds) {
          setSyncCooldownUntil(Date.now() + body.retry_after_seconds * 1000)
        }
        const friendly = body?.message ?? body?.error ?? error.message ?? 'Sync failed'
        console.error('sync-listings error', error, body)
        setSyncProgress({ stage: 'error', message: friendly })
      } else {
        const result = data as { synced?: number; shop_name?: string } | null
        // Achievements disabled pre-launch — skip awarding.
        setSyncProgress({
          stage: 'done',
          message: result?.synced != null ? `Synced ${result.synced} listings` : 'Sync complete',
        })
        setLastSyncedAt(new Date().toISOString())
        setSyncCooldownUntil(null)
      }

      // Refresh slim dashboard data and sync stats in parallel after sync so
      // KPI cards update immediately. Full listings are NOT re-fetched here
      // because 300+ rows are expensive and most users won't immediately visit
      // the Listings page after a sync. If they do, loadListings() fires then.
      await Promise.all([loadDashboardData(), refreshSyncStats()])
      void loadRecentOptimizations()
      void refreshPendingReviewIds()

      // Fire-and-forget: take a fresh snapshot after every successful sync so
      // TodaysPulse deltas and trending data update automatically. Not awaited —
      // the user shouldn't wait the extra ~5s while Etsy receipts are fetched.
      // When it resolves, we reload dashboard data to pick up the new snapshot row.
      if (!error) {
        void supabase.functions.invoke('snapshot-performance', { body: {} })
          .then(() => loadDashboardData())
          .catch(() => { /* non-fatal — nightly cron covers missed snapshots */ })
      }

    } finally {
      window.clearInterval(poll)
      setIsSyncing(false)
      window.setTimeout(() => setSyncProgress({ stage: 'idle', message: '' }), 4000)
    }
  }, [isSyncing, syncCooldownUntil, refreshSyncStats, loadDashboardData, loadRecentOptimizations, refreshPendingReviewIds])

  // Keep ref pointed at latest fn so the auto-sync effect can invoke without
  // adding syncListings to its deps (would create a remount loop).
  useEffect(() => { syncListingsRef.current = syncListings }, [syncListings])


  const addToQueue = useCallback((listingId: string) => {
    // Check full listings first (populated if user visited Listings page), then
    // fall back to dashboardRows so this works even before a full load.
    const full = listings.find(l => l.id === listingId)
    const slim = !full ? dashboardRows.find(r => r.id === listingId) : null
    const source = full ?? slim
    if (!source) return

    const exists = queue.find(q => q.listing_id === listingId && q.status === 'pending')
    if (exists) return

    const item: QueueItem = {
      id: `q-${Date.now()}`,
      listing_id: listingId,
      listing_title: source.title,
      listing_thumbnail: source.thumbnail_url ?? undefined,
      current_grade: source.current_grade ?? 0,
      priority: (source.current_grade ?? 100) < 50 ? 'high' : 'medium',
      reason: 'Manually scheduled',
      scheduled_for: user?.settings.optimization_schedule === 'immediate' ? 'immediate' : 'nightly',
      created_at: new Date().toISOString(),
      status: 'pending',
    }
    setQueue(prev => [item, ...prev])
  }, [listings, dashboardRows, queue, user])

  const removeFromQueue = useCallback((queueId: string) => {
    setQueue(prev => prev.filter(q => q.id !== queueId))
  }, [])

  const hasAiOverride = typeof window !== 'undefined' && !!localStorage.getItem('radariq_ai_provider_key')
  const setupStatus: SetupStatus = {
    supabase: isSupabaseConfigured,
    etsy: !!connectedStore,
    gemini: isSupabaseConfigured || hasAiOverride,
    googleAnalytics: !!import.meta.env.VITE_GA_PROPERTY_ID,

  }

  return (
    <AppContext.Provider value={{
      connectedStore, setConnectedStore, isStoreConnected: !!connectedStore, storeStatus,
      dashboardRows,
      listings, setListings, loadListings, isLoadingListings, loadDashboardData,

      isSyncing, syncProgress, lastSyncedAt, syncCooldownUntil, syncListings,
      syncStats, refreshSyncStats, refreshConnectedStore: loadConnectedStore,
      queue, addToQueue, removeFromQueue,
      dashboardStats, recentOptimizations,
      pendingReviewListingIds, refreshPendingReviewIds,
      shopSnapshotHistory,
      lifetimeSales: latestShopSnapshot?.total_sales ?? null,
      isDbConnected: isSupabaseConfigured,
      setupStatus,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
