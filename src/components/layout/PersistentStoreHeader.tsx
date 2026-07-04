import { useMemo, useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { RefreshCw, Link2, Loader2, CheckCircle2, Plane, AlertTriangle, Menu, Sun, Moon, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useApp } from '@/contexts/AppContext'
import { computeStoreHealthScore, healthGradeColor } from '@/lib/healthScore'
import { detectShopType } from '@/lib/shopType'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Logo } from './Logo'

/**
 * Persistent top strip rendered above every authenticated page.
 * Left: live store health score + grade (when data available).
 * Middle: top active alert from the same Quick Wins source the dashboard uses.
 * Right: Etsy connection chip, Sync button, and notification bell —
 * promoted here so they're truly global instead of duplicated per page header.
 */
const PAGE_TITLES: Record<string, string> = {
  '/app/dashboard': 'Dashboard',
  '/app/listings': 'Listings',
  '/app/intelligence': 'Intelligence',
  '/app/performance': 'Performance',
  '/app/actions': 'Fix Actions',
  '/app/store-profile': 'Personalize AI',
  '/app/settings': 'Settings',
  '/app/affiliate': 'Affiliate',
}

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('radariq_theme') === 'dark' } catch { return false }
  })
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('radariq_theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('radariq_theme', 'light')
    }
  }, [dark])
  // Init from storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('radariq_theme')
    if (saved === 'dark') { document.documentElement.classList.add('dark'); setDark(true) }
    else { document.documentElement.classList.remove('dark') }
  }, [])
  return [dark, setDark] as const
}

const TOP_LEVEL_ROUTES = ['/app', '/app/dashboard', '/app/listings', '/app/intelligence', '/app/review', '/app/performance', '/app/settings', '/app/store-profile', '/app/affiliate']

export function PersistentStoreHeader({ onMobileMenuOpen }: { onMobileMenuOpen?: () => void } = {}) {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [dark, setDark] = useDarkMode()
  const {
    dashboardRows,
    syncStats,
    isStoreConnected,
    storeStatus,
    connectedStore,
    isSyncing,
    syncListings,
    syncProgress,
    syncCooldownUntil,
    refreshConnectedStore,
  } = useApp()
  const { toast } = useToast()
  const [refreshingStatus, setRefreshingStatus] = useState(false)
  const autoRefreshedRef = useRef(false)

  const refreshShopStatus = async (manual: boolean) => {
    if (refreshingStatus) return
    setRefreshingStatus(true)
    try {
      const { data, error } = await supabase.functions.invoke('refresh-shop-status', { body: {} })
      if (error) throw error
      const payload = data as { ok?: boolean; status?: { is_vacation?: boolean }; error?: string; message?: string } | null
      // Soft-fail (200 with `error`) — don't surface as a hard reconnect prompt
      if (payload?.error) {
        if (manual) {
          toast({
            title: 'Could not recheck right now',
            description: payload.message || 'Etsy did not respond. Your saved status is unchanged — try again in a moment.',
          })
        }
        return
      }
      await refreshConnectedStore()
      if (manual) {
        const stillVacation = payload?.status?.is_vacation
        toast({
          title: stillVacation ? 'Your shop is still on vacation' : 'Status refreshed',
          description: stillVacation
            ? 'Etsy still reports your shop as on vacation. Changes can take a moment to propagate — try again shortly.'
            : 'Your shop status is up to date.',
        })
      }
    } catch (e) {
      if (manual) {
        toast({
          title: 'Could not recheck right now',
          description: 'Etsy did not respond. Your saved status is unchanged — try again in a moment.',
        })
      }
    } finally {
      setRefreshingStatus(false)
    }
  }

  // When the chip shows vacation mode, auto-refresh once on mount so a recent
  // Etsy toggle gets picked up without needing a full sync.
  useEffect(() => {
    if (autoRefreshedRef.current) return
    if (!isStoreConnected || !connectedStore?.is_vacation) return
    autoRefreshedRef.current = true
    void refreshShopStatus(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStoreConnected, connectedStore?.is_vacation])

  // Proactively refresh the Etsy OAuth access token when it's near expiry
  // (within ~1 hour) so users don't see the "Reconnect" chip flicker between
  // background syncs. The edge function is a no-op if not yet needed.
  const tokenRefreshTriedRef = useRef(false)
  useEffect(() => {
    if (tokenRefreshTriedRef.current) return
    if (!isStoreConnected) return
    const exp = connectedStore?.token_expires_at
    if (!exp) return
    const msUntilExpiry = new Date(exp).getTime() - Date.now()
    // Refresh if expires within 1 hour OR already expired (let server attempt)
    if (msUntilExpiry > 60 * 60 * 1000) return
    tokenRefreshTriedRef.current = true
    void (async () => {
      try {
        await supabase.functions.invoke('etsy-refresh-token', { body: {} })
        await refreshConnectedStore()
      } catch { /* silent */ }
    })()
  }, [isStoreConnected, connectedStore?.token_expires_at, refreshConnectedStore])

  const shopType = useMemo(() => detectShopType(dashboardRows), [dashboardRows])
  const health = useMemo(
    () => computeStoreHealthScore(dashboardRows, syncStats.media, syncStats.listingCount, shopType),
    [dashboardRows, syncStats, shopType],
  )

  if (!user) return null

  const hasHealth = isStoreConnected && dashboardRows.length > 0
  const gradeC = hasHealth ? healthGradeColor(health.grade) : '#64748b'

  // Shop status chip — mirrors prior Header logic
  const shopStatus = (() => {
    if (storeStatus === 'unknown') return null
    if (!isStoreConnected) {
      return {
        icon: Link2,
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.08)',
        border: 'rgba(245,158,11,0.25)',
        text: 'Etsy · Pending',
        full: 'Etsy · Pending — connect your store',
        clickable: true,
      }
    }
    if (isSyncing || syncProgress.stage === 'pulling' || syncProgress.stage === 'starting') {
      return {
        icon: Loader2,
        color: 'hsl(var(--primary))',
        bg: 'hsl(var(--primary) / 0.08)',
        border: 'hsl(var(--primary) / 0.25)',
        text: `Etsy · Syncing`,
        full: `Etsy · Syncing — ${syncStats.listingCount} listings`,
        spin: true,
        clickable: false,
      }
    }
    const tokenExpired = connectedStore?.token_expires_at
      ? new Date(connectedStore.token_expires_at).getTime() < Date.now()
      : false
    if (tokenExpired) {
      return {
        icon: AlertTriangle,
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.08)',
        border: 'rgba(239,68,68,0.25)',
        text: 'Etsy · Reconnect',
        full: 'Etsy · Session expired — reconnect',
        clickable: true,
      }
    }
    if (connectedStore?.is_vacation) {
      return {
        icon: Plane,
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.10)',
        border: 'rgba(245,158,11,0.30)',
        text: connectedStore?.shop_name ? `${connectedStore.shop_name} · Vacation` : 'Etsy · Vacation',
        full: connectedStore?.shop_name
          ? `${connectedStore.shop_name} · Vacation mode — updates paused`
          : 'Etsy · Vacation mode — updates paused',
        clickable: false,
      }
    }
    return {
      icon: CheckCircle2,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.08)',
      border: 'rgba(16,185,129,0.25)',
      text: 'Etsy ✓',
      full: connectedStore?.shop_name
        ? `Etsy · ${connectedStore.shop_name} connected${syncStats.listingCount ? ` · ${syncStats.listingCount} listings` : ''}`
        : 'Etsy · Connected',
      clickable: false,
    }
  })()

  const now = Date.now()
  const cooldownMs = syncCooldownUntil ? syncCooldownUntil - now : 0
  const isCoolingDown = cooldownMs > 0
  const syncDisabled = isSyncing || isCoolingDown || !isStoreConnected
  const cooldownLabel = (() => {
    if (!isCoolingDown) return ''
    const mins = Math.ceil(cooldownMs / 60000)
    return mins >= 1 ? `Next sync available in ${mins} min` : 'Next sync available in <1 min'
  })()

  const syncBtn = (
    <Button
      variant="outline"
      size="sm"
      onClick={syncListings}
      disabled={syncDisabled}
      className="gap-1.5 h-7 px-2.5"
      style={{ borderColor: "hsl(var(--border))", color: 'hsl(var(--muted-foreground))' }}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline text-xs">
        {isSyncing ? 'Syncing...' : isCoolingDown ? 'Cooling down' : 'Sync'}
      </span>
    </Button>
  )

  const pageTitle = Object.entries(PAGE_TITLES).find(([path]) => location.pathname.startsWith(path))?.[1] ?? ''
  const isTopLevel = TOP_LEVEL_ROUTES.some(r => location.pathname === r || location.pathname === r + '/')
  const canGoBack = !isTopLevel && location.pathname.startsWith('/app/')
  const hasHistory = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0
  const goBack = () => { if (hasHistory) navigate(-1); else navigate('/app') }

  return (
    <div
      className="border-b shrink-0"
      style={{ background: 'hsl(var(--surface-1))', borderColor: 'hsl(var(--border))' }}
    >
      <div className="flex h-12 items-center gap-2 sm:gap-3 px-3 md:px-6 max-w-[1600px] mx-auto w-full">
      {/* Left: mobile hamburger + page title (desktop also gets back button here) */}
      <div className="flex items-center gap-2 shrink-0">
        {onMobileMenuOpen && (
          <button
            type="button"
            onClick={onMobileMenuOpen}
            className="rounded-md p-1.5 hover:bg-surface-2 md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5 text-foreground" />
          </button>
        )}
        <div className="md:hidden">
          <Logo size={20} showText animated />
        </div>
        {/* Desktop back button for sub-routes */}
        {canGoBack && (
          <button
            onClick={goBack}
            className="hidden md:flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors hover:bg-surface-2"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
          >
            <ArrowLeft className="h-3 w-3" />
            Back
          </button>
        )}
        {pageTitle && (
          <span
            className="hidden md:block text-sm font-bold text-foreground"
            style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}
          >
            {pageTitle}
          </span>
        )}
      </div>

      <div className="flex-1" />

      {/* Right cluster: score badge + Etsy chip + dark toggle + Sync + Bell */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {hasHealth && (
          <Link
            to="/app/actions"
            className="flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity"
            aria-label="Store health score"
          >
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px]"
              style={{ borderColor: gradeC, background: `${gradeC}1a` }}
            >
              <span
                className="text-[11px] font-bold leading-none"
                style={{ color: gradeC, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}
              >
                {health.overall}
              </span>
            </div>
            <span
              className="hidden md:inline text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: gradeC }}
            >
              {health.grade === 'F' ? 'Starting' : health.grade === 'D' ? 'Building' : health.grade}
            </span>
          </Link>
        )}
        {shopStatus && (() => {
          const isVacationChip = !!connectedStore?.is_vacation
          const isConnectedChip = shopStatus.text === 'Etsy ✓'
          const chipInner = (
            <>
              <shopStatus.icon className={`h-3 w-3 ${shopStatus.spin || (isVacationChip && refreshingStatus) ? 'animate-spin' : ''}`} style={{ color: shopStatus.color }} />
              {isConnectedChip ? (
                <span className="text-[11px] font-medium" style={{ color: shopStatus.color }}>{shopStatus.text}</span>
              ) : (
                <>
                  <span className="text-[11px] font-medium hidden sm:inline" style={{ color: shopStatus.color }}>{shopStatus.full}</span>
                  <span className="text-[11px] font-medium sm:hidden" style={{ color: shopStatus.color }}>{shopStatus.text}</span>
                </>
              )}
            </>
          )
          const chipClass = "flex items-center gap-1 px-2 py-1 rounded-full border transition-colors hover:opacity-90"
          const chipStyle = { background: shopStatus.bg, borderColor: shopStatus.border }
          if (isVacationChip) {
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => void refreshShopStatus(true)}
                      disabled={refreshingStatus}
                      className={chipClass}
                      style={chipStyle}
                    >
                      {chipInner}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Click to recheck vacation status from Etsy</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          }
          if (shopStatus.clickable) {
            const needsReconnect = shopStatus.text === 'Etsy · Reconnect'
            return (
              <Link
                to={needsReconnect ? '/app/connect-etsy?auto=1' : '/app/connect-etsy'}
                className={chipClass}
                style={chipStyle}
              >
                {chipInner}
              </Link>
            )
          }
          if (isConnectedChip) {
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className={chipClass} style={chipStyle}>
                      {chipInner}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{shopStatus.full}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          }
          return <div className={chipClass} style={chipStyle}>{chipInner}</div>
        })()}
        {isCoolingDown ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild><span>{syncBtn}</span></TooltipTrigger>
              <TooltipContent>{cooldownLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : syncBtn}
        {/* Dark mode toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setDark(d => !d)}
                className="h-7 w-7 flex items-center justify-center rounded-lg border transition-colors hover:bg-surface-2"
                style={{ borderColor: 'hsl(var(--border))' }}
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {dark
                  ? <Sun className="h-3.5 w-3.5 text-amber-400" />
                  : <Moon className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{dark ? 'Light mode' : 'Dark mode'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <NotificationBell />
      </div>
      </div>
    </div>
  )
}
