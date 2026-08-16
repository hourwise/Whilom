-- 0005_people_events_objects.sql
-- The other first-class heritage entities (spec §4, §10-§12). Birth/death/
-- burial, find-spots and holdings are ALSO expressible as relationships
-- (0006); the direct FKs here are convenience denormalisations for display.

-- ---------------------------------------------------------------------------
-- people
-- ---------------------------------------------------------------------------
create table public.people (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text unique not null,
  name text not null,               -- display name, e.g. "Anne Boleyn"
  given_name text,
  family_name text,
  titles text[] not null default '{}',   -- offices/titles held
  birth_year integer,
  death_year integer,
  date_note text,                   -- free text for approximate/uncertain dates
  biography text,
  portrait_image_id uuid,           -- FK added in 0007 (images) via alter
  trust_level public.trust_level not null default 'open_data_source',
  status public.moderation_state not null default 'approved',
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index people_search_gin on public.people using gin (search_vector);
create trigger people_set_updated_at before update on public.people
  for each row execute function public.set_updated_at();

create or replace function public.people_update_search_vector()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.titles, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.biography, '')), 'C');
  return new;
end;
$$;
create trigger people_search_vector_update before insert or update on public.people
  for each row execute function public.people_update_search_vector();

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  event_type public.event_type not null,
  period public.historical_period,
  date_start date,
  date_end date,
  date_note text,
  description text,
  primary_place_id uuid references public.places (id) on delete set null,
  location extensions.geography(Point, 4326),
  trust_level public.trust_level not null default 'open_data_source',
  status public.moderation_state not null default 'approved',
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_place_idx on public.events (primary_place_id);
create index events_search_gin on public.events using gin (search_vector);
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create or replace function public.events_update_search_vector()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'C');
  return new;
end;
$$;
create trigger events_search_vector_update before insert or update on public.events
  for each row execute function public.events_update_search_vector();

-- ---------------------------------------------------------------------------
-- objects (museum / archive material)
-- ---------------------------------------------------------------------------
create table public.objects (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  object_type public.object_type not null,
  period public.historical_period,
  date_note text,
  creator_note text,                -- creator/maker where known
  description text,
  -- Held at a museum (a place) and/or found at an origin place. Both also
  -- expressible via relationships (held_at / discovered_at).
  current_museum_place_id uuid references public.places (id) on delete set null,
  origin_place_id uuid references public.places (id) on delete set null,
  image_id uuid,                    -- FK added in 0007
  image_reuse_permitted boolean not null default false,
  external_record_url text,         -- official museum record (spec §12)
  trust_level public.trust_level not null default 'open_data_source',
  status public.moderation_state not null default 'approved',
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index objects_museum_idx on public.objects (current_museum_place_id);
create index objects_search_gin on public.objects using gin (search_vector);
create trigger objects_set_updated_at before update on public.objects
  for each row execute function public.set_updated_at();

create or replace function public.objects_update_search_vector()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'C');
  return new;
end;
$$;
create trigger objects_search_vector_update before insert or update on public.objects
  for each row execute function public.objects_update_search_vector();

-- ---------------------------------------------------------------------------
-- RLS (public read approved / editor write)
-- ---------------------------------------------------------------------------
alter table public.people enable row level security;
alter table public.events enable row level security;
alter table public.objects enable row level security;

create policy "people read" on public.people for select using (status = 'approved' or public.is_editor());
create policy "people write" on public.people for all using (public.is_editor()) with check (public.is_editor());
create policy "events read" on public.events for select using (status = 'approved' or public.is_editor());
create policy "events write" on public.events for all using (public.is_editor()) with check (public.is_editor());
create policy "objects read" on public.objects for select using (status = 'approved' or public.is_editor());
create policy "objects write" on public.objects for all using (public.is_editor()) with check (public.is_editor());
