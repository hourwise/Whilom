-- 0017_child_row_visibility.sql
-- Close a read-disclosure gap in the child-row policies (spec §38).
--
-- 0004/0010/0012 gate their PARENT tables correctly (`places`, `routes` and
-- `collections` are only publicly readable when approved/published) but gave the
-- attached child tables a blanket `using (true)` read policy. PostgREST lets a
-- client query those child tables directly, so a draft or rejected place still
-- leaked its designations (NHLE reference + grade), access detail, facilities,
-- accessibility notes and taxonomy links — and the existence of its id. The same
-- pattern applied to unapproved routes (`route_stops`, `route_geometry`),
-- unpublished collections (`collection_entities`) and unapproved images
-- (`image_rights`, which carries creator/licence/source URLs).
--
-- The contract this migration enforces:
--   public users may read a child row only when its parent is publicly visible;
--   editors (and the service role, which bypasses RLS) keep full read access.
--
-- Genuinely global lookup tables are deliberately left world-readable: they hold
-- no per-entity data and carry no parent to gate against —
--   place_categories, place_tags   (taxonomy vocabularies)
--   sources                        (registry of datasets we import from)
--   badges                         (badge catalogue)

-- ---------------------------------------------------------------------------
-- Visibility helpers. SECURITY DEFINER + fixed search_path, matching the
-- is_editor()/is_moderator() pattern in 0003: a policy that re-queried the
-- parent directly would evaluate the parent's own RLS a second time per row.
-- These only read a status column, so they disclose nothing by themselves.
-- ---------------------------------------------------------------------------
create or replace function public.place_is_public(p_place_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.places p
    where p.id = p_place_id and p.status = 'approved'
  );
$$;

comment on function public.place_is_public(uuid) is
  'True when the place is approved, i.e. readable by anon/authenticated. Used by child-table RLS.';

create or replace function public.route_is_public(p_route_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.routes r
    where r.id = p_route_id and r.status = 'approved'
  );
$$;

comment on function public.route_is_public(uuid) is
  'True when the route is approved. Used by route child-table RLS.';

create or replace function public.collection_is_public(p_collection_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.collections c
    where c.id = p_collection_id and c.is_published and c.status = 'approved'
  );
$$;

comment on function public.collection_is_public(uuid) is
  'True when the collection is published and approved. Used by collection child-table RLS.';

-- Mirrors the "images read" policy in 0007: approved, or the caller's own upload.
-- Moderator access is added in the policy itself so it stays visible there.
create or replace function public.image_is_visible(p_image_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.images i
    where i.id = p_image_id
      and (i.moderation_status = 'approved' or i.uploaded_by = auth.uid())
  );
$$;

comment on function public.image_is_visible(uuid) is
  'True when the image is approved or owned by the caller. Used by image_rights RLS.';

-- ---------------------------------------------------------------------------
-- Place child rows (0004)
-- ---------------------------------------------------------------------------
drop policy "category_links read" on public.place_category_links;
create policy "category_links read" on public.place_category_links for select
  using (public.is_editor() or public.place_is_public(place_id));

drop policy "tag_links read" on public.place_tag_links;
create policy "tag_links read" on public.place_tag_links for select
  using (public.is_editor() or public.place_is_public(place_id));

drop policy "designations read" on public.place_designations;
create policy "designations read" on public.place_designations for select
  using (public.is_editor() or public.place_is_public(place_id));

drop policy "access read" on public.place_access;
create policy "access read" on public.place_access for select
  using (public.is_editor() or public.place_is_public(place_id));

drop policy "facilities read" on public.place_facilities;
create policy "facilities read" on public.place_facilities for select
  using (public.is_editor() or public.place_is_public(place_id));

drop policy "accessibility read" on public.place_accessibility;
create policy "accessibility read" on public.place_accessibility for select
  using (public.is_editor() or public.place_is_public(place_id));

-- ---------------------------------------------------------------------------
-- Route child rows (0010)
-- ---------------------------------------------------------------------------
drop policy "route_stops read" on public.route_stops;
create policy "route_stops read" on public.route_stops for select
  using (public.is_editor() or public.route_is_public(route_id));

drop policy "route_geometry read" on public.route_geometry;
create policy "route_geometry read" on public.route_geometry for select
  using (public.is_editor() or public.route_is_public(route_id));

-- ---------------------------------------------------------------------------
-- Collection child rows (0012)
-- ---------------------------------------------------------------------------
drop policy "collection_entities read" on public.collection_entities;
create policy "collection_entities read" on public.collection_entities for select
  using (public.is_editor() or public.collection_is_public(collection_id));

-- ---------------------------------------------------------------------------
-- Image rights (0007)
-- ---------------------------------------------------------------------------
drop policy "image_rights read" on public.image_rights;
create policy "image_rights read" on public.image_rights for select
  using (public.is_moderator() or public.image_is_visible(image_id));

-- ---------------------------------------------------------------------------
-- Supporting indexes for the parent lookups these policies now perform.
-- (Parent PKs already cover the exists() probes; these cover the child side of
-- joins that previously never needed to filter by parent.)
-- ---------------------------------------------------------------------------
create index if not exists place_category_links_place_idx on public.place_category_links (place_id);
create index if not exists place_tag_links_place_idx on public.place_tag_links (place_id);
