-- 0009_visits_wishlists.sql
-- Personal history (spec §16, §24, §31). Visits are private by default; a
-- public projection is exposed later via a column-limited view, never by
-- opening the base row.

create table public.visits (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  visited_on date,
  rating smallint check (rating between 1 and 5),
  minutes_spent integer check (minutes_spent is null or minutes_spent > 0),
  public_note text,
  private_note text,
  companions text,                  -- private metadata
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index visits_user_idx on public.visits (user_id);
create index visits_place_idx on public.visits (place_id);
create trigger visits_set_updated_at before update on public.visits
  for each row execute function public.set_updated_at();

create table public.visit_photos (
  visit_id uuid not null references public.visits (id) on delete cascade,
  image_id uuid not null references public.images (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (visit_id, image_id)
);

-- User-owned lists: wishlist / favourites / custom (spec §16).
create table public.wishlists (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.wishlist_kind not null default 'wishlist',
  name text not null default 'Wishlist',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wishlists_user_idx on public.wishlists (user_id);
create trigger wishlists_set_updated_at before update on public.wishlists
  for each row execute function public.set_updated_at();

create table public.wishlist_items (
  wishlist_id uuid not null references public.wishlists (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  note text,
  added_at timestamptz not null default now(),
  primary key (wishlist_id, place_id)
);

-- ---------------------------------------------------------------------------
-- RLS — strictly owner-scoped for private records (spec §38).
-- ---------------------------------------------------------------------------
alter table public.visits enable row level security;
alter table public.visit_photos enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;

create policy "visits owner all" on public.visits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "visit_photos owner all" on public.visit_photos for all
  using (exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid()))
  with check (exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid()));

-- Wishlists: owner manages; public lists are readable by anyone.
create policy "wishlists read" on public.wishlists for select
  using (user_id = auth.uid() or is_public);
create policy "wishlists owner write" on public.wishlists for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "wishlist_items read" on public.wishlist_items for select
  using (exists (select 1 from public.wishlists w
                 where w.id = wishlist_id and (w.user_id = auth.uid() or w.is_public)));
create policy "wishlist_items owner write" on public.wishlist_items for all
  using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = auth.uid()));
