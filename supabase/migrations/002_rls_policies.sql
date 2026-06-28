-- RAVE — Row Level Security Policies

-- ─── Enable RLS ───────────────────────────────────────────────────────────────
alter table user_profiles enable row level security;
alter table connected_stores enable row level security;
alter table listings enable row level security;
alter table listing_grades enable row level security;
alter table optimization_records enable row level security;
alter table optimization_queue enable row level security;
alter table sales_history enable row level security;
alter table analytics_snapshots enable row level security;

-- ─── user_profiles ────────────────────────────────────────────────────────────
create policy "Users can view own profile"
  on user_profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on user_profiles for update
  using (auth.uid() = id);

-- ─── connected_stores ────────────────────────────────────────────────────────
create policy "Users can manage own stores"
  on connected_stores for all
  using (auth.uid() = user_id);

-- ─── listings ─────────────────────────────────────────────────────────────────
create policy "Users can manage own listings"
  on listings for all
  using (auth.uid() = user_id);

-- ─── listing_grades ───────────────────────────────────────────────────────────
create policy "Users can view grades for own listings"
  on listing_grades for select
  using (
    listing_id in (
      select id from listings where user_id = auth.uid()
    )
  );

create policy "Users can insert grades for own listings"
  on listing_grades for insert
  with check (
    listing_id in (
      select id from listings where user_id = auth.uid()
    )
  );

-- ─── optimization_records ─────────────────────────────────────────────────────
create policy "Users can manage own optimization records"
  on optimization_records for all
  using (auth.uid() = user_id);

-- ─── optimization_queue ───────────────────────────────────────────────────────
create policy "Users can manage own queue"
  on optimization_queue for all
  using (auth.uid() = user_id);

-- ─── sales_history ────────────────────────────────────────────────────────────
create policy "Users can manage own sales"
  on sales_history for all
  using (auth.uid() = user_id);

-- ─── analytics_snapshots ──────────────────────────────────────────────────────
create policy "Users can manage own analytics"
  on analytics_snapshots for all
  using (auth.uid() = user_id);

-- ─── Service role bypass (for Cloud Functions) ───────────────────────────────
-- Cloud functions use service_role key which bypasses RLS automatically.
-- No additional policies needed for server-side operations.
