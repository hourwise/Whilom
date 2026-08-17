-- pgTAP: canonical heritage data is editor-only to write, and the SECURITY
-- DEFINER visibility helpers are configured safely.
--
-- Community change reaches canonical data through corrections/contributions and
-- a moderator, never by direct write. That is the property under test here.
--
-- Canonical tables are closed to `authenticated` at two independent layers: no
-- INSERT/UPDATE/DELETE grant (0021) and an editor-only policy (0004). Both
-- report 42501, and the assertions below deliberately test the outcome rather
-- than which layer produced it — either one alone would be sufficient, and
-- requiring both is the point.

begin;
-- supabase test db already provides pgTAP; this keeps the file runnable on
-- its own via psql. It is never created by a migration, so the test framework
-- cannot reach a real deployment.
create extension if not exists pgtap;
select plan(18);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test');

insert into public.places (id, slug, name, place_type, location, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a-castle', 'A Castle', 'castle',
   extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography,
   'approved');

insert into public.people (id, slug, name, status) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'a-person', 'A Person', 'approved');

-- ---------------------------------------------------------------------------
-- Ordinary authenticated user
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$insert into public.places (slug, name, place_type, location)
      values ('sneaky', 'Sneaky Castle', 'castle',
              extensions.st_setsrid(extensions.st_makepoint(-1.0, 54.0), 4326)::extensions.geography)$$,
  '42501', null, 'an ordinary user cannot insert a canonical place');

-- These raise rather than affecting zero rows: `authenticated` holds no
-- UPDATE/DELETE grant on canonical tables (0021), so the privilege layer stops
-- the statement before RLS is ever consulted.
select throws_ok(
  $$update public.places set name = 'Renamed'
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', null, 'an ordinary user cannot update a canonical place');

select throws_ok(
  $$delete from public.places
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', null, 'an ordinary user cannot delete a canonical place');

select throws_ok(
  $$insert into public.place_designations (place_id, designation)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'scheduled_monument')$$,
  '42501', null, 'an ordinary user cannot attach a designation');

select throws_ok(
  $$insert into public.place_access (place_id, official_url)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'https://evil.test')$$,
  '42501', null, 'an ordinary user cannot write canonical access information');

select throws_ok(
  $$insert into public.place_facilities (place_id, facility)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'cafe')$$,
  '42501', null, 'an ordinary user cannot write canonical facilities');

select throws_ok(
  $$insert into public.entity_relationships
      (subject_type, subject_id, predicate, object_type, object_id)
    values ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'associated_with',
            'person', 'bbbbbbbb-0000-0000-0000-000000000001')$$,
  '42501', null, 'an ordinary user cannot assert a canonical relationship');

select throws_ok(
  $$insert into public.place_categories (slug, name) values ('fake', 'Fake')$$,
  '42501', null, 'an ordinary user cannot extend the canonical taxonomy');

-- The sanctioned route for user-supplied change stays open.
select lives_ok(
  $$insert into public.corrections (user_id, entity_type, entity_id, note, status)
      values ('11111111-1111-1111-1111-111111111111', 'place',
              'aaaaaaaa-0000-0000-0000-000000000001', 'Opening times are wrong.', 'submitted')$$,
  'an ordinary user can submit a correction');

select throws_ok(
  $$insert into public.corrections (user_id, entity_type, entity_id, note, status)
      values ('11111111-1111-1111-1111-111111111111', 'place',
              'aaaaaaaa-0000-0000-0000-000000000001', 'Pre-approved!', 'approved')$$,
  '42501', null, 'a user cannot submit a correction that is already approved');

-- Privilege escalation: a user must not be able to make themselves an editor.
select throws_ok(
  $$update public.profiles set role = 'editor'
      where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'an authenticated user cannot promote themselves to editor');

select ok(not public.is_editor(), 'the user is still not an editor');

reset role;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helper configuration (migration 0018)
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('place_is_public', 'route_is_public', 'collection_is_public',
                        'image_is_visible', 'current_app_role', 'is_editor',
                        'is_moderator', 'is_admin', 'guard_profile_role', 'handle_new_user')
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c
         where c like 'search_path=%')),
  0::bigint,
  'every SECURITY DEFINER function pins an explicit search_path');

select is(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and 'search_path=public' = any(coalesce(p.proconfig, array[]::text[]))),
  0::bigint,
  'no SECURITY DEFINER function resolves through the writable public schema');

-- The policies need these callable by the querying role, so this must hold.
select ok(
  has_function_privilege('anon', 'public.place_is_public(uuid)', 'execute'),
  'anon may execute place_is_public, as its RLS policies require');
select ok(
  has_function_privilege('authenticated', 'public.is_editor()', 'execute'),
  'authenticated may execute is_editor');

-- Disclosure: a hidden place and a nonexistent id must be indistinguishable.
select is(
  public.place_is_public('99999999-9999-9999-9999-999999999999'),
  false,
  'place_is_public returns false for an unknown id, revealing nothing');

select ok(
  public.place_is_public('aaaaaaaa-0000-0000-0000-000000000001'),
  'place_is_public returns true for an approved place');

select * from finish();
rollback;
