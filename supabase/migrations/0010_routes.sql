-- 0010_routes.sql
-- Walks, trails and drives (spec §13, §27, §47). A stop may be a database place
-- or an ordinary geographic waypoint.

create table public.routes (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  route_type public.route_type not null,
  difficulty public.route_difficulty,
  distance_m numeric(9, 1),
  duration_minutes integer,
  ascent_m integer,
  theme text,                       -- historical theme, e.g. 'Roman Britain'
  period public.historical_period,
  description text,
  start_point extensions.geography(Point, 4326),
  end_point extensions.geography(Point, 4326),
  parking_notes text,
  transport_notes text,
  safety_notes text,                -- current-condition / safety warnings
  accessibility_notes text,
  is_premium boolean not null default false,   -- basic vs premium trail (spec §41)
  trust_level public.trust_level not null default 'editorially_verified',
  status public.moderation_state not null default 'approved',
  created_by uuid references public.profiles (id) on delete set null,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index routes_type_idx on public.routes (route_type);
create index routes_search_gin on public.routes using gin (search_vector);
create trigger routes_set_updated_at before update on public.routes
  for each row execute function public.set_updated_at();

create or replace function public.routes_update_search_vector()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.theme, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'C');
  return new;
end;
$$;
create trigger routes_search_vector_update before insert or update on public.routes
  for each row execute function public.routes_update_search_vector();

create table public.route_stops (
  id uuid primary key default extensions.uuid_generate_v4(),
  route_id uuid not null references public.routes (id) on delete cascade,
  position integer not null,
  place_id uuid references public.places (id) on delete set null,  -- null = plain waypoint
  name text,                        -- required when place_id is null
  description text,
  location extensions.geography(Point, 4326),
  is_optional boolean not null default false,   -- optional diversion
  created_at timestamptz not null default now(),
  unique (route_id, position),
  constraint route_stop_has_target check (place_id is not null or name is not null)
);
create index route_stops_route_idx on public.route_stops (route_id);
create index route_stops_place_idx on public.route_stops (place_id);

create table public.route_geometry (
  route_id uuid primary key references public.routes (id) on delete cascade,
  geom extensions.geography(LineString, 4326) not null,
  gpx text,
  updated_at timestamptz not null default now()
);
create index route_geometry_gix on public.route_geometry using gist (geom);
create trigger route_geometry_set_updated_at before update on public.route_geometry
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (public read approved / editor write)
-- ---------------------------------------------------------------------------
alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.route_geometry enable row level security;

create policy "routes read" on public.routes for select using (status = 'approved' or public.is_editor());
create policy "routes write" on public.routes for all using (public.is_editor()) with check (public.is_editor());
create policy "route_stops read" on public.route_stops for select using (true);
create policy "route_stops write" on public.route_stops for all using (public.is_editor()) with check (public.is_editor());
create policy "route_geometry read" on public.route_geometry for select using (true);
create policy "route_geometry write" on public.route_geometry for all using (public.is_editor()) with check (public.is_editor());
