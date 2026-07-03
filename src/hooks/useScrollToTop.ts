import { useEffect } from 'react'
import type { RefObject } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Resets scroll position to the top on every route change.
 *
 * React Router's BrowserRouter does not do this automatically for SPA
 * navigations — without it, a new page opens wherever the previous page's
 * scroll offset happened to be (e.g. landing mid-page or at the bottom).
 *
 * The app's actual scrollable regions are internal `overflow-y-auto` divs
 * inside AppLayout/AdminLayout, not the window — `window.scrollTo` alone
 * does nothing there. Pass that container's ref to reset it directly;
 * omit it on pages that rely on normal document-level scrolling (the
 * window reset below still runs either way, which is what those need).
 */
export function useScrollToTop(containerRef?: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation()
  useEffect(() => {
    containerRef?.current?.scrollTo({ top: 0, left: 0 })
    window.scrollTo({ top: 0, left: 0 })
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Window-scroll variant for routes outside AppLayout/AdminLayout (Landing,
 * Login, Register, Privacy, Terms, etc.) — those pages rely on normal
 * document-level scrolling, so the window reset alone is sufficient. Mount
 * once near the top of the router tree; renders nothing.
 */
export function ScrollToTop() {
  useScrollToTop()
  return null
}
