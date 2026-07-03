import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Toaster } from '@/components/ui/toaster'
import { MobileHeaderProvider } from '@/contexts/MobileHeaderContext'

import { Echo } from '@/components/echo/Echo'
import { EtsyDisclaimer } from '@/components/EtsyDisclaimer'
import { ListingActionsProvider } from '@/hooks/useListingActions'
import { BulkProgressPanel } from '@/components/listings/BulkProgressPanel'
import { useRealNotifications } from '@/hooks/useRealNotifications'
import { useTractionNotifications } from '@/hooks/useTractionNotifications'
import { PersistentStoreHeader } from './PersistentStoreHeader'
import { MobileTopHeader } from './MobileTopHeader'
import { MobileBottomNav } from './MobileBottomNav'
import { OnboardingRedirects } from '@/components/onboarding/OnboardingRedirects'
import { MorningSummaryToast } from '@/components/actions/MorningSummaryToast'
// Achievements are disabled pre-launch — toast + delivery hook are stubbed out.

import { ScoreGainToast } from '@/components/dashboard/ScoreGainToast'
import { useScoreChangeWatcher } from '@/hooks/useScoreChangeWatcher'
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner'

function NotificationBridge() {
  useRealNotifications()
  useTractionNotifications()
  useScoreChangeWatcher()
  return null
}

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Preload the most-visited pages in the background so bottom-nav
  // navigation is instant after the first render, not just after the
  // first visit to each page.
  useEffect(() => {
    const preload = () => {
      void import('@/pages/Listings')
      void import('@/pages/Intelligence')
      void import('@/pages/Performance')
      void import('@/pages/Settings')
      void import('@/pages/ActionQueue')
      void import('@/pages/ScoreRoadmap')
      void import('@/pages/ListingDetail')
    }
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(preload, { timeout: 4000 })
    } else {
      setTimeout(preload, 2500)
    }
  }, [])

  return (
    <MobileHeaderProvider>
    <ListingActionsProvider>
    <NotificationBridge />
    <OnboardingRedirects />
    <MorningSummaryToast />
    <div className="flex h-screen flex-col overflow-hidden bg-background">
    <ImpersonationBanner />
    <div className="flex flex-1 overflow-hidden">
      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      <main className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Both headers live OUTSIDE the scroll container so they never scroll away */}
        <MobileTopHeader />
        <div className="hidden md:block">
          <PersistentStoreHeader onMobileMenuOpen={() => setMobileNavOpen(true)} />
        </div>
        <div
          className="flex-1 overflow-y-auto scrollbar-thin pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0"
          style={{ overscrollBehaviorY: 'none' }}
        >
          <div className="w-full max-w-[1600px] mx-auto">
          <Outlet />
          <footer className="hidden md:block px-4 pt-2 pb-3">
            <EtsyDisclaimer />
          </footer>
          </div>
        </div>
      </main>
      <Toaster />
      <Echo />
      <BulkProgressPanel />
      {/* AchievementToast removed — achievements disabled pre-launch */}
      <ScoreGainToast />
      <MobileBottomNav />
    </div>
    </div>
    </ListingActionsProvider>
    </MobileHeaderProvider>
  )
}
