-- RAVE — Security, GDPR, billing, notifications, support tickets

-- ─── Token encryption wrapper ─────────────────────────────────────────────────
-- In production: use Supabase Vault (https://supabase.com/docs/guides/database/vault)
-- for storing OAuth tokens encrypted at rest.
-- For now: RLS + service-role-only access to connected_stores tokens is sufficient.
-- Future: ALTER TABLE connected_stores ALTER COLUMN access_token TYPE bytea;
-- and use pgcrypto's pgp_sym_encrypt/decrypt

-- ─── Data deletion requests (GDPR / account cancellation) ─────────────────────
create table if not exists data_deletion_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references user_profiles(id),
  requested_at timestamptz not null default now(),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'completed')),
  reviewed_by uuid references user_profiles(id),
  reviewed_at timestamptz,
  completed_at timestamptz,
  notes text
);

comment on table data_deletion_requests is
  'User-requested data deletions. Admin must review before data is purged. '
  'Until admin approves, data is retained but the account is inaccessible.';

alter table data_deletion_requests enable row level security;
create policy "Users can create and view own deletion requests"
  on data_deletion_requests for all
  using (auth.uid() = user_id);

-- ─── Add account status to user_profiles ─────────────────────────────────────
alter table user_profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'deletion_requested', 'deleted')),
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists subscription_paused_at timestamptz,
  add column if not exists subscription_pause_until timestamptz;

-- ─── Notification preferences (extended from settings JSON) ──────────────────
create table if not exists notification_preferences (
  user_id uuid primary key references user_profiles(id) on delete cascade,
  in_app boolean not null default true,
  email boolean not null default true,
  sms boolean not null default false,
  browser_push boolean not null default false,
  optimization_complete boolean not null default true,
  grade_improved boolean not null default true,
  listing_sold boolean not null default true,
  trend_alerts boolean not null default true,
  payment_receipts boolean not null default true,
  weekly_report boolean not null default true,
  reoptimize_suggestions boolean not null default true,
  email_daily_digest boolean not null default false,
  sms_phone text,
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;
create policy "Users manage own notification prefs"
  on notification_preferences for all
  using (auth.uid() = user_id);

-- ─── Support tickets ─────────────────────────────────────────────────────────
create table if not exists support_tickets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references user_profiles(id),
  type text not null check (type in ('bug', 'feedback', 'billing', 'other')),
  subject text not null,
  description text not null,
  severity text check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  url text,
  user_agent text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  admin_notes text
);

alter table support_tickets enable row level security;
create policy "Users can create and view own tickets"
  on support_tickets for all
  using (auth.uid() = user_id);

-- ─── Billing history (for user-facing billing portal) ────────────────────────
create table if not exists billing_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  event_type text not null check (event_type in ('charge', 'refund', 'subscription_start', 'subscription_pause', 'subscription_cancel', 'plan_change')),
  amount numeric(10,2),
  currency text not null default 'USD',
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  description text,
  from_plan text,
  to_plan text,
  created_at timestamptz not null default now()
);

alter table billing_events enable row level security;
create policy "Users can view own billing events"
  on billing_events for select
  using (auth.uid() = user_id);

-- ─── Onboarding tracking ──────────────────────────────────────────────────────
create table if not exists onboarding_progress (
  user_id uuid primary key references user_profiles(id) on delete cascade,
  steps_completed text[] not null default '{}',
  store_health_score integer,
  quick_wins jsonb,
  completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table onboarding_progress enable row level security;
create policy "Users manage own onboarding"
  on onboarding_progress for all
  using (auth.uid() = user_id);

-- ─── A/B Test tracking ────────────────────────────────────────────────────────
create table if not exists ab_tests (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references listings(id) on delete cascade,
  user_id uuid not null references user_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running_a', 'running_b', 'completed', 'canceled')),
  version_a_title text not null,
  version_a_description text,
  version_a_tags text[],
  version_a_grade integer,
  version_b_title text,
  version_b_description text,
  version_b_tags text[],
  version_b_grade integer,
  -- Metrics snapshot at comparison time
  version_a_views integer,
  version_a_favorites integer,
  version_a_sales integer,
  version_b_views integer,
  version_b_favorites integer,
  version_b_sales integer,
  winner text check (winner in ('a', 'b')),
  started_at timestamptz,
  phase_b_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table ab_tests enable row level security;
create policy "Users manage own ab tests"
  on ab_tests for all
  using (auth.uid() = user_id);
