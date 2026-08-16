-- 0012_collections.sql
-- Editorial groupings: themes, feature destinations and public articles
-- (spec §4, §18, §19). A collection embeds real entities rather than free text,
-- so a reader can save/open/add-to-trip any member without searching again.

create table public.collections (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  kind text not null default 'theme' check (kind in ('theme', 'feature', 'article')),
  summary text,
  body text,                        -- long-form editorial (retains references)
  hero_image_id uuid references public.images (id) on delete set null,
  period public.historical_period,
  is_published boolean not null default false,
  status public.moderation_state not null default 'approved',
  created_by uuid references public.profiles (id) on delete set null,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index collections_kind_idx on public.collections (kind);
create index collections_search_gin on public.collections using gin (search_vector);
create trigger collections_set_updated_at before update on public.collections
  for each row execute function public.set_updated_at();

create or replace function public.collections_update_search_vector()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.body, '')), 'C');
  return new;
end;
$$;
create trigger collections_search_vector_update before insert or update on public.collections
  for each row execute function public.collections_update_search_vector();

create table public.collection_entities (
  id uuid primary key default extensions.uuid_generate_v4(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  entity_type public.entity_type not null,
  entity_id uuid not null,
  position integer not null default 0,
  note text,                        -- editorial framing for this member
  unique (collection_id, entity_type, entity_id)
);
create index collection_entities_collection_idx on public.collection_entities (collection_id);
create index collection_entities_entity_idx on public.collection_entities (entity_type, entity_id);
create trigger collection_entities_check_entity before insert or update on public.collection_entities
  for each row execute function public.check_entity_reference();

-- ---------------------------------------------------------------------------
-- RLS (public read published / editor write)
-- ---------------------------------------------------------------------------
alter table public.collections enable row level security;
alter table public.collection_entities enable row level security;

create policy "collections read" on public.collections for select
  using ((is_published and status = 'approved') or public.is_editor());
create policy "collections write" on public.collections for all
  using (public.is_editor()) with check (public.is_editor());
create policy "collection_entities read" on public.collection_entities for select using (true);
create policy "collection_entities write" on public.collection_entities for all
  using (public.is_editor()) with check (public.is_editor());
