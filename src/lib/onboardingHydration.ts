/**
 * Hydrate the onboarding checklist from server-side signals.
 *
 * The checklist state lives in localStorage so the UI can update instantly,
 * but that means it visibly "resets" if the user opens the app in a new
 * browser, an incognito window, or on a different device. To fix that, on
 * every login we ask the database which milestones have actually happened
 * and mark those steps complete (without ever un-checking a step the user
 * already finished on this device).
 */
import { supabase } from '@/integrations/supabase/client'
import { markOnboardingStepsComplete } from '@/types/onboarding'

export async function hydrateOnboardingFromServer(userId: string): Promise<void> {
  if (!userId) return
  try {
    const [tokens, optimizations, personalization, grades] = await Promise.all([
      supabase.from('etsy_connection_status').select('shop_id').eq('user_id', userId).limit(1),
      supabase.from('optimizations').select('id').eq('user_id', userId).limit(1),
      supabase
        .from('store_personalization')
        .select('completion_percentage')
        .eq('user_id', userId)
        .gt('completion_percentage', 0)
        .limit(1),
      supabase.from('grade_runs').select('id').eq('user_id', userId).limit(1),
    ])

    const done: string[] = []
    if ((tokens.data?.length ?? 0) > 0) done.push('connect_store')
    if ((grades.data?.length ?? 0) > 0) done.push('view_health_score')
    if ((optimizations.data?.length ?? 0) > 0) {
      done.push('first_optimization')
      done.push('review_analytics') // if they've optimized, they've effectively engaged with the data
    }
    if ((personalization.data?.length ?? 0) > 0) done.push('personalize_ai')

    if (done.length > 0) markOnboardingStepsComplete(done)
  } catch {
    /* non-fatal — checklist falls back to localStorage-only state */
  }
}
