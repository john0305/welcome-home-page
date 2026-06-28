// Phase 1 capture pipe for the optimization feedback system.
// Writes structured rows to public.optimization_feedback alongside the
// legacy optimizations.reject_reason column so the existing feedbackBlock
// in optimize-listing keeps working unchanged.
import { supabase } from '@/integrations/supabase/client'

type FeedbackAction = 'rejected' | 'edited_after_approval' | 'approved_as_is'

type RecordArgs = {
  optimizationId: string
  listingId: string
  action: FeedbackAction
  reasonCategory?: string | null
  reasonText?: string | null
  diffSummary?: Record<string, unknown> | null
}

async function resolveShopId(listingId: string): Promise<string | null> {
  const { data } = await supabase
    .from('listings')
    .select('store_id')
    .eq('id', listingId)
    .maybeSingle()
  return (data?.store_id as string | null) ?? null
}

export async function recordOptimizationFeedback(args: RecordArgs): Promise<void> {
  try {
    const { data: userRes } = await supabase.auth.getUser()
    const userId = userRes?.user?.id
    if (!userId) return
    const shopId = await resolveShopId(args.listingId)
    await supabase.from('optimization_feedback').insert({
      user_id: userId,
      listing_id: args.listingId,
      shop_id: shopId,
      optimization_run_id: args.optimizationId,
      action: args.action,
      reason_category: args.reasonCategory ?? null,
      reason_text: args.reasonText ?? null,
      diff_summary: (args.diffSummary ?? null) as never,
    })
  } catch (err) {
    // Capture is best-effort — never block the user-facing action.
    console.warn('[optimizationFeedback] failed to record', err)
  }
}

// Compare two text/array fields and return a compact diff entry if they differ.
type FieldComparable = string | string[] | null | undefined
function fieldDiffers(a: FieldComparable, b: FieldComparable): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const aa = Array.isArray(a) ? a : []
    const bb = Array.isArray(b) ? b : []
    if (aa.length !== bb.length) return true
    return aa.some((v, i) => v !== bb[i])
  }
  return (a ?? '') !== (b ?? '')
}

export function buildEditDiffSummary(
  aiGenerated: {
    title?: string | null
    description?: string | null
    tags?: string[] | null
    materials?: string[] | null
  },
  approved: {
    title?: string | null
    description?: string | null
    tags?: string[] | null
    materials?: string[] | null
  },
): Record<string, { ai: unknown; approved: unknown }> | null {
  const diff: Record<string, { ai: unknown; approved: unknown }> = {}
  if (fieldDiffers(aiGenerated.title, approved.title)) diff.title = { ai: aiGenerated.title ?? '', approved: approved.title ?? '' }
  if (fieldDiffers(aiGenerated.description, approved.description)) diff.description = { ai: aiGenerated.description ?? '', approved: approved.description ?? '' }
  if (fieldDiffers(aiGenerated.tags, approved.tags)) diff.tags = { ai: aiGenerated.tags ?? [], approved: approved.tags ?? [] }
  if (fieldDiffers(aiGenerated.materials, approved.materials)) diff.materials = { ai: aiGenerated.materials ?? [], approved: approved.materials ?? [] }
  return Object.keys(diff).length ? diff : null
}
