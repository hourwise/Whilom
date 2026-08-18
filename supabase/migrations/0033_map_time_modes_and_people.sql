-- 0033_map_time_modes_and_people.sql
-- WHERE + WHEN + WHO in one query.
--
-- Adds two things to the map surface:
--
--   * time modes — "at", "until", "from" — around a single selected year,
--     alongside the existing period and explicit-range filters;
--   * a person filter, so the map can answer "show me this person's places".
--
-- The semantics of the modes are worth stating plainly, because they are the
-- difference between a slider and a historical instrument:
--
--   all      no temporal restriction
--   at       associations overlapping the selected year
--   until    associations that had begun by the selected year
--   from     associations still running at or after the selected year
--
-- An association with no start or end year matches none of them. That is
-- deliberate: a relationship with no temporal evidence must not acquire
-- relevance to a year the user happened to pick.

-- ---------------------------------------------------------------------------
-- Does a place match the selected time?
-- ---------------------------------------------------------------------------
create or replace function public.place_matches_time(
  p_place_id uuid,
  p_mode text,
  p_year integer,
  p_period_id text default null,
  p_from_year integer default null,
  p_to_year integer default null
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    -- No temporal restriction of any kind.
    when coalesce(p_mode, 'all') = 'all'
         and p_period_id is null and p_from_year is null and p_to_year is null
      then true
    else exists (
      select 1
        from public.temporal_associations ta
        left join public.historical_periods hp on hp.id = p_period_id
       where ta.entity_type = 'place'
         and ta.entity_id = p_place_id
         and ta.status = 'approved'
         and (
           p_period_id is null
           or ta.period_id = p_period_id
           or (ta.start_year is not null and ta.end_year is not null
               and ta.start_year <= hp.end_year and ta.end_year >= hp.start_year)
         )
         and (
           coalesce(p_mode, 'all') = 'all' or p_year is null
           or (ta.start_year is not null and ta.end_year is not null and case p_mode
                 when 'at'    then ta.start_year <= p_year and ta.end_year >= p_year
                 when 'until' then ta.start_year <= p_year
                 when 'from'  then ta.end_year   >= p_year
                 else true
               end)
         )
         and (
           (p_from_year is null and p_to_year is null)
           or (ta.start_year is not null and ta.end_year is not null
               and (p_to_year is null or ta.start_year <= p_to_year)
               and (p_from_year is null or ta.end_year >= p_from_year))
         )
    )
  end;
$$;

comment on function public.place_matches_time is
  'Whether a place has a temporal claim satisfying the selected period, mode/year and range. A claim with no years matches no restriction — an undated relationship must not acquire relevance to a year somebody picked.';

grant execute on function public.place_matches_time(uuid, text, integer, text, integer, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- map_places, with time modes, people and display categories
-- ---------------------------------------------------------------------------
drop function if exists public.map_places(
  double precision, double precision, double precision, double precision,
  text[], integer, text, integer, integer, text, text[], boolean);

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
      and (categories is null or public.place_display_category(p.place_type)::text = any(categories))
      and (q is null or q = '' or p.search_vector @@ websearch_to_tsquery('english', q))
      and (designations is null or exists (
        select 1 from public.place_designations d
         where d.place_id = p.id and d.designation::text = any(designations)))
      and (not require_image or public.map_thumbnail_for(p.id) is not null)
      and public.place_matches_time(p.id, time_mode, selected_year, period_id, from_year, to_year)
      and (person_id is null or exists (
        select 1 from public.person_places(person_id, 500) pp where pp.place_id = p.id))
    order by p.content_level desc, p.name
    limit capped;
end;
$$;

comment on function public.map_places is
  'Bounded discovery projection: WHERE (bbox) + WHEN (period, mode/year, range) + WHO (person) + WHAT (types, categories). Geography mandatory, viewport size-limited, rows capped server-side.';

-- ---------------------------------------------------------------------------
-- map_clusters, same filters
-- ---------------------------------------------------------------------------
drop function if exists public.map_clusters(
  double precision, double precision, double precision, double precision,
  double precision, text[], text, integer, integer, text, text[], boolean, integer);

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

  return query
    with matched as (
      select
        p.id, p.name,
        public.place_display_category(p.place_type)::text as category,
        extensions.st_x(p.location::extensions.geometry) as x,
        extensions.st_y(p.location::extensions.geometry) as y
      from public.places p
      where p.status = 'approved'
        and p.location operator(extensions.&&) envelope
        and (place_types is null or p.place_type::text = any(place_types))
        and (categories is null or public.place_display_category(p.place_type)::text = any(categories))
        and (q is null or q = '' or p.search_vector @@ websearch_to_tsquery('english', q))
        and (designations is null or exists (
          select 1 from public.place_designations d
           where d.place_id = p.id and d.designation::text = any(designations)))
        and (not require_image or public.map_thumbnail_for(p.id) is not null)
        and public.place_matches_time(p.id, time_mode, selected_year, period_id, from_year, to_year)
        and (person_id is null or exists (
          select 1 from public.person_places(person_id, 500) pp where pp.place_id = p.id))
    ),
    binned as (
      select floor(x / cell)::bigint as gx, floor(y / cell)::bigint as gy, id, name, category, x, y
      from matched
    ),
    counted as (
      select gx, gy, count(*) as n, avg(x) as lng, avg(y) as lat,
             (array_agg(id order by name))[1] as sample_id,
             (array_agg(name order by name))[1] as sample_name,
             count(distinct category)::integer as categories_present,
             (array_agg(category order by category))[1] as any_category,
             mode() within group (order by category) as dominant
        from binned group by gx, gy
    )
    select
      c.gx || ':' || c.gy, c.n, c.lng, c.lat, c.sample_id, c.sample_name,
      -- Only claimed when the cell really is one category. A mixed cluster
      -- reporting its most common member would imply the rest match it.
      case when c.categories_present = 1 then c.any_category else null end,
      c.categories_present
    from counted c
    order by c.n desc
    limit capped_cells;
end;
$$;

comment on function public.map_clusters is
  'Server-side density aggregation with the same WHERE/WHEN/WHO/WHAT filters, applied before aggregation so a count always describes what was asked. Reports a category only for single-category cells.';

revoke all on function public.map_places(
  double precision, double precision, double precision, double precision,
  text[], integer, text, integer, integer, text, text[], boolean, text, integer, uuid, text[]) from public;
revoke all on function public.map_clusters(
  double precision, double precision, double precision, double precision,
  double precision, text[], text, integer, integer, text, text[], boolean, integer, text, integer, uuid, text[]) from public;

grant execute on function public.map_places(
  double precision, double precision, double precision, double precision,
  text[], integer, text, integer, integer, text, text[], boolean, text, integer, uuid, text[]) to anon, authenticated;
grant execute on function public.map_clusters(
  double precision, double precision, double precision, double precision,
  double precision, text[], text, integer, integer, text, text[], boolean, integer, text, integer, uuid, text[]) to anon, authenticated;
