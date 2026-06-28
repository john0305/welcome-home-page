/**
 * Google Cloud Function: create-checkout
 * Creates a Stripe Checkout session server-side (never expose secret key on frontend).
 *
 * Expects: POST { price_id, user_id, email, success_url, cancel_url }
 * Returns: { url }
 */

import type { Request, Response } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function createCheckout(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  res.set('Access-Control-Allow-Origin', process.env.APP_URL ?? '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).send('')

  const { price_id, user_id, email, success_url, cancel_url } = req.body as {
    price_id: string
    user_id: string
    email: string
    success_url: string
    cancel_url: string
  }

  if (!price_id || !user_id || !email) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id, username')
      .eq('id', user_id)
      .single()

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: profile?.username,
        metadata: { supabase_user_id: user_id },
      })
      customerId = customer.id

      await supabase
        .from('user_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user_id)
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: price_id, quantity: 1 }],
      mode: 'subscription',
      success_url: success_url ?? `${process.env.APP_URL}/app/settings?checkout=success`,
      cancel_url: cancel_url ?? `${process.env.APP_URL}/app/settings`,
      subscription_data: {
        metadata: { supabase_user_id: user_id },
        // No trial — the free account (5 opts/month) is the trial experience.
      },
      allow_promotion_codes: true,
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Checkout error:', err)
    return res.status(500).json({ error: String(err) })
  }
}
