/**
 * actionCategories — single source of truth for how pending fix_actions are
 * grouped and explained across the app (dashboard EchoPicksPanel and the
 * Fix Actions page's bulk review).
 *
 * Two groupings live here:
 *
 * 1. TABS (Echo Picks / Quick Wins / Big Impact) — three *differently-shaped*
 *    slices of the same queue. Before this module, the Echo tab's fallback was
 *    "all rows by severity" and Big Impact was "high/critical rows by delta",
 *    which produced identical lists for any account whose actions were mostly
 *    high-severity. The criteria below are structurally different so the tabs
 *    can't collapse into each other, and each tab carries a visible reason.
 *
 * 2. CATEGORIES (weak titles, missing tags, …) — factor-level groups used by
 *    the bulk review workflow: approve a whole category at once, or expand it
 *    and review item by item.
 */
import type { FixActionRow } from '@/hooks/useFixActions'

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
const EFFORT_COST: Record<string, number> = { low: 1, medium: 2, high: 4 }

// fix_actions carries estimated_effort in the DB but the base row type
// predates it; read it defensively.
function effortOf(row: FixActionRow): 'low' | 'medium' | 'high' {
  const e = (row as FixActionRow & { estimated_effort?: string | null }).estimated_effort
  if (e === 'low' || e === 'medium' || e === 'high') return e
  // One-tap auto fixes are low effort by definition.
  return row.mode === 'auto' ? 'low' : 'medium'
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export type ActionTab = 'echo' | 'quick' | 'impact'

/** Plain-language explanation of what each tab means — rendered under the
 *  tab strip so a seller knows *why* an item landed there (Section 4). */
export const TAB_MEANINGS: Record<ActionTab, string> = {
  echo: "Echo's shortlist — the best return for the least work, spread across your shop so one listing doesn't hog the list.",
  quick: 'Low effort — one-tap or a few minutes each. Knock these out first when you have five minutes.',
  impact: 'Biggest score and visibility lift once applied — these may take a little more review.',
}

export interface TabbedActions {
  echo: FixActionRow[]
  quick: FixActionRow[]
  impact: FixActionRow[]
}

/**
 * Split pending actions into the three tabs with genuinely different logic:
 * - quick:  low-effort rows (auto-applyable or estimated_effort=low), easiest first.
 * - impact: highest score_delta rows regardless of effort, biggest first.
 * - echo:   best delta-per-effort ratio, diversified (max 2 per listing) —
 *           i.e. "what Echo would do first", not just a severity re-sort.
 */
export function splitTabs(rows: FixActionRow[], limit = 8): TabbedActions {
  const quick = rows
    .filter(r => effortOf(r) === 'low' || r.mode === 'auto')
    .sort((a, b) => {
      const eff = EFFORT_COST[effortOf(a)] - EFFORT_COST[effortOf(b)]
      if (eff !== 0) return eff
      return (b.score_delta ?? 0) - (a.score_delta ?? 0)
    })
    .slice(0, limit)

  const impact = [...rows]
    .filter(r => (r.score_delta ?? 0) > 0 || r.severity === 'critical' || r.severity === 'high')
    .sort((a, b) => {
      const d = (b.score_delta ?? 0) - (a.score_delta ?? 0)
      if (d !== 0) return d
      return (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
    })
    .slice(0, limit)

  // Echo Picks: value = delta / effort, diversified across listings.
  const tagged = rows.filter(r => (r.source ?? '').toLowerCase().includes('echo'))
  const pool = tagged.length > 0 ? tagged : rows
  const scored = [...pool].sort((a, b) => {
    const va = ((a.score_delta ?? 0) + (SEVERITY_RANK[a.severity] ?? 0)) / EFFORT_COST[effortOf(a)]
    const vb = ((b.score_delta ?? 0) + (SEVERITY_RANK[b.severity] ?? 0)) / EFFORT_COST[effortOf(b)]
    return vb - va
  })
  const echo: FixActionRow[] = []
  const perListing = new Map<string, number>()
  for (const r of scored) {
    if (echo.length >= limit) break
    const key = r.listing_id ?? 'shop'
    const used = perListing.get(key) ?? 0
    if (used >= 2) continue
    perListing.set(key, used + 1)
    echo.push(r)
  }

  return { echo, quick, impact }
}

// ─── Categories (bulk review) ────────────────────────────────────────────────

export interface ActionCategory {
  key: string
  /** e.g. "Weak titles" */
  label: string
  /** Why these are grouped + why the fix matters, in plain language. */
  explanation: string
  rows: FixActionRow[]
  totalDelta: number
  /** Rows that carry a concrete proposed change and can be approved in bulk. */
  bulkApplicable: FixActionRow[]
}

interface CategoryMeta { label: string; explanation: string }

const CATEGORY_META: Record<string, CategoryMeta> = {
  title_length: {
    label: 'Short titles',
    explanation: 'These titles leave keyword room on the table — shoppers search long phrases, and longer keyword-rich titles surface in more of them.',
  },
  title_strength: {
    label: 'Weak titles',
    explanation: 'These titles are missing the phrases shoppers actually type. A stronger title puts the listing in more searches.',
  },
  tags_complete: {
    label: 'Empty tag slots',
    explanation: "Etsy gives every listing 13 tags and these aren't using them all — each empty slot is a search these listings can't appear in.",
  },
  tag_coverage: {
    label: 'Empty tag slots',
    explanation: "Etsy gives every listing 13 tags and these aren't using them all — each empty slot is a search these listings can't appear in.",
  },
  materials_present: {
    label: 'Missing materials',
    explanation: 'Materials are a free search surface and a trust signal for buyers — these listings have none filled in.',
  },
  market_tag_gap: {
    label: 'Trending tag opportunities',
    explanation: 'Shops like yours are getting found through tags these listings don\'t have yet — riding the trend is a small tweak, not a rewrite.',
  },
  market_title_length: {
    label: 'Titles behind the market',
    explanation: 'Similar shops in your niche run noticeably longer, keyword-rich titles — these listings are competing with less.',
  },
  return_policy_present: {
    label: 'Return policy',
    explanation: 'Listings with a clear return policy rank and convert better — buyers hesitate without one.',
  },
  review_health: {
    label: 'Review health',
    explanation: 'Recent reviews need attention — responding early keeps a dip from becoming a pattern buyers notice.',
  },
  trend_expiry_review: {
    label: 'Seasonal & trend check-ins',
    explanation: 'These listings were updated for a trend or season that has now passed — decide whether to revert them, refresh them for what\'s next, or leave them as-is.',
  },
}

const FALLBACK_META: CategoryMeta = {
  label: 'Other improvements',
  explanation: 'Assorted fixes that don\'t fit a bigger group — each one still shows its own reason.',
}

export function categoryMetaFor(factorKey: string): CategoryMeta {
  return CATEGORY_META[factorKey] ?? FALLBACK_META
}

/** True when a row carries a concrete proposed change RadarIQ can push after
 *  approval (vs. guided fixes the seller applies on Etsy themselves). */
export function isBulkApplicable(row: FixActionRow): boolean {
  return row.mode === 'auto' && row.proposed_value != null
}

/** Group pending actions into approve-as-a-group categories, largest first. */
export function groupIntoCategories(rows: FixActionRow[]): ActionCategory[] {
  const byKey = new Map<string, FixActionRow[]>()
  for (const r of rows) {
    const meta = CATEGORY_META[r.factor_key]
    const key = meta ? r.factor_key : 'other'
    const list = byKey.get(key) ?? []
    list.push(r)
    byKey.set(key, list)
  }
  // Merge duplicate labels (e.g. tags_complete + tag_coverage).
  const byLabel = new Map<string, ActionCategory>()
  for (const [key, list] of byKey) {
    const meta = key === 'other' ? FALLBACK_META : categoryMetaFor(key)
    const existing = byLabel.get(meta.label)
    if (existing) {
      existing.rows.push(...list)
    } else {
      byLabel.set(meta.label, {
        key,
        label: meta.label,
        explanation: meta.explanation,
        rows: [...list],
        totalDelta: 0,
        bulkApplicable: [],
      })
    }
  }
  const cats = [...byLabel.values()]
  for (const c of cats) {
    c.totalDelta = c.rows.reduce((s, r) => s + (r.score_delta ?? 0), 0)
    c.bulkApplicable = c.rows.filter(isBulkApplicable)
    c.rows.sort((a, b) => (b.score_delta ?? 0) - (a.score_delta ?? 0))
  }
  return cats.sort((a, b) => b.rows.length - a.rows.length)
}
