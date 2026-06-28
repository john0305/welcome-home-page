-- RAVE — Stripe + Affiliate Schema additions

-- ─── Extend user_profiles with Stripe + invite code fields ───────────────────
alter table user_profiles
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists subscription_status text default 'none'
    check (subscription_status in ('none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  add column if not exists subscription_current_period_end timestamptz,
  add column if not exists referred_by_code text,  -- invite/affiliate code used at signup
  add column if not exists optimizations_used_this_month integer not null default 0,
  add column if not exists optimizations_reset_at timestamptz;

create index if not exists idx_user_profiles_stripe_customer_id on user_profiles(stripe_customer_id);
create index if not exists idx_user_profiles_referred_by_code on user_profiles(referred_by_code);

-- ─── Affiliate Profiles ───────────────────────────────────────────────────────
create table if not exists affiliate_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references user_profiles(id) on delete cascade unique,
  referral_code text not null unique,
  commission_rate numeric(4,3) not null default 0.20, -- 20%
  commission_months_max integer not null default 12,
  status text not null default 'active' check (status in ('active', 'paused', 'banned')),
  total_earnings numeric(10,2) not null default 0,
  pending_earnings numeric(10,2) not null default 0,
  paid_earnings numeric(10,2) not null default 0,
  total_referrals integer not null default 0,
  paid_referrals integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_affiliate_profiles_referral_code on affiliate_profiles(referral_code);

-- ─── Referrals ────────────────────────────────────────────────────────────────
create table if not exists referrals (
  id uuid primary key default uuid_generate_v4(),
  affiliate_id uuid not null references affiliate_profiles(id) on delete cascade,
  referred_user_id uuid not null references user_profiles(id) on delete cascade,

  signed_up_at timestamptz not null default now(),
  converted_to_paid boolean not null default false,
  converted_at timestamptz,
  plan text,                         -- 'pro' | 'enterprise'

  -- Commission tracking per billing period
  commission_earned numeric(10,2) not null default 0,
  commission_status text not null default 'pending'
    check (commission_status in ('pending', 'paid', 'canceled')),
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,

  unique(affiliate_id, referred_user_id, period_start)
);

create index if not exists idx_referrals_affiliate_id on referrals(affiliate_id);
create index if not exists idx_referrals_referred_user_id on referrals(referred_user_id);

-- ─── Affiliate Payouts ────────────────────────────────────────────────────────
create table if not exists affiliate_payouts (
  id uuid primary key default uuid_generate_v4(),
  affiliate_id uuid not null references affiliate_profiles(id) on delete cascade,
  amount numeric(10,2) not null,
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed')),
  method text default 'bank_transfer',         -- 'bank_transfer' | 'paypal' | 'stripe'
  reference text,                              -- external payout reference
  period_start date not null,
  period_end date not null,
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  notes text
);

create index if not exists idx_affiliate_payouts_affiliate_id on affiliate_payouts(affiliate_id);

-- ─── Helper: increment affiliate earnings ────────────────────────────────────
create or replace function increment_affiliate_earnings(affiliate_id uuid, amount numeric)
returns void as $$
begin
  update affiliate_profiles
  set
    total_earnings = total_earnings + amount,
    pending_earnings = pending_earnings + amount
  where id = affiliate_id;
end;
$$ language plpgsql security definer;

-- ─── Helper: reset monthly optimization counter ───────────────────────────────
create or replace function reset_monthly_optimizations()
returns void as $$
begin
  update user_profiles
  set
    optimizations_used_this_month = 0,
    optimizations_reset_at = now()
  where
    tier = 'free'
    and (optimizations_reset_at is null
         or optimizations_reset_at < date_trunc('month', now()));
end;
$$ language plpgsql security definer;

-- ─── RLS for new tables ───────────────────────────────────────────────────────
alter table affiliate_profiles enable row level security;
alter table referrals enable row level security;
alter table affiliate_payouts enable row level security;

create policy "Users can view own affiliate profile"
  on affiliate_profiles for select
  using (auth.uid() = user_id);

create policy "Users can update own affiliate profile"
  on affiliate_profiles for update
  using (auth.uid() = user_id);

create policy "Affiliates can view own referrals"
  on referrals for select
  using (
    affiliate_id in (
      select id from affiliate_profiles where user_id = auth.uid()
    )
  );

create policy "Affiliates can view own payouts"
  on affiliate_payouts for select
  using (
    affiliate_id in (
      select id from affiliate_profiles where user_id = auth.uid()
    )
  );

-- ─── Auto-generate affiliate code for new users ───────────────────────────────
-- Affiliates are created on demand (when user visits affiliate dashboard)
-- so no trigger needed here.
