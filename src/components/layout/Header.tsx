import { useEffect } from 'react'
import { AlertTriangle, Sparkles, ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useMobileHeader } from '@/contexts/MobileHeaderContext'

const STORE_PROFILE_KEY = 'radariq_store_personality'

function usePersonalityComplete() {
  try {
    const stored = localStorage.getItem(STORE_PROFILE_KEY)
    if (!stored) return false
    const p = JSON.parse(stored)
    return !!(p.store_description && p.target_audience && p.brand_voice)
  } catch {
    return false
  }
}

interface HeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function Header({ title, description, actions }: HeaderProps) {
  const { isDbConnected, setupStatus } = useApp()
  const { usingMockAuth, user } = useAuth()
  const personalityComplete = usePersonalityComplete()
  const navigate = useNavigate()
  const location = useLocation()
  const { setMobileHeader, clearMobileHeader } = useMobileHeader()

  // Top-level routes never show Back. Every other /app/* route does, falling back
  // to /app (Dashboard) when there's no browser history (e.g. direct URL / refresh).
  const TOP_LEVEL_ROUTES = ['/app', '/app/dashboard', '/app/listings', '/app/intelligence', '/app/review', '/app/performance', '/app/settings', '/app/store-profile']
  const isTopLevel = TOP_LEVEL_ROUTES.includes(location.pathname)
  const hasHistory = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0
  const canGoBack = !isTopLevel
  const fromLabel = (location.state as { fromLabel?: string } | null)?.fromLabel
  const goBack = () => {
    if (hasHistory) navigate(-1)
    else navigate('/app')
  }

  // On mobile, push our back+title into the MobileTopHeader so there's only
  // one sticky header at top-0 (avoids content bleeding above the header).
  useEffect(() => {
    if (canGoBack) {
      setMobileHeader({
        title,
        onBack: goBack,
        actions,
      })
    }
    return () => clearMobileHeader()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, canGoBack])

  // System-status notices are platform-admin only — normal users don't need to see backend health
  const isAdmin = user?.email === 'admin@radariq.app'
  const missingServices = isAdmin
    ? [!isDbConnected && 'Database', !setupStatus.gemini && 'AI Provider'].filter(Boolean)
    : []

  return (
    <div className="hidden sticky top-0 z-20 border-b border-border bg-surface-1/95 backdrop-blur-md shadow-warm-sm">
      {/* Admin-only mock-mode / missing-services notice */}
      {isAdmin && (usingMockAuth || missingServices.length > 0) && (
        <div className="px-6 py-2 border-b border-amber-500/20 bg-amber-500/8">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <p className="text-xs">
              {usingMockAuth
                ? 'Demo mode — mock data only. Configure backend for real persistence.'
                : `Missing: ${missingServices.join(', ')}. See Platform Admin.`}
            </p>
          </div>
        </div>
      )}

      {/* Main header row */}
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        {/* Left: back button (if applicable) + page title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {canGoBack && (
            <button
              onClick={goBack}
              className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-surface-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{fromLabel ?? 'Back'}</span>
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>{title}</h1>
            {description && <p className="truncate text-xs mt-0.5 text-muted-foreground">{description}</p>}
          </div>
        </div>

        {/* Right: page-specific actions + Personalize AI nudge */}
        <div className="flex items-center gap-2">
          {!personalityComplete && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/app/store-profile"
                    state={{ fromLabel: title || 'Dashboard' }}
                  >
                    <Button size="sm" variant="teal" className="gap-1.5 animate-pulse">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Personalize AI</span>
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>Tell Radar IQ about your brand voice for better optimizations</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {actions}
        </div>
      </div>
    </div>
  )
}
