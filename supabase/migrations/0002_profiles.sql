-- 0002_profiles.sql
-- User profiles + baseline RLS (spec §16, §38).
-- A profile row is created automatically for every new auth user.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public-facing user profile, 1:1 with auth.users.';

alter table public.profiles enable row level security;

-- Anyone may read non-private profiles; owners always see their own.
create policy "profiles are readable"
  on public.profiles for select
  using (not is_private or auth.uid() = id);

-- Users may update ONLY their own profile (spec §38).
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-provision a profile when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Explorer'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
