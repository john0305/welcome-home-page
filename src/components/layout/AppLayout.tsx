import { useState, useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { useScrollToTop } from '@/hooks/useScrollToTop'
import { Sidebar } from './Sidebar'
import { Toaster } from '@/components/ui/toaster'
import { MobileHeaderProvider } from '@/contexts/MobileHeaderContext'

import { Echo } from '@/components/echo/Echo'
import { EtsyDisclaimer } from '@/components/EtsyDisclaimer'
import { ListingActionsProvider } from '@/hooks/useListingActions'
import { BulkProgressPanel } from '@/components/listings/BulkProgressPanel'
import { useRealNotifications } from '@/hooks/useRealNotifications'
import { useTractionNotifications } from '@/hooks/useTractionNotifications'
import { useProactiveInsights } from '@/hooks/useProactiveInsights'
import { PersistentStoreHeader } from './PersistentStoreHeader'
import { MobileTopHeader } from './MobileTopHeader'
import { MobileBottomNav } from './MobileBottomNav'
import { OnboardingRedirects } from '@/components/onboarding/OnboardingRedirects'
import { MorningSummaryToast } from '@/components/actions/MorningSummaryToast'
// Achievements are disabled pre-launch — toast + delivery hook are stubbed out.

import { ScoreGainToast } from '@/components/dashboard/ScoreGainToast'
import { useScoreChangeWatcher } from '@/hooks/useScoreChangeWatcher'
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner'
import { useApp } from '@/contexts/AppContext'
import { loadPersonalization } from '@/lib/personalization'
import { maybeAutoAdaptTheme } from '@/lib/themeAdaptation'

function NotificationBridge() {
  useRealNotifications()
  useTractionNotifications()
  useScoreChangeWatcher()
  useProactiveInsights()
  return null
}

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { connectedStore } = useApp()
  // The scrollable region is this internal div, not the window — reset it
  // (and the window, harmlessly) on every route change so a new page always
  // opens at the top instead of wherever the previous page's scroll offset was.
  const scrollRef = useRef<HTMLDivElement>(null)
  useScrollToTop(scrollRef)

  // Skin-deep theme adaptation from the seller's confirmed shop personality
  // (Section 6). Manual Settings choice always wins; see themeAdaptation.ts.
  useEffect(() => {
    const shopId = connectedStore?.id
    if (!shopId) return
    void loadPersonalization(shopId).then(p => maybeAutoAdaptTheme(p?.category))
  }, [connectedStore?.id])

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
    <div data-app-shell className="flex h-screen flex-col overflow-hidden bg-background">
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
          ref={scrollRef}
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
