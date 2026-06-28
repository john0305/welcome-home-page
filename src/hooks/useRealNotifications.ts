import { useEffect, useRef } from 'react'
import { useApp } from '@/contexts/AppContext'
import { useNotifications } from '@/contexts/NotificationContext'

/**
 * Subscribes to real AppContext signals (sync results, completed
 * optimizations, expiring listings, rating swings) and emits in-app
 * notifications. Dedupes via refs (per-session) and localStorage (per-day)
 * so the bar fills only when something actually happens.
 */
const EXPIRING_KEY = 'radariq_notif_expiring_lastfired'
const RATING_KEY = 'radariq_notif_rating_last'

export function useRealNotifications() {
  const {
    syncProgress,
    recentOptimizations,
    dashboardRows,
    syncStats,
  } = useApp()
  const { add, prefs } = useNotifications()

  const lastSyncStage = useRef<string>('idle')
  const seenOptIds = useRef<Set<string>>(new Set())
  const optsHydrated = useRef(false)

  // ── sync complete / error ────────────────────────────────────────────────
  useEffect(() => {
    if (syncProgress.stage === lastSyncStage.current) return
    const prev = lastSyncStage.current
    lastSyncStage.current = syncProgress.stage

    if (syncProgress.stage === 'done' && prev !== 'idle') {
      add({
        type: 'sync_complete',
        severity: 'success',
        title: 'Sync complete',
        body: syncProgress.message || 'Your store is up to date.',
        action_label: 'View dashboard',
        action_route: '/app/dashboard',
      })
    } else if (syncProgress.stage === 'error') {
      add({
        type: 'error',
        severity: 'error',
        title: 'Sync failed',
        body: syncProgress.message || "Couldn't reach Etsy. We'll retry shortly.",
      })
    }
  }, [syncProgress.stage, syncProgress.message, add])

  // ── new completed optimizations ──────────────────────────────────────────
  useEffect(() => {
    // First pass: seed the seen-set without notifying, so we don't spam on load.
    if (!optsHydrated.current) {
      recentOptimizations.forEach(o => seenOptIds.current.add(o.id))
      optsHydrated.current = true
      return
    }
    if (!prefs.optimization_complete) return

    for (const opt of recentOptimizations) {
      if (seenOptIds.current.has(opt.id)) continue
      seenOptIds.current.add(opt.id)
      if (opt.status !== 'completed' && opt.status !== 'accepted') continue

      const improvement = opt.grade_improvement ?? 0
      const improved = improvement > 0
      add({
        type: improved ? 'grade_improved' : 'optimization_complete',
        severity: improved ? 'success' : 'info',
        title: improved ? `Grade up ${improvement} pts` : 'Optimization ready',
        body: opt.listing_title
          ? `${opt.listing_title.slice(0, 60)}${opt.listing_title.length > 60 ? '…' : ''}`
          : 'A listing finished optimizing.',
        action_label: 'Review',
        action_route: '/app/review',
        listing_id: opt.listing_id,
      })
    }
  }, [recentOptimizations, add, prefs.optimization_complete])

  // ── expiring soon (once per day) ─────────────────────────────────────────
  // Uses the listings table directly — ending_at isn't on DashboardListingRow.
  useEffect(() => {
    if (!prefs.trend_alerts) return
    if (!dashboardRows.length) return

    const today = new Date().toISOString().slice(0, 10)
    try {
      if (localStorage.getItem(EXPIRING_KEY) === today) return
    } catch { /* ignore */ }

    let cancelled = false
    ;(async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client')
        const { data } = await supabase
          .from('listings')
          .select('id, ending_at')
          .eq('state', 'active')
          .not('ending_at', 'is', null)
        if (cancelled || !data) return
        const now = Date.now()
        const expiring = data.filter(l => {
          if (!l.ending_at) return false
          const days = (new Date(l.ending_at).getTime() - now) / 86400000
          return days >= 0 && days <= 7
        })
        if (expiring.length === 0) return
        try { localStorage.setItem(EXPIRING_KEY, today) } catch { /* ignore */ }
        add({
          type: 'trend_alert',
          severity: 'warning',
          title: `${expiring.length} listing${expiring.length === 1 ? '' : 's'} expiring soon`,
          body: 'Renew within 7 days to avoid going inactive.',
          action_label: 'Review on Intelligence',
          action_route: '/app/intelligence',
        })
      } catch { /* non-fatal */ }
    })()
    return () => { cancelled = true }
  }, [dashboardRows.length, add, prefs.trend_alerts])

  // ── rating swing ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!prefs.trend_alerts) return
    const { shopRating, ratingDelta, ratingTrend } = syncStats
    if (shopRating == null || ratingDelta == null || ratingTrend == null) return
    if (Math.abs(ratingDelta) < 0.05) return // ignore noise

    const sig = `${shopRating.toFixed(2)}|${ratingDelta.toFixed(2)}`
    try {
      const last = localStorage.getItem(RATING_KEY)
      if (last === sig) return
      localStorage.setItem(RATING_KEY, sig)
    } catch { /* ignore */ }

    const up = ratingTrend === 'up'
    add({
      type: 'trend_alert',
      severity: up ? 'success' : 'warning',
      title: up
        ? `Shop rating up ${ratingDelta.toFixed(2)} ★`
        : `Shop rating down ${Math.abs(ratingDelta).toFixed(2)} ★`,
      body: `Now ${shopRating.toFixed(2)} ★ across ${syncStats.reviewCount} reviews.`,
      action_route: '/app/store-profile',
    })
  }, [syncStats, add, prefs.trend_alerts])
}
