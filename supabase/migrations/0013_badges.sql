-- 0013_badges.sql
-- Personal travel record, not competitive gamification (spec §30). Badges are
-- awarded by a controlled server routine; users can NEVER self-award (spec §38).

create table public.badges (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  description text,
  category public.badge_category not null,
  icon text,
  -- Machine-checkable criteria, e.g.
  --   {"metric":"place_count","threshold":10}
  --   {"metric":"place_type_count","place_type":"castle","threshold":10}
  --   {"metric":"county_count","threshold":10}
  criteria jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id uuid not null references public.badges (id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
create index user_badges_user_idx on public.user_badges (user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

create policy "badges read" on public.badges for select using (true);
create policy "badges admin write" on public.badges for all
  using (public.is_admin()) with check (public.is_admin());

-- Users read their own awards; a user's public profile can surface them later
-- via a dedicated view. There is deliberately NO user insert/update policy —
-- awards happen only through the service role / an award routine (spec §38).
create policy "user_badges read own" on public.user_badges for select
  using (user_id = auth.uid() or public.is_moderator());
create policy "user_badges admin write" on public.user_badges for all
  using (public.is_admin()) with check (public.is_admin());
