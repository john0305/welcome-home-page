-- RAVE — Store personality + rejection tracking

-- ─── Store Personality ────────────────────────────────────────────────────────
create table if not exists store_personalities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  shop_id text not null,

  brand_voice text,
  target_audience text,
  style_keywords text[] not null default '{}',
  avoid_keywords text[] not null default '{}',
  store_description text,
  unique_selling_points text,
  price_positioning text check (price_positioning in ('budget', 'mid-range', 'premium', 'luxury')),
  tone text check (tone in ('casual', 'professional', 'playful', 'sophisticated', 'earthy')),
  emoji_usage text not null default 'minimal' check (emoji_usage in ('none', 'minimal', 'moderate')),
  description_style text check (description_style in ('storytelling', 'feature-focused', 'benefit-focused', 'mixed')),
  avoid_claims text,
  competitor_mentions text default 'avoid' check (competitor_mentions in ('allowed', 'avoid')),

  is_complete boolean not null default false,
  completion_percentage integer not null default 0,
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique(user_id, shop_id)
);

alter table store_personalities enable row level security;
create policy "Users can manage own store personality"
  on store_personalities for all
  using (auth.uid() = user_id);

-- ─── Extend optimization_records with rejection details ───────────────────────
alter table optimization_records
  add column if not exists rejection_category text
    check (rejection_category in (
      'tone_off', 'not_my_style', 'factually_wrong',
      'too_salesy', 'missing_context', 'too_generic',
      'keyword_stuffing', 'other'
    )),
  add column if not exists rejection_comment text,    -- free-form user explanation
  add column if not exists applied_to_etsy boolean not null default false,
  add column if not exists applied_at timestamptz;

-- ─── Rejection Summary View (for analytics + future prompt context) ──────────
-- Provides a per-listing rejection pattern view
create or replace view rejection_patterns as
  select
    listing_id,
    count(*) filter (where status = 'rejected') as total_rejections,
    count(*) filter (where status = 'accepted') as total_acceptances,
    array_agg(rejection_category order by created_at desc) filter (where rejection_category is not null) as rejection_categories,
    array_agg(rejection_comment order by created_at desc) filter (where rejection_comment is not null) as rejection_comments,
    max(created_at) as latest_attempt
  from optimization_records
  group by listing_id;
