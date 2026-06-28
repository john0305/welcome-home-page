import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Logo } from './Logo'
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

export function MobileTopHeader() {
  const { user } = useAuth()
  const { title, onBack, actions } = useMobileHeader()
  const location = useLocation()
  const personalityComplete = usePersonalityComplete()

  const initials = user
    ? (user.full_name?.trim() || user.username || '?')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w: string) => w[0].toUpperCase())
        .join('')
    : '?'

  const avatar = (
    <Link
      to="/app/settings"
      aria-label="Account"
      className="flex h-8 w-8 items-center justify-center rounded-full shrink-0 active:opacity-70 transition-opacity overflow-hidden bg-primary/12 border border-primary/35"
    >
      {user?.avatar_url ? (
        <img src={user.avatar_url} alt={initials} className="w-full h-full object-cover" />
      ) : (
        <span className="text-[11px] font-semibold leading-none text-primary">
          {initials}
        </span>
      )}
    </Link>
  )

  return (
    <header
      className="md:hidden flex items-center select-none shrink-0 bg-surface-1 border-b border-border shadow-warm-sm px-3"
      style={{
        height: 52,
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {title ? (
        /* Sub-page mode: Back button | Title | actions+avatar */
        <>
          <button
            onClick={onBack ?? undefined}
            className="flex items-center gap-1 shrink-0 rounded-[var(--radius-sm)] border border-primary/25 bg-primary/8 px-2 py-1.5 text-xs font-medium text-primary transition-colors active:opacity-70"
            aria-label="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>

          <p className="flex-1 mx-3 text-sm font-semibold truncate text-foreground">
            {title}
          </p>

          <div className="flex items-center gap-2 shrink-0">
            {!personalityComplete && (
              <Link
                to="/app/store-profile"
                state={{ fromLabel: title || 'Back' }}
                className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-primary/35 bg-primary/8 px-2 py-1 text-[11px] font-medium text-primary animate-pulse"
              >
                <Sparkles className="h-3 w-3" />
                <span className="hidden xs:inline">Personalize AI</span>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'hsl(var(--primary))' }} />
              </Link>
            )}
            {actions}
            {avatar}
          </div>
        </>
      ) : (
        /* Top-level mode: spacer | Logo | Avatar */
        <>
          <div style={{ width: 36 }} />
          <div className="flex-1 flex items-center justify-center">
            <Logo size={22} showText animated />
          </div>
          {avatar}
        </>
      )}
    </header>
  )
}
