import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  hasUnread: boolean
  onToggle: () => void
}

export function EchoBubble({ open, hasUnread, onToggle }: Props) {
  const [pulse, setPulse] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const schedule = () => {
      const delay = 45_000 + Math.random() * 45_000
      timeoutRef.current = window.setTimeout(() => {
        if (cancelled) return
        setPulse(true)
        window.setTimeout(() => !cancelled && setPulse(false), 500)
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      cancelled = true
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <div className="hidden md:block fixed bottom-5 right-5 z-50 group">
      {/* Tooltip */}
      <div className={cn(
        'echo-tooltip pointer-events-none absolute right-full mr-3 top-1/2 -translate-y-1/2',
        'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
      )}>
        {open ? 'Close Echo' : 'Ask Echo'}
      </div>

      <button
        data-echo-toggle
        onClick={onToggle}
        aria-label={open ? 'Close Echo' : 'Ask Echo'}
        className={cn(
          'echo-bubble relative transition-transform duration-[400ms] ease-out active:scale-95',
          pulse && 'scale-[1.1]',
          !pulse && 'scale-100',
          open && 'is-open',
        )}
      >
        {/* Radar */}
        <div className="relative" style={{ width: 38, height: 38 }}>
          <div className="echo-ring-outer" />
          <div className="echo-ring-inner" />
          <div className="echo-sweep" />
          <div className="echo-dot" />
        </div>

        {/* Unread indicator */}
        {hasUnread && !open && (
          <span className="echo-unread" aria-label="New message from Echo" />
        )}
      </button>
    </div>
  )
}
