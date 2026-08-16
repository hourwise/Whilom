-- 0011_trips.sql
-- User itineraries (spec §14, §26). Planned on the web, they appear in the app
-- automatically because both clients read the same rows.

create table public.trips (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'My trip',
  start_date date,
  end_date date,
  transport public.transport_mode,
  max_radius_m integer,
  notes text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trips_user_idx on public.trips (user_id);
create trigger trips_set_updated_at before update on public.trips
  for each row execute function public.set_updated_at();

create table public.trip_days (
  id uuid primary key default extensions.uuid_generate_v4(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  day_index integer not null,
  date date,
  notes text,
  unique (trip_id, day_index)
);
create index trip_days_trip_idx on public.trip_days (trip_id);

create table public.trip_stops (
  id uuid primary key default extensions.uuid_generate_v4(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  trip_day_id uuid references public.trip_days (id) on delete set null,
  place_id uuid not null references public.places (id) on delete cascade,
  position integer not null default 0,
  planned_minutes integer,
  status text not null default 'planned' check (status in ('planned', 'completed', 'skipped')),
  notes text,
  created_at timestamptz not null default now()
);
create index trip_stops_trip_idx on public.trip_stops (trip_id);
create index trip_stops_day_idx on public.trip_stops (trip_day_id);

-- ---------------------------------------------------------------------------
-- RLS — owner-scoped, with optional public read of shared trips.
-- ---------------------------------------------------------------------------
alter table public.trips enable row level security;
alter table public.trip_days enable row level security;
alter table public.trip_stops enable row level security;

create policy "trips read" on public.trips for select using (user_id = auth.uid() or is_public);
create policy "trips owner write" on public.trips for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "trip_days read" on public.trip_days for select
  using (exists (select 1 from public.trips t where t.id = trip_id and (t.user_id = auth.uid() or t.is_public)));
create policy "trip_days owner write" on public.trip_days for all
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

create policy "trip_stops read" on public.trip_stops for select
  using (exists (select 1 from public.trips t where t.id = trip_id and (t.user_id = auth.uid() or t.is_public)));
create policy "trip_stops owner write" on public.trip_stops for all
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));
