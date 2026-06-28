import type {
  AffiliateProfile, Referral, AffiliatePayout,
  AffiliateStats, MonthlyAffiliateStat
} from '@/types/affiliate'
import { calculateTier, getTierConfig, getNextTier } from '@/types/affiliate'

// ─── Admin's affiliate profile (Gold Partner — 26 active customers, 17%) ─────

export const mockAffiliateProfile: AffiliateProfile = {
  id: 'aff-001',
  user_id: 'admin-001',
  referral_code: 'ADMIN2024',
  referral_link: 'https://radariq.app/register?ref=ADMIN2024',
  current_tier: 'gold',
  calculated_tier: 'gold',
  grace_period_active: false,
  status: 'active',
  access_type: 'invite_only',

  total_referrals: 34,
  active_customers: 26,
  pending_customers: 4,
  churned_customers: 4,
  disputed_customers: 0,

  total_earnings: 892.40,
  pending_earnings: 187.30,
  paid_earnings: 705.10,
  earnings_ytd: 421.60,
  pending_bonus: 0,

  tier_upgraded_at: '2025-03-01T00:00:00Z',
  tier_bonus_paid: true,

  payout_method: 'paypal',
  payout_email: 'admin@rave.app',
  w9_required: false,
  w9_submitted: false,

  created_at: '2024-01-15T00:00:00Z',
}

// ─── Referrals ────────────────────────────────────────────────────────────────

const now = Date.now()
const day = 86400000

export const mockReferrals: Referral[] = [
  // Active customers (count toward tier — all 4 conditions met)
  { id: 'r-001', affiliate_id: 'aff-001', referred_user_id: 'u-101', referred_username: 'craftygems', referred_email: 'crafty@example.com', referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - 120 * day).toISOString(), first_billing_completed_at: new Date(now - 90 * day).toISOString(), converted_to_paid: true, converted_at: new Date(now - 115 * day).toISOString(), plan: 'pro', plan_price: 29, status: 'active', commission_rate_at_calc: 0.17, commission_earned_lifetime: 59.50, commission_earned_this_month: 4.93, last_commission_at: new Date(now - day).toISOString(), is_paused: false, has_dispute: false },
  { id: 'r-002', affiliate_id: 'aff-001', referred_user_id: 'u-102', referred_username: 'silverstudio', referred_email: 'silver@example.com', referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - 95 * day).toISOString(), first_billing_completed_at: new Date(now - 65 * day).toISOString(), converted_to_paid: true, converted_at: new Date(now - 90 * day).toISOString(), plan: 'agency', plan_price: 79, status: 'active', commission_rate_at_calc: 0.17, commission_earned_lifetime: 94.30, commission_earned_this_month: 13.43, last_commission_at: new Date(now - day).toISOString(), is_paused: false, has_dispute: false },
  { id: 'r-003', affiliate_id: 'aff-001', referred_user_id: 'u-103', referred_username: 'handmadebyju', referred_email: 'ju@example.com', referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - 80 * day).toISOString(), first_billing_completed_at: new Date(now - 50 * day).toISOString(), converted_to_paid: true, converted_at: new Date(now - 75 * day).toISOString(), plan: 'pro', plan_price: 29, status: 'active', commission_rate_at_calc: 0.17, commission_earned_lifetime: 44.20, commission_earned_this_month: 4.93, last_commission_at: new Date(now - day).toISOString(), is_paused: false, has_dispute: false },
  { id: 'r-004', affiliate_id: 'aff-001', referred_user_id: 'u-104', referred_username: 'beadworks', referred_email: 'bead@example.com', referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - 65 * day).toISOString(), first_billing_completed_at: new Date(now - 35 * day).toISOString(), converted_to_paid: true, converted_at: new Date(now - 60 * day).toISOString(), plan: 'starter', plan_price: 12, status: 'active', commission_rate_at_calc: 0.17, commission_earned_lifetime: 18.70, commission_earned_this_month: 2.04, last_commission_at: new Date(now - day).toISOString(), is_paused: false, has_dispute: false },
  { id: 'r-005', affiliate_id: 'aff-001', referred_user_id: 'u-105', referred_username: 'moonjewels', referred_email: 'moon@example.com', referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - 55 * day).toISOString(), first_billing_completed_at: new Date(now - 25 * day).toISOString(), converted_to_paid: true, converted_at: new Date(now - 50 * day).toISOString(), plan: 'pro', plan_price: 29, status: 'active', commission_rate_at_calc: 0.17, commission_earned_lifetime: 24.65, commission_earned_this_month: 4.93, last_commission_at: new Date(now - day).toISOString(), is_paused: false, has_dispute: false },
  // Bulk active customers to reach 26 total active
  ...Array.from({ length: 21 }, (_, i): Referral => ({
    id: `r-bulk-${i}`, affiliate_id: 'aff-001', referred_user_id: `u-2${i}`, referred_username: `seller${i + 10}`, referred_email: `seller${i + 10}@example.com`, referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - (40 + i * 2) * day).toISOString(), first_billing_completed_at: new Date(now - (10 + i) * day).toISOString(), converted_to_paid: true, converted_at: new Date(now - (38 + i * 2) * day).toISOString(),
    plan: (['starter', 'pro', 'pro', 'agency'] as const)[i % 4],
    plan_price: [12, 29, 29, 79][i % 4],
    status: 'active', commission_rate_at_calc: 0.17, commission_earned_lifetime: 15 + i * 3, commission_earned_this_month: [2.04, 4.93, 4.93, 13.43][i % 4], last_commission_at: new Date(now - day).toISOString(), is_paused: false, has_dispute: false,
  })),
  // Pending (< 30 days / first cycle not complete — do NOT count toward tier)
  { id: 'r-p1', affiliate_id: 'aff-001', referred_user_id: 'u-p1', referred_username: 'newshop1', referred_email: 'new1@example.com', referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - 12 * day).toISOString(), converted_to_paid: true, converted_at: new Date(now - 10 * day).toISOString(), plan: 'pro', plan_price: 29, status: 'pending', commission_earned_lifetime: 0, commission_earned_this_month: 0, is_paused: false, has_dispute: false },
  { id: 'r-p2', affiliate_id: 'aff-001', referred_user_id: 'u-p2', referred_username: 'newshop2', referred_email: 'new2@example.com', referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - 5 * day).toISOString(), converted_to_paid: false, status: 'pending', commission_earned_lifetime: 0, commission_earned_this_month: 0, is_paused: false, has_dispute: false },
  { id: 'r-p3', affiliate_id: 'aff-001', referred_user_id: 'u-p3', referred_username: 'newshop3', referred_email: 'new3@example.com', referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - 20 * day).toISOString(), converted_to_paid: true, converted_at: new Date(now - 18 * day).toISOString(), plan: 'starter', plan_price: 12, status: 'pending', commission_earned_lifetime: 0, commission_earned_this_month: 0, is_paused: false, has_dispute: false },
  { id: 'r-p4', affiliate_id: 'aff-001', referred_user_id: 'u-p4', referred_username: 'newshop4', referred_email: 'new4@example.com', referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - 3 * day).toISOString(), converted_to_paid: false, status: 'pending', commission_earned_lifetime: 0, commission_earned_this_month: 0, is_paused: false, has_dispute: false },
  // Churned
  { id: 'r-c1', affiliate_id: 'aff-001', referred_user_id: 'u-c1', referred_username: 'oldshop1', referred_email: 'old1@example.com', referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - 150 * day).toISOString(), first_billing_completed_at: new Date(now - 120 * day).toISOString(), converted_to_paid: true, converted_at: new Date(now - 148 * day).toISOString(), plan: 'pro', plan_price: 29, status: 'canceled', commission_rate_at_calc: 0.10, commission_earned_lifetime: 8.70, commission_earned_this_month: 0, is_paused: false, has_dispute: false },
  { id: 'r-c2', affiliate_id: 'aff-001', referred_user_id: 'u-c2', referred_username: 'oldshop2', referred_email: 'old2@example.com', referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - 130 * day).toISOString(), first_billing_completed_at: new Date(now - 100 * day).toISOString(), converted_to_paid: true, converted_at: new Date(now - 128 * day).toISOString(), plan: 'starter', plan_price: 12, status: 'canceled', commission_earned_lifetime: 4.80, commission_earned_this_month: 0, is_paused: false, has_dispute: false },
  // Disputed — chargeback deducted
  { id: 'r-d1', affiliate_id: 'aff-001', referred_user_id: 'u-d1', referred_username: 'disputer1', referred_email: 'dispute@example.com', referral_code_used: 'ADMIN2024', signed_up_at: new Date(now - 70 * day).toISOString(), converted_to_paid: true, converted_at: new Date(now - 68 * day).toISOString(), plan: 'pro', plan_price: 29, status: 'disputed', commission_earned_lifetime: 0, commission_earned_this_month: 0, chargeback_amount: 4.93, is_paused: false, has_dispute: true },
]

// ─── Payout history ───────────────────────────────────────────────────────────

export const mockPayouts: AffiliatePayout[] = [
  // Note: Feb payout includes $75 Gold tier bonus
  { id: 'p-001', affiliate_id: 'aff-001', amount: 263.80, bonus_amount: 75, currency: 'USD', status: 'paid', method: 'paypal', reference: 'PP-20250301-A1', period_start: '2025-02-01', period_end: '2025-02-28', requested_at: '2025-03-01T00:00:00Z', paid_at: '2025-03-05T00:00:00Z', includes_bonus_for_tier: 'gold', w9_on_file: false },
  { id: 'p-002', affiliate_id: 'aff-001', amount: 124.40, bonus_amount: 0, currency: 'USD', status: 'paid', method: 'paypal', reference: 'PP-20250201-A1', period_start: '2025-01-01', period_end: '2025-01-31', requested_at: '2025-02-01T00:00:00Z', paid_at: '2025-02-05T00:00:00Z', w9_on_file: false },
  { id: 'p-003', affiliate_id: 'aff-001', amount: 92.30, bonus_amount: 0, currency: 'USD', status: 'paid', method: 'paypal', reference: 'PP-20250101-A1', period_start: '2024-12-01', period_end: '2024-12-31', requested_at: '2025-01-01T00:00:00Z', paid_at: '2025-01-06T00:00:00Z', w9_on_file: false },
  { id: 'p-004', affiliate_id: 'aff-001', amount: 187.30, bonus_amount: 0, currency: 'USD', status: 'pending', method: 'paypal', period_start: '2025-04-01', period_end: '2025-04-30', requested_at: new Date(now - 5 * day).toISOString(), w9_on_file: false, notes: 'Paid within 7 business days via PayPal' },
]

// ─── Monthly performance ──────────────────────────────────────────────────────

export const mockMonthlyStats: MonthlyAffiliateStat[] = [
  { month: 'Dec', referrals: 3, conversions: 2, earnings: 31.20, active_customers: 14 },
  { month: 'Jan', referrals: 5, conversions: 4, earnings: 67.60, active_customers: 18 },
  { month: 'Feb', referrals: 6, conversions: 5, earnings: 189.40, active_customers: 21 }, // Gold upgrade + $75 bonus
  { month: 'Mar', referrals: 4, conversions: 3, earnings: 124.30, active_customers: 24 },
  { month: 'Apr', referrals: 5, conversions: 4, earnings: 152.80, active_customers: 26 },
  { month: 'May', referrals: 4, conversions: 3, earnings: 187.30, active_customers: 26 },
]

// ─── Compute stats for dashboard ─────────────────────────────────────────────

export function computeAffiliateStats(profile: AffiliateProfile, referrals: Referral[]): AffiliateStats {
  const active = referrals.filter(r => r.status === 'active')
  const starters = active.filter(r => r.plan === 'starter').length
  const pros = active.filter(r => r.plan === 'pro').length
  const agencies = active.filter(r => r.plan === 'agency').length

  const commissionRate = getTierConfig(profile.current_tier).commissionRate
  const monthlyRecurring = Math.round((
    starters * 12 * commissionRate +
    pros * 29 * commissionRate +
    agencies * 79 * commissionRate
  ) * 100) / 100

  const nextTierCfg = getNextTier(profile.current_tier)
  const customersToNextTier = nextTierCfg
    ? Math.max(0, nextTierCfg.minCustomers - profile.active_customers)
    : 0

  const currentTierCfg = getTierConfig(profile.current_tier)
  const customersToProtectTier = profile.grace_period_active
    ? Math.max(0, currentTierCfg.minCustomers - profile.active_customers)
    : 0

  const graceDaysRemaining = profile.grace_period_ends_at
    ? Math.max(0, Math.floor((new Date(profile.grace_period_ends_at).getTime() - Date.now()) / 86400000))
    : undefined

  return {
    active_customers: profile.active_customers,
    pending_customers: profile.pending_customers,
    churned_customers: profile.churned_customers,
    total_referrals: profile.total_referrals,
    conversion_rate: profile.total_referrals > 0
      ? Math.round((profile.active_customers / profile.total_referrals) * 100)
      : 0,
    current_tier: profile.current_tier,
    calculated_tier: profile.calculated_tier,
    is_downgrade_risk: profile.calculated_tier !== profile.current_tier || profile.grace_period_active,
    grace_days_remaining: graceDaysRemaining,
    customers_to_next_tier: customersToNextTier,
    customers_to_protect_tier: customersToProtectTier,
    monthly_recurring: monthlyRecurring,
    pending_earnings: profile.pending_earnings,
    earnings_ytd: profile.earnings_ytd,
    w9_threshold_pct: Math.round((profile.earnings_ytd / 600) * 100),
    starter_active: starters,
    pro_active: pros,
    agency_active: agencies,
    commission_rate: commissionRate,
  }
}
