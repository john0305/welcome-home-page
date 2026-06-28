
ALTER TABLE public.listing_sales_events
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'snapshot',
  ADD COLUMN IF NOT EXISTS etsy_receipt_id text,
  ADD COLUMN IF NOT EXISTS etsy_transaction_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lse_receipt_txn
  ON public.listing_sales_events (user_id, etsy_transaction_id)
  WHERE etsy_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.refresh_store_velocity(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Only wipe snapshot-inferred rows; preserve receipt-sourced sales which
  -- are authoritative (come from real Etsy orders, not stock-diff guessing).
  DELETE FROM public.listing_sales_events
   WHERE user_id = _user_id AND source = 'snapshot';

  INSERT INTO public.listing_sales_events
    (listing_id, user_id, sold_on, units, was_first_sale, days_to_first_sale, listing_type, source)
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
    END,
    'snapshot'
  FROM enriched e
  -- Don't re-insert snapshot rows for listings that already have receipt data
  -- on the same day (receipts win).
  WHERE NOT EXISTS (
    SELECT 1 FROM public.listing_sales_events r
    WHERE r.user_id = _user_id
      AND r.listing_id = e.listing_id
      AND r.sold_on = e.sold_on
      AND r.source = 'receipt'
  );

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
$function$;
