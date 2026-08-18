-- 0035_map_filter_hoisting.sql
-- Stop paying for filters nobody asked for.
--
-- 0033 added time modes and a person filter as row predicates, and the regional
-- bench caught what that cost: the whole-region cluster query went from 77ms to
-- 1,022ms, a thirteenfold regression against a 300ms gate.
--
-- Two separate mistakes, both the same shape — work proportional to the corpus
-- for a question the caller did not ask:
--
--   1. `place_matches_time` was invoked for all 23,151 rows even under "All
--      time", where it can only ever return true. The function short-circuits
--      internally, but a function call per row is still 23,151 function calls.
--
--   2. `person_places(person_id, 500)` sat inside an EXISTS in the row filter,
--      so a set-returning function that walks the relationship graph was
--      re-executed once per candidate row.
--
-- A third, smaller version of the same thing: `place_display_category` was
-- called per row both to filter by category and to work out how mixed a cluster
-- is. The taxonomy is a fixed enum of a few dozen values, so both uses can be
-- answered from the types alone — a category filter becomes a list of place
-- types resolved once, and cluster mixedness is computed from each cell's
-- distinct types rather than from each of its rows.
--
-- All of it is hoisted out of the per-row path. None of it changes an answer;
-- the time-mode and person assertions in supabase/tests are unchanged and
-- still pass.

-- ---------------------------------------------------------------------------
-- map_places
-- ---------------------------------------------------------------------------
create or replace function public.map_places(
  bbox_sw_lng double precision,
  bbox_sw_lat double precision,
  bbox_ne_lng double precision,
  bbox_ne_lat double precision,
  place_types text[] default null,
  max_rows integer default 250,
  period_id text default null,
  from_year integer default null,
  to_year integer default null,
  q text default null,
  designations text[] default null,
  require_image boolean default false,
  time_mode text default 'all',
  selected_year integer default null,
  person_id uuid default null,
  categories text[] default null
)
returns table (
  id uuid,
  slug text,
  name text,
  place_type text,
  display_category text,
  lng double precision,
  lat double precision,
  location_accuracy_m numeric,
  primary_designation text,
  thumbnail_url text,
  survival_status text,
  period_summary text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  max_span_lng constant double precision := 2.5;
  max_span_lat constant double precision := 1.5;
  capped integer := least(greatest(coalesce(max_rows, 250), 1), 500);
  envelope extensions.geography;
  -- Computed once from parameters alone. Under "All time" with no period and no
  -- range there is nothing to test, so the function is never called.
  unrestricted_time boolean := (
    coalesce(time_mode, 'all') = 'all'
    and period_id is null and from_year is null and to_year is null
  );
  -- The person's places, resolved once rather than per row.
  person_place_ids uuid[];
  -- A category filter expressed as the place types it selects. Resolved once
  -- against the enum instead of deriving a category for every candidate row.
  type_filter text[];
begin
  if bbox_sw_lng is null or bbox_sw_lat is null or bbox_ne_lng is null or bbox_ne_lat is null then
    raise exception 'map_places requires a bounding box; there is no unbounded form'
      using errcode = 'invalid_parameter_value';
  end if;
  if bbox_ne_lng <= bbox_sw_lng or bbox_ne_lat <= bbox_sw_lat then
    raise exception 'map_places bounding box is empty or inverted'
      using errcode = 'invalid_parameter_value';
  end if;
  if (bbox_ne_lng - bbox_sw_lng) > max_span_lng or (bbox_ne_lat - bbox_sw_lat) > max_span_lat then
    raise exception 'map_places bounding box is too large (max % x % degrees); zoom in or use clusters',
      max_span_lng, max_span_lat using errcode = 'invalid_parameter_value';
  end if;

  envelope := extensions.st_makeenvelope(bbox_sw_lng, bbox_sw_lat, bbox_ne_lng, bbox_ne_lat, 4326)::extensions.geography;

  if person_id is not null then
    select array_agg(pp.place_id) into person_place_ids
      from public.person_places(person_id, 500) pp;
    -- A person with no published places matches nothing, and an empty array
    -- says so without a special case further down.
    person_place_ids := coalesce(person_place_ids, '{}'::uuid[]);
  end if;

  if categories is not null then
    select coalesce(array_agg(t::text), '{}')
      into type_filter
      from unnest(enum_range(null::public.place_type)) t
     where public.place_display_category(t)::text = any(categories);
  end if;

  return query
    select
      p.id, p.slug, p.name, p.place_type::text,
      public.place_display_category(p.place_type)::text,
      extensions.st_x(p.location::extensions.geometry),
      extensions.st_y(p.location::extensions.geometry),
      p.location_accuracy_m,
      (select d.designation::text from public.place_designations d
        where d.place_id = p.id order by d.designation limit 1),
      public.map_thumbnail_for(p.id),
      p.survival_status::text,
      (select string_agg(distinct coalesce(hp.display_name, ta.association_type::text), ', ')
         from public.temporal_associations ta
         left join public.historical_periods hp on hp.id = ta.period_id
        where ta.entity_type = 'place' and ta.entity_id = p.id and ta.status = 'approved')
    from public.places p
    where p.status = 'approved'
      and p.location operator(extensions.&&) envelope
      and (place_types is null or p.place_type::text = any(place_types))
      and (type_filter is null or p.place_type::text = any(type_filter))
      and (q is null or q = '' or p.search_vector @@ websearch_to_tsquery('english', q))
      and (designations is null or exists (
        select 1 from public.place_designations d
         where d.place_id = p.id and d.designation::text = any(designations)))
      and (not require_image or public.map_thumbnail_for(p.id) is not null)
      and (unrestricted_time
           or public.place_matches_time(p.id, time_mode, selected_year, period_id, from_year, to_year))
      and (person_id is null or p.id = any(person_place_ids))
    order by p.content_level desc, p.name
    limit capped;
end;
$$;

comment on function public.map_places is
  'Bounded discovery projection: WHERE (bbox) + WHEN (period, mode/year, range) + WHO (person) + WHAT (types, categories). Unrestricted time and person filters are hoisted out of the per-row path.';

-- ---------------------------------------------------------------------------
-- map_clusters
-- ---------------------------------------------------------------------------
create or replace function public.map_clusters(
  bbox_sw_lng double precision,
  bbox_sw_lat double precision,
  bbox_ne_lng double precision,
  bbox_ne_lat double precision,
  cell_degrees double precision default 0.05,
  place_types text[] default null,
  period_id text default null,
  from_year integer default null,
  to_year integer default null,
  q text default null,
  designations text[] default null,
  require_image boolean default false,
  max_cells integer default 400,
  time_mode text default 'all',
  selected_year integer default null,
  person_id uuid default null,
  categories text[] default null
)
returns table (
  cell_key text,
  place_count bigint,
  lng double precision,
  lat double precision,
  sample_place_id uuid,
  sample_name text,
  dominant_category text,
  category_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  cell constant double precision := least(greatest(coalesce(cell_degrees, 0.05), 0.005), 5.0);
  capped_cells integer := least(greatest(coalesce(max_cells, 400), 1), 2000);
  envelope extensions.geography;
  unrestricted_time boolean := (
    coalesce(time_mode, 'all') = 'all'
    and period_id is null and from_year is null and to_year is null
  );
  person_place_ids uuid[];
  type_filter text[];
begin
  if bbox_sw_lng is null or bbox_sw_lat is null or bbox_ne_lng is null or bbox_ne_lat is null then
    raise exception 'map_clusters requires a bounding box'
      using errcode = 'invalid_parameter_value';
  end if;
  if bbox_ne_lng <= bbox_sw_lng or bbox_ne_lat <= bbox_sw_lat then
    raise exception 'map_clusters bounding box is empty or inverted'
      using errcode = 'invalid_parameter_value';
  end if;

  envelope := extensions.st_makeenvelope(bbox_sw_lng, bbox_sw_lat, bbox_ne_lng, bbox_ne_lat, 4326)::extensions.geography;

  if person_id is not null then
    select array_agg(pp.place_id) into person_place_ids
      from public.person_places(person_id, 500) pp;
    person_place_ids := coalesce(person_place_ids, '{}'::uuid[]);
  end if;

  if categories is not null then
    select coalesce(array_agg(t::text), '{}')
      into type_filter
      from unnest(enum_range(null::public.place_type)) t
     where public.place_display_category(t)::text = any(categories);
  end if;

  return query
    with matched as (
      select
        p.id, p.name, p.place_type,
        extensions.st_x(p.location::extensions.geometry) as x,
        extensions.st_y(p.location::extensions.geometry) as y
      from public.places p
      where p.status = 'approved'
        and p.location operator(extensions.&&) envelope
        and (place_types is null or p.place_type::text = any(place_types))
        and (type_filter is null or p.place_type::text = any(type_filter))
        and (q is null or q = '' or p.search_vector @@ websearch_to_tsquery('english', q))
        and (designations is null or exists (
          select 1 from public.place_designations d
           where d.place_id = p.id and d.designation::text = any(designations)))
        and (not require_image or public.map_thumbnail_for(p.id) is not null)
        and (unrestricted_time
             or public.place_matches_time(p.id, time_mode, selected_year, period_id, from_year, to_year))
        and (person_id is null or p.id = any(person_place_ids))
    ),
    binned as (
      select floor(x / cell)::bigint as gx, floor(y / cell)::bigint as gy, id, name, place_type, x, y
      from matched
    ),
    counted as (
      select gx, gy, count(*) as n, avg(x) as lng, avg(y) as lat,
             (array_agg(id order by name))[1] as sample_id,
             (array_agg(name order by name))[1] as sample_name,
             -- The distinct types in the cell, at most a few dozen. Categories
             -- are derived from these rather than from every row.
             array_agg(distinct place_type) as types
        from binned group by gx, gy
    ),
    categorised as (
      select c.*, (
        select array_agg(distinct public.place_display_category(t)::text)
          from unnest(c.types) t
      ) as cats
      from counted c
    )
    select
      c.gx || ':' || c.gy, c.n, c.lng, c.lat, c.sample_id, c.sample_name,
      case when array_length(c.cats, 1) = 1 then c.cats[1] else null end,
      coalesce(array_length(c.cats, 1), 0)
    from categorised c
    order by c.n desc
    limit capped_cells;
end;
$$;

comment on function public.map_clusters is
  'Server-side density aggregation with WHERE/WHEN/WHO/WHAT filters applied before aggregation. Unrestricted time and person filters are hoisted out of the per-row path.';

-- ---------------------------------------------------------------------------
-- Supporting index
-- ---------------------------------------------------------------------------
-- `place_matches_time` looks a place up in temporal_associations by entity and
-- status. The existing entity index does not carry status, so an approved-only
-- lookup still visited rejected rows. Cheap, and the temporal path is the one
-- that remains per-row when a filter genuinely is applied.
create index if not exists temporal_associations_entity_approved_idx
  on public.temporal_associations (entity_id, entity_type)
  where status = 'approved';
