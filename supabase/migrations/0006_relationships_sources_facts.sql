-- 0006_relationships_sources_facts.sql
-- The heritage graph's connective tissue + provenance (spec §5, §34, §36, §39).

-- ---------------------------------------------------------------------------
-- Polymorphic entity existence check, used by integrity triggers below.
-- ---------------------------------------------------------------------------
create or replace function public.entity_exists(kind public.entity_type, ent_id uuid)
returns boolean language plpgsql stable as $$
declare found boolean;
begin
  execute format(
    'select exists(select 1 from public.%I where id = $1)',
    case kind
      when 'place' then 'places'
      when 'person' then 'people'
      when 'event' then 'events'
      when 'object' then 'objects'
      when 'route' then 'routes'
      when 'collection' then 'collections'
      when 'source' then 'sources'
    end
  ) into found using ent_id;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- sources: citable references (a dataset, publication, website, museum record)
-- ---------------------------------------------------------------------------
create table public.sources (
  id uuid primary key default extensions.uuid_generate_v4(),
  kind public.source_kind not null,
  name text not null,
  publisher text,
  url text,
  licence text,
  licence_url text,
  attribution text,
  trust_level public.trust_level not null default 'open_data_source',
  created_at timestamptz not null default now()
);

-- source_records: a specific record within a source, linked to the canonical
-- entity it describes. Multiple records per entity is the norm (spec §36).
create table public.source_records (
  id uuid primary key default extensions.uuid_generate_v4(),
  source_id uuid not null references public.sources (id) on delete cascade,
  external_id text,                 -- the source's own identifier
  url text,
  licence text,
  attribution text,
  retrieved_at timestamptz not null default now(),
  source_updated_at timestamptz,
  importer_version text,
  raw jsonb,                        -- original payload, retained for audit
  entity_type public.entity_type not null,
  entity_id uuid not null,
  match_confidence numeric(4, 3) check (match_confidence between 0 and 1),
  review_status public.moderation_state not null default 'approved',
  created_at timestamptz not null default now(),
  unique (source_id, external_id, entity_type, entity_id)
);
create index source_records_entity_idx on public.source_records (entity_type, entity_id);

-- facts: atomic, provenance-bearing assertions about any entity (spec §34).
create table public.facts (
  id uuid primary key default extensions.uuid_generate_v4(),
  entity_type public.entity_type not null,
  entity_id uuid not null,
  predicate text not null,          -- e.g. 'construction_start', 'height_m'
  value jsonb not null,
  source_id uuid references public.sources (id) on delete set null,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  status public.moderation_state not null default 'approved',
  valid_from date,
  valid_to date,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index facts_entity_idx on public.facts (entity_type, entity_id);

-- entity_relationships: the flexible graph edge. `predicate` is free text
-- validated against the domain registry (spec §5) so new relationship types
-- never need a migration. Every edge can carry provenance + editorial state.
create table public.entity_relationships (
  id uuid primary key default extensions.uuid_generate_v4(),
  subject_type public.entity_type not null,
  subject_id uuid not null,
  predicate text not null,
  object_type public.entity_type not null,
  object_id uuid not null,
  note text,
  date_start date,
  date_end date,
  source_id uuid references public.sources (id) on delete set null,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  verified boolean not null default false,
  status public.moderation_state not null default 'approved',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (subject_type, subject_id, predicate, object_type, object_id)
);
create index rel_subject_idx on public.entity_relationships (subject_type, subject_id);
create index rel_object_idx on public.entity_relationships (object_type, object_id);
create index rel_predicate_idx on public.entity_relationships (predicate);

-- ---------------------------------------------------------------------------
-- Integrity triggers: enforce that polymorphic references point at real rows,
-- since a FK cannot span multiple tables.
-- ---------------------------------------------------------------------------
create or replace function public.check_relationship_endpoints()
returns trigger language plpgsql as $$
begin
  if not public.entity_exists(new.subject_type, new.subject_id) then
    raise exception 'relationship subject %/% does not exist', new.subject_type, new.subject_id;
  end if;
  if not public.entity_exists(new.object_type, new.object_id) then
    raise exception 'relationship object %/% does not exist', new.object_type, new.object_id;
  end if;
  return new;
end;
$$;
create trigger entity_relationships_check_endpoints
  before insert or update on public.entity_relationships
  for each row execute function public.check_relationship_endpoints();

create or replace function public.check_entity_reference()
returns trigger language plpgsql as $$
begin
  if not public.entity_exists(new.entity_type, new.entity_id) then
    raise exception 'referenced entity %/% does not exist', new.entity_type, new.entity_id;
  end if;
  return new;
end;
$$;
create trigger facts_check_entity
  before insert or update on public.facts
  for each row execute function public.check_entity_reference();
create trigger source_records_check_entity
  before insert or update on public.source_records
  for each row execute function public.check_entity_reference();

-- ---------------------------------------------------------------------------
-- RLS (public read approved / editor write)
-- ---------------------------------------------------------------------------
alter table public.sources enable row level security;
alter table public.source_records enable row level security;
alter table public.facts enable row level security;
alter table public.entity_relationships enable row level security;

create policy "sources read" on public.sources for select using (true);
create policy "sources write" on public.sources for all using (public.is_editor()) with check (public.is_editor());
create policy "source_records read" on public.source_records for select using (review_status = 'approved' or public.is_editor());
create policy "source_records write" on public.source_records for all using (public.is_editor()) with check (public.is_editor());
create policy "facts read" on public.facts for select using (status = 'approved' or public.is_editor());
create policy "facts write" on public.facts for all using (public.is_editor()) with check (public.is_editor());
create policy "relationships read" on public.entity_relationships for select using (status = 'approved' or public.is_editor());
create policy "relationships write" on public.entity_relationships for all using (public.is_editor()) with check (public.is_editor());
