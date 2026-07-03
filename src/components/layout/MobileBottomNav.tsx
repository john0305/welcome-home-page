import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, List, Brain, Target } from 'lucide-react'
import { toggleEcho, ECHO_STATE_EVENT } from '@/components/echo/Echo'
import { useApp } from '@/contexts/AppContext'

const LEFT_ITEMS = [
  { to: '/app/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/app/listings',     icon: List,            label: 'Listings'  },
] as const

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) {
  return (
    <li className="flex-1">
      <NavLink
        to={to}
        end={to === '/app/dashboard'}
        className="flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-1.5 px-1 transition-all active:scale-95 relative"
      >
        {({ isActive }) => (
          <>
            {/* Active indicator dot at top of item */}
            <span
              className={`absolute top-1.5 left-1/2 -translate-x-1/2 rounded-full transition-all duration-200 ${isActive ? 'w-5 bg-primary' : 'w-1 bg-transparent'}`}
              style={{ height: 3, borderRadius: 99 }}
            />
            {isActive && (
              <span className="absolute inset-x-1 inset-y-0 rounded-xl bg-primary/10" />
            )}
            <Icon
              className={`h-5 w-5 relative ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
              aria-hidden="true"
            />
            <span className={`text-[10px] font-medium leading-none relative ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
              {label}
            </span>
          </>
        )}
      </NavLink>
    </li>
  )
}

export function MobileBottomNav() {
  const [echoOpen, setEchoOpen] = useState(false)
  const [pulse, setPulse] = useState(false)
  const { recentOptimizations } = useApp()

  // Show Analytics tab only when the user has applied optimizations that
  // have had time to generate attribution data (7+ day window).
  const hasAnalyticsData = recentOptimizations.length > 0

  // Stay in sync with Echo's internal open state.
  useEffect(() => {
    const handler = (e: Event) => {
      setEchoOpen((e as CustomEvent<{ open: boolean }>).detail.open)
    }
    window.addEventListener(ECHO_STATE_EVENT, handler)
    return () => window.removeEventListener(ECHO_STATE_EVENT, handler)
  }, [])

  // Occasional gentle pulse on the center button.
  useEffect(() => {
    if (echoOpen) return
    let cancelled = false
    const schedule = () => {
      const delay = 50_000 + Math.random() * 40_000
      setTimeout(() => {
        if (cancelled) return
        setPulse(true)
        setTimeout(() => !cancelled && setPulse(false), 400)
        schedule()
      }, delay)
    }
    schedule()
    return () => { cancelled = true }
  }, [echoOpen])

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 select-none bg-surface-1 border-t border-border shadow-[0_-2px_12px_hsl(0_0%_0%/0.06)]"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        overflow: 'visible',
      }}
    >
      <ul className="flex items-stretch justify-around" style={{ overflow: 'visible' }}>
        {LEFT_ITEMS.map(item => <NavItem key={item.to} {...item} />)}

        {/* Center Echo button */}
        <li className="relative flex-1 flex items-center justify-center" style={{ minWidth: 64 }}>
          <div
            aria-hidden
            className="absolute pointer-events-none rounded-full bg-surface-1"
            style={{ width: 62, height: 62, bottom: 4, left: '50%', transform: 'translateX(-50%)' }}
          />
          <button
            onClick={toggleEcho}
            aria-label={echoOpen ? 'Close Echo' : 'Ask Echo'}
            className="absolute transition-transform active:scale-95"
            style={{
              width: 52, height: 52, bottom: 10, left: '50%',
              transform: `translateX(-50%) scale(${pulse ? 1.06 : 1})`,
              transition: 'transform 400ms ease, box-shadow 300ms ease',
              borderRadius: '50%',
              background: 'hsl(163 60% 26%)',
              border: echoOpen ? '2px solid hsl(163 60% 40%)' : '2px solid hsl(163 60% 36%)',
              boxShadow: echoOpen
                ? '0 4px 20px hsl(163 60% 26% / 0.5), 0 0 0 6px hsl(163 60% 26% / 0.12)'
                : '0 4px 14px hsl(163 60% 26% / 0.35)',
            }}
          >
            <div className="relative" style={{ width: 36, height: 36, margin: '0 auto' }}>
              <div className="absolute inset-0 rounded-full" style={{ border: '1px solid rgba(255,255,255,0.35)' }} />
              <div className="absolute rounded-full" style={{ inset: 8, border: '1px solid hsl(var(--border))' }} />
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'conic-gradient(from 0deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.4) 50deg, rgba(255,255,255,0) 75deg)',
                  animation: 'echo-radar-sweep-kf 4.5s linear infinite',
                }}
              />
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ width: 4, height: 4, background: 'white', boxShadow: '0 0 6px rgba(255,255,255,0.9)' }}
              />
            </div>
            {!echoOpen && (
              <span id="echo-nav-unread" className="absolute rounded-full hidden"
                style={{ top: 2, right: 2, width: 8, height: 8, background: 'hsl(22 65% 56%)', border: '2px solid white' }} />
            )}
          </button>
        </li>

        {/* Score Roadmap — always right of the radar, core action page */}
        <NavItem to="/app/score-roadmap" icon={Target} label="Roadmap" />

        {/* Intelligence */}
        <NavItem to="/app/intelligence" icon={Brain} label="Intelligence" />
      </ul>
    </nav>
  )
}
