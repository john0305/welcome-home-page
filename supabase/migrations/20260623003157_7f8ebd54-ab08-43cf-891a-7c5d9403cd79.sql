with ranked as (
  select
    listing_id,
    recorded_on,
    last_modified_tsz,
    changed_fields,
    lag(last_modified_tsz) over (partition by listing_id order by recorded_on) as prev_lmt
  from public.listing_snapshots
)
update public.listing_snapshots s
set changed_fields = '{}'::text[]
from ranked r
where s.listing_id = r.listing_id
  and s.recorded_on = r.recorded_on
  and r.changed_fields = ARRAY['last_modified_tsz']::text[]
  and r.prev_lmt is not null
  and r.last_modified_tsz is not null
  and r.prev_lmt = r.last_modified_tsz;

delete from public.listing_traction_events e
where e.event_type = 'external_edit'
  and e.previous_value is not null
  and e.new_value is not null
  and e.previous_value::timestamptz = e.new_value::timestamptz;