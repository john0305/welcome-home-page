/**
 * Google Cloud Function: sync-listings
 * Fetches all active listings from Etsy and upserts them into Supabase.
 * Called: manually (sync button) or nightly via Cloud Scheduler.
 *
 * Expects: POST { user_id, shop_id, access_token }
 * Returns: { synced: number, errors: string[] }
 */

import type { Request, Response } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role for server-side writes
)

const ETSY_API_BASE = 'https://api.etsy.com/v3'

export async function syncListings(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed')
  }

  const { user_id, shop_id, access_token } = req.body as {
    user_id: string
    shop_id: string
    access_token: string
  }

  if (!user_id || !shop_id || !access_token) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const errors: string[] = []
  let synced = 0
  let offset = 0
  const limit = 100

  try {
    while (true) {
      const { data } = await axios.get(`${ETSY_API_BASE}/application/shops/${shop_id}/listings/active`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'x-api-key': process.env.ETSY_API_KEY,
        },
        params: { limit, offset, includes: 'Images,MainImage', sort_on: 'created', sort_order: 'desc' },
      })

      const etsyListings = data.results ?? []
      if (etsyListings.length === 0) break

      for (const el of etsyListings) {
        try {
          const listing = {
            etsy_listing_id: el.listing_id,
            shop_id,
            user_id,
            title: el.title,
            description: el.description ?? '',
            price: parseFloat(el.price?.amount ?? 0) / (el.price?.divisor ?? 100),
            currency_code: el.price?.currency_code ?? 'USD',
            quantity: el.quantity ?? 0,
            state: el.state,
            tags: el.tags ?? [],
            materials: el.materials ?? [],
            taxonomy_id: el.taxonomy_id,
            image_urls: (el.images ?? []).map((img: { url_fullxfull?: string }) => img.url_fullxfull).filter(Boolean),
            thumbnail_url: el.main_image?.url_75x75,
            views: el.views ?? 0,
            favorites: el.num_favorers ?? 0,
            etsy_created_at: new Date(el.creation_timestamp * 1000).toISOString(),
            etsy_updated_at: new Date(el.last_modified_timestamp * 1000).toISOString(),
            last_synced_at: new Date().toISOString(),
            has_variations: el.has_variations ?? false,
            is_customizable: el.is_customizable ?? false,
            is_digital: el.is_digital ?? false,
          }

          const { error } = await supabase
            .from('listings')
            .upsert(listing, { onConflict: 'user_id,etsy_listing_id' })

          if (error) errors.push(`Listing ${el.listing_id}: ${error.message}`)
          else synced++
        } catch (err) {
          errors.push(`Listing ${el.listing_id}: ${String(err)}`)
        }
      }

      if (etsyListings.length < limit) break
      offset += limit
    }

    // Update last_sync_at on connected store
    await supabase
      .from('connected_stores')
      .update({ last_sync_at: new Date().toISOString(), listing_count: synced })
      .eq('user_id', user_id)
      .eq('shop_id', shop_id)

    return res.status(200).json({ synced, errors })
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}
