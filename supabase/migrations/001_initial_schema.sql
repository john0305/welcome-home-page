-- RAVE — Initial Schema
-- Run in Supabase SQL Editor or via supabase db push

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── User Profiles ────────────────────────────────────────────────────────────
create table if not exists user_profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null unique,
  username text not null unique,
  full_name text,
  avatar_url text,
  tier text not null default 'free' check (tier in ('free', 'pro', 'enterprise', 'admin')),
  settings jsonb not null default '{
    "default_listing_state": "draft",
    "optimization_schedule": "nightly",
    "notifications_enabled": true,
    "gemini_model": "gemini-1.5-flash",
    "auto_optimize": false,
    "auto_optimize_threshold": 60,
    "auto_optimize_interval_days": 90,
    "low_activity_threshold_days": 30
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Connected Stores ─────────────────────────────────────────────────────────
create table if not exists connected_stores (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  platform text not null default 'etsy' check (platform in ('etsy', 'ebay', 'amazon', 'shopify')),
  shop_id text not null,
  shop_name text not null,
  shop_icon_url text,
  shop_url text,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  is_connected boolean not null default true,
  last_sync_at timestamptz,
  listing_count integer default 0,
  created_at timestamptz not null default now(),
  unique(user_id, platform, shop_id)
);

-- ─── Listings ─────────────────────────────────────────────────────────────────
create table if not exists listings (
  id uuid primary key default uuid_generate_v4(),
  etsy_listing_id bigint not null,
  shop_id text not null,
  user_id uuid not null references user_profiles(id) on delete cascade,

  title text not null,
  description text not null default '',
  price numeric(10,2) not null default 0,
  currency_code text not null default 'USD',
  quantity integer not null default 0,
  state text not null default 'active' check (state in ('active', 'inactive', 'draft', 'expired', 'sold_out')),

  tags text[] not null default '{}',
  materials text[] not null default '{}',
  category_id integer,
  taxonomy_id integer,
  taxonomy_path text[],
  shipping_profile_id bigint,
  shop_section_id bigint,
  has_variations boolean not null default false,
  is_customizable boolean not null default false,
  is_digital boolean not null default false,

  image_urls text[] not null default '{}',
  thumbnail_url text,

  views integer not null default 0,
  favorites integer not null default 0,
  sales_count integer not null default 0,

  etsy_created_at timestamptz not null,
  etsy_updated_at timestamptz not null,
  last_synced_at timestamptz not null default now(),

  current_grade integer,
  current_image_grade integer,
  optimization_count integer not null default 0,
  last_optimized_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(user_id, etsy_listing_id)
);

create index if not exists idx_listings_user_id on listings(user_id);
create index if not exists idx_listings_state on listings(state);
create index if not exists idx_listings_current_grade on listings(current_grade);
create index if not exists idx_listings_etsy_created_at on listings(etsy_created_at);

-- ─── Listing Grades ───────────────────────────────────────────────────────────
create table if not exists listing_grades (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references listings(id) on delete cascade,

  overall_score integer not null check (overall_score between 0 and 100),
  title_score integer not null check (title_score between 0 and 25),
  description_score integer not null check (description_score between 0 and 25),
  tags_score integer not null check (tags_score between 0 and 25),
  image_score integer not null check (image_score between 0 and 25),

  strengths text[] not null default '{}',
  weaknesses text[] not null default '{}',
  recommendations text[] not null default '{}',

  graded_at timestamptz not null default now(),
  graded_by text not null default 'gemini-1.5-flash',
  views_at_grading integer not null default 0,
  favorites_at_grading integer not null default 0,
  sales_at_grading integer not null default 0
);

create index if not exists idx_listing_grades_listing_id on listing_grades(listing_id);

-- ─── Optimization Records ─────────────────────────────────────────────────────
create table if not exists optimization_records (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references listings(id) on delete cascade,
  user_id uuid not null references user_profiles(id) on delete cascade,

  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'failed', 'rejected', 'accepted')),

  original_title text not null,
  original_description text not null,
  original_tags text[] not null default '{}',
  original_materials text[] not null default '{}',
  original_grade integer not null default 0,

  optimized_title text,
  optimized_description text,
  optimized_tags text[],
  optimized_materials text[],
  new_grade integer,
  grade_improvement integer,

  accepted_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,

  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  model_used text not null default 'gemini-1.5-flash',
  tokens_used integer
);

create index if not exists idx_optimization_records_listing_id on optimization_records(listing_id);
create index if not exists idx_optimization_records_user_id on optimization_records(user_id);
create index if not exists idx_optimization_records_status on optimization_records(status);

-- ─── Optimization Queue ───────────────────────────────────────────────────────
create table if not exists optimization_queue (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references listings(id) on delete cascade,
  user_id uuid not null references user_profiles(id) on delete cascade,

  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  reason text not null,
  scheduled_for text not null default 'nightly' check (scheduled_for in ('immediate', 'nightly')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'failed')),

  created_at timestamptz not null default now()
);

-- ─── Sales History ────────────────────────────────────────────────────────────
create table if not exists sales_history (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references listings(id) on delete cascade,
  user_id uuid not null references user_profiles(id) on delete cascade,
  etsy_transaction_id bigint not null unique,

  sale_date timestamptz not null,
  sale_price numeric(10,2) not null,
  quantity_sold integer not null default 1,
  buyer_message text,

  listing_grade_at_sale integer,
  image_grade_at_sale integer,
  optimization_count_at_sale integer not null default 0,
  views_at_sale integer not null default 0,
  favorites_at_sale integer not null default 0
);

create index if not exists idx_sales_history_listing_id on sales_history(listing_id);
create index if not exists idx_sales_history_sale_date on sales_history(sale_date);

-- ─── Analytics Snapshots ──────────────────────────────────────────────────────
create table if not exists analytics_snapshots (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  snapshot_date date not null,
  ga_data jsonb,
  etsy_views integer default 0,
  etsy_favorites integer default 0,
  created_at timestamptz not null default now(),
  unique(user_id, snapshot_date)
);

-- ─── Trigger: auto-update updated_at ─────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_user_profiles_updated_at
  before update on user_profiles
  for each row execute function update_updated_at();

create trigger update_listings_updated_at
  before update on listings
  for each row execute function update_updated_at();

-- ─── Trigger: create profile on signup ───────────────────────────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into user_profiles (id, email, username, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
