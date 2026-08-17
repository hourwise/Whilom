-- pgTAP: place child-row visibility (migration 0017).
--
-- Contract under test:
--   a public reader may read a child row only when its parent place is
--   approved; an editor keeps full access; merely authenticating grants
--   nothing extra.
--
-- Note that reads here depend on BOTH halves of Postgres' access control: the
-- GRANTs in 0021 and the policies in 0004/0017. Missing grants is what made
-- every one of these fail the first time the schema actually ran.

begin;
-- supabase test db already provides pgTAP; this keeps the file runnable on
-- its own via psql. It is never created by a migration, so the test framework
-- cannot reach a real deployment.
create extension if not exists pgtap;
select plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures. Created as the migration/superuser role, which bypasses RLS.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'reader@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.test');

-- handle_new_user() has already created both profiles. Promoting one is only
-- possible because 0018 allows a role change when auth.uid() is NULL (a trusted
-- server-side context); under 0003 alone this statement aborted the whole file.
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

insert into public.place_accessibility (place_id, feature) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'wheelchair_access'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'wheelchair_access');

insert into public.place_categories (id, slug, name)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'fortifications', 'Fortifications');
insert into public.place_category_links (place_id, category_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.place_tags (id, slug, name)
  values ('cccccccc-0000-0000-0000-000000000001', 'norman', 'Norman');
insert into public.place_tag_links (place_id, tag_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Anonymous reader
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '';
set local role anon;

select is((select count(*) from public.places where slug = 'approved-castle'),
  1::bigint, 'anon reads an approved place');
select is((select count(*) from public.places where slug = 'draft-castle'),
  0::bigint, 'anon cannot read an unapproved place');

select is((select count(*) from public.place_designations where reference = 'NHLE-APPROVED'),
  1::bigint, 'anon reads designations of an approved place');
select is((select count(*) from public.place_designations where reference = 'NHLE-DRAFT'),
  0::bigint, 'anon cannot read designations of an unapproved place');

select is((select count(*) from public.place_access
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1::bigint, 'anon reads access detail of an approved place');
select is((select count(*) from public.place_access
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0::bigint, 'anon cannot read access detail of an unapproved place');

select is((select count(*) from public.place_facilities
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1::bigint, 'anon reads facilities of an approved place');
select is((select count(*) from public.place_facilities
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0::bigint, 'anon cannot read facilities of an unapproved place');

select is((select count(*) from public.place_accessibility
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1::bigint, 'anon reads accessibility of an approved place');
select is((select count(*) from public.place_accessibility
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0::bigint, 'anon cannot read accessibility of an unapproved place');

select is((select count(*) from public.place_category_links
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1::bigint, 'anon reads category links of an approved place');
select is((select count(*) from public.place_category_links
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0::bigint, 'anon cannot enumerate an unapproved place through its category links');

select is((select count(*) from public.place_tag_links
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1::bigint, 'anon reads tag links of an approved place');
select is((select count(*) from public.place_tag_links
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0::bigint, 'anon cannot enumerate an unapproved place through its tag links');

-- The vocabularies themselves name no place and stay globally readable.
select is((select count(*) from public.place_categories where slug = 'fortifications'),
  1::bigint, 'anon reads the category vocabulary');
select is((select count(*) from public.place_tags where slug = 'norman'),
  1::bigint, 'anon reads the tag vocabulary');

reset role;

-- ---------------------------------------------------------------------------
-- Editor: retains access to unapproved canonical content
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*) from public.places where slug = 'draft-castle'),
  1::bigint, 'an editor reads an unapproved place');
select is((select count(*) from public.place_designations where reference = 'NHLE-DRAFT'),
  1::bigint, 'an editor reads designations of an unapproved place');
select is((select count(*) from public.place_access
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  1::bigint, 'an editor reads access detail of an unapproved place');
select is((select count(*) from public.place_facilities
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  1::bigint, 'an editor reads facilities of an unapproved place');
select is((select count(*) from public.place_category_links
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  1::bigint, 'an editor reads category links of an unapproved place');

reset role;

-- ---------------------------------------------------------------------------
-- Ordinary authenticated user: authenticating grants nothing extra
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select ok(not public.is_editor(), 'an ordinary authenticated user is not an editor');
select is((select count(*) from public.places where slug = 'draft-castle'),
  0::bigint, 'an ordinary authenticated user cannot read an unapproved place');
select is((select count(*) from public.place_designations where reference = 'NHLE-DRAFT'),
  0::bigint, 'an ordinary authenticated user cannot read its designations');

reset role;

select * from finish();
rollback;
