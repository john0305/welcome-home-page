/**
 * Theme adaptation (Section 6) — skin-deep only: picks one of the existing
 * color themes (forest / ocean / sunset / lavender) from the seller's
 * confirmed store personalization category. Never touches logic, only chrome.
 *
 * Lock semantics: an explicit choice in Settings writes
 * `radariq_color_theme` (the manual key) and permanently wins. Auto-adaptation
 * writes `radariq_color_theme_auto` and only applies when no manual choice
 * exists. Drift handling: recomputed on each app load — if the shop's
 * category changes, the auto theme follows gradually (next load), never
 * mid-session.
 */
const MANUAL_KEY = 'radariq_color_theme'
const AUTO_KEY = 'radariq_color_theme_auto'

export type ColorTheme = 'forest' | 'ocean' | 'sunset' | 'lavender'

const CATEGORY_TO_THEME: Record<string, ColorTheme> = {
  jewelry: 'lavender',
  beauty: 'lavender',
  vintage: 'sunset',
  apparel: 'sunset',
  art_print: 'sunset',
  home_decor: 'forest',
  craft_supply: 'forest',
  digital: 'ocean',
  paper_goods: 'ocean',
}

export function suggestThemeForCategory(category: string | null | undefined): ColorTheme | null {
  if (!category) return null
  return CATEGORY_TO_THEME[category] ?? null
}

/** Apply the category-derived theme unless the seller has chosen manually. */
export function maybeAutoAdaptTheme(category: string | null | undefined): void {
  try {
    if (localStorage.getItem(MANUAL_KEY)) return // seller's own pick is locked in
    const suggestion = suggestThemeForCategory(category)
    if (!suggestion) return
    if (localStorage.getItem(AUTO_KEY) === suggestion) {
      // Already applied on a previous load — just ensure the attribute is set.
      document.documentElement.setAttribute('data-color-theme', suggestion)
      return
    }
    localStorage.setItem(AUTO_KEY, suggestion)
    document.documentElement.setAttribute('data-color-theme', suggestion)
  } catch { /* theming is cosmetic — never let it break the app */ }
}
