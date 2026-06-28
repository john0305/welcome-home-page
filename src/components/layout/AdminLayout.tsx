import { Outlet } from 'react-router-dom'
import { AdminSidebar } from './AdminSidebar'
import { Toaster } from '@/components/ui/toaster'
import { AchievementToast } from '@/components/achievements/AchievementToast'

export function AdminLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </div>
      </main>
      <Toaster />
      <AchievementToast />
    </div>
  )
}
