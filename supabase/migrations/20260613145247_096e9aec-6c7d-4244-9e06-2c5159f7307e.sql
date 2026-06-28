
-- Store Velocity feature: per-listing sale events + per-user rollup

CREATE TABLE IF NOT EXISTS public.listing_sales_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sold_on date NOT NULL,
  units int NOT NULL DEFAULT 1,
  was_first_sale boolean NOT NULL DEFAULT false,
  days_to_first_sale int,
  listing_type text NOT NULL CHECK (listing_type IN ('type_oneoff','type_fixed_qty','type_infinite')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lse_user_sold_on ON public.listing_sales_events(user_id, sold_on);
CREATE INDEX IF NOT EXISTS idx_lse_listing ON public.listing_sales_events(listing_id);
CREATE INDEX IF NOT EXISTS idx_lse_first ON public.listing_sales_events(user_id) WHERE was_first_sale;

GRANT SELECT ON public.listing_sales_events TO authenticated;
GRANT ALL ON public.listing_sales_events TO service_role;
ALTER TABLE public.listing_sales_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lse_owner_select" ON public.listing_sales_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "lse_service_all" ON public.listing_sales_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS public.store_velocity_stats (
  user_id uuid PRIMARY KEY,
  avg_days_to_sell numeric,
  avg_days_optimized numeric,
  avg_days_not_optimized numeric,
  p20_days_to_sell numeric,
  monthly_trend jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_count int NOT NULL DEFAULT 0,
  sold_last_90d int NOT NULL DEFAULT 0,
  sold_prior_90d int NOT NULL DEFAULT 0,
  sell_through_90d numeric,
  sell_through_prior_90d numeric,
  fast_seller_traits jsonb NOT NULL DEFAULT '[]'::jsonb,
  infinite_count int NOT NULL DEFAULT 0,
  infinite_sales_per_month numeric,
  sample_size int NOT NULL DEFAULT 0,
  computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.store_velocity_stats TO authenticated;
GRANT ALL ON public.store_velocity_stats TO service_role;
ALTER TABLE public.store_velocity_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svs_owner_select" ON public.store_velocity_stats
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "svs_service_all" ON public.store_velocity_stats
  FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE OR REPLACE FUNCTION public.refresh_store_velocity(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p20 numeric;
  _avg numeric;
  _avg_opt numeric;
  _avg_not numeric;
  _active int;
  _sold90 int;
  _sold_prior int;
  _st numeric;
  _st_prior numeric;
  _sample int;
  _trend jsonb;
  _traits jsonb := '[]'::jsonb;
  _infcount int;
  _infrate numeric;
BEGIN
  DELETE FROM public.listing_sales_events WHERE user_id = _user_id;

  INSERT INTO public.listing_sales_events
    (listing_id, user_id, sold_on, units, was_first_sale, days_to_first_sale, listing_type)
  WITH ordered AS (
    SELECT s.listing_id, s.recorded_on, s.quantity,
      LAG(s.quantity) OVER (PARTITION BY s.listing_id ORDER BY s.recorded_on) AS prev_qty
    FROM public.listing_snapshots s
    WHERE s.user_id = _user_id
  ),
  drops AS (
    SELECT listing_id, recorded_on AS sold_on,
      GREATEST(COALESCE(prev_qty,0) - COALESCE(quantity,0), 0) AS units
    FROM ordered
    WHERE prev_qty IS NOT NULL AND quantity < prev_qty
  ),
  first_snap AS (
    SELECT listing_id,
      (ARRAY_AGG(quantity ORDER BY recorded_on))[1] AS first_qty
    FROM public.listing_snapshots WHERE user_id = _user_id GROUP BY listing_id
  ),
  enriched AS (
    SELECT d.listing_id, d.sold_on, d.units,
      ROW_NUMBER() OVER (PARTITION BY d.listing_id ORDER BY d.sold_on) AS rn,
      l.etsy_created_at, l.quantity AS cur_qty,
      fs.first_qty,
      SUM(d.units) OVER (PARTITION BY d.listing_id) AS total_units
    FROM drops d
    JOIN public.listings l ON l.id = d.listing_id
    LEFT JOIN first_snap fs ON fs.listing_id = d.listing_id
  )
  SELECT
    e.listing_id, _user_id, e.sold_on, e.units,
    (e.rn = 1),
    CASE WHEN e.rn = 1 AND e.etsy_created_at IS NOT NULL
      THEN GREATEST((e.sold_on - e.etsy_created_at::date), 0) END,
    CASE
      WHEN e.total_units >= 3
        AND e.etsy_created_at IS NOT NULL
        AND (CURRENT_DATE - e.etsy_created_at::date) >= 180
        AND COALESCE(e.cur_qty,0) > 0
        THEN 'type_infinite'
      WHEN COALESCE(e.first_qty, e.cur_qty, 1) <= 1 THEN 'type_oneoff'
      ELSE 'type_fixed_qty'
    END
  FROM enriched e;

  SELECT
    AVG(days_to_first_sale)::numeric,
    PERCENTILE_CONT(0.2) WITHIN GROUP (ORDER BY days_to_first_sale)::numeric,
    COUNT(*)::int
  INTO _avg, _p20, _sample
  FROM public.listing_sales_events
  WHERE user_id = _user_id AND was_first_sale AND listing_type <> 'type_infinite'
    AND days_to_first_sale IS NOT NULL;

  SELECT AVG(e.days_to_first_sale) INTO _avg_opt
  FROM public.listing_sales_events e
  JOIN public.listings l ON l.id = e.listing_id
  WHERE e.user_id = _user_id AND e.was_first_sale AND e.listing_type <> 'type_infinite'
    AND e.days_to_first_sale IS NOT NULL AND COALESCE(l.optimization_count,0) > 0;

  SELECT AVG(e.days_to_first_sale) INTO _avg_not
  FROM public.listing_sales_events e
  JOIN public.listings l ON l.id = e.listing_id
  WHERE e.user_id = _user_id AND e.was_first_sale AND e.listing_type <> 'type_infinite'
    AND e.days_to_first_sale IS NOT NULL AND COALESCE(l.optimization_count,0) = 0;

  SELECT COUNT(*) INTO _active FROM public.listings WHERE user_id = _user_id AND state = 'active';

  SELECT COUNT(DISTINCT listing_id) INTO _sold90
  FROM public.listing_sales_events
  WHERE user_id = _user_id AND sold_on >= CURRENT_DATE - 90;

  SELECT COUNT(DISTINCT listing_id) INTO _sold_prior
  FROM public.listing_sales_events
  WHERE user_id = _user_id AND sold_on >= CURRENT_DATE - 180 AND sold_on < CURRENT_DATE - 90;

  _st := CASE WHEN _active > 0 THEN ROUND(100.0 * _sold90 / _active, 1) END;
  _st_prior := CASE WHEN _active > 0 THEN ROUND(100.0 * _sold_prior / _active, 1) END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('month', m, 'avg_days', a) ORDER BY m), '[]'::jsonb)
  INTO _trend
  FROM (
    SELECT to_char(date_trunc('month', sold_on), 'YYYY-MM') AS m,
           ROUND(AVG(days_to_first_sale)::numeric, 1) AS a
    FROM public.listing_sales_events
    WHERE user_id = _user_id AND was_first_sale AND listing_type <> 'type_infinite'
      AND days_to_first_sale IS NOT NULL
      AND sold_on >= (CURRENT_DATE - INTERVAL '6 months')
    GROUP BY 1
  ) t;

  SELECT COUNT(DISTINCT listing_id) INTO _infcount
  FROM public.listing_sales_events WHERE user_id = _user_id AND listing_type = 'type_infinite';

  SELECT CASE WHEN _infcount > 0 THEN ROUND(SUM(units)::numeric / _infcount, 1) END
  INTO _infrate
  FROM public.listing_sales_events
  WHERE user_id = _user_id AND listing_type = 'type_infinite'
    AND sold_on >= CURRENT_DATE - 30;

  IF _sample >= 8 THEN
    WITH base AS (
      SELECT e.listing_id, e.days_to_first_sale, l.tags, l.photo_count, l.price, l.materials, l.title, l.description,
             NTILE(3) OVER (ORDER BY e.days_to_first_sale) AS bucket
      FROM public.listing_sales_events e
      JOIN public.listings l ON l.id = e.listing_id
      WHERE e.user_id = _user_id AND e.was_first_sale AND e.listing_type <> 'type_infinite'
        AND e.days_to_first_sale IS NOT NULL
    ),
    metrics AS (
      SELECT
        (SELECT AVG(LENGTH(title)) FROM base WHERE bucket=1) AS fast_title,
        (SELECT AVG(LENGTH(title)) FROM base WHERE bucket=3) AS slow_title,
        (SELECT AVG(COALESCE(array_length(tags,1),0)) FROM base WHERE bucket=1) AS fast_tags,
        (SELECT AVG(COALESCE(array_length(tags,1),0)) FROM base WHERE bucket=3) AS slow_tags,
        (SELECT AVG(photo_count) FROM base WHERE bucket=1) AS fast_photos,
        (SELECT AVG(photo_count) FROM base WHERE bucket=3) AS slow_photos,
        (SELECT AVG(price) FROM base WHERE bucket=1) AS fast_price,
        (SELECT AVG(price) FROM base WHERE bucket=3) AS slow_price,
        (SELECT AVG(LENGTH(description)) FROM base WHERE bucket=1) AS fast_desc,
        (SELECT AVG(LENGTH(description)) FROM base WHERE bucket=3) AS slow_desc,
        (SELECT AVG(CASE WHEN COALESCE(array_length(materials,1),0) > 0 THEN 1.0 ELSE 0.0 END) FROM base WHERE bucket=1) AS fast_mat,
        (SELECT AVG(CASE WHEN COALESCE(array_length(materials,1),0) > 0 THEN 1.0 ELSE 0.0 END) FROM base WHERE bucket=3) AS slow_mat,
        (SELECT AVG(days_to_first_sale) FROM base WHERE bucket=1) AS fast_days,
        (SELECT AVG(days_to_first_sale) FROM base WHERE bucket=3) AS slow_days,
        (SELECT COUNT(*) FROM base) AS n
    )
    SELECT jsonb_build_array(
      jsonb_build_object('trait','title_length','threshold',80,
        'fast_avg', ROUND(COALESCE(m.fast_title,0),1), 'slow_avg', ROUND(COALESCE(m.slow_title,0),1),
        'multiplier', CASE WHEN m.slow_title>0 THEN ROUND((m.fast_title/m.slow_title)::numeric,2) END,
        'sample_size', m.n),
      jsonb_build_object('trait','tags_count','threshold',13,
        'fast_avg', ROUND(COALESCE(m.fast_tags,0),1), 'slow_avg', ROUND(COALESCE(m.slow_tags,0),1),
        'multiplier', CASE WHEN m.slow_tags>0 THEN ROUND((m.fast_tags/m.slow_tags)::numeric,2) END,
        'sample_size', m.n),
      jsonb_build_object('trait','photo_count','threshold',10,
        'fast_avg', ROUND(COALESCE(m.fast_photos,0),1), 'slow_avg', ROUND(COALESCE(m.slow_photos,0),1),
        'multiplier', CASE WHEN m.slow_photos>0 THEN ROUND((m.fast_photos/m.slow_photos)::numeric,2) END,
        'sample_size', m.n),
      jsonb_build_object('trait','price',
        'fast_avg', ROUND(COALESCE(m.fast_price,0),2), 'slow_avg', ROUND(COALESCE(m.slow_price,0),2),
        'threshold', ROUND(COALESCE(m.fast_price,0),2),
        'multiplier', CASE WHEN m.fast_price>0 AND m.slow_price>0 THEN ROUND((m.slow_price/m.fast_price)::numeric,2) END,
        'sample_size', m.n),
      jsonb_build_object('trait','description_length','threshold',500,
        'fast_avg', ROUND(COALESCE(m.fast_desc,0),1), 'slow_avg', ROUND(COALESCE(m.slow_desc,0),1),
        'multiplier', CASE WHEN m.slow_desc>0 THEN ROUND((m.fast_desc/m.slow_desc)::numeric,2) END,
        'sample_size', m.n),
      jsonb_build_object('trait','has_materials','threshold',1,
        'fast_avg', ROUND(COALESCE(m.fast_mat,0),2), 'slow_avg', ROUND(COALESCE(m.slow_mat,0),2),
        'multiplier', CASE WHEN m.slow_mat>0 THEN ROUND((m.fast_mat/m.slow_mat)::numeric,2) END,
        'sample_size', m.n),
      jsonb_build_object('trait','speed_ratio',
        'fast_days', ROUND(COALESCE(m.fast_days,0),1), 'slow_days', ROUND(COALESCE(m.slow_days,0),1))
    )
    INTO _traits
    FROM metrics m;
  END IF;

  INSERT INTO public.store_velocity_stats (
    user_id, avg_days_to_sell, avg_days_optimized, avg_days_not_optimized,
    p20_days_to_sell, monthly_trend, active_count, sold_last_90d, sold_prior_90d,
    sell_through_90d, sell_through_prior_90d, fast_seller_traits,
    infinite_count, infinite_sales_per_month, sample_size, computed_at, updated_at
  ) VALUES (
    _user_id, _avg, _avg_opt, _avg_not, _p20, _trend, _active, _sold90, _sold_prior,
    _st, _st_prior, _traits, _infcount, _infrate, _sample, now(), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    avg_days_to_sell = EXCLUDED.avg_days_to_sell,
    avg_days_optimized = EXCLUDED.avg_days_optimized,
    avg_days_not_optimized = EXCLUDED.avg_days_not_optimized,
    p20_days_to_sell = EXCLUDED.p20_days_to_sell,
    monthly_trend = EXCLUDED.monthly_trend,
    active_count = EXCLUDED.active_count,
    sold_last_90d = EXCLUDED.sold_last_90d,
    sold_prior_90d = EXCLUDED.sold_prior_90d,
    sell_through_90d = EXCLUDED.sell_through_90d,
    sell_through_prior_90d = EXCLUDED.sell_through_prior_90d,
    fast_seller_traits = EXCLUDED.fast_seller_traits,
    infinite_count = EXCLUDED.infinite_count,
    infinite_sales_per_month = EXCLUDED.infinite_sales_per_month,
    sample_size = EXCLUDED.sample_size,
    computed_at = EXCLUDED.computed_at,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_store_velocity(uuid) TO authenticated, service_role;
