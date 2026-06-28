/**
 * fix_lifecycle helpers (client-side).
 *
 * The lifecycle table tracks every suggested fix from open → applied →
 * monitoring → reopened. It sits on top of fix_actions / market score / the
 * optimize dialog — none of those flows change, they just also call into here.
 */
import { supabase } from '@/integrations/supabase/client'

export type FixField = 'title' | 'tags' | 'price' | 'photos' | 'description' | 'quantity' | 'shipping'
export type FixStatus = 'open' | 'applied' | 'monitoring' | 'reopened'
export type FixSource = 'market_score' | 'optimize_dialog' | 'action_engine' | 'manual'

export type FixLifecycleRow = {
  id: string
  user_id: string
  listing_id: string
  shop_id: string
  field: FixField
  issue_description: string | null
  suggested_fix: string | null
  status: FixStatus
  source: FixSource | null
  before_value: string | null
  after_value: string | null
  opened_at: string
  applied_at: string | null
  last_monitored_at: string | null
  reopened_count: number
  dismissed: boolean
  created_at: string
  updated_at: string
}

export type OpenFixInput = {
  user_id: string
  listing_id: string
  shop_id: string
  field: FixField
  issue_description?: string
  suggested_fix?: string
  source: FixSource
  before_value?: string
}

/** Open a new fix lifecycle row, unless one is already active for that listing+field. */
export async function openFix(input: OpenFixInput): Promise<void> {
  const { data: existing } = await supabase
    .from('fix_lifecycle')
    .select('id')
    .eq('listing_id', input.listing_id)
    .eq('field', input.field)
    .in('status', ['open', 'reopened'])
    .maybeSingle()
  if (existing?.id) return
  await supabase.from('fix_lifecycle').insert({
    user_id: input.user_id,
    listing_id: input.listing_id,
    shop_id: input.shop_id,
    field: input.field,
    issue_description: input.issue_description ?? null,
    suggested_fix: input.suggested_fix ?? null,
    source: input.source,
    before_value: input.before_value ?? null,
    status: 'open',
  })
}

export type MarkAppliedInput = {
  user_id: string
  listing_id: string
  shop_id: string
  field: FixField
  source: FixSource
  before_value?: string
  after_value?: string
  dismissed?: boolean
}

/** Transition open/reopened → applied. Creates an applied row if none existed.
 *  Dedupe: if an applied/monitoring row already exists for the same
 *  listing+field, update it in place instead of inserting a duplicate. */
export async function markApplied(input: MarkAppliedInput): Promise<void> {
  const now = new Date().toISOString()
  const { data: existing } = await supabase
    .from('fix_lifecycle')
    .select('id, before_value')
    .eq('listing_id', input.listing_id)
    .eq('field', input.field)
    .in('status', ['open', 'reopened', 'applied', 'monitoring'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) {
    await supabase
      .from('fix_lifecycle')
      .update({
        status: 'applied',
        applied_at: now,
        after_value: input.after_value ?? null,
        before_value: existing.before_value ?? input.before_value ?? null,
        dismissed: input.dismissed ?? false,
      })
      .eq('id', existing.id)
    return
  }
  await supabase.from('fix_lifecycle').insert({
    user_id: input.user_id,
    listing_id: input.listing_id,
    shop_id: input.shop_id,
    field: input.field,
    source: input.source,
    status: 'applied',
    before_value: input.before_value ?? null,
    after_value: input.after_value ?? null,
    applied_at: now,
    dismissed: input.dismissed ?? false,
  })
}

export async function dismissFix(input: MarkAppliedInput): Promise<void> {
  return markApplied({ ...input, dismissed: true })
}

export function factorKeyToField(factorKey: string): FixField | null {
  if (!factorKey) return null
  const k = factorKey.toLowerCase()
  if (k.includes('title')) return 'title'
  if (k.includes('tag')) return 'tags'
  if (k.includes('photo') || k.includes('image')) return 'photos'
  if (k.includes('description')) return 'description'
  if (k.includes('price')) return 'price'
  if (k.includes('quantity') || k.includes('stock')) return 'quantity'
  if (k.includes('shipping')) return 'shipping'
  return null
}
