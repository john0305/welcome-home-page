/**
 * Theme adaptation (Section 6) — skin-deep only: picks one of the existing
 * color themes (forest / ocean / sunset / lavender) from the seller's
 * confirmed store personalization category. Never touches logic, only chrome.
 *
 * Lock semantics (manual override always wins):
 *  - An explicit choice in Settings writes `radariq_color_theme` (MANUAL_KEY)
 *    and permanently wins — auto-adaptation never overrides it.
 *  - Auto-adaptation writes `radariq_color_theme_auto` (AUTO_KEY) and only
 *    applies when no manual choice exists.
 *  - Drift: recomputed on each app load. If the shop's category changes and
 *    the seller hasn't locked a choice, the auto theme follows (next load),
 *    never mid-session — a gradual, non-jarring re-adaptation.
 */
const MANUAL_KEY = 'radariq_color_theme'
const AUTO_KEY = 'radariq_color_theme_auto'

export type ColorTheme = 'forest' | 'ocean' | 'sunset' | 'lavender'

// Every ShopCategory maps to a warm theme whose mood fits the aesthetic:
// lavender for soft/pretty goods, sunset for warm/handmade/vintage,
// forest for natural/home, ocean for clean/digital.
const CATEGORY_TO_THEME: Record<string, ColorTheme> = {
  jewelry: 'lavender',
  beauty: 'lavender',
  accessories: 'lavender',
  vintage: 'sunset',
  apparel: 'sunset',
  art_print: 'sunset',
  home_decor: 'forest',
  craft_supply: 'forest',
  digital: 'ocean',
  paper_goods: 'ocean',
  other: 'forest',
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
    // Drift: if the shop's suggested theme changed since last auto-apply,
    // this overwrites the stale auto value and re-skins on this load.
    localStorage.setItem(AUTO_KEY, suggestion)
    document.documentElement.setAttribute('data-color-theme', suggestion)
  } catch { /* theming is cosmetic — never let it break the app */ }
}

export interface ThemeState {
  /** 'manual' = seller locked a choice; 'auto' = adapted from shop; 'none' = default. */
  mode: 'manual' | 'auto' | 'none'
  /** The theme currently in effect. */
  active: ColorTheme
  /** What the shop's aesthetic suggests (may differ from active if locked). */
  suggested: ColorTheme | null
}

/** Read the current adaptation state — drives the Settings UI. */
export function getThemeState(category?: string | null): ThemeState {
  let manual: string | null = null
  let auto: string | null = null
  try {
    manual = localStorage.getItem(MANUAL_KEY)
    auto = localStorage.getItem(AUTO_KEY)
  } catch { /* ignore */ }
  const suggested = suggestThemeForCategory(category)
  if (manual) return { mode: 'manual', active: manual as ColorTheme, suggested }
  if (auto) return { mode: 'auto', active: auto as ColorTheme, suggested }
  return { mode: 'none', active: 'forest', suggested }
}

/** The theme the shop's aesthetic last matched to (stored auto value), if any. */
export function getShopMatchedTheme(): ColorTheme | null {
  try {
    return (localStorage.getItem(AUTO_KEY) as ColorTheme | null) ?? null
  } catch {
    return null
  }
}

/** Seller explicitly locks a theme (Settings swatch click). Wins over auto. */
export function lockTheme(theme: ColorTheme): void {
  try {
    localStorage.setItem(MANUAL_KEY, theme)
    document.documentElement.setAttribute('data-color-theme', theme)
  } catch { /* ignore */ }
}

/**
 * Clear the manual lock and re-match to the shop's aesthetic. Used by the
 * "Match to my shop" affordance so a seller can hand control back to auto.
 * Falls back to the last stored shop match when the category isn't handy.
 */
export function resetToShopMatch(category?: string | null): ColorTheme | null {
  try {
    localStorage.removeItem(MANUAL_KEY)
    const suggestion = suggestThemeForCategory(category) ?? getShopMatchedTheme() ?? 'forest'
    localStorage.setItem(AUTO_KEY, suggestion)
    document.documentElement.setAttribute('data-color-theme', suggestion)
    return suggestion
  } catch {
    return null
  }
}
