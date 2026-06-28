
CREATE TABLE public.listing_renewal_snapshots (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etsy_listing_id         TEXT NOT NULL,
  etsy_shop_id            TEXT NOT NULL,
  snapshot_date           DATE NOT NULL,
  state                   TEXT NOT NULL,
  quantity                INT NOT NULL DEFAULT 0,
  price                   NUMERIC(10,2) NOT NULL DEFAULT 0,
  ending_timestamp        BIGINT NOT NULL DEFAULT 0,
  last_modified_timestamp BIGINT NOT NULL DEFAULT 0,
  is_digital              BOOLEAN NOT NULL DEFAULT FALSE,
  shop_on_vacation        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (etsy_listing_id, snapshot_date)
);
CREATE INDEX idx_renewal_snaps_listing_date ON public.listing_renewal_snapshots (etsy_listing_id, snapshot_date DESC);
CREATE INDEX idx_renewal_snaps_shop_date    ON public.listing_renewal_snapshots (etsy_shop_id, snapshot_date DESC);

GRANT SELECT ON public.listing_renewal_snapshots TO authenticated;
GRANT ALL    ON public.listing_renewal_snapshots TO service_role;
ALTER TABLE public.listing_renewal_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their shop renewal snapshots"
  ON public.listing_renewal_snapshots FOR SELECT TO authenticated
  USING (etsy_shop_id IN (SELECT s.etsy_shop_id FROM public.stores s WHERE s.user_id = auth.uid()));

CREATE TABLE public.listing_renewal_events (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etsy_listing_id             TEXT NOT NULL,
  etsy_shop_id                TEXT NOT NULL,
  detected_at                 DATE NOT NULL,
  previous_ending_timestamp   BIGINT NOT NULL,
  new_ending_timestamp        BIGINT NOT NULL,
  days_extended               INT GENERATED ALWAYS AS (
    ((new_ending_timestamp - previous_ending_timestamp) / 86400)::INT
  ) STORED,
  renewal_type                TEXT NOT NULL CHECK (renewal_type IN ('auto','manual','relist','unknown')),
  state_at_renewal            TEXT NOT NULL,
  shop_on_vacation_at_renewal BOOLEAN NOT NULL DEFAULT FALSE,
  quantity_at_renewal         INT NOT NULL DEFAULT 0,
  price_at_renewal            NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_unique_item              BOOLEAN GENERATED ALWAYS AS (quantity_at_renewal = 1) STORED,
  renewal_fee_usd             NUMERIC(6,4) NOT NULL DEFAULT 0.20,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_renewal_events_listing ON public.listing_renewal_events (etsy_listing_id, detected_at DESC);
CREATE INDEX idx_renewal_events_shop    ON public.listing_renewal_events (etsy_shop_id, detected_at DESC);
CREATE INDEX idx_renewal_events_unique  ON public.listing_renewal_events (etsy_shop_id, is_unique_item);

GRANT SELECT ON public.listing_renewal_events TO authenticated;
GRANT ALL    ON public.listing_renewal_events TO service_role;
ALTER TABLE public.listing_renewal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their shop renewal events"
  ON public.listing_renewal_events FOR SELECT TO authenticated
  USING (etsy_shop_id IN (SELECT s.etsy_shop_id FROM public.stores s WHERE s.user_id = auth.uid()));

CREATE TABLE public.listing_renewal_summary (
  etsy_listing_id          TEXT PRIMARY KEY,
  etsy_shop_id             TEXT NOT NULL,
  first_seen_date          DATE,
  last_renewal_date        DATE,
  total_renewals           INT NOT NULL DEFAULT 0,
  auto_renewals            INT NOT NULL DEFAULT 0,
  manual_renewals          INT NOT NULL DEFAULT 0,
  relist_renewals          INT NOT NULL DEFAULT 0,
  total_renewal_cost_usd   NUMERIC(8,2) NOT NULL DEFAULT 0,
  is_unique_item           BOOLEAN NOT NULL DEFAULT FALSE,
  current_quantity         INT,
  current_price            NUMERIC(10,2),
  current_state            TEXT,
  days_since_creation      INT,
  vacation_adjusted_days   INT,
  estimated_stale_score    INT NOT NULL DEFAULT 0,
  data_confidence          TEXT NOT NULL DEFAULT 'inferred'
                           CHECK (data_confidence IN ('inferred','partial','observed')),
  last_updated             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_renewal_summary_shop ON public.listing_renewal_summary (etsy_shop_id);
CREATE INDEX idx_renewal_summary_stale ON public.listing_renewal_summary (etsy_shop_id, estimated_stale_score DESC);

GRANT SELECT ON public.listing_renewal_summary TO authenticated;
GRANT ALL    ON public.listing_renewal_summary TO service_role;
ALTER TABLE public.listing_renewal_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their shop renewal summary"
  ON public.listing_renewal_summary FOR SELECT TO authenticated
  USING (etsy_shop_id IN (SELECT s.etsy_shop_id FROM public.stores s WHERE s.user_id = auth.uid()));

CREATE TABLE public.shop_vacation_periods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etsy_shop_id TEXT NOT NULL,
  started_on   DATE NOT NULL,
  ended_on     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vacation_periods_shop ON public.shop_vacation_periods (etsy_shop_id, started_on DESC);
CREATE UNIQUE INDEX uniq_one_open_vacation_per_shop
  ON public.shop_vacation_periods (etsy_shop_id) WHERE ended_on IS NULL;

GRANT SELECT ON public.shop_vacation_periods TO authenticated;
GRANT ALL    ON public.shop_vacation_periods TO service_role;
ALTER TABLE public.shop_vacation_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their shop vacation periods"
  ON public.shop_vacation_periods FOR SELECT TO authenticated
  USING (etsy_shop_id IN (SELECT s.etsy_shop_id FROM public.stores s WHERE s.user_id = auth.uid()));
