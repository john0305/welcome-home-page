/**
 * Google Cloud Function: stripe-webhook
 * Handles Stripe webhook events to update subscription status and affiliate commissions.
 *
 * Set webhook URL in Stripe Dashboard:
 *   https://us-central1-YOUR_PROJECT.cloudfunctions.net/stripe-webhook
 *
 * Events handled:
 *   - checkout.session.completed
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - invoice.payment_succeeded (for affiliate commission tracking)
 */

import type { Request, Response } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!

// Commission rate: 20% of subscription revenue for 12 months
const COMMISSION_RATE = 0.20
const COMMISSION_MONTHS = 12

export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature']
  if (!sig) return res.status(400).send('Missing stripe-signature header')

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.rawBody ?? req.body, sig, WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return res.status(400).send(`Webhook Error: ${err}`)
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutCompleted(session)
        break
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        await handleSubscriptionUpdated(sub)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await handleSubscriptionDeleted(sub)
        break
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        await handleInvoicePaid(invoice)
        break
      }
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('Webhook handler error:', err)
    return res.status(500).json({ error: String(err) })
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.supabase_user_id
    ?? (session.subscription as Stripe.Subscription)?.metadata?.supabase_user_id
  if (!userId) return

  const tier = getPlanTierFromSession(session)

  await supabase.from('user_profiles').update({
    tier,
    stripe_customer_id: session.customer as string,
    stripe_subscription_id: session.subscription as string,
    subscription_status: 'active',
    subscription_current_period_end: null, // will be set on subscription.updated
  }).eq('id', userId)
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const userId = sub.metadata?.supabase_user_id
  if (!userId) return

  const tier = getPlanTierFromSub(sub)
  await supabase.from('user_profiles').update({
    tier: sub.status === 'active' ? tier : 'free',
    subscription_status: sub.status,
    subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
  }).eq('id', userId)
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = sub.metadata?.supabase_user_id
  if (!userId) return

  await supabase.from('user_profiles').update({
    tier: 'free',
    subscription_status: 'canceled',
    stripe_subscription_id: null,
  }).eq('id', userId)
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  if (!invoice.subscription || invoice.billing_reason === 'subscription_create') return

  const customerId = invoice.customer as string
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, referred_by_code')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!profile?.referred_by_code) return

  // Find the affiliate
  const { data: affiliate } = await supabase
    .from('affiliate_profiles')
    .select('id, user_id, total_commission_months')
    .eq('referral_code', profile.referred_by_code)
    .single()

  if (!affiliate) return

  // Check how many commissions already paid for this referral (max COMMISSION_MONTHS)
  const { count } = await supabase
    .from('referrals')
    .select('id', { count: 'exact' })
    .eq('affiliate_id', affiliate.id)
    .eq('referred_user_id', profile.id)
    .eq('commission_status', 'paid')

  if ((count ?? 0) >= COMMISSION_MONTHS) return

  const amountPaid = (invoice.amount_paid ?? 0) / 100
  const commission = Math.round(amountPaid * COMMISSION_RATE * 100) / 100

  // Record commission
  await supabase.from('referrals').upsert({
    affiliate_id: affiliate.id,
    referred_user_id: profile.id,
    commission_earned: commission,
    commission_status: 'pending',
    period_start: new Date(invoice.period_start! * 1000).toISOString(),
    period_end: new Date(invoice.period_end! * 1000).toISOString(),
  })

  // Update affiliate total earnings
  await supabase.rpc('increment_affiliate_earnings', {
    affiliate_id: affiliate.id,
    amount: commission,
  })
}

function getPlanTierFromSession(session: Stripe.Checkout.Session): string {
  const priceId = (session.line_items as any)?.[0]?.price?.id ?? ''
  return getPlanFromPriceId(priceId)
}

function getPlanTierFromSub(sub: Stripe.Subscription): string {
  const priceId = sub.items.data[0]?.price?.id ?? ''
  return getPlanFromPriceId(priceId)
}

function getPlanFromPriceId(priceId: string): string {
  if (priceId.includes('enterprise')) return 'enterprise'
  if (priceId.includes('pro')) return 'pro'
  return 'free'
}
