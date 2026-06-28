import { useEffect, useRef, useState } from 'react'
import { Palette, Check } from 'lucide-react'
import { THEMES, type ThemeId, getStoredTheme, setTheme } from '@/lib/theme'

export function ThemeSelector({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<ThemeId>(() => getStoredTheme())
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Outside click closes dropdown
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Sync with external theme changes
  useEffect(() => {
    const onChange = (e: Event) => {
      const id = (e as CustomEvent<ThemeId>).detail
      if (id) setActive(id)
    }
    window.addEventListener('radariq:theme-change', onChange as EventListener)
    return () => window.removeEventListener('radariq:theme-change', onChange as EventListener)
  }, [])

  const pick = (id: ThemeId) => {
    setTheme(id)
    setActive(id)
    setOpen(false)
  }

  const activeMeta = THEMES.find(t => t.id === active) ?? THEMES[0]

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label="Choose theme"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="riq-theme-trigger inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition"
      >
        <Palette className="h-4 w-4" />
        <span className="hidden sm:inline">Theme</span>
        <span
          className="inline-block h-3 w-3 rounded-full ring-1"
          aria-hidden
          style={{ background: activeMeta.swatch, boxShadow: '0 0 0 1px hsl(var(--border))' }}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme options"
          className="riq-theme-menu absolute right-0 mt-2 w-60 rounded-xl border overflow-hidden z-[110]"
        >
          {THEMES.map(t => {
            const isActive = t.id === active
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => pick(t.id)}
                className="riq-theme-item w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition"
              >
                <span
                  className="inline-block h-5 w-5 rounded-full shrink-0"
                  style={{ background: t.swatch, boxShadow: '0 0 0 1px rgba(255,255,255,0.18)' }}
                  aria-hidden
                />
                <span className="flex-1 truncate">
                  <span className="mr-1.5" aria-hidden>{t.emoji}</span>
                  {t.name}
                </span>
                {isActive && <Check className="h-4 w-4 shrink-0" aria-hidden />}
              </button>
            )
          })}
        </div>
      )}

      <style>{`
        .riq-theme-trigger {
          background: color-mix(in srgb, var(--riq-accent, #C8A97E) 8%, transparent);
          border-color: var(--riq-border, hsl(var(--border)));
          color: var(--riq-text, #fff);
        }
        .riq-theme-trigger:hover {
          background: color-mix(in srgb, var(--riq-accent, #C8A97E) 14%, transparent);
        }
        .riq-theme-menu {
          background: var(--riq-card, #1E1E30);
          border-color: var(--riq-border, rgba(255,255,255,0.12));
          color: var(--riq-text, #fff);
          box-shadow: 0 16px 40px rgba(0,0,0,0.45);
        }
        .riq-theme-item { color: var(--riq-text, #fff); }
        .riq-theme-item:hover {
          background: color-mix(in srgb, var(--riq-accent, #C8A97E) 14%, transparent);
        }
        .riq-theme-item[aria-checked="true"] {
          background: color-mix(in srgb, var(--riq-accent, #C8A97E) 10%, transparent);
          color: var(--riq-accent, #C8A97E);
        }
      `}</style>
    </div>
  )
}
