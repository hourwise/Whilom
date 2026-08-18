-- 0028_map_discovery_contract.sql
-- The bounded read contract the future discovery map will consume.
--
-- No map is built here. What is established is the shape and the limits, so
-- that whoever builds it cannot accidentally write a query that asks for a
-- region's worth of places at once.
--
-- Three properties are enforced by the function rather than left to the caller:
--
--   1. Geography is MANDATORY. There is no way to call this and get everything.
--   2. The row limit is capped server-side, so a client asking for 100,000 gets
--      the cap, not the region.
--   3. The viewport itself is bounded. A "viewport" spanning the country is a
--      full scan wearing a bbox, so an oversized envelope is rejected outright
--      rather than served slowly.
--
-- The projection is deliberately small: enough to draw a pin and label it, and
-- nothing that belongs on a place page. A map that has to load complete place
-- records to render markers will not stay interactive, and the temptation to
-- add "just one more field" is exactly what this signature exists to resist.

-- ---------------------------------------------------------------------------
-- Rights-ready thumbnails only
-- ---------------------------------------------------------------------------
-- A thumbnail may only reach the map when attribution can be generated for that
-- exact file from stored data. "From Wikimedia Commons" is not a licence, and a
-- map marker is a publication like any other.
create or replace function public.map_thumbnail_for(p_place_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select i.thumbnail_url
    from public.images i
    join public.image_rights r on r.image_id = i.id
   where i.entity_type = 'place'
     and i.entity_id = p_place_id
     and i.moderation_status = 'approved'
     and i.thumbnail_url is not null
     and r.attribution is not null
     and r.licence is not null
   order by i.created_at
   limit 1;
$$;

comment on function public.map_thumbnail_for(uuid) is
  'The first rights-ready thumbnail for a place, or NULL. Returns nothing unless stored rights data can support attribution.';

-- ---------------------------------------------------------------------------
-- map_places: the bounded discovery projection
-- ---------------------------------------------------------------------------
create or replace function public.map_places(
  bbox_sw_lng double precision,
  bbox_sw_lat double precision,
  bbox_ne_lng double precision,
  bbox_ne_lat double precision,
  place_types text[] default null,
  max_rows integer default 250
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
  thumbnail_url text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  -- ~2.5 degrees of longitude and 1.5 of latitude is a generous county-sized
  -- viewport. Beyond that a client is not panning a map, it is downloading a
  -- region, and should be asking for a different thing.
  max_span_lng constant double precision := 2.5;
  max_span_lat constant double precision := 1.5;
  capped integer := least(greatest(coalesce(max_rows, 250), 1), 500);
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
    raise exception 'map_places bounding box is too large (max % x % degrees); zoom in or use search',
      max_span_lng, max_span_lat
      using errcode = 'invalid_parameter_value';
  end if;

  return query
    select
      p.id,
      p.slug,
      p.name,
      p.place_type::text,
      extensions.st_x(p.location::extensions.geometry),
      extensions.st_y(p.location::extensions.geometry),
      p.location_accuracy_m,
      (select d.designation::text
         from public.place_designations d
        where d.place_id = p.id
        order by d.designation
        limit 1),
      public.map_thumbnail_for(p.id)
    from public.places p
    where p.status = 'approved'
      and (place_types is null or p.place_type::text = any(place_types))
      and p.location operator(extensions.&&) extensions.st_makeenvelope(
        bbox_sw_lng, bbox_sw_lat, bbox_ne_lng, bbox_ne_lat, 4326)::extensions.geography
    -- Ordered so that a truncated result is the more substantial places rather
    -- than an arbitrary slice: a capped viewport should still look sensible.
    order by p.content_level desc, p.name
    limit capped;
end;
$$;

comment on function public.map_places is
  'Bounded discovery projection for the map. Geography is mandatory, the viewport is size-limited and the row count is capped server-side. Returns only what a marker needs.';

grant execute on function public.map_places(
  double precision, double precision, double precision, double precision, text[], integer) to anon, authenticated;
grant execute on function public.map_thumbnail_for(uuid) to anon, authenticated;
