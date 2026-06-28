// ─── Tier definitions ────────────────────────────────────────────────────────

export type AffiliateTierName = 'partner' | 'silver' | 'gold' | 'elite'

export interface AffiliateTierConfig {
  name: AffiliateTierName
  label: string
  minCustomers: number
  maxCustomers: number | null
  commissionRate: number      // e.g. 0.10 = 10%
  oneTimeBonus: number        // $ amount, 0 if none
  color: string               // tailwind color class
  icon: string                // emoji
}

export const AFFILIATE_TIERS: AffiliateTierConfig[] = [
  {
    name: 'partner',
    label: 'Partner',
    minCustomers: 1,
    maxCustomers: 9,
    commissionRate: 0.10,
    oneTimeBonus: 0,
    color: 'text-slate-700 bg-slate-100 border-slate-300',
    icon: '🤝',
  },
  {
    name: 'silver',
    label: 'Silver Partner',
    minCustomers: 10,
    maxCustomers: 24,
    commissionRate: 0.13,
    oneTimeBonus: 25,
    color: 'text-slate-600 bg-slate-200 border-slate-400',
    icon: '🥈',
  },
  {
    name: 'gold',
    label: 'Gold Partner',
    minCustomers: 25,
    maxCustomers: 49,
    commissionRate: 0.17,
    oneTimeBonus: 75,
    color: 'text-amber-700 bg-amber-100 border-amber-300',
    icon: '🥇',
  },
  {
    name: 'elite',
    label: 'Elite Partner',
    minCustomers: 50,
    maxCustomers: null,
    commissionRate: 0.20,
    oneTimeBonus: 150,
    color: 'text-[#00D4C8] bg-[#00D4C8]/15 border-[#00D4C8]',
    icon: '👑',
  },
]

export function getTierConfig(name: AffiliateTierName): AffiliateTierConfig {
  return AFFILIATE_TIERS.find(t => t.name === name)!
}

export function calculateTier(activeCustomers: number): AffiliateTierName {
  if (activeCustomers >= 50) return 'elite'
  if (activeCustomers >= 25) return 'gold'
  if (activeCustomers >= 10) return 'silver'
  return 'partner'
}

export function getCommissionRate(tier: AffiliateTierName): number {
  return getTierConfig(tier).commissionRate
}

export function getNextTier(tier: AffiliateTierName): AffiliateTierConfig | null {
  const idx = AFFILIATE_TIERS.findIndex(t => t.name === tier)
  return idx < AFFILIATE_TIERS.length - 1 ? AFFILIATE_TIERS[idx + 1] : null
}

// ─── Active customer definition ───────────────────────────────────────────────
// A referred customer counts toward tier ONLY when:
//  1. Signed up using affiliate's code
//  2. Completed at least one full 30-day billing cycle
//  3. Has NOT disputed, charged back, or canceled
//  4. Currently on active paid subscription (not paused)

export type ReferralStatus =
  | 'pending'       // Signed up but < 30 days or first cycle incomplete
  | 'active'        // Counts toward tier — all 4 conditions met
  | 'paused'        // Subscription paused — does NOT count toward tier
  | 'canceled'      // Canceled — no longer counts
  | 'disputed'      // Chargeback/dispute — removed + deducted
  | 'self_referral' // Flagged as abuse

// ─── Profile & state ─────────────────────────────────────────────────────────

export interface AffiliateProfile {
  id: string
  user_id: string
  referral_code: string                // e.g. "Linda25"
  referral_link?: string               // full trackable URL
  current_tier: AffiliateTierName
  calculated_tier: AffiliateTierName   // what tier they WOULD BE based on today's active count
  grace_period_active: boolean
  grace_period_started_at?: string     // when they dropped below current tier threshold
  grace_period_ends_at?: string        // 60 days after grace_period_started_at
  status: 'active' | 'paused' | 'banned' | 'pending_invite'
  access_type: 'invite_only' | 'public'

  // Customer counts
  total_referrals: number              // all signups ever
  active_customers: number             // currently counts toward tier
  pending_customers: number            // signed up, < 30 days / first cycle pending
  churned_customers: number
  disputed_customers: number

  // Earnings
  total_earnings: number               // lifetime commissions
  pending_earnings: number             // earned, not yet paid out
  paid_earnings: number
  earnings_ytd: number                 // year-to-date (W-9 trigger at $600)
  pending_bonus: number                // tier upgrade bonus not yet paid

  // Tier history
  tier_upgraded_at?: string
  tier_bonus_paid: boolean

  // Payout info
  payout_method?: 'paypal' | 'venmo' | 'bank_transfer'
  payout_email?: string
  w9_required: boolean
  w9_submitted: boolean

  created_at: string
}

export interface Referral {
  id: string
  affiliate_id: string
  referred_user_id: string
  referred_username?: string
  referred_email?: string
  referral_code_used: string
  signed_up_at: string
  first_billing_completed_at?: string
  converted_to_paid: boolean
  converted_at?: string
  plan?: 'starter' | 'pro' | 'agency'
  plan_price?: number                   // at time of commission calc
  status: ReferralStatus
  commission_rate_at_calc?: number      // rate applied when commission was calculated
  commission_earned_lifetime: number
  commission_earned_this_month: number
  last_commission_at?: string
  is_paused: boolean
  has_dispute: boolean
  chargeback_amount?: number
}

export interface AffiliatePayout {
  id: string
  affiliate_id: string
  amount: number
  bonus_amount: number          // tier upgrade bonus if applicable
  currency: string
  status: 'pending' | 'processing' | 'paid' | 'failed'
  method?: string
  reference?: string
  period_start: string
  period_end: string
  requested_at: string
  paid_at?: string
  includes_bonus_for_tier?: AffiliateTierName
  w9_on_file: boolean
  notes?: string
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export interface AffiliateStats {
  // Customer counts
  active_customers: number
  pending_customers: number
  churned_customers: number
  total_referrals: number
  conversion_rate: number      // active / total signups %

  // Tier
  current_tier: AffiliateTierName
  calculated_tier: AffiliateTierName
  is_downgrade_risk: boolean   // calculated < current (in grace)
  grace_days_remaining?: number
  customers_to_next_tier?: number
  customers_to_protect_tier?: number  // how many more needed to avoid drop

  // Earnings
  monthly_recurring: number    // current active × commission rate
  pending_earnings: number
  earnings_ytd: number
  w9_threshold_pct: number     // ytd / 600

  // Plan breakdown
  starter_active: number
  pro_active: number
  agency_active: number

  commission_rate: number
}

export interface MonthlyAffiliateStat {
  month: string
  referrals: number
  conversions: number
  earnings: number
  active_customers: number
}

// ─── Promotional material templates ──────────────────────────────────────────

export const PROMO_CAPTIONS = [
  "I use Radar IQ to optimize my Etsy listings and it's been a game changer for my views and sales. Sign up free with my code {CODE} and get started: {LINK}",
  "If you're serious about growing your Etsy shop, Radar IQ uses AI to rewrite your listings for better search ranking. Try it free → {LINK} (code: {CODE})",
  "Spent 2 years writing listing titles the wrong way. Radar IQ fixed them all in a weekend. Use {CODE} to start free: {LINK}",
  "Radar IQ grades every listing in my Etsy shop and tells me exactly what to fix. The before/after on my views was wild. Try it: {LINK}",
]

export const PROMO_TALKING_POINTS = [
  "RAVE uses Google Gemini AI to grade every listing 0-100 and rewrites titles, descriptions, and tags for Etsy SEO",
  "Free to start — 5 optimizations per month at no cost, upgrade when you see results",
  "Setup takes under 5 minutes: connect Etsy, run a scan, see your score instantly",
  "Not just one-time fixes — it monitors your listings and alerts you when they need re-optimization",
  "Category-level tag and keyword reports to help you decide what to focus on in your own shop",
  "Every referred seller who upgrades earns you a commission every single month they stay subscribed",
]
