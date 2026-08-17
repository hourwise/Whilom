-- pgTAP: conflict resolution deterministically moves the displayed claim.
--
-- Before 0026 a reviewer could choose "accept the source value" and nothing
-- moved: the decision was recorded and then ignored. These assert that a
-- decision now changes what Whilom shows, atomically, without deleting the
-- claim that lost.

begin;
create extension if not exists pgtap;
select plan(22);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.test');
update public.profiles set role = 'editor' where id = '22222222-2222-2222-2222-222222222222';

insert into public.sources (id, kind, name) values
  ('50000000-0000-0000-0000-000000000001', 'open_data', 'NHLE'),
  ('50000000-0000-0000-0000-000000000002', 'open_data', 'Wikidata');
insert into public.import_sources (id, key, display_name, adapter, source_id) values
  ('51000000-0000-0000-0000-000000000001', 'historic-england-nhle', 'NHLE', 'nhle', '50000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000002', 'wikidata', 'Wikidata', 'wd', '50000000-0000-0000-0000-000000000002');
insert into public.import_runs (id, import_source_id) values
  ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001');

insert into public.places (id, slug, name, place_type, location)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'preferred-abbey', 'Preferred Abbey', 'abbey',
        extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography);

-- Two sources disagree about when it was founded, and both claims are stored.
insert into public.facts (id, entity_type, entity_id, predicate, value, source_id, is_preferred)
values
  ('f0000000-0000-0000-0000-000000000001', 'place', 'aaaaaaaa-0000-0000-0000-000000000001',
   'inception_year', '1132'::jsonb, '50000000-0000-0000-0000-000000000001', true),
  ('f0000000-0000-0000-0000-000000000002', 'place', 'aaaaaaaa-0000-0000-0000-000000000001',
   'inception_year', '1380'::jsonb, '50000000-0000-0000-0000-000000000002', false);

insert into public.import_candidates (id, import_run_id, entity_type, normalised, status, matched_entity_id)
values ('53000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'place',
  jsonb_build_object('provenance', jsonb_build_object('sourceId', 'wikidata')),
  'approved', 'aaaaaaaa-0000-0000-0000-000000000001');

insert into public.import_conflicts
  (id, import_candidate_id, entity_type, entity_id, field, predicate, existing_value, incoming_value)
values
  ('c0000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', 'place',
   'aaaaaaaa-0000-0000-0000-000000000001', 'inception_year', 'inception_year', '1132'::jsonb, '1380'::jsonb);

-- ---------------------------------------------------------------------------
-- Predicate cardinality drives the rule, not one blanket constraint
-- ---------------------------------------------------------------------------
select is(
  (select cardinality from public.fact_predicates where predicate = 'inception_year'),
  'single', 'a founding year has one displayed value');
select is(
  (select cardinality from public.fact_predicates where predicate = 'former_name'),
  'multi', 'a place may legitimately have several former names');

-- ---------------------------------------------------------------------------
-- Authority
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '';
set local role anon;
select throws_ok(
  $$select public.resolve_import_conflict('c0000000-0000-0000-0000-000000000001', 'accept_source_value')$$,
  '42501', null, 'anon cannot move the preferred claim');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$select public.resolve_import_conflict('c0000000-0000-0000-0000-000000000001', 'accept_source_value')$$,
  '42501', null, 'an ordinary user cannot move the preferred claim');
select is(
  (select count(*) from (
     update public.facts set is_preferred = true
      where id = 'f0000000-0000-0000-0000-000000000002' returning 1) u),
  0::bigint, 'an ordinary user cannot set a preference directly either');
reset role;

-- ---------------------------------------------------------------------------
-- ACCEPT_SOURCE_VALUE promotes the source and demotes the old value
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$select public.resolve_import_conflict('c0000000-0000-0000-0000-000000000001',
      'accept_source_value', 'Wikidata cites the foundation charter')$$,
  'an editor can resolve the conflict');
reset role;

select is(
  (select is_preferred from public.facts where id = 'f0000000-0000-0000-0000-000000000002'),
  true, 'the accepted source claim is now the displayed one');
select is(
  (select is_preferred from public.facts where id = 'f0000000-0000-0000-0000-000000000001'),
  false, 'the previously displayed claim was demoted');
select is(
  (select count(*) from public.facts
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000001' and predicate = 'inception_year'),
  2::bigint, 'both claims still exist — the losing one was demoted, not deleted');
select is(
  (select value from public.facts where id = 'f0000000-0000-0000-0000-000000000001'),
  '1132'::jsonb, 'the losing claim keeps its value');
select isnt(
  (select source_id from public.facts where id = 'f0000000-0000-0000-0000-000000000001'),
  null, 'and keeps its attribution, so "source A said X" remains answerable');

-- Idempotency: the same decision again changes nothing.
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$select public.resolve_import_conflict('c0000000-0000-0000-0000-000000000001', 'accept_source_value')$$,
  'repeating the decision succeeds');
reset role;

select is(
  (select count(*) from public.facts
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and predicate = 'inception_year' and is_preferred),
  1::bigint, 'exactly one claim is preferred after repeating the decision');

-- ---------------------------------------------------------------------------
-- KEEP_CANONICAL puts it back, without removing the source claim
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$select public.resolve_import_conflict('c0000000-0000-0000-0000-000000000001', 'keep_canonical')$$,
  'the reviewer can change their mind');
reset role;

select is(
  (select is_preferred from public.facts where id = 'f0000000-0000-0000-0000-000000000001'),
  true, 'keep_canonical restores our value as the displayed one');
select is(
  (select is_preferred from public.facts where id = 'f0000000-0000-0000-0000-000000000002'),
  false, 'and the source claim is stored but not displayed');

-- ---------------------------------------------------------------------------
-- REJECT_SOURCE_CLAIM: auditable, never displayable
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$select public.resolve_import_conflict('c0000000-0000-0000-0000-000000000001',
      'reject_source_claim', 'transcription error in the source')$$,
  'a claim can be rejected outright');
reset role;

select is(
  (select status::text from public.facts where id = 'f0000000-0000-0000-0000-000000000002'),
  'rejected', 'the rejected claim is marked rejected');
select is(
  (select count(*) from public.facts where id = 'f0000000-0000-0000-0000-000000000002'),
  1::bigint, 'but is still there, still attributable');

-- ---------------------------------------------------------------------------
-- DEFER changes nothing
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$select public.resolve_import_conflict('c0000000-0000-0000-0000-000000000001', 'defer')$$,
  'deferring succeeds');
reset role;

select is(
  (select is_preferred from public.facts where id = 'f0000000-0000-0000-0000-000000000001'),
  true, 'deferring left the displayed value exactly as it was');

-- ---------------------------------------------------------------------------
-- Multi-valued predicates keep several preferred claims
-- ---------------------------------------------------------------------------
insert into public.facts (entity_type, entity_id, predicate, value, source_id, is_preferred)
values
  ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'former_name', '"Old Abbey"'::jsonb,
   '50000000-0000-0000-0000-000000000001', true),
  ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'former_name', '"Elder Abbey"'::jsonb,
   '50000000-0000-0000-0000-000000000002', true);

select is(
  (select count(*) from public.facts
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and predicate = 'former_name' and is_preferred),
  2::bigint,
  'a multi-valued predicate is not forced down to one preferred claim');

select * from finish();
rollback;
