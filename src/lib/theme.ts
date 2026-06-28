// RadarIQ landing-page theme registry + helpers.
// Themes are applied via a `data-theme` attribute on <html>.
// All visual tokens live in src/styles/themes.css (no inline styles).

export const THEME_STORAGE_KEY = 'radariq_theme'
export const DEFAULT_THEME = 'radar-amber'

export type ThemeId =
  | 'radar-amber'
  | 'midnight-teal'
  | 'crimson-dark'
  | 'cobalt-night'
  | 'forest-ink'
  | 'rose-gold'

export interface ThemeMeta {
  id: ThemeId
  name: string
  emoji: string
  swatch: string // accent color for the dot
}

export const THEMES: ThemeMeta[] = [
  { id: 'radar-amber',   name: 'Radar Amber',   emoji: '🟠', swatch: '#C8A97E' },
  { id: 'midnight-teal', name: 'Midnight Teal', emoji: '🟢', swatch: '#2DD4BF' },
  { id: 'crimson-dark',  name: 'Crimson Dark',  emoji: '🔴', swatch: '#E05252' },
  { id: 'cobalt-night',  name: 'Cobalt Night',  emoji: '🔵', swatch: '#6C9EFF' },
  { id: 'forest-ink',    name: 'Forest Ink',    emoji: '🟩', swatch: '#7ACA85' },
  { id: 'rose-gold',     name: 'Rose Gold',     emoji: '🌸', swatch: '#E8A0A8' },
]

const VALID = new Set<string>(THEMES.map(t => t.id))

export function isValidTheme(v: unknown): v is ThemeId {
  return typeof v === 'string' && VALID.has(v)
}

export function getStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (isValidTheme(v)) return v
  } catch { /* ignore */ }
  return DEFAULT_THEME
}

export function applyTheme(id: ThemeId) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', id)
}

export function setTheme(id: ThemeId) {
  applyTheme(id)
  try { localStorage.setItem(THEME_STORAGE_KEY, id) } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent('radariq:theme-change', { detail: id }))
  } catch { /* ignore */ }
}
