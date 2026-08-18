-- 0030_map_discovery_v2.sql
-- The public discovery surface: density-aware, time-aware, and bounded.
--
-- 0028 established that a map query must be bounded. This adds the two things a
-- real regional map needs on top of that:
--
--   * clustering, so a view of the whole of Yorkshire returns a few hundred
--     aggregates instead of 23,171 points;
--   * temporal filtering, so "Roman" and "Victorian" mean something.
--
-- Both are SECURITY INVOKER. RLS on `places` already decides what the public may
-- see, and routing the map around it via SECURITY DEFINER would mean maintaining
-- a second, weaker copy of that judgement.

-- ---------------------------------------------------------------------------
-- Which places match a period
-- ---------------------------------------------------------------------------
-- Overlap, not containment: a building begun in 1450 and lost in 1600 is
-- relevant to the Tudor period even though it fits inside neither end. A claim
-- carrying only a period id matches that period directly, because the registry
-- is exactly where such a claim's years would have come from.
create or replace function public.place_matches_period(
  p_place_id uuid,
  p_period_id text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from public.temporal_associations ta
      join public.historical_periods hp on hp.id = p_period_id
     where ta.entity_type = 'place'
       and ta.entity_id = p_place_id
       and ta.status = 'approved'
       and (
         ta.period_id = p_period_id
         or (
           ta.start_year is not null and ta.end_year is not null
           and ta.start_year <= hp.end_year
           and ta.end_year   >= hp.start_year
         )
       )
  );
$$;

comment on function public.place_matches_period(uuid, text) is
  'Whether a place has a temporal claim overlapping a navigation period. Overlap rather than containment, because a place that spanned a period belongs to it.';

-- ---------------------------------------------------------------------------
-- Retire the 0028 signature FIRST
-- ---------------------------------------------------------------------------
-- The filterable version below takes different arguments, so `create or
-- replace` adds an overload rather than replacing anything. While both exist,
-- `comment on function public.map_places` cannot resolve which one is meant and
-- the migration fails — so the old one goes before the new one arrives, not
-- after.
drop function if exists public.map_places(
  double precision, double precision, double precision, double precision, text[], integer);

-- ---------------------------------------------------------------------------
-- map_places: individual markers, now filterable by time
-- ---------------------------------------------------------------------------
-- Replaces the 0028 signature. The viewport, size cap and row cap are unchanged
-- and remain the point: there is still no unbounded form.
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
  require_image boolean default false
)
returns table (
  id uuid,
  slug text,
  name text,
  place_type text,
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
      extensions.st_x(p.location::extensions.geometry),
      extensions.st_y(p.location::extensions.geometry),
      p.location_accuracy_m,
      (select d.designation::text from public.place_designations d
        where d.place_id = p.id order by d.designation limit 1),
      public.map_thumbnail_for(p.id),
      p.survival_status::text,
      -- A short, honest summary of why this place is relevant to a time. NULL
      -- when Whilom holds no temporal claim, which is most of the corpus.
      (select string_agg(distinct coalesce(hp.display_name, ta.association_type::text), ', ')
         from public.temporal_associations ta
         left join public.historical_periods hp on hp.id = ta.period_id
        where ta.entity_type = 'place' and ta.entity_id = p.id and ta.status = 'approved')
    from public.places p
    where p.status = 'approved'
      and p.location operator(extensions.&&) envelope
      and (place_types is null or p.place_type::text = any(place_types))
      and (q is null or q = '' or p.search_vector @@ websearch_to_tsquery('english', q))
      and (designations is null or exists (
        select 1 from public.place_designations d
         where d.place_id = p.id and d.designation::text = any(designations)))
      and (not require_image or public.map_thumbnail_for(p.id) is not null)
      and (period_id is null or public.place_matches_period(p.id, period_id))
      and (
        (from_year is null and to_year is null)
        or exists (
          select 1 from public.temporal_associations ta
           where ta.entity_type = 'place' and ta.entity_id = p.id
             and ta.status = 'approved'
             and ta.start_year is not null and ta.end_year is not null
             and (to_year is null or ta.start_year <= to_year)
             and (from_year is null or ta.end_year >= from_year)))
    order by p.content_level desc, p.name
    limit capped;
end;
$$;

comment on function public.map_places is
  'Bounded discovery projection. Geography mandatory, viewport size-limited, row count capped server-side. Filters compose; temporal filters match only places with an actual temporal claim.';

-- ---------------------------------------------------------------------------
-- map_clusters: aggregate, for when there is too much to draw
-- ---------------------------------------------------------------------------
-- The whole of Yorkshire is 23,171 places. Sending them to a browser to be
-- clustered there would mean a multi-megabyte payload for a view in which no
-- individual marker is even legible.
--
-- Aggregation is by a grid snapped to the requested cell size, computed in the
-- database so what crosses the wire is a few hundred rows regardless of how many
-- places they represent. The centroid is the mean of the members, so a cluster
-- sits where its places actually are rather than at the middle of an arbitrary
-- square.
--
-- The viewport is NOT size-capped here — a cluster query over a whole region is
-- exactly what this is for — but the number of cells returned is, and the filters
-- are applied before aggregation so counts always describe what is being asked
-- about.
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
  max_cells integer default 400
)
returns table (
  cell_key text,
  place_count bigint,
  lng double precision,
  lat double precision,
  sample_place_id uuid,
  sample_name text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  -- Bounded so a caller cannot request a grid so fine that "aggregation"
  -- degenerates into one cell per place.
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
        extensions.st_x(p.location::extensions.geometry) as x,
        extensions.st_y(p.location::extensions.geometry) as y
      from public.places p
      where p.status = 'approved'
        and p.location operator(extensions.&&) envelope
        and (place_types is null or p.place_type::text = any(place_types))
        and (q is null or q = '' or p.search_vector @@ websearch_to_tsquery('english', q))
        and (designations is null or exists (
          select 1 from public.place_designations d
           where d.place_id = p.id and d.designation::text = any(designations)))
        and (not require_image or public.map_thumbnail_for(p.id) is not null)
        and (period_id is null or public.place_matches_period(p.id, period_id))
        and (
          (from_year is null and to_year is null)
          or exists (
            select 1 from public.temporal_associations ta
             where ta.entity_type = 'place' and ta.entity_id = p.id
               and ta.status = 'approved'
               and ta.start_year is not null and ta.end_year is not null
               and (to_year is null or ta.start_year <= to_year)
               and (from_year is null or ta.end_year >= from_year)))
    ),
    binned as (
      select
        floor(x / cell)::bigint as gx,
        floor(y / cell)::bigint as gy,
        id, name, x, y
      from matched
    )
    select
      b.gx || ':' || b.gy as cell_key,
      count(*) as place_count,
      avg(b.x) as lng,
      avg(b.y) as lat,
      (array_agg(b.id order by b.name))[1] as sample_place_id,
      (array_agg(b.name order by b.name))[1] as sample_name
    from binned b
    group by b.gx, b.gy
    order by count(*) desc
    limit capped_cells;
end;
$$;

comment on function public.map_clusters is
  'Server-side density aggregation for broad viewports. Filters apply before aggregation, so a cluster count always describes what was asked for. Returns cells, never the underlying places.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Explicitly revoked from PUBLIC first: inheriting execute from PUBLIC is how a
-- function ends up callable by a role nobody intended.
revoke all on function public.map_places(
  double precision, double precision, double precision, double precision,
  text[], integer, text, integer, integer, text, text[], boolean) from public;
revoke all on function public.map_clusters(
  double precision, double precision, double precision, double precision,
  double precision, text[], text, integer, integer, text, text[], boolean, integer) from public;
revoke all on function public.place_matches_period(uuid, text) from public;

grant execute on function public.map_places(
  double precision, double precision, double precision, double precision,
  text[], integer, text, integer, integer, text, text[], boolean) to anon, authenticated;
grant execute on function public.map_clusters(
  double precision, double precision, double precision, double precision,
  double precision, text[], text, integer, integer, text, text[], boolean, integer) to anon, authenticated;
grant execute on function public.place_matches_period(uuid, text) to anon, authenticated;
