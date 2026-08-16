-- 0007_media.sql
-- Images + rights (spec §12, §40). Every image keeps creator/source/licence/
-- attribution; community uploads must carry an ownership declaration.

create table public.images (
  id uuid primary key default extensions.uuid_generate_v4(),
  storage_path text not null,       -- path in Supabase Storage (or external URL)
  caption text,
  alt_text text,
  width integer,
  height integer,
  -- Optional link to the entity the image depicts.
  entity_type public.entity_type,
  entity_id uuid,
  uploaded_by uuid references public.profiles (id) on delete set null,
  is_community boolean not null default false,
  moderation_status public.moderation_state not null default 'approved',
  created_at timestamptz not null default now()
);
create index images_entity_idx on public.images (entity_type, entity_id);
create index images_uploader_idx on public.images (uploaded_by);

create table public.image_rights (
  image_id uuid primary key references public.images (id) on delete cascade,
  creator text,
  source text,
  licence text,
  attribution text,
  licence_url text,
  source_url text,
  -- Community upload terms: uploader declares they have the right to submit.
  ownership_declared boolean not null default false,
  created_at timestamptz not null default now()
);

-- Deferred FKs from 0005 now that `images` exists.
alter table public.people
  add constraint people_portrait_fk
  foreign key (portrait_image_id) references public.images (id) on delete set null;
alter table public.objects
  add constraint objects_image_fk
  foreign key (image_id) references public.images (id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.images enable row level security;
alter table public.image_rights enable row level security;

-- Approved images are public; uploaders and moderators see their pending ones.
create policy "images read" on public.images for select
  using (moderation_status = 'approved' or uploaded_by = auth.uid() or public.is_moderator());

-- Authenticated users may upload, but only as themselves and only as community
-- content awaiting moderation (spec §40). Editors/service handle canonical media.
create policy "images community insert" on public.images for insert to authenticated
  with check (uploaded_by = auth.uid() and is_community = true and moderation_status = 'submitted');

-- Uploaders may edit/remove their own images while not yet approved.
create policy "images owner update" on public.images for update
  using (uploaded_by = auth.uid() and moderation_status <> 'approved')
  with check (uploaded_by = auth.uid());
create policy "images owner delete" on public.images for delete
  using (uploaded_by = auth.uid() and moderation_status <> 'approved');

create policy "images editor manage" on public.images for all
  using (public.is_editor()) with check (public.is_editor());

create policy "image_rights read" on public.image_rights for select using (true);
create policy "image_rights owner write" on public.image_rights for all
  using (
    public.is_editor()
    or exists (select 1 from public.images i where i.id = image_id and i.uploaded_by = auth.uid())
  )
  with check (
    public.is_editor()
    or exists (select 1 from public.images i where i.id = image_id and i.uploaded_by = auth.uid())
  );
