import { useCallback, useEffect, useState } from 'react'

/**
 * Global default/advanced view mode (Section 7).
 * - 'simple' (default): 3-5 prioritized actions, plain language, dense
 *   filter/stat machinery tucked behind disclosures.
 * - 'advanced': raw scores, full breakdowns, all filters — for power sellers.
 * Persisted per browser; broadcast via a custom event so every mounted
 * consumer flips together.
 */
const KEY = 'radariq_view_mode'
const EVENT = 'radariq-view-mode-change'

export type ViewMode = 'simple' | 'advanced'

function read(): ViewMode {
  try {
    return localStorage.getItem(KEY) === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

export function useViewMode(): { mode: ViewMode; setMode: (m: ViewMode) => void; isAdvanced: boolean } {
  const [mode, setModeState] = useState<ViewMode>(read)

  useEffect(() => {
    const onChange = () => setModeState(read())
    window.addEventListener(EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  const setMode = useCallback((m: ViewMode) => {
    try { localStorage.setItem(KEY, m) } catch { /* cosmetic */ }
    setModeState(m)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return { mode, setMode, isAdvanced: mode === 'advanced' }
}
