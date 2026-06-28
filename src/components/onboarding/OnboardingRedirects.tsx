import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '@/contexts/AppContext'
import { hasSelectedPlan } from '@/lib/onboardingFlags'

/**
 * Drives the first-run signup flow:
 *   email/pw → connect Etsy → auto-sync → "aha" → choose plan → (billing) → dashboard
 *
 * 1. If the user lands inside /app without an Etsy store connected, route them
 *    straight to /app/connect-etsy. We allow them to stay on connect-etsy,
 *    settings, choose-plan, or affiliate without bouncing.
 * 2. Once a sync completes successfully AND the store is connected AND the
 *    user hasn't yet picked a plan, send them to /app/choose-plan. Tracked
 *    via a localStorage flag so we never nag returning users.
 */
export function OnboardingRedirects() {
  const navigate = useNavigate()
  const location = useLocation()
  const { storeStatus, isStoreConnected, syncProgress } = useApp()
  const lastSyncStageRef = useRef(syncProgress.stage)

  // Seed the plan-selected flag for returning users — anyone whose store is
  // already connected on first mount is past the new-user funnel, so don't
  // bounce them to /choose-plan after a routine sync.
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    if (storeStatus === 'unknown') return
    seededRef.current = true
    if (isStoreConnected && !hasSelectedPlan()) {
      try { localStorage.setItem('radariq_plan_selected', '1') } catch {}
    }
  }, [storeStatus, isStoreConnected])

  // Step 1 — push unconnected users to the Etsy connect screen.
  useEffect(() => {
    if (storeStatus !== 'not_connected') return
    const allow = ['/app/connect-etsy', '/app/settings', '/app/choose-plan', '/app/affiliate']
    if (allow.some(p => location.pathname.startsWith(p))) return
    navigate('/app/connect-etsy', { replace: true })
  }, [storeStatus, location.pathname, navigate])

  // Step 2 — after first successful sync, route to plan selection (once).
  useEffect(() => {
    const prev = lastSyncStageRef.current
    lastSyncStageRef.current = syncProgress.stage
    if (prev === 'done' || syncProgress.stage !== 'done') return
    if (!isStoreConnected) return
    if (hasSelectedPlan()) return
    if (location.pathname.startsWith('/app/choose-plan')) return
    navigate('/app/choose-plan', { replace: true })
  }, [syncProgress.stage, isStoreConnected, location.pathname, navigate])

  return null
}
