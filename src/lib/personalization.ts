/**
 * Personalization client. Reads/writes the user's StorePersonality from the
 * Supabase `store_personalization` table, scoped per connected Etsy shop so
 * answers from one shop never leak into another shop the user connects.
 *
 * A localStorage cache (keyed per shop_id) lets sync helpers like
 * `readStorePersonality(shopId)` return same-tick values to the AI hooks.
 *
 * Migration: on first DB load, if the DB row is empty for this shop but
 * the legacy un-scoped localStorage cache has data, we upsert it once so
 * existing users don't lose their answers.
 */
import { supabase } from '@/integrations/supabase/client'
import { buildSystemPrompt } from '@/types/store-profile'
import type { StorePersonality, AiFollowup } from '@/types/store-profile'

const LEGACY_STORAGE_KEY = 'radariq_store_personality'
const STORAGE_PREFIX = 'radariq_store_personality:'
const FOLLOWUPS_PREFIX = 'radariq_personalization_followups:'
const OVERRIDE_PREFIX = 'radariq_personalization_has_override:'

const storageKey = (shopId: string) => `${STORAGE_PREFIX}${shopId}`
const followupsKey = (shopId: string) => `${FOLLOWUPS_PREFIX}${shopId}`
const overrideKey = (shopId: string) => `${OVERRIDE_PREFIX}${shopId}`

export interface PersonalizationState {
  shop_id: string | null
  answers: Partial<StorePersonality>
  ai_followups: AiFollowup[]
  has_custom_override: boolean
  completion_percentage: number
  category: string | null
  updated_at: string | null
}

// --- synchronous cache reads (used by useListingActions) ---

export function readStorePersonality(shopId: string | null | undefined): Partial<StorePersonality> | null {
  if (typeof window === 'undefined' || !shopId) return null
  try {
    const raw = localStorage.getItem(storageKey(shopId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StorePersonality>
    if (!parsed?.store_description) return null
    return parsed
  } catch {
    return null
  }
}

export function hasPersonalization(shopId: string | null | undefined): boolean {
  if (!shopId || typeof window === 'undefined') return false
  return !!readStorePersonality(shopId) || localStorage.getItem(overrideKey(shopId)) === '1'
}

export function getPersonalizationPrompt(shopId: string | null | undefined): string {
  const p = readStorePersonality(shopId)
  return p ? buildSystemPrompt(p) : ''
}

export function clearLocalPersonalizationCache(shopId: string | null | undefined) {
  if (!shopId || typeof window === 'undefined') return
  try {
    localStorage.removeItem(storageKey(shopId))
    localStorage.removeItem(followupsKey(shopId))
    localStorage.removeItem(overrideKey(shopId))
  } catch { /* ignore */ }
}

// --- async DB-backed API ---

export async function loadPersonalization(shopId: string | null | undefined): Promise<PersonalizationState | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const resolvedShopId = await resolvePersonalizationShopId(shopId, user.id)

  if (!resolvedShopId) {
    return {
      shop_id: null,
      answers: {},
      ai_followups: [],
      has_custom_override: false,
      completion_percentage: 0,
      category: null,
      updated_at: null,
    }
  }

  const { data, error } = await supabase
    .from('store_personalization')
    .select('answers, ai_followups, custom_prompt_override, completion_percentage, category, updated_at')
    .eq('user_id', user.id)
    .eq('etsy_shop_id', resolvedShopId)
    .maybeSingle()

  if (error) {
    console.warn('loadPersonalization', error)
  }

  // Look up the user's best (most-complete) personalization row across all
  // shops, used both as a fallback when this shop has no row and as a merge
  // source when this shop's row is less complete (e.g. because the user
  // reconnected to a fresh shop_id and started over).
  const { data: priorRaw } = await supabase
    .from('store_personalization')
    .select('answers, ai_followups, custom_prompt_override, completion_percentage, category, updated_at, etsy_shop_id')
    .eq('user_id', user.id)
    .neq('etsy_shop_id', resolvedShopId)
    .order('completion_percentage', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const prior = priorRaw as {
    answers: Partial<StorePersonality> | null
    ai_followups: AiFollowup[] | null
    custom_prompt_override: string | null
    completion_percentage: number | null
    category: string | null
  } | null

  // First-time migration: legacy (un-scoped) localStorage → DB for THIS shop only.
  if (!data) {
    let local: Partial<StorePersonality> | null = null
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (raw) local = JSON.parse(raw) as Partial<StorePersonality>
    } catch { /* ignore */ }

    if (local && local.store_description) {
      await supabase.from('store_personalization').upsert({
        user_id: user.id,
        etsy_shop_id: resolvedShopId,
        answers: local as never,
        completion_percentage: completionPct(local),
      }, { onConflict: 'user_id,etsy_shop_id' })
      // Wipe the legacy global key so it's not migrated into a different shop later.
      try { localStorage.removeItem(LEGACY_STORAGE_KEY) } catch { /* ignore */ }
      mirrorToCache(resolvedShopId, local, [], false)
      return {
        shop_id: resolvedShopId,
        answers: local,
        ai_followups: [],
        has_custom_override: false,
        completion_percentage: completionPct(local),
        category: null,
        updated_at: new Date().toISOString(),
      }
    }

    // Restore from a prior connected shop if the user filled it out before.
    if (prior?.answers && Object.keys(prior.answers).length > 0) {
      const restored = await restoreFromPriorShop(resolvedShopId, user.id, prior)
      return restored
    }

    // Truly nothing and no prior shop to restore from — leave it blank so the
    // user can fill it in themselves. Do not seed example answers.
    return {
      shop_id: resolvedShopId,
      answers: {},
      ai_followups: [],
      has_custom_override: false,
      completion_percentage: 0,
      category: null,
      updated_at: null,
    }
  }

  const row = data as {
    answers: Partial<StorePersonality> | null
    ai_followups: AiFollowup[] | null
    custom_prompt_override: string | null
    completion_percentage: number | null
    category: string | null
    updated_at: string | null
  }

  let answers = row.answers ?? {}
  let followups = row.ai_followups ?? []
  let completion = row.completion_percentage ?? completionPct(answers)
  let category = row.category ?? null

  // If a different shop has a meaningfully more-complete profile, merge its
  // answers under this row (current shop's filled answers always win), then
  // persist so subsequent loads stay fast. This rescues users whose previous
  // shop was 100% done but the new shop only has a few stub answers.
  if (prior?.answers && (prior.completion_percentage ?? 0) > completion + 10) {
    const merged = { ...prior.answers, ...stripEmpty(answers) }
    const mergedPct = completionPct(merged)
    if (mergedPct > completion) {
      await supabase.from('store_personalization').upsert({
        user_id: user.id,
        etsy_shop_id: resolvedShopId,
        answers: merged as never,
        ai_followups: (followups.length ? followups : prior.ai_followups ?? []) as never,
        completion_percentage: mergedPct,
        category: category ?? prior.category,
      }, { onConflict: 'user_id,etsy_shop_id' })
      answers = merged
      followups = followups.length ? followups : (prior.ai_followups ?? [])
      completion = mergedPct
      category = category ?? prior.category
    }
  }

  const state: PersonalizationState = {
    shop_id: resolvedShopId,
    answers,
    ai_followups: followups,
    has_custom_override: !!row.custom_prompt_override,
    completion_percentage: completion,
    category,
    updated_at: row.updated_at,
  }

  mirrorToCache(resolvedShopId, answers, state.ai_followups, state.has_custom_override)
  return state
}

async function resolvePersonalizationShopId(shopId: string | null | undefined, userId: string): Promise<string | null> {
  const direct = shopId?.toString().trim()
  if (direct) return direct

  const { data: store } = await supabase
    .from('stores')
    .select('etsy_shop_id')
    .eq('user_id', userId)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (store as { etsy_shop_id?: string | null } | null)?.etsy_shop_id ?? null
}

async function restoreFromPriorShop(
  shopId: string,
  userId: string,
  prior: {
    answers: Partial<StorePersonality> | null
    ai_followups: AiFollowup[] | null
    custom_prompt_override: string | null
    completion_percentage: number | null
    category: string | null
  },
): Promise<PersonalizationState> {
  const answers = prior.answers ?? {}
  const followups = prior.ai_followups ?? []
  const hasOverride = !!prior.custom_prompt_override
  await supabase.from('store_personalization').upsert({
    user_id: userId,
    etsy_shop_id: shopId,
    answers: answers as never,
    ai_followups: followups as never,
    completion_percentage: prior.completion_percentage ?? completionPct(answers),
    category: prior.category,
    // custom_prompt_override is admin-only; the DB trigger would strip it anyway.
  }, { onConflict: 'user_id,etsy_shop_id' })
  mirrorToCache(shopId, answers, followups, hasOverride)
  return {
    shop_id: shopId,
    answers,
    ai_followups: followups,
    has_custom_override: hasOverride,
    completion_percentage: prior.completion_percentage ?? completionPct(answers),
    category: prior.category,
    updated_at: new Date().toISOString(),
  }
}

function stripEmpty(answers: Partial<StorePersonality>): Partial<StorePersonality> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(answers)) {
    if (v == null) continue
    if (Array.isArray(v) && v.length === 0) continue
    if (typeof v === 'string' && v.trim() === '') continue
    out[k] = v
  }
  return out as Partial<StorePersonality>
}


export async function savePersonalization(
  shopId: string | null | undefined,
  answers: Partial<StorePersonality>,
  category?: string | null,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to save personalization')
  const resolvedShopId = await resolvePersonalizationShopId(shopId, user.id)
  if (!resolvedShopId) throw new Error('Connect a shop before saving personalization')

  const row: Record<string, unknown> = {
    user_id: user.id,
    etsy_shop_id: resolvedShopId,
    answers: answers as never,
    completion_percentage: completionPct(answers),
    updated_at: new Date().toISOString(),
  }
  if (category !== undefined) row.category = category

  const { error } = await supabase
    .from('store_personalization')
    .upsert(row as never, { onConflict: 'user_id,etsy_shop_id' })

  if (error) {
    console.warn('savePersonalization', error)
    throw new Error(error.message || 'Failed to save personalization')
  }


  if (typeof window !== 'undefined') {
    try { localStorage.setItem(storageKey(resolvedShopId), JSON.stringify(answers)) } catch { /* ignore */ }
  }
}

export async function requestFollowups(shopId: string | null | undefined): Promise<AiFollowup[]> {
  const { data, error } = await supabase.functions.invoke('suggest-personalization-followups', {
    body: { etsy_shop_id: shopId ?? null },
  })
  if (error) throw error
  const followups = (data?.followups ?? []) as AiFollowup[]
  if (shopId && typeof window !== 'undefined') {
    try { localStorage.setItem(followupsKey(shopId), JSON.stringify(followups)) } catch { /* ignore */ }
  }
  return followups
}

function mirrorToCache(
  shopId: string,
  answers: Partial<StorePersonality>,
  followups: AiFollowup[],
  hasOverride: boolean,
) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(storageKey(shopId), JSON.stringify(answers))
    localStorage.setItem(followupsKey(shopId), JSON.stringify(followups))
    localStorage.setItem(overrideKey(shopId), hasOverride ? '1' : '0')
  } catch { /* quota / ssr — ignore */ }
}

function completionPct(answers: Partial<StorePersonality>): number {
  // 14 questions total; match against StorePersonality keys present and truthy.
  const trackedKeys: (keyof StorePersonality)[] = [
    'store_description', 'product_categories', 'era_focus', 'target_audience',
    'brand_voice', 'tone', 'unique_selling_points', 'price_positioning',
    'style_keywords', 'avoid_keywords', 'avoid_claims', 'shop_values',
    'emoji_usage', 'description_style',
  ]
  const done = trackedKeys.filter(k => {
    const v = answers[k]
    if (Array.isArray(v)) return v.length > 0
    return typeof v === 'string' ? v.trim().length > 0 : !!v
  }).length
  return Math.round((done / trackedKeys.length) * 100)
}
