import { useEffect, useMemo, useRef } from 'react'
import { useApp } from '@/contexts/AppContext'
import { computeStoreHealthScore } from '@/lib/healthScore'
import { detectShopType } from '@/lib/shopType'
import { showScoreChange } from '@/lib/scoreToast'

/**
 * Watches the derived store-health score for changes. When the score
 * moves (after a fix is applied, a re-grade, or a sync), it surfaces a
 * small inline toast with the delta.
 *
 * Mounted once at the app root so it works regardless of which page the
 * user happens to be on when the change lands.
 */
export function useScoreChangeWatcher() {
  const { dashboardRows, syncStats } = useApp()
  const shopType = useMemo(() => detectShopType(dashboardRows), [dashboardRows])
  const health = useMemo(
    () => computeStoreHealthScore(dashboardRows, syncStats.media, syncStats.listingCount, shopType),
    [dashboardRows, syncStats, shopType],
  )

  const prevRef = useRef<number | null>(null)

  useEffect(() => {
    if (!dashboardRows.length) return
    const score = health.overall
    const prev = prevRef.current
    // First observation — seed without firing.
    if (prev === null) { prevRef.current = score; return }
    if (score !== prev) {
      const delta = score - prev
      // Only animate meaningful movements; skip 0-delta and tiny float noise.
      if (Math.abs(delta) >= 1) showScoreChange(delta, score)
      prevRef.current = score
    }
  }, [health.overall, dashboardRows.length])
}
