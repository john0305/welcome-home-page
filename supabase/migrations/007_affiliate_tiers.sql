-- RAVE — Affiliate tier system (v2)
-- Replaces simple 20% flat rate with 4 performance-based tiers.

-- ─── Update affiliate_profiles ────────────────────────────────────────────────
alter table affiliate_profiles
  -- Tier tracking
  add column if not exists current_tier text not null default 'partner'
    check (current_tier in ('partner', 'silver', 'gold', 'elite')),
  add column if not exists calculated_tier text not null default 'partner'
    check (calculated_tier in ('partner', 'silver', 'gold', 'elite')),

  -- Grace period (60 days if active count drops below tier threshold)
  add column if not exists grace_period_active boolean not null default false,
  add column if not exists grace_period_started_at timestamptz,
  add column if not exists grace_period_ends_at timestamptz,

  -- Customer counts (separate from raw referrals)
  add column if not exists active_customers integer not null default 0,
  add column if not exists pending_customers integer not null default 0,
  add column if not exists churned_customers integer not null default 0,
  add column if not exists disputed_customers integer not null default 0,

  -- Earnings tracking
  add column if not exists earnings_ytd numeric(10,2) not null default 0,
  add column if not exists pending_bonus numeric(10,2) not null default 0,

  -- Tier upgrade history
  add column if not exists tier_upgraded_at timestamptz,
  add column if not exists tier_bonus_paid boolean not null default false,

  -- Payout preferences
  add column if not exists payout_method text check (payout_method in ('paypal', 'venmo', 'bank_transfer')),
  add column if not exists payout_email text,

  -- W-9 / tax compliance
  add column if not exists w9_required boolean not null default false,
  add column if not exists w9_submitted boolean not null default false,
  add column if not exists w9_submitted_at timestamptz,

  -- Program access
  add column if not exists access_type text not null default 'invite_only'
    check (access_type in ('invite_only', 'public')),
  add column if not exists referral_link text;

-- Update commission_rate: computed from tier, not stored as a fixed value
comment on column affiliate_profiles.commission_rate is
  'Deprecated: commission rate is now computed from current_tier. '
  'Partner=10%, Silver=13%, Gold=17%, Elite=20%. Kept for backwards compat.';

-- ─── Tier config reference table ──────────────────────────────────────────────
create table if not exists affiliate_tier_config (
  tier_name text primary key,
  label text not null,
  min_customers integer not null,
  max_customers integer,
  commission_rate numeric(4,3) not null,
  one_time_bonus numeric(10,2) not null default 0,
  commission_months_max integer  -- null = unlimited
);

insert into affiliate_tier_config values
  ('partner',  'Partner',       1,   9,  0.10, 0,   null),
  ('silver',   'Silver Partner', 10,  24, 0.13, 25,  null),
  ('gold',     'Gold Partner',   25,  49, 0.17, 75,  null),
  ('elite',    'Elite Partner',  50,  null, 0.20, 150, null)
on conflict (tier_name) do update
  set commission_rate = excluded.commission_rate,
      one_time_bonus = excluded.one_time_bonus;

-- ─── Extend referrals table ───────────────────────────────────────────────────
alter table referrals
  add column if not exists referral_code_used text,
  add column if not exists first_billing_completed_at timestamptz,
  add column if not exists plan text check (plan in ('starter', 'pro', 'agency')),
  add column if not exists plan_price numeric(10,2),
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'canceled', 'disputed', 'self_referral')),
  add column if not exists commission_rate_at_calc numeric(4,3),
  add column if not exists commission_earned_lifetime numeric(10,2) not null default 0,
  add column if not exists commission_earned_this_month numeric(10,2) not null default 0,
  add column if not exists last_commission_at timestamptz,
  add column if not exists is_paused boolean not null default false,
  add column if not exists has_dispute boolean not null default false,
  add column if not exists chargeback_amount numeric(10,2);

-- ─── Tier history log ────────────────────────────────────────────────────────
create table if not exists affiliate_tier_history (
  id uuid primary key default uuid_generate_v4(),
  affiliate_id uuid not null references affiliate_profiles(id) on delete cascade,
  from_tier text,
  to_tier text not null,
  active_customers_at_change integer not null,
  bonus_amount numeric(10,2) not null default 0,
  bonus_paid boolean not null default false,
  changed_at timestamptz not null default now()
);

alter table affiliate_tier_history enable row level security;
create policy "Affiliates can view own tier history"
  on affiliate_tier_history for select
  using (
    affiliate_id in (select id from affiliate_profiles where user_id = auth.uid())
  );

-- ─── Function: evaluate affiliate tiers (run on 1st of month) ────────────────
create or replace function evaluate_affiliate_tiers()
returns void as $$
declare
  aff record;
  new_tier text;
  tier_cfg record;
begin
  for aff in select * from affiliate_profiles where status = 'active' loop
    -- Determine what tier they should be at
    select tier_name into new_tier
    from affiliate_tier_config
    where aff.active_customers >= min_customers
      and (max_customers is null or aff.active_customers <= max_customers)
    order by min_customers desc
    limit 1;

    -- Default to partner if no tier matches (0 active customers)
    new_tier := coalesce(new_tier, 'partner');

    update affiliate_profiles
    set calculated_tier = new_tier
    where id = aff.id;

    -- Handle tier upgrade
    if new_tier != aff.current_tier then
      -- Check if they were at this calculated tier for a full billing cycle
      -- (simplified: if calculated_tier matches for this eval, upgrade immediately)
      if new_tier > aff.current_tier then
        -- Moving up: immediate upgrade + schedule bonus
        select * into tier_cfg from affiliate_tier_config where tier_name = new_tier;
        update affiliate_profiles
        set current_tier = new_tier,
            commission_rate = tier_cfg.commission_rate,
            tier_upgraded_at = now(),
            tier_bonus_paid = false,
            pending_bonus = pending_bonus + tier_cfg.one_time_bonus,
            grace_period_active = false
        where id = aff.id;

        insert into affiliate_tier_history (affiliate_id, from_tier, to_tier, active_customers_at_change, bonus_amount)
        values (aff.id, aff.current_tier, new_tier, aff.active_customers, tier_cfg.one_time_bonus);

      elsif not aff.grace_period_active then
        -- Moving down: start grace period instead of immediately downgrading
        update affiliate_profiles
        set grace_period_active = true,
            grace_period_started_at = now(),
            grace_period_ends_at = now() + interval '60 days'
        where id = aff.id;

      elsif aff.grace_period_ends_at < now() then
        -- Grace period expired: apply the tier drop
        select * into tier_cfg from affiliate_tier_config where tier_name = new_tier;
        update affiliate_profiles
        set current_tier = new_tier,
            commission_rate = tier_cfg.commission_rate,
            grace_period_active = false,
            grace_period_started_at = null,
            grace_period_ends_at = null
        where id = aff.id;

        insert into affiliate_tier_history (affiliate_id, from_tier, to_tier, active_customers_at_change, bonus_amount)
        values (aff.id, aff.current_tier, new_tier, aff.active_customers, 0);
      end if;
    else
      -- Same tier: clear grace period if they recovered
      if aff.grace_period_active then
        update affiliate_profiles
        set grace_period_active = false,
            grace_period_started_at = null,
            grace_period_ends_at = null
        where id = aff.id;
      end if;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

-- ─── Function: compute monthly affiliate commissions ──────────────────────────
create or replace function compute_affiliate_commissions()
returns void as $$
declare
  ref record;
  aff record;
  commission numeric;
begin
  -- For each active referral
  for ref in
    select r.*, ap.current_tier, ap.commission_rate
    from referrals r
    join affiliate_profiles ap on r.affiliate_id = ap.id
    where r.status = 'active'
      and ap.status = 'active'
  loop
    commission := round(coalesce(ref.plan_price, 0) * ref.commission_rate, 2);

    update referrals
    set commission_earned_this_month = commission,
        commission_earned_lifetime = commission_earned_lifetime + commission,
        commission_rate_at_calc = ref.commission_rate,
        last_commission_at = now()
    where id = ref.id;

    update affiliate_profiles
    set total_earnings = total_earnings + commission,
        pending_earnings = pending_earnings + commission,
        earnings_ytd = earnings_ytd + commission
    where id = ref.affiliate_id;
  end loop;
end;
$$ language plpgsql security definer;

-- ─── W-9 check trigger ────────────────────────────────────────────────────────
create or replace function check_w9_requirement()
returns trigger as $$
begin
  if new.earnings_ytd >= 600 and not new.w9_required then
    new.w9_required := true;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger affiliate_w9_check
  before update on affiliate_profiles
  for each row execute function check_w9_requirement();
