-- pgTAP tests for 0017_child_row_visibility.sql (run with `supabase test db`).
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ STATUS: NOT YET EXECUTED.                                                │
-- │                                                                          │
-- │ These tests have never been run against a database. The batch that added │
-- │ them was under a local-storage gate — Docker was not installed and the   │
-- │ C: drive had ~6 GB free, so no local Supabase stack could be started     │
-- │ without a large download onto a nearly-full disk, and no hosted project  │
-- │ exists. Treat them as unverified until `supabase test db` has passed.    │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- What they assert: a child row attached to a place is visible to the public
-- only when its parent place is approved, editors still see everything, and an
-- ordinary authenticated user cannot write canonical heritage records.

begin;
select plan(11);

-- ---------------------------------------------------------------------------
-- Fixtures, created as the superuser so RLS does not interfere with setup.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'reader@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.test');

-- handle_new_user() has already created the profiles; promote one to editor.
update public.profiles set role = 'editor'
  where id = '22222222-2222-2222-2222-222222222222';

insert into public.places (id, slug, name, place_type, location, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'approved-castle', 'Approved Castle',
   'castle', extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography,
   'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'draft-castle', 'Draft Castle',
   'castle', extensions.st_setsrid(extensions.st_makepoint(-1.6, 54.1), 4326)::extensions.geography,
   'submitted');

insert into public.place_designations (place_id, designation, grade, reference) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'listed_building', 'I', 'NHLE-APPROVED'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'listed_building', 'I', 'NHLE-DRAFT');

insert into public.place_access (place_id, official_url) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'https://example.test/approved'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'https://example.test/draft');

insert into public.place_facilities (place_id, facility) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'parking'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'parking');

insert into public.place_categories (id, slug, name) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'fortifications', 'Fortifications');
insert into public.place_category_links (place_id, category_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Anonymous reader
-- ---------------------------------------------------------------------------
set local role anon;

select is(
  (select count(*) from public.place_designations where reference = 'NHLE-APPROVED'),
  1::bigint,
  'anon reads designations of an approved place'
);

select is(
  (select count(*) from public.place_designations where reference = 'NHLE-DRAFT'),
  0::bigint,
  'anon cannot read designations of an unapproved place'
);

select is(
  (select count(*) from public.place_access
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0::bigint,
  'anon cannot read access detail of an unapproved place'
);

select is(
  (select count(*) from public.place_facilities
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0::bigint,
  'anon cannot read facilities of an unapproved place'
);

select is(
  (select count(*) from public.place_category_links
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0::bigint,
  'anon cannot infer an unapproved place exists from its category links'
);

select is(
  (select count(*) from public.place_category_links
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1::bigint,
  'anon still reads category links of an approved place'
);

-- Taxonomy itself stays globally readable: it names no place.
select is(
  (select count(*) from public.place_categories where slug = 'fortifications'),
  1::bigint,
  'anon reads the category vocabulary'
);

reset role;

-- ---------------------------------------------------------------------------
-- Editor
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*) from public.place_designations where reference = 'NHLE-DRAFT'),
  1::bigint,
  'an editor reads designations of an unapproved place'
);

select is(
  (select count(*) from public.place_access
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  1::bigint,
  'an editor reads access detail of an unapproved place'
);

reset role;

-- ---------------------------------------------------------------------------
-- Ordinary authenticated user may not write canonical heritage records
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$insert into public.places (slug, name, place_type, location)
      values ('sneaky', 'Sneaky Castle', 'castle',
              extensions.st_setsrid(extensions.st_makepoint(-1.0, 54.0), 4326)::extensions.geography)$$,
  '42501',
  null,
  'an ordinary user cannot insert a canonical place'
);

select throws_ok(
  $$insert into public.place_designations (place_id, designation)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'scheduled_monument')$$,
  '42501',
  null,
  'an ordinary user cannot attach a designation to a canonical place'
);

reset role;

select * from finish();
rollback;
