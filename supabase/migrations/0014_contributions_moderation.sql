-- 0014_contributions_moderation.sql
-- Community submissions + the moderation system (spec §16, §17, §20).
-- Historical contributions are moderated more strictly than opinion content;
-- users can never self-approve or alter moderation records (spec §38).

-- Generic submission queue: new-place suggestions, relationship suggestions,
-- historical claims, etc. `payload` carries the proposed structured content.
create table public.contributions (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  contribution_type public.contribution_type not null,
  entity_type public.entity_type,   -- target entity, null for new-entity proposals
  entity_id uuid,
  payload jsonb not null default '{}',
  status public.moderation_state not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contributions_user_idx on public.contributions (user_id);
create index contributions_status_idx on public.contributions (status);
create trigger contributions_set_updated_at before update on public.contributions
  for each row execute function public.set_updated_at();

create table public.corrections (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entity_type public.entity_type not null,
  entity_id uuid not null,
  field text,
  current_value text,
  suggested_value text,
  note text,
  status public.moderation_state not null default 'submitted',
  created_at timestamptz not null default now()
);
create index corrections_entity_idx on public.corrections (entity_type, entity_id);

create table public.reports (
  id uuid primary key default extensions.uuid_generate_v4(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_kind text not null,        -- 'review' | 'comment' | 'image' | 'place' | ...
  target_id uuid not null,
  reason public.report_reason not null,
  note text,
  status public.moderation_state not null default 'submitted',
  created_at timestamptz not null default now()
);
create index reports_target_idx on public.reports (target_kind, target_id);

-- Unified moderation queue: one row per moderatable thing.
create table public.moderation_items (
  id uuid primary key default extensions.uuid_generate_v4(),
  target_kind text not null,        -- table/content kind under review
  target_id uuid not null,
  state public.moderation_state not null default 'needs_review',
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_kind, target_id)
);
create index moderation_items_state_idx on public.moderation_items (state);
create trigger moderation_items_set_updated_at before update on public.moderation_items
  for each row execute function public.set_updated_at();

-- Append-only audit history of moderator decisions (spec §17, §20).
create table public.moderation_actions (
  id uuid primary key default extensions.uuid_generate_v4(),
  moderation_item_id uuid not null references public.moderation_items (id) on delete cascade,
  moderator_id uuid references public.profiles (id) on delete set null,
  action text not null,             -- 'approve' | 'reject' | 'supersede' | 'assign' | 'note'
  note text,
  created_at timestamptz not null default now()
);
create index moderation_actions_item_idx on public.moderation_actions (moderation_item_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.contributions enable row level security;
alter table public.corrections enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_items enable row level security;
alter table public.moderation_actions enable row level security;

-- Submissions: create as self, read own, moderators manage.
create policy "contributions insert" on public.contributions for insert to authenticated
  with check (user_id = auth.uid() and status = 'submitted');
create policy "contributions read" on public.contributions for select
  using (user_id = auth.uid() or public.is_moderator());
create policy "contributions owner update" on public.contributions for update
  using (user_id = auth.uid() and status = 'submitted') with check (user_id = auth.uid());
create policy "contributions moderator" on public.contributions for all
  using (public.is_moderator()) with check (public.is_moderator());

create policy "corrections insert" on public.corrections for insert to authenticated
  with check (user_id = auth.uid() and status = 'submitted');
create policy "corrections read" on public.corrections for select
  using (user_id = auth.uid() or public.is_moderator());
create policy "corrections moderator" on public.corrections for all
  using (public.is_moderator()) with check (public.is_moderator());

create policy "reports insert" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'submitted');
create policy "reports read" on public.reports for select
  using (reporter_id = auth.uid() or public.is_moderator());
create policy "reports moderator" on public.reports for all
  using (public.is_moderator()) with check (public.is_moderator());

-- Moderation records are moderator/admin only, and actions are append-only
-- (no update/delete policy exists, so history cannot be rewritten).
create policy "moderation_items moderator" on public.moderation_items for all
  using (public.is_moderator()) with check (public.is_moderator());
create policy "moderation_actions read" on public.moderation_actions for select
  using (public.is_moderator());
create policy "moderation_actions insert" on public.moderation_actions for insert
  with check (public.is_moderator() and moderator_id = auth.uid());
