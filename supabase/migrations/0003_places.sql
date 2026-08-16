-- 0003_places.sql
-- Minimal `places` table + geospatial/text search RPC (spec §4, §6, §37).
-- This is a Phase-1 STUB proving the model end-to-end; the full schema
-- (categories, designations, access, facilities, relationships, sources …)
-- is designed in the dedicated schema task.

create table public.places (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  place_type text not null,                       -- domain PlaceType value
  content_level smallint not null default 1,      -- domain PlaceContentLevel (1..4)
  period text,                                    -- domain HistoricalPeriod value
  cost text,                                       -- domain AccessCost value
  is_visitable boolean not null default false,
  summary text,
  -- WGS84 point; stored as geography for accurate metre-based distance.
  location extensions.geography(Point, 4326) not null,
  -- Search vector maintained by trigger (weighted name > summary).
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index places_location_gix on public.places using gist (location);
create index places_search_gin on public.places using gin (search_vector);
create index places_type_idx on public.places (place_type);

alter table public.places enable row level security;

-- Imported/official heritage records are world-readable; only privileged
-- server functions (service role) may write them (spec §38).
create policy "places are public read" on public.places for select using (true);

create trigger places_set_updated_at
  before update on public.places
  for each row execute function public.set_updated_at();

create or replace function public.places_update_search_vector()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.summary, '')), 'B');
  return new;
end;
$$;

create trigger places_search_vector_update
  before insert or update on public.places
  for each row execute function public.places_update_search_vector();

-- ---------------------------------------------------------------------------
-- search_places: single RPC targeted by @heritage/search.buildSearchArgs.
-- All filters are optional; geographic filters use metre distance / bbox.
-- ---------------------------------------------------------------------------
create or replace function public.search_places(
  q text default null,
  center_lng double precision default null,
  center_lat double precision default null,
  radius_m double precision default null,
  bbox_sw_lng double precision default null,
  bbox_sw_lat double precision default null,
  bbox_ne_lng double precision default null,
  bbox_ne_lat double precision default null,
  place_types text[] default null,
  periods text[] default null,
  cost text default null,
  visitable_only boolean default false,
  max_rows integer default 50,
  row_offset integer default 0
)
returns table (
  id uuid,
  slug text,
  name text,
  place_type text,
  content_level smallint,
  period text,
  cost text,
  is_visitable boolean,
  summary text,
  lng double precision,
  lat double precision,
  distance_m double precision
)
language sql
stable
as $$
  select
    p.id, p.slug, p.name, p.place_type, p.content_level, p.period, p.cost,
    p.is_visitable, p.summary,
    extensions.st_x(p.location::extensions.geometry) as lng,
    extensions.st_y(p.location::extensions.geometry) as lat,
    case
      when center_lng is not null and center_lat is not null
      then extensions.st_distance(
        p.location,
        extensions.st_setsrid(extensions.st_makepoint(center_lng, center_lat), 4326)::extensions.geography
      )
    end as distance_m
  from public.places p
  where
    (q is null or p.search_vector @@ websearch_to_tsquery('english', q))
    and (place_types is null or p.place_type = any(place_types))
    and (periods is null or p.period = any(periods))
    and (cost is null or p.cost = cost)
    and (not visitable_only or p.is_visitable)
    and (
      center_lng is null or center_lat is null or radius_m is null
      or extensions.st_dwithin(
        p.location,
        extensions.st_setsrid(extensions.st_makepoint(center_lng, center_lat), 4326)::extensions.geography,
        radius_m
      )
    )
    and (
      bbox_sw_lng is null
      or p.location::extensions.geometry && extensions.st_makeenvelope(
        bbox_sw_lng, bbox_sw_lat, bbox_ne_lng, bbox_ne_lat, 4326
      )
    )
  order by
    distance_m asc nulls last,
    p.content_level desc,
    p.name asc
  limit greatest(1, least(max_rows, 100))
  offset greatest(0, row_offset);
$$;
