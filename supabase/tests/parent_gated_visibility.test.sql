-- pgTAP: the non-place parent-gated tables from migration 0017.
--
-- Their parent semantics are NOT the same and are asserted separately rather
-- than through one generic assumption:
--   route_stops / route_geometry  → parent route must be approved
--   collection_entities           → parent collection must be published AND approved
--   image_rights                  → parent image approved, OR owned by the caller,
--                                   OR the caller is a moderator

begin;
-- supabase test db already provides pgTAP; this keeps the file runnable on
-- its own via psql. It is never created by a migration, so the test framework
-- cannot reach a real deployment.
create extension if not exists pgtap;
select plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'other@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'moderator@example.test');

update public.profiles set role = 'editor'
  where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set role = 'moderator'
  where id = '44444444-4444-4444-4444-444444444444';

-- A place, needed by check_entity_reference() on collection_entities.
insert into public.places (id, slug, name, place_type, location, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'member-place', 'Member Place', 'castle',
   extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography,
   'approved');

-- Routes: one approved, one not.
insert into public.routes (id, slug, name, route_type, status) values
  ('dddddddd-0000-0000-0000-000000000001', 'approved-trail', 'Approved Trail', 'walking', 'approved'),
  ('dddddddd-0000-0000-0000-000000000002', 'draft-trail', 'Draft Trail', 'walking', 'submitted');

insert into public.route_stops (route_id, position, name) values
  ('dddddddd-0000-0000-0000-000000000001', 1, 'Approved Stop'),
  ('dddddddd-0000-0000-0000-000000000002', 1, 'Draft Stop');

insert into public.route_geometry (route_id, geom) values
  ('dddddddd-0000-0000-0000-000000000001',
   extensions.st_setsrid(extensions.st_makeline(
     extensions.st_makepoint(-1.5, 54.0), extensions.st_makepoint(-1.4, 54.1)), 4326)::extensions.geography),
  ('dddddddd-0000-0000-0000-000000000002',
   extensions.st_setsrid(extensions.st_makeline(
     extensions.st_makepoint(-1.3, 54.2), extensions.st_makepoint(-1.2, 54.3)), 4326)::extensions.geography);

-- Collections: published+approved, unpublished, and published-but-unapproved.
insert into public.collections (id, slug, name, is_published, status) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'live-theme', 'Live Theme', true, 'approved'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'unpublished-theme', 'Unpublished Theme', false, 'approved'),
  ('eeeeeeee-0000-0000-0000-000000000003', 'unapproved-theme', 'Unapproved Theme', true, 'submitted');

insert into public.collection_entities (collection_id, entity_type, entity_id) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'place', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'place', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000003', 'place', 'aaaaaaaa-0000-0000-0000-000000000001');

-- Images: one approved, one still awaiting moderation, owned by user 1.
insert into public.images (id, storage_path, uploaded_by, is_community, moderation_status) values
  ('ffffffff-0000-0000-0000-000000000001', 'approved.jpg',
   '11111111-1111-1111-1111-111111111111', true, 'approved'),
  ('ffffffff-0000-0000-0000-000000000002', 'pending.jpg',
   '11111111-1111-1111-1111-111111111111', true, 'submitted');

insert into public.image_rights (image_id, creator, licence) values
  ('ffffffff-0000-0000-0000-000000000001', 'A Photographer', 'CC-BY-4.0'),
  ('ffffffff-0000-0000-0000-000000000002', 'A Photographer', 'CC-BY-4.0');

-- ---------------------------------------------------------------------------
-- Routes — gated on status alone
-- ---------------------------------------------------------------------------
set local role anon;

select is((select count(*) from public.route_stops
    where route_id = 'dddddddd-0000-0000-0000-000000000001'),
  1::bigint, 'anon reads stops of an approved route');
select is((select count(*) from public.route_stops
    where route_id = 'dddddddd-0000-0000-0000-000000000002'),
  0::bigint, 'anon cannot read stops of an unapproved route');
select is((select count(*) from public.route_geometry
    where route_id = 'dddddddd-0000-0000-0000-000000000001'),
  1::bigint, 'anon reads geometry of an approved route');
select is((select count(*) from public.route_geometry
    where route_id = 'dddddddd-0000-0000-0000-000000000002'),
  0::bigint, 'anon cannot read geometry of an unapproved route');

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*) from public.route_stops
    where route_id = 'dddddddd-0000-0000-0000-000000000002'),
  1::bigint, 'an editor reads stops of an unapproved route');
select is((select count(*) from public.route_geometry
    where route_id = 'dddddddd-0000-0000-0000-000000000002'),
  1::bigint, 'an editor reads geometry of an unapproved route');
reset role;

-- ---------------------------------------------------------------------------
-- Collections — gated on BOTH is_published and status
-- ---------------------------------------------------------------------------
set local role anon;

select is((select count(*) from public.collection_entities
    where collection_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  1::bigint, 'anon reads members of a published, approved collection');
select is((select count(*) from public.collection_entities
    where collection_id = 'eeeeeeee-0000-0000-0000-000000000002'),
  0::bigint, 'anon cannot read members of an unpublished collection');
select is((select count(*) from public.collection_entities
    where collection_id = 'eeeeeeee-0000-0000-0000-000000000003'),
  0::bigint, 'anon cannot read members of a published but unapproved collection');

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*) from public.collection_entities
    where collection_id = 'eeeeeeee-0000-0000-0000-000000000002'),
  1::bigint, 'an editor reads members of an unpublished collection');
select is((select count(*) from public.collection_entities
    where collection_id = 'eeeeeeee-0000-0000-0000-000000000003'),
  1::bigint, 'an editor reads members of an unapproved collection');
reset role;

-- ---------------------------------------------------------------------------
-- Image rights — approved, or owned by the caller, or moderator
-- ---------------------------------------------------------------------------
set local role anon;
select is((select count(*) from public.image_rights
    where image_id = 'ffffffff-0000-0000-0000-000000000001'),
  1::bigint, 'anon reads rights of an approved image');
select is((select count(*) from public.image_rights
    where image_id = 'ffffffff-0000-0000-0000-000000000002'),
  0::bigint, 'anon cannot read rights of an unmoderated image');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select count(*) from public.image_rights
    where image_id = 'ffffffff-0000-0000-0000-000000000002'),
  1::bigint, 'an uploader reads rights of their own unmoderated image');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select count(*) from public.image_rights
    where image_id = 'ffffffff-0000-0000-0000-000000000002'),
  0::bigint, 'another user cannot read rights of someone else''s unmoderated image');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is((select count(*) from public.image_rights
    where image_id = 'ffffffff-0000-0000-0000-000000000002'),
  1::bigint, 'a moderator reads rights of an unmoderated image');
reset role;

select * from finish();
rollback;
