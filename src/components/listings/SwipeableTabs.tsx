import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface SwipeTab {
  id: string
  label: ReactNode
  /** Optional small count/badge shown next to the label */
  badge?: ReactNode
  /** When true, renders the tab at reduced opacity to indicate it's empty/inactive */
  muted?: boolean
  content: ReactNode
}

interface Props {
  tabs: SwipeTab[]
  defaultTab?: string
  value?: string
  onChange?: (id: string) => void
  className?: string
}

/**
 * Horizontally swipeable tab carousel. Each panel snaps full-width.
 * The sticky tab bar above stays in sync via IntersectionObserver on each
 * panel — tapping a tab scrolls smoothly to that panel; swiping the panels
 * updates the active tab indicator.
 */
export function SwipeableTabs({ tabs, defaultTab, value, onChange, className = '' }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [internal, setInternal] = useState<string>(defaultTab ?? tabs[0]?.id ?? '')
  const active = value ?? internal
  // Suppress IntersectionObserver updates during programmatic scrolls
  const programmaticScroll = useRef(false)

  const setActive = (id: string) => {
    if (value === undefined) setInternal(id)
    onChange?.(id)
  }

  // Scroll the active tab chip into view in the sticky bar
  useEffect(() => {
    const bar = tabBarRef.current
    if (!bar) return
    const chip = bar.querySelector<HTMLButtonElement>(`[data-tab="${active}"]`)
    chip?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [active])

  // Observe panels to sync active tab while user swipes (not during programmatic scrolls)
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const io = new IntersectionObserver(
      (entries) => {
        if (programmaticScroll.current) return
        // Pick the most-visible panel
        let best: { id: string; ratio: number } | null = null
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.panel ?? ''
          if (!id) continue
          if (!best || e.intersectionRatio > best.ratio) best = { id, ratio: e.intersectionRatio }
        }
        if (best && best.ratio > 0.55 && best.id !== active) setActive(best.id)
      },
      { root: track, threshold: [0.25, 0.55, 0.85] },
    )
    Object.values(panelRefs.current).forEach((el) => el && io.observe(el))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length])

  const goTo = (id: string) => {
    setActive(id)
    programmaticScroll.current = true
    const panel = panelRefs.current[id]
    panel?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
    // Release the lock after scroll animation completes (~600ms)
    window.setTimeout(() => { programmaticScroll.current = false }, 700)
  }

  return (
    <div className={className}>
      {/* Sticky tab bar */}
      <div
        ref={tabBarRef}
        className="sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
        role="tablist"
      >
        {tabs.map((t) => {
          const isActive = t.id === active
          return (
            <button
              key={t.id}
              data-tab={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => goTo(t.id)}
              className={`relative shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? 'border-primary/60 bg-primary/15 text-primary shadow-[0_0_0_1px_hsl(var(--primary) / 0.25)]'
                  : 'border-border/50 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted'
              } ${t.muted && !isActive ? 'opacity-40' : ''}`}
            >
              <span className="flex items-center gap-1.5">
                {t.label}
                {t.badge != null && (
                  <span
                    className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-foreground'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* Swipeable track */}
      <div
        ref={trackRef}
        className="mt-3 flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth scrollbar-none"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {tabs.map((t) => (
          <div
            key={t.id}
            data-panel={t.id}
            ref={(el) => { panelRefs.current[t.id] = el }}
            className="w-full shrink-0 snap-start snap-always pr-1"
            role="tabpanel"
            aria-labelledby={t.id}
          >
            <div className="space-y-4">{t.content}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
