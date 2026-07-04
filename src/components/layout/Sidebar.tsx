import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, BarChart2, List, Sparkles, Settings,
  Link2, Store, LogOut, Crown, Gift,
  ShieldAlert, ShieldCheck, MessageSquare, TrendingUp, X, ChevronRight, Flag,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EchoFeedbackForm } from '@/components/echo/EchoFeedbackForm'
import { usePendingFixCount } from '@/hooks/useFixActions'
import { useShopIntelligence } from '@/hooks/useShopIntelligence'
import { Logo } from './Logo'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { useAuth } from '@/contexts/AuthContext'
import { useApp } from '@/contexts/AppContext'
import { LockedFeatureModal, type LockedFeature } from '@/components/upgrade/LockedFeatureModal'
import { toggleEcho } from '@/components/echo/Echo'

type LockMeta = { requiredTier: LockedFeature['requiredTier']; description: string }
const LOCK_META: Record<string, LockMeta> = {
  '/app/ab-testing': {
    requiredTier: 'pro',
    description: 'Test two AI-optimized variants of any listing and let Radar IQ pick the winner after two weeks.',
  },
}

// Ordered by the daily-use loop, not alphabetically: land on Dashboard →
// approve what's queued (Fix Actions) → manage inventory (Listings) →
// check what changed (Performance) → go deep occasionally (Intelligence).
const NAV_ITEMS = [
  { to: '/app/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/app/actions',      icon: ShieldCheck,     label: 'Fix Actions',  badge: 'actions' as const },
  { to: '/app/listings',     icon: List,            label: 'Listings',     badge: 'listings' as const },
  { to: '/app/performance',  icon: TrendingUp,      label: 'Performance' },
  { to: '/app/intelligence', icon: BarChart2,       label: 'Intelligence' },
]

const BOTTOM_ITEMS = [
  { to: '/app/store-profile', icon: Sparkles, label: 'Personalize AI' },
  { to: '/app/affiliate',     icon: Gift,     label: 'Affiliate', affiliateOnly: true as const },
  { to: '/app/settings',      icon: Settings, label: 'Settings' },
]

const TIER_ORDER: Record<string, number> = { free: 0, starter: 1, pro: 2, agency: 3, admin: 99 }

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps = {}) {
  const [lockedFeature, setLockedFeature] = useState<LockedFeature | null>(null)
  const [comingSoonOpen, setComingSoonOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const { user, logout } = useAuth()
  const { connectedStore, isStoreConnected, storeStatus } = useApp()
  const navigate = useNavigate()
  const isAdmin = user?.tier === 'admin' || user?.email === 'admin@radariq.app'
  const userTierRank = TIER_ORDER[user?.tier ?? 'free'] ?? 0

  const pendingActions = usePendingFixCount()
  const { intelligence } = useShopIntelligence(user?.id)
  const competitorAlertCount = intelligence?.active_competitor_alerts ?? 0

  const getBadgeCount = (badge?: 'listings' | 'actions') => {
    if (badge === 'actions') return pendingActions > 0 ? pendingActions : undefined
    return undefined
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const storeName = connectedStore?.shop_name
  const initials = (user?.full_name?.trim() || user?.username || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('')

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden backdrop-blur-sm"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'flex h-[100dvh] w-[220px] flex-col bg-surface-1 border-r border-border transition-all duration-300',
          'fixed inset-y-0 left-0 z-50 md:relative md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Mobile close */}
        <button
          type="button"
          onClick={onMobileClose}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-foreground/40 hover:bg-surface-2 md:hidden"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Logo + brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <Logo size={32} showText={false} animated />
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
              RadarIQ
            </p>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Shop Optimization</p>
          </div>
        </div>

        {/* Store pill */}
        <div className="px-4 pt-4 pb-1">
          {storeStatus === 'unknown' ? (
            <div className="h-8 rounded-lg bg-surface-2 animate-pulse" />
          ) : isStoreConnected && storeName ? (
            <div className="flex items-center gap-2 rounded-lg bg-primary/8 border border-primary/15 px-3 py-2">
              <Store className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate text-xs font-medium text-primary">{storeName}</span>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            </div>
          ) : storeStatus === 'not_connected' ? (
            <NavLink to="/app/connect-etsy" onClick={onMobileClose}>
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 hover:bg-amber-100 transition-colors">
                <Link2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="text-xs text-amber-700 font-medium">Connect Etsy store →</span>
              </div>
            </NavLink>
          ) : null}
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 scrollbar-thin">
          {NAV_ITEMS.map(item => {
            const badge = getBadgeCount(item.badge as any)
            const isDashboard = item.to === '/app/dashboard'
            const lockMeta = LOCK_META[item.to]
            const isLockedForUser = !!lockMeta && userTierRank < (TIER_ORDER[lockMeta.requiredTier] ?? 99)

            if (isLockedForUser && lockMeta) {
              return (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => setLockedFeature({ label: item.label, description: lockMeta.description, requiredTier: lockMeta.requiredTier, icon: item.icon })}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground/50 hover:bg-surface-2 transition-colors"
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  <Crown className="h-3 w-3 text-primary/50" />
                </button>
              )
            }

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={isDashboard}
                onClick={onMobileClose}
                className={({ isActive }) => cn(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground/60 hover:bg-surface-2 hover:text-foreground'
                )}
              >
                {({ isActive }) => (
                  <>
                    {/* Left active indicator */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
                    )}
                    <item.icon className={cn('h-4 w-4 shrink-0', isActive && 'text-primary')} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {isDashboard && competitorAlertCount > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                        {competitorAlertCount}
                      </span>
                    )}
                    {badge !== undefined && (
                      <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}

          {/* Divider */}
          <div className="my-2 border-t border-border" />

          {/* Bottom nav items */}
          {BOTTOM_ITEMS.map(item => {
            const itemAny = item as any
            if (itemAny.affiliateOnly && !(user as any)?.is_affiliate && !isAdmin) return null
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onMobileClose}
                className={({ isActive }) => cn(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground/60 hover:bg-surface-2 hover:text-foreground'
                )}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />}
                    <item.icon className={cn('h-4 w-4 shrink-0', isActive && 'text-primary')} />
                    <span className="flex-1 truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            )
          })}

          {/* Feedback */}
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-foreground/60 hover:bg-surface-2 hover:text-foreground transition-colors"
          >
            <Flag className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left truncate">Share Feedback</span>
          </button>

          {/* Admin */}
          {isAdmin && (
            <NavLink
              to="/app/admin"
              onClick={onMobileClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Platform Admin</span>
            </NavLink>
          )}

          {/* Coming soon teaser */}
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setComingSoonOpen(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-muted-foreground/50 hover:bg-surface-2 transition-colors"
            >
              <span className="flex-1 text-left">More coming soon</span>
              <ChevronRight className={cn('h-3 w-3 transition-transform', comingSoonOpen && 'rotate-90')} />
            </button>
            {comingSoonOpen && (
              <div className="px-3 py-1 space-y-1 animate-fade-in">
                {[{ label: 'Review Management', icon: MessageSquare }].map(i => (
                  <div key={i.label} className="flex items-center gap-2 px-2 py-1 opacity-40 cursor-not-allowed text-xs">
                    <i.icon className="h-3.5 w-3.5" />
                    <span>{i.label}</span>
                    <span className="ml-auto text-[9px] border border-current rounded px-1">Soon</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Ask Your Store CTA */}
        <div className="px-4 pb-3">
          <button
            type="button"
            data-echo-toggle
            onClick={toggleEcho}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-warm-sm"
          >
            <Sparkles className="h-4 w-4" />
            Ask Your Store
          </button>
        </div>

        {/* User footer */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 shrink-0">
              {(user as any)?.avatar_url ? (
                <img src={(user as any).avatar_url} alt={initials} className="h-full w-full object-cover rounded-full" />
              ) : (
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground leading-tight">
                {storeName ?? user?.username ?? 'User'}
              </p>
              <p className="text-[10px] text-muted-foreground capitalize">{user?.tier ?? 'free'} plan</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLogout}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
                  aria-label="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Sign out</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>

      <LockedFeatureModal feature={lockedFeature} onClose={() => setLockedFeature(null)} />

      {/* Feedback dialog */}
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Share Feedback</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2 mb-1">
            Report a bug, suggest a feature, or just tell us what you think. Every submission goes straight to the team.
          </p>
          <EchoFeedbackForm />
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
