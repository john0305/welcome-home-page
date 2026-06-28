/**
 * Google Cloud Function: scheduled-optimization
 * Nightly batch optimization run. Processes items in optimization_queue.
 * Triggered by Cloud Pub/Sub topic "rave-nightly-optimization" via Cloud Scheduler.
 *
 * Cloud Scheduler config:
 *   Schedule: 0 2 * * *  (2 AM nightly)
 *   Topic: rave-nightly-optimization
 */

import type { CloudEvent } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FUNCTIONS_BASE = process.env.CLOUD_FUNCTIONS_BASE_URL

export async function scheduledOptimization(_event: CloudEvent<unknown>) {
  console.log('Starting nightly optimization run...')

  // Get all pending nightly queue items, grouped by user
  const { data: queueItems } = await supabase
    .from('optimization_queue')
    .select('*, listings(*)')
    .eq('status', 'pending')
    .eq('scheduled_for', 'nightly')
    .order('priority', { ascending: false }) // high first
    .limit(50) // max 50 optimizations per night

  if (!queueItems || queueItems.length === 0) {
    console.log('Queue empty, nothing to do.')
    return
  }

  console.log(`Processing ${queueItems.length} items...`)

  const results = { succeeded: 0, failed: 0, errors: [] as string[] }

  for (const item of queueItems) {
    try {
      // Mark as in_progress
      await supabase
        .from('optimization_queue')
        .update({ status: 'in_progress' })
        .eq('id', item.id)

      // First refresh token if needed
      const store = await supabase
        .from('connected_stores')
        .select('*')
        .eq('user_id', item.user_id)
        .eq('platform', 'etsy')
        .single()

      if (store.data) {
        const tokenExpiry = new Date(store.data.token_expires_at)
        if (tokenExpiry.getTime() - Date.now() < 600000) { // < 10 min
          await axios.post(`${FUNCTIONS_BASE}/refresh-etsy-token`, {
            user_id: item.user_id,
            shop_id: store.data.shop_id,
          })
        }
      }

      // Call optimize-listing function
      await axios.post(`${FUNCTIONS_BASE}/optimize-listing`, {
        listing_id: item.listing_id,
        user_id: item.user_id,
      })

      // Mark queue item as completed
      await supabase
        .from('optimization_queue')
        .update({ status: 'completed' })
        .eq('id', item.id)

      // Update listing optimization_count
      await supabase
        .from('listings')
        .update({
          optimization_count: supabase.rpc('increment', { x: 1 }) as unknown as number,
          last_optimized_at: new Date().toISOString(),
        })
        .eq('id', item.listing_id)

      results.succeeded++
    } catch (err) {
      results.failed++
      results.errors.push(`Item ${item.id}: ${String(err)}`)
      await supabase
        .from('optimization_queue')
        .update({ status: 'failed' })
        .eq('id', item.id)
    }

    // Rate limit: 1 second between calls to avoid Gemini quota exhaustion
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log('Nightly run complete:', results)
  return results
}
