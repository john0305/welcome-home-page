/**
 * Google Cloud Function: customer-portal
 * Creates a Stripe Customer Portal session so users can manage billing.
 *
 * Expects: POST { user_id, return_url }
 * Returns: { url }
 */

import type { Request, Response } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function customerPortal(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  const allowedOrigin = process.env.APP_URL
  if (!allowedOrigin) return res.status(500).json({ error: 'APP_URL not configured' })
  res.set('Access-Control-Allow-Origin', allowedOrigin)
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).send('')

  const { user_id, return_url } = req.body as { user_id: string; return_url: string }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('id', user_id)
    .single()

  if (!profile?.stripe_customer_id) {
    return res.status(400).json({ error: 'No Stripe customer found' })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: return_url ?? process.env.APP_URL,
  })

  return res.status(200).json({ url: session.url })
}
