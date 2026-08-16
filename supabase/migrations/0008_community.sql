-- 0008_community.sql
-- Opinion content (spec §16, §17). Kept strictly separate from historical fact:
-- these never feed the heritage graph. All community content is moderated.

create table public.reviews (
  id uuid primary key default extensions.uuid_generate_v4(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text,
  moderation_status public.moderation_state not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, user_id)        -- one review per user per place
);
create index reviews_place_idx on public.reviews (place_id);
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

create table public.comments (
  id uuid primary key default extensions.uuid_generate_v4(),
  entity_type public.entity_type not null,
  entity_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null,
  moderation_status public.moderation_state not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_entity_idx on public.comments (entity_type, entity_id);
create trigger comments_set_updated_at before update on public.comments
  for each row execute function public.set_updated_at();
create trigger comments_check_entity before insert or update on public.comments
  for each row execute function public.check_entity_reference();

create table public.tips (
  id uuid primary key default extensions.uuid_generate_v4(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  moderation_status public.moderation_state not null default 'submitted',
  created_at timestamptz not null default now()
);
create index tips_place_idx on public.tips (place_id);

-- ---------------------------------------------------------------------------
-- RLS — the shared community pattern:
--   read:   approved OR own OR moderator
--   insert: authenticated, as self, status 'submitted'
--   update/delete own while not yet approved; moderators manage all
-- ---------------------------------------------------------------------------
alter table public.reviews enable row level security;
alter table public.comments enable row level security;
alter table public.tips enable row level security;

create policy "reviews read" on public.reviews for select
  using (moderation_status = 'approved' or user_id = auth.uid() or public.is_moderator());
create policy "reviews insert" on public.reviews for insert to authenticated
  with check (user_id = auth.uid() and moderation_status = 'submitted');
create policy "reviews owner update" on public.reviews for update
  using (user_id = auth.uid() and moderation_status <> 'approved') with check (user_id = auth.uid());
create policy "reviews owner delete" on public.reviews for delete using (user_id = auth.uid());
create policy "reviews moderator" on public.reviews for all
  using (public.is_moderator()) with check (public.is_moderator());

create policy "comments read" on public.comments for select
  using (moderation_status = 'approved' or user_id = auth.uid() or public.is_moderator());
create policy "comments insert" on public.comments for insert to authenticated
  with check (user_id = auth.uid() and moderation_status = 'submitted');
create policy "comments owner update" on public.comments for update
  using (user_id = auth.uid() and moderation_status <> 'approved') with check (user_id = auth.uid());
create policy "comments owner delete" on public.comments for delete using (user_id = auth.uid());
create policy "comments moderator" on public.comments for all
  using (public.is_moderator()) with check (public.is_moderator());

create policy "tips read" on public.tips for select
  using (moderation_status = 'approved' or user_id = auth.uid() or public.is_moderator());
create policy "tips insert" on public.tips for insert to authenticated
  with check (user_id = auth.uid() and moderation_status = 'submitted');
create policy "tips owner update" on public.tips for update
  using (user_id = auth.uid() and moderation_status <> 'approved') with check (user_id = auth.uid());
create policy "tips owner delete" on public.tips for delete using (user_id = auth.uid());
create policy "tips moderator" on public.tips for all
  using (public.is_moderator()) with check (public.is_moderator());
