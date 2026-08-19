-- 0039_period_counts_scale.sql
-- Count periods by leading with the small side.
--
-- Batch 11 took the regional corpus from 267 temporal claims to 1,443, and the
-- period-count query went from 78ms to 375ms with it — straight through the
-- 300ms discovery gate. The gate is right and has not moved.
--
-- The first attempt at this blamed the OR in 0036's join condition:
--
--     left join dated d
--       on d.period_id = hp.id
--       or (d.start_year <= hp.end_year and d.end_year >= hp.start_year)
--
-- An OR of an equality and a range can be neither hashed nor merged, so
-- splitting it into two joinable branches is a genuine improvement to the
-- shape. It made almost no difference to the time: 375ms became 372ms. The
-- measurement said the diagnosis was wrong, so the diagnosis changed.
--
-- The actual cause is that 0036 materialised the set of visible place ids and
-- joined the claims to it. **A materialised CTE carries no index.** That join
-- is therefore a nested loop scanning every visible place for every claim —
-- roughly two million comparisons at 267 claims against an 8,000-place
-- viewport, and eleven million at 1,443. Growth is exactly linear in the number
-- of claims, which is why the batch that added temporal depth was always going
-- to break this gate, and why the OR was never going to be the fix.
--
-- So the query now leads with the small side. Every approved temporal claim is
-- a few thousand rows; each resolves to its place by primary key and is then
-- tested against the viewport through the spatial index. The work is
-- proportional to how much Whilom knows about time rather than to how crowded
-- the map is — which is also the right way round as the corpus grows.
--
-- The OR is still split, because it is still the better shape.
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
  -- The envelope, built once.
  --
  -- Inlined into a join predicate it is rebuilt per row, and a geography cast
  -- is not free at twenty-three thousand rows. A single-row materialised CTE
  -- pins it to one evaluation.
  with params as materialized (
    select extensions.st_makeenvelope(
      bbox_sw_lng, bbox_sw_lat, bbox_ne_lng, bbox_ne_lat, 4326)::extensions.geography as env
  ),
  -- Lead with the claims and test each against the viewport by primary key.
  --
  -- EXISTS rather than a join: it asks for one index probe per claim, which is
  -- what the shape should cost. A join lets the planner choose to scan places
  -- and hash, and at 23,151 rows that is the slow direction.
  dated as materialized (
    select distinct ta.entity_id, ta.period_id, ta.start_year, ta.end_year
      from public.temporal_associations ta
     where ta.status = 'approved'
       and ta.entity_type = 'place'
       and exists (
         select 1
           from public.places p, params
          where p.id = ta.entity_id
            and p.status = 'approved'
            and p.location operator(extensions.&&) params.env
            and (place_types is null or p.place_type::text = any(place_types))
            and (q is null or q = '' or p.search_vector @@ websearch_to_tsquery('english', q))
       )
  ),
  by_named as (
    select d.period_id, d.entity_id from dated d where d.period_id is not null
  ),
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
