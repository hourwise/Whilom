-- 0039_period_counts_scale.sql
-- Count periods without a 21-way OR.
--
-- Batch 11 took the regional corpus from 267 temporal claims to 1,443, and the
-- period-count query went from 78ms to 375ms with it — straight through the
-- 300ms discovery gate. The gate is right and stays where it is.
--
-- The cost is the join condition 0036 left in place:
--
--     left join dated d
--       on d.period_id = hp.id
--       or (d.start_year <= hp.end_year and d.end_year >= hp.start_year)
--
-- An OR of an equality and a range cannot be hashed or merged, so the planner
-- has no choice but a nested loop over all 21 periods for every claim in view.
-- That was affordable at 267 claims and is not at 1,443, and it would be five
-- times worse again at national scale.
--
-- Splitting the OR into two branches that are each joinable, then unioning
-- them, removes the loop: the named-period branch is a plain equality, and the
-- span branch is a range join against a 21-row table. The result is identical —
-- a claim still counts towards a period if it names it OR overlaps it — and
-- the union deduplicates the claims that do both, which is what the previous
-- `count(distinct)` was quietly relying on.
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
  ),
  -- A claim that names its period. A plain equality, so this is a hash join.
  by_named as (
    select d.period_id, d.entity_id
      from dated d
     where d.period_id is not null
  ),
  -- A claim that has years and overlaps a period without naming it. Still a
  -- range join, but against 21 rows rather than inside a per-period loop.
  by_span as (
    select hp.id as period_id, d.entity_id
      from dated d
      join public.historical_periods hp
        on d.start_year is not null
       and d.end_year is not null
       and d.start_year <= hp.end_year
       and d.end_year >= hp.start_year
  ),
  matched as (
    select period_id, entity_id from by_named
    union
    select period_id, entity_id from by_span
  )
  select hp.id, hp.display_name, hp.display_order,
         count(m.entity_id)::bigint as place_count
    from public.historical_periods hp
    left join matched m on m.period_id = hp.id
   group by hp.id, hp.display_name, hp.display_order
   order by hp.display_order;
$$;

comment on function public.period_counts_for_viewport is
  'Records Whilom currently associates with each period in this view. NOT a count of what existed then — dated coverage is a small share of the corpus.';
