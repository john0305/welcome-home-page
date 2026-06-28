/**
 * Google Cloud Function: refresh-etsy-token
 * Refreshes an Etsy OAuth access token using the refresh token.
 * Should run on a schedule (every 50 minutes) or be called before any Etsy API call.
 *
 * Expects: POST { user_id, shop_id } OR triggered by Cloud Scheduler
 * Returns: { access_token, expires_at }
 */

import type { Request, Response } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token'

export async function refreshEtsyToken(req: Request, res: Response) {
  const isScheduled = req.get('X-Cloudscheduler-Scheduletime') !== undefined

  if (isScheduled) {
    // Refresh all stores that expire in the next 10 minutes
    const expiryThreshold = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const { data: stores } = await supabase
      .from('connected_stores')
      .select('*')
      .eq('is_connected', true)
      .eq('platform', 'etsy')
      .lt('token_expires_at', expiryThreshold)

    const results = await Promise.allSettled(
      (stores ?? []).map(store => refreshStore(store))
    )

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    return res.status(200).json({ refreshed: succeeded, total: stores?.length ?? 0 })
  }

  // Single store refresh
  const { user_id, shop_id } = req.body as { user_id: string; shop_id: string }
  if (!user_id || !shop_id) return res.status(400).json({ error: 'Missing user_id or shop_id' })

  const { data: store } = await supabase
    .from('connected_stores')
    .select('*')
    .eq('user_id', user_id)
    .eq('shop_id', shop_id)
    .single()

  if (!store) return res.status(404).json({ error: 'Store not found' })

  try {
    const result = await refreshStore(store)
    return res.status(200).json(result)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}

async function refreshStore(store: { id: string; refresh_token: string }) {
  const { data } = await axios.post(ETSY_TOKEN_URL, {
    grant_type: 'refresh_token',
    client_id: process.env.ETSY_API_KEY,
    refresh_token: store.refresh_token,
  })

  const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString()

  await supabase
    .from('connected_stores')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? store.refresh_token,
      token_expires_at: expires_at,
    })
    .eq('id', store.id)

  return { access_token: data.access_token, expires_at }
}
