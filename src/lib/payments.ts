// Stripe payments — single source of truth.
// Browser-side helpers + price ID lookup + plan metadata.

import { loadStripe, type Stripe } from "@stripe/stripe-js";

type StripeEnv = 'sandbox' | 'live';

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;
const environment: StripeEnv = clientToken?.startsWith('pk_test_') ? 'sandbox' : 'live';

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    if (!clientToken) throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");
    stripePromise = loadStripe(clientToken);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return environment;
}

export const isPaymentsConfigured = !!clientToken;

// Price lookup keys (match what was created via batch_create_product)
export const PLAN_PRICE_IDS = {
  starter: { monthly: 'starter_monthly_v2', yearly: 'starter_yearly_v2' },
  pro: { monthly: 'pro_monthly_v2', yearly: 'pro_yearly_v2' },
  agency: { monthly: 'agency_monthly_v2', yearly: 'agency_yearly_v2' },
} as const;

export type PlanId = 'free' | 'starter' | 'pro' | 'agency';

export const AFFILIATE_COMMISSION_RATE = 0.20;

export const PLANS = [
  {
    id: 'free' as const,
    name: 'Free',
    price_monthly: 0,
    price_yearly: 0,
    affiliate_commission_monthly: 0,
    description: "See what's holding your shop back",
    features: [
      '10 AI optimizations per month',
      'Unlimited listing grading',
      'Store health score',
      'Basic dashboard and alerts',
      'Nightly data sync',
      '1 Etsy store',
      'Echo Lite — 10 messages per month',
    ],
    limits: { optimizations_per_month: 10, stores: 1 },
  },
  {
    id: 'starter' as const,
    name: 'Starter',
    price_monthly: 14,
    price_yearly: 11,
    affiliate_commission_monthly: 2.80,
    description: 'For sellers ready to start growing',
    features: [
      '50 AI optimizations per month',
      'Unlimited listing grading',
      'Full dashboard and analytics',
      'Nightly data sync',
      'Competitor tag gap analysis',
      'Up to 5 smart alerts',
      '1 Etsy store',
      'Echo Standard — 50 messages per month',
    ],
    limits: { optimizations_per_month: 50, stores: 1 },
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price_monthly: 39,
    price_yearly: 31,
    affiliate_commission_monthly: 7.80,
    description: 'Put your shop on autopilot',
    features: [
      '✨ RadarIQ Pinterest Spotlight — FREE',
      'Unlimited AI optimizations',
      'Unlimited listing grading',
      '3x faster batch grading and optimization',
      'Full dashboard and analytics',
      'Automated nightly scans',
      'Bulk optimization',
      'Seasonal and category insights',
      'Unlimited smart alerts',
      'Dead listing resurrection',
      'Review sentiment analysis',
      'Holiday readiness score',
      'Echo Full — unlimited conversations',
      '3 Etsy stores',
      'A/B Testing Lab — coming soon',
    ],
    limits: { optimizations_per_month: -1, stores: 3 },
    highlighted: true,
  },
  {
    id: 'agency' as const,
    name: 'Agency',
    price_monthly: 99,
    price_yearly: 79,
    affiliate_commission_monthly: 19.80,
    description: 'For power sellers and multi-shop managers',
    features: [
      'Everything in Pro',
      'Unlimited Etsy stores',
      '5x faster batch grading',
      'Extended analytics history',
      'Priority support',
      'Dedicated onboarding call',
      'Early access to all new features',
      'Echo Pro — unlimited, multi-store context switching',
      'API access — coming soon',
      'White label option — coming soon',
    ],
    limits: { optimizations_per_month: -1, stores: -1 },
  },
];
