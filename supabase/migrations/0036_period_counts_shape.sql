-- 0036_period_counts_shape.sql
-- Gather the viewport's dated records once, then ask the periods about them.
--
-- 0031 wrote period_counts_for_viewport as a left join from the 21 periods
-- straight onto temporal_associations, with the viewport expressed as an
-- `entity_id in (select ...)` inside the join condition. That shape leaves the
-- planner free to probe temporal_associations once per period per visible
-- place, and once 0035 added an approved-only index on (entity_id,
-- entity_type) it did exactly that: the urban period-count query went from 6ms
-- to 349ms and took the regional latency gate with it.
--
-- The index is not the problem — a query that only performs when a particular
-- index is absent was already waiting to fail. The shape is the problem, so
-- the shape changes: collect the viewport's approved temporal associations
-- into one materialised set first. Dated coverage is a small share of the
-- corpus, so that set is small, and the 21-way join against it is trivial
-- whatever the planner decides.
--
-- The counts themselves are unchanged; supabase/tests/coverage_and_time.test.sql
-- pins them.
create or replace function public.period_counts_for_viewport(
  bbox_sw_lng double precision,
  bbox_sw_lat double precision,
  bbox_ne_lng double precision,
  bbox_ne_lat double precision,
  place_types text[] default null,
  q text default null
)
returns table (
  period_id text,
  display_name text,
  display_order integer,
  place_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with visible as materialized (
    select p.id
      from public.places p
     where p.status = 'approved'
       and p.location operator(extensions.&&) extensions.st_makeenvelope(
             bbox_sw_lng, bbox_sw_lat, bbox_ne_lng, bbox_ne_lat, 4326)::extensions.geography
       and (place_types is null or p.place_type::text = any(place_types))
       and (q is null or q = '' or p.search_vector @@ websearch_to_tsquery('english', q))
  ),
  -- Every approved temporal claim in view, once. Distinct because two sources
  -- agreeing about the same place and period must not count that place twice.
  dated as materialized (
    select distinct ta.entity_id, ta.period_id, ta.start_year, ta.end_year
      from public.temporal_associations ta
      join visible v on v.id = ta.entity_id
     where ta.status = 'approved'
       and ta.entity_type = 'place'
  )
  select hp.id, hp.display_name, hp.display_order,
         count(distinct d.entity_id) as place_count
    from public.historical_periods hp
    left join dated d
      on d.period_id = hp.id
      or (d.start_year is not null and d.end_year is not null
          and d.start_year <= hp.end_year and d.end_year >= hp.start_year)
   group by hp.id, hp.display_name, hp.display_order
   order by hp.display_order;
$$;

comment on function public.period_counts_for_viewport is
  'Records Whilom currently associates with each period in this view. NOT a count of what existed then — dated coverage is a small share of the corpus.';
