import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Activity, BarChart3, FlaskConical, TrendingUp,
  ChevronLeft, ChevronRight, ShieldAlert, LogOut, Mail, Coins,
  GitBranch, Globe, Settings2, UserCog,
} from 'lucide-react'
import { Logo } from './Logo'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { useAuth } from '@/contexts/AuthContext'

const NAV = [
  {
    label: 'Platform',
    items: [
      { to: '/app/admin', icon: LayoutDashboard, label: 'Overview', end: true },
      { to: '/app/admin/users', icon: Users, label: 'Users' },
      { to: '/app/admin/activity', icon: Activity, label: 'Activity' },
      { to: '/app/admin/usage', icon: BarChart3, label: 'Usage & Health' },
      { to: '/app/admin/tokens', icon: Coins, label: 'AI Tokens' },
      { to: '/app/admin/performance', icon: TrendingUp, label: 'Performance' },
      { to: '/app/admin/ab-testing', icon: FlaskConical, label: 'A/B Testing' },
      // Achievements admin hidden — feature disabled pre-launch
      { to: '/app/admin/beta', icon: Mail, label: 'Beta Waitlist' },
      { to: '/app/admin/pipeline', icon: GitBranch, label: 'Pipeline' },
      { to: '/app/admin/niches', icon: Globe, label: 'Niches' },
      { to: '/app/admin/market-settings', icon: Settings2, label: 'Settings' },
    ],
  },
  {
    label: 'Dev',
    items: [
      { to: '/app/admin/dev-login', icon: UserCog, label: 'Login as User (Local)' },
    ],
  },
] as const

export function AdminSidebar() {
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'relative flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        <div className={cn('flex h-16 items-center border-b border-sidebar-border px-4', collapsed && 'justify-center')}>
          <Logo size={28} showText={!collapsed} animated />
        </div>

        {!collapsed && (
          <div className="mx-3 mt-3">
            <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 border border-amber-500/20">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-amber-600 dark:text-amber-200">Admin Console</p>
                <p className="text-[10px] text-amber-500/70 dark:text-amber-300/60">Platform operator view</p>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {NAV.map(section => (
            <div key={section.label} className="mb-2">
              {!collapsed && (
                <p className="mx-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {section.label}
                </p>
              )}
              {section.items.map(item => (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={item.to}
                      end={'end' in item ? item.end : false}
                      className={({ isActive }) =>
                        cn(
                          'mx-2 mb-0.5 flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm transition-all',
                          isActive
                            ? 'bg-primary/12 font-semibold text-primary border border-primary/25 shadow-[0_2px_10px_hsl(var(--primary)/0.15)]'
                            : 'text-sidebar-foreground/55 border border-transparent hover:bg-sidebar-accent hover:text-sidebar-foreground',
                          collapsed && 'justify-center px-2'
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    </NavLink>
                  </TooltipTrigger>
                  {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
                </Tooltip>
              ))}
            </div>
          ))}
        </nav>

        <Separator className="bg-sidebar-border" />

        <div className={cn('p-3', collapsed && 'flex flex-col items-center gap-2')}>
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-amber-500/20 text-amber-300 text-xs">
                  {user?.username?.slice(0, 2).toUpperCase() ?? 'AD'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sidebar-foreground">{user?.username ?? 'Admin'}</p>
                <Badge className="text-[10px] bg-amber-500/20 text-amber-300 border-amber-500/30 mt-0.5">Admin</Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground"
                onClick={handleLogout}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="absolute -right-3 top-20 h-6 w-6 rounded-full border bg-background shadow-sm z-10"
          onClick={() => setCollapsed(c => !c)}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </Button>
      </aside>
    </TooltipProvider>
  )
}
