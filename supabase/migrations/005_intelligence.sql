-- RAVE — Intelligence & ChromaDB data layer

-- ─── Platform Insights (computed nightly by Cloud Function) ──────────────────
create table if not exists platform_insights (
  id uuid primary key default uuid_generate_v4(),
  insight_type text not null,
  category text,                       -- null = platform-wide
  title text not null,
  body text not null,
  metric text,
  severity text not null default 'info' check (severity in ('opportunity', 'warning', 'info', 'trending')),
  confidence text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  data_source text not null default 'platform',
  supporting_data jsonb,               -- raw aggregated data behind the insight
  sample_size integer,
  valid_until timestamptz,
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create index if not exists idx_platform_insights_type on platform_insights(insight_type);
create index if not exists idx_platform_insights_category on platform_insights(category);
create index if not exists idx_platform_insights_expires_at on platform_insights(expires_at);

-- ─── Category Benchmarks (updated nightly) ────────────────────────────────────
create table if not exists category_benchmarks (
  id uuid primary key default uuid_generate_v4(),
  category text not null unique,
  sample_size integer not null,
  avg_grade numeric(5,2),
  avg_image_count numeric(4,2),
  avg_tag_count numeric(4,2),
  avg_title_length numeric(6,2),
  avg_views numeric(10,2),
  avg_favorites numeric(10,2),
  avg_sales numeric(10,2),
  top_tags text[] not null default '{}',
  optimal_price_min numeric(10,2),
  optimal_price_max numeric(10,2),
  best_day_to_post text,
  best_hour_to_post integer,
  computed_at timestamptz not null default now()
);

-- ─── Tag Trends (updated daily) ───────────────────────────────────────────────
create table if not exists tag_trends (
  id uuid primary key default uuid_generate_v4(),
  tag text not null,
  category text not null,
  week_over_week_change numeric(6,4) not null default 0,
  month_over_month_change numeric(6,4) not null default 0,
  in_top_sellers_pct numeric(5,4) not null default 0,
  search_volume_index integer not null default 0,
  is_rising boolean not null default false,
  is_seasonal boolean not null default false,
  seasonal_peak_month integer,
  computed_at timestamptz not null default now(),
  unique(tag, category)
);

create index if not exists idx_tag_trends_category on tag_trends(category);
create index if not exists idx_tag_trends_is_rising on tag_trends(is_rising);

-- ─── Optimization Outcomes (for ROI tracking + AI learning) ──────────────────
-- Captures anonymized before/after data 30 days post-optimization
create table if not exists optimization_outcomes (
  id uuid primary key default uuid_generate_v4(),
  optimization_record_id uuid not null references optimization_records(id) on delete cascade,
  user_id_hash text not null,          -- SHA-256 of user_id — anonymized
  listing_id_hash text not null,       -- SHA-256 of listing_id — anonymized
  category text,
  price_bucket text,

  -- Before optimization
  grade_before integer not null,
  views_before integer not null default 0,
  favorites_before integer not null default 0,
  sales_before integer not null default 0,

  -- After optimization (recorded 30 days later)
  grade_after integer,
  views_after integer,
  favorites_after integer,
  sales_after integer,

  -- Computed uplift
  views_uplift_pct numeric(8,4),
  favorites_uplift_pct numeric(8,4),
  sales_uplift_pct numeric(8,4),

  accepted boolean not null default false,
  rejection_category text,
  fields_changed text[] not null default '{}',

  optimized_at timestamptz not null,
  outcomes_recorded_at timestamptz
);

create index if not exists idx_opt_outcomes_category on optimization_outcomes(category);
create index if not exists idx_opt_outcomes_accepted on optimization_outcomes(accepted);

-- ─── ChromaDB Sync Log (track which listings have been embedded) ──────────────
create table if not exists chroma_sync_log (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references listings(id) on delete cascade unique,
  chroma_document_id text not null,
  embedding_model text not null default 'models/embedding-001',
  last_synced_at timestamptz not null default now(),
  sync_status text not null default 'synced' check (sync_status in ('synced', 'pending', 'failed'))
);

-- ─── Neo4j Sync Log ───────────────────────────────────────────────────────────
create table if not exists neo4j_sync_log (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null,           -- 'listing' | 'tag' | 'optimization'
  entity_id uuid not null,
  last_synced_at timestamptz not null default now(),
  sync_status text not null default 'synced',
  unique(entity_type, entity_id)
);

-- ─── User Insight Dismissals (don't show the same insight twice) ──────────────
create table if not exists insight_dismissals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  insight_id text not null,
  dismissed_at timestamptz not null default now(),
  unique(user_id, insight_id)
);

alter table platform_insights enable row level security;
-- Platform insights are readable by all authenticated users
create policy "Authenticated users can read insights"
  on platform_insights for select
  using (auth.uid() is not null);

alter table category_benchmarks enable row level security;
create policy "Authenticated users can read benchmarks"
  on category_benchmarks for select
  using (auth.uid() is not null);

alter table tag_trends enable row level security;
create policy "Authenticated users can read trends"
  on tag_trends for select
  using (auth.uid() is not null);

alter table optimization_outcomes enable row level security;
-- Outcomes are anonymized — readable only by service role (Cloud Functions)

alter table insight_dismissals enable row level security;
create policy "Users manage own dismissals"
  on insight_dismissals for all
  using (auth.uid() = user_id);
