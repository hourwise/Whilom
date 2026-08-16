-- 0004_places.sql
-- Canonical places + taxonomy, designations, access and facilities
-- (spec §4, §6, §9). Community "suggest a place" flows through `contributions`
-- (0014) and is promoted here by an editor — direct writes are editor-only.

-- ---------------------------------------------------------------------------
-- places (canonical)
-- ---------------------------------------------------------------------------
create table public.places (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  place_type public.place_type not null,
  content_level smallint not null default 1 check (content_level between 1 and 4),
  primary_period public.historical_period,
  -- Denormalised filter columns (full detail lives in place_access).
  access_cost public.access_cost,
  is_visitable boolean not null default false,
  summary text,                    -- one/two lines (all levels)
  description text,                -- long-form overview (level 3+)
  location extensions.geography(Point, 4326) not null,
  address_line text,
  town text,
  county text,
  postcode text,
  country char(2) not null default 'GB',
  trust_level public.trust_level not null default 'open_data_source',
  status public.moderation_state not null default 'approved',
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index places_location_gix on public.places using gist (location);
create index places_search_gin on public.places using gin (search_vector);
create index places_type_idx on public.places (place_type);
create index places_period_idx on public.places (primary_period);
create index places_county_idx on public.places (county);

create trigger places_set_updated_at
  before update on public.places for each row execute function public.set_updated_at();

create or replace function public.places_update_search_vector()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.town, '') || ' ' || coalesce(new.county, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.summary, '')), 'C');
  return new;
end;
$$;

create trigger places_search_vector_update
  before insert or update on public.places
  for each row execute function public.places_update_search_vector();

-- ---------------------------------------------------------------------------
-- Taxonomy: hierarchical categories + free tags
-- ---------------------------------------------------------------------------
create table public.place_categories (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  parent_id uuid references public.place_categories (id) on delete set null,
  description text
);

create table public.place_category_links (
  place_id uuid not null references public.places (id) on delete cascade,
  category_id uuid not null references public.place_categories (id) on delete cascade,
  primary key (place_id, category_id)
);

create table public.place_tags (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text unique not null,
  name text not null
);

create table public.place_tag_links (
  place_id uuid not null references public.places (id) on delete cascade,
  tag_id uuid not null references public.place_tags (id) on delete cascade,
  primary key (place_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Statutory designations (a place may carry several)
-- ---------------------------------------------------------------------------
create table public.place_designations (
  id uuid primary key default extensions.uuid_generate_v4(),
  place_id uuid not null references public.places (id) on delete cascade,
  designation public.designation_type not null,
  grade public.designation_grade,
  reference text,                 -- e.g. NHLE list entry number
  first_designated date,
  url text,
  created_at timestamptz not null default now()
);
create index place_designations_place_idx on public.place_designations (place_id);

-- ---------------------------------------------------------------------------
-- Visitor access detail (1:1 with place)
-- ---------------------------------------------------------------------------
create table public.place_access (
  place_id uuid primary key references public.places (id) on delete cascade,
  access_cost public.access_cost,
  is_visitable boolean not null default false,
  public_access boolean not null default false,
  booking_required boolean not null default false,
  guided_tours boolean not null default false,
  seasonal boolean not null default false,
  expected_visit_minutes integer check (expected_visit_minutes is null or expected_visit_minutes > 0),
  admission_notes text,
  opening_notes text,
  official_url text,
  updated_at timestamptz not null default now()
);
create trigger place_access_set_updated_at
  before update on public.place_access for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Facilities + accessibility (many rows per place)
-- ---------------------------------------------------------------------------
create table public.place_facilities (
  place_id uuid not null references public.places (id) on delete cascade,
  facility public.facility_type not null,
  note text,
  primary key (place_id, facility)
);

create table public.place_accessibility (
  place_id uuid not null references public.places (id) on delete cascade,
  feature public.accessibility_feature not null,
  note text,
  primary key (place_id, feature)
);

-- ---------------------------------------------------------------------------
-- RLS: canonical content is world-readable when approved; writes are
-- editor-only (service role bypasses RLS for ingestion). (spec §38)
-- ---------------------------------------------------------------------------
alter table public.places enable row level security;
alter table public.place_categories enable row level security;
alter table public.place_category_links enable row level security;
alter table public.place_tags enable row level security;
alter table public.place_tag_links enable row level security;
alter table public.place_designations enable row level security;
alter table public.place_access enable row level security;
alter table public.place_facilities enable row level security;
alter table public.place_accessibility enable row level security;

create policy "places public read" on public.places for select
  using (status = 'approved' or public.is_editor());
create policy "places editor write" on public.places for all
  using (public.is_editor()) with check (public.is_editor());

-- Simple "public read / editor write" pattern for the place child tables.
create policy "categories read" on public.place_categories for select using (true);
create policy "categories write" on public.place_categories for all using (public.is_editor()) with check (public.is_editor());
create policy "category_links read" on public.place_category_links for select using (true);
create policy "category_links write" on public.place_category_links for all using (public.is_editor()) with check (public.is_editor());
create policy "tags read" on public.place_tags for select using (true);
create policy "tags write" on public.place_tags for all using (public.is_editor()) with check (public.is_editor());
create policy "tag_links read" on public.place_tag_links for select using (true);
create policy "tag_links write" on public.place_tag_links for all using (public.is_editor()) with check (public.is_editor());
create policy "designations read" on public.place_designations for select using (true);
create policy "designations write" on public.place_designations for all using (public.is_editor()) with check (public.is_editor());
create policy "access read" on public.place_access for select using (true);
create policy "access write" on public.place_access for all using (public.is_editor()) with check (public.is_editor());
create policy "facilities read" on public.place_facilities for select using (true);
create policy "facilities write" on public.place_facilities for all using (public.is_editor()) with check (public.is_editor());
create policy "accessibility read" on public.place_accessibility for select using (true);
create policy "accessibility write" on public.place_accessibility for all using (public.is_editor()) with check (public.is_editor());

-- ---------------------------------------------------------------------------
-- search_places: single RPC targeted by @whilom/search.buildSearchArgs.
-- Signature is stable across the app; all filters optional.
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
  id uuid, slug text, name text, place_type text, content_level smallint,
  period text, cost text, is_visitable boolean, summary text,
  lng double precision, lat double precision, distance_m double precision
)
language sql stable
as $$
  select
    p.id, p.slug, p.name, p.place_type::text, p.content_level,
    p.primary_period::text, p.access_cost::text, p.is_visitable, p.summary,
    extensions.st_x(p.location::extensions.geometry) as lng,
    extensions.st_y(p.location::extensions.geometry) as lat,
    case when center_lng is not null and center_lat is not null
      then extensions.st_distance(
        p.location,
        extensions.st_setsrid(extensions.st_makepoint(center_lng, center_lat), 4326)::extensions.geography)
    end as distance_m
  from public.places p
  where p.status = 'approved'
    and (q is null or p.search_vector @@ websearch_to_tsquery('english', q))
    and (place_types is null or p.place_type::text = any(place_types))
    and (periods is null or p.primary_period::text = any(periods))
    and (cost is null or p.access_cost::text = cost)
    and (not visitable_only or p.is_visitable)
    and (center_lng is null or center_lat is null or radius_m is null
      or extensions.st_dwithin(
        p.location,
        extensions.st_setsrid(extensions.st_makepoint(center_lng, center_lat), 4326)::extensions.geography,
        radius_m))
    and (bbox_sw_lng is null
      or p.location operator(extensions.&&) extensions.st_makeenvelope(
        bbox_sw_lng, bbox_sw_lat, bbox_ne_lng, bbox_ne_lat, 4326)::extensions.geography)
  order by distance_m asc nulls last, p.content_level desc, p.name asc
  limit greatest(1, least(max_rows, 100))
  offset greatest(0, row_offset);
$$;
