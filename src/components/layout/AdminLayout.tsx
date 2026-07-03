import { useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { AdminSidebar } from './AdminSidebar'
import { Toaster } from '@/components/ui/toaster'
import { AchievementToast } from '@/components/achievements/AchievementToast'
import { useScrollToTop } from '@/hooks/useScrollToTop'

export function AdminLayout() {
  // Same internal-scroll-container reset as AppLayout — this div, not the
  // window, is what actually scrolls here.
  const scrollRef = useRef<HTMLDivElement>(null)
  useScrollToTop(scrollRef)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </div>
      </main>
      <Toaster />
      <AchievementToast />
    </div>
  )
}
