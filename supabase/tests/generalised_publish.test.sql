-- pgTAP: generalised fact and relationship publication (migration 0024).
--
-- The properties under test: publication is no longer limited to two hard-coded
-- fields, every published claim keeps its source, agreement between independent
-- sources stays two attributable claims, and a reimport changes nothing.

begin;
create extension if not exists pgtap;
select plan(31);

-- ---------------------------------------------------------------------------
-- Actors and sources
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.test');
update public.profiles set role = 'editor' where id = '22222222-2222-2222-2222-222222222222';

insert into public.sources (id, kind, name, licence, attribution) values
  ('50000000-0000-0000-0000-000000000001', 'open_data', 'National Heritage List for England',
   'OGL-UK-3.0', 'Contains Historic England information © Historic England.'),
  ('50000000-0000-0000-0000-000000000002', 'open_data', 'Wikidata',
   'CC0-1.0', 'Wikidata contributors, CC0 1.0');

insert into public.import_sources (id, key, display_name, adapter, source_id) values
  ('51000000-0000-0000-0000-000000000001', 'historic-england-nhle', 'NHLE', 'nhle',
   '50000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000002', 'wikidata', 'Wikidata', 'wikidata',
   '50000000-0000-0000-0000-000000000002');

insert into public.import_runs (id, import_source_id) values
  ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001'),
  ('52000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002');

create or replace function pg_temp.candidate(
  p_source text, p_external text, p_name text, p_facts jsonb, p_people jsonb
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'provenance', jsonb_build_object(
      'sourceId', p_source, 'sourceRecordId', p_external,
      'originalUrl', 'https://example.test/' || p_external,
      'licence', 'OGL-UK-3.0', 'attribution', 'Test attribution',
      'retrievedAt', '2026-08-17T00:00:00.000Z',
      'importerVersion', '1.0.0', 'importRunId', 'r'),
    'name', p_name,
    'placeType', 'castle',
    'location', jsonb_build_object('lng', -1.5, 'lat', 54.0),
    'locationMethod', 'source_coordinate',
    'locationAccuracyMeters', 10,
    'designations', '[]'::jsonb,
    'externalIds', '[]'::jsonb,
    'facts', p_facts,
    'relatedPeople', p_people);
$$;

-- Candidate 1: a rich set of facts, none of them the old hard-coded pair only.
insert into public.import_candidates (id, import_run_id, entity_type, normalised, status)
values ('53000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'place',
  pg_temp.candidate('historic-england-nhle', 'NH-1', 'Generalised Castle',
    '[{"predicate":"inception_year","value":1132,"sourceValue":"1132"},
      {"predicate":"official_website","value":"https://example.org/gc"},
      {"predicate":"commons_category","value":"Category:Generalised Castle"},
      {"predicate":"designation_reference","value":"NH-1"},
      {"predicate":"former_name","value":"Olde Castle"},
      {"predicate":"area_hectares","value":12.5}]'::jsonb,
    '[{"label":"Titus Salt","role":"founder","externalId":"Q333333"}]'::jsonb),
  'approved');

-- ---------------------------------------------------------------------------
-- Registry
-- ---------------------------------------------------------------------------
select ok(
  (select count(*) from public.fact_predicates) >= 10,
  'the publishable fact vocabulary is registered in the database');

select ok(
  exists (select 1 from public.fact_predicates where predicate = 'inception_year'),
  'inception_year is a registered predicate, not a special case in code');

-- ---------------------------------------------------------------------------
-- Publish as editor
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-000000000001')$$,
  'a candidate with six different facts publishes');
reset role;

select is(
  (select count(*) from public.facts f join public.places p on p.id = f.entity_id
    where p.name = 'Generalised Castle'),
  6::bigint, 'all six facts were published, not just the two once hard-coded');

select is(
  (select value #>> '{}' from public.facts f join public.places p on p.id = f.entity_id
    where p.name = 'Generalised Castle' and f.predicate = 'commons_category'),
  'Category:Generalised Castle', 'a fact the old engine dropped is now published');

select is(
  (select f.source_value from public.facts f join public.places p on p.id = f.entity_id
    where p.name = 'Generalised Castle' and f.predicate = 'inception_year'),
  '1132', 'the value as the source expressed it is retained');

select is(
  (select count(*) from public.facts f join public.places p on p.id = f.entity_id
    where p.name = 'Generalised Castle' and f.source_record_id is null),
  0::bigint, 'every published fact points at the source record that asserted it');

-- Canonical value -> fact -> source record -> source -> external record.
select is(
  (select s.name from public.facts f
     join public.source_records sr on sr.id = f.source_record_id
     join public.sources s on s.id = sr.source_id
     join public.places p on p.id = f.entity_id
    where p.name = 'Generalised Castle' and f.predicate = 'area_hectares'),
  'National Heritage List for England',
  'a published fact traces back to the source that made the claim');

-- ---------------------------------------------------------------------------
-- Relationships
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.entity_relationships er
     join public.places p on p.id = er.subject_id
    where p.name = 'Generalised Castle'),
  1::bigint, 'the place-person relationship was materialised into the graph');

select is(
  (select pe.name from public.entity_relationships er
     join public.people pe on pe.id = er.object_id
     join public.places p on p.id = er.subject_id
    where p.name = 'Generalised Castle'),
  'Titus Salt', 'the person named by the source now exists as an entity');

select is(
  (select er.predicate from public.entity_relationships er
     join public.places p on p.id = er.subject_id
    where p.name = 'Generalised Castle'),
  'associated_with', 'a founder maps to an existing domain predicate, not a new one');

select alike(
  (select er.note from public.entity_relationships er
     join public.places p on p.id = er.subject_id
    where p.name = 'Generalised Castle'),
  '%founder%', 'the source''s own role wording survives the mapping');

select is(
  (select count(*) from public.entity_relationships er
     join public.places p on p.id = er.subject_id
    where p.name = 'Generalised Castle' and er.source_record_id is null),
  0::bigint, 'no relationship is published as an untraceable graph edge');

select is(
  (select count(*) from public.source_records sr
     join public.people pe on pe.id = sr.entity_id
    where sr.entity_type = 'person' and sr.external_id = 'Q333333'),
  1::bigint, 'the created person carries a source record of their own');

-- ---------------------------------------------------------------------------
-- Reimport: the same external record arrives again in a later run.
--
-- Modelled as a NEW candidate carrying the same source and external id, matched
-- to the place the first run produced — which is what a reimport actually looks
-- like. (Clearing published_entity_id would not be a reimport; it would be a
-- fresh candidate, and would correctly create a second place.)
-- ---------------------------------------------------------------------------
insert into public.import_candidates (id, import_run_id, entity_type, normalised, status, matched_entity_id)
select '53000000-0000-0000-0000-00000000000a', '52000000-0000-0000-0000-000000000001', 'place',
       c.normalised, 'approved', c.published_entity_id
  from public.import_candidates c where c.id = '53000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-00000000000a')$$,
  'reimporting the same source record succeeds');
reset role;

select is(
  (select count(*) from public.facts f join public.places p on p.id = f.entity_id
    where p.name = 'Generalised Castle'),
  6::bigint, 'reimporting did not duplicate any fact');

select is(
  (select count(*) from public.entity_relationships er
     join public.places p on p.id = er.subject_id
    where p.name = 'Generalised Castle'),
  1::bigint, 'reimporting did not duplicate the relationship');

select is(
  (select count(*) from public.people where name = 'Titus Salt'),
  1::bigint, 'reimporting did not create a second person');

-- ---------------------------------------------------------------------------
-- A second, independent source agreeing must stay separately attributable
-- ---------------------------------------------------------------------------
insert into public.import_candidates (id, import_run_id, entity_type, normalised, status, matched_entity_id)
select '53000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000002', 'place',
       pg_temp.candidate('wikidata', 'Q900001', 'Generalised Castle',
         '[{"predicate":"inception_year","value":1132}]'::jsonb,
         '[{"label":"Titus Salt","role":"founder","externalId":"Q333333"}]'::jsonb),
       'approved', c.published_entity_id
  from public.import_candidates c where c.id = '53000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-000000000002')$$,
  'a second source publishing the same claim succeeds');
reset role;

select is(
  (select count(*) from public.facts f join public.places p on p.id = f.entity_id
    where p.name = 'Generalised Castle' and f.predicate = 'inception_year'),
  2::bigint,
  'two independent sources asserting 1132 remain two attributable claims');

select is(
  (select count(distinct f.source_id) from public.facts f join public.places p on p.id = f.entity_id
    where p.name = 'Generalised Castle' and f.predicate = 'inception_year'),
  2::bigint, 'and they are attributed to different sources');

select is(
  (select count(*) from public.entity_relationships er
     join public.places p on p.id = er.subject_id
    where p.name = 'Generalised Castle'),
  2::bigint,
  'the same relationship from a second source is a second attributable edge');

select is(
  (select count(*) from public.places where name = 'Generalised Castle'),
  1::bigint, 'the second source attached rather than duplicating the place');

-- ---------------------------------------------------------------------------
-- Unregistered predicates are refused
-- ---------------------------------------------------------------------------
insert into public.import_candidates (id, import_run_id, entity_type, normalised, status)
values ('53000000-0000-0000-0000-000000000003', '52000000-0000-0000-0000-000000000001', 'place',
  pg_temp.candidate('historic-england-nhle', 'NH-3', 'Bad Predicate Castle',
    '[{"predicate":"favourite_colour","value":"blue"}]'::jsonb, '[]'::jsonb),
  'approved');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-000000000003')$$,
  '23514', null, 'an unregistered fact predicate is refused');
reset role;

-- Atomicity: the refused publish must have left nothing behind.
select is(
  (select count(*) from public.places where name = 'Bad Predicate Castle'),
  0::bigint, 'a failed publish rolled back the place it had already created');

select is(
  (select published_entity_id from public.import_candidates
    where id = '53000000-0000-0000-0000-000000000003'),
  null, 'a failed publish left the candidate unpublished');

-- ---------------------------------------------------------------------------
-- Preview mutates nothing and is editor-only
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '';
set local role anon;
select throws_ok(
  $$select public.preview_import_candidate('53000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon cannot preview a candidate');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$select public.preview_import_candidate('53000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'an ordinary authenticated user cannot preview a candidate');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select public.preview_import_candidate('53000000-0000-0000-0000-000000000003') ->> 'action'),
  'create_new_place', 'the preview reports what publication would do');
select is(
  (select jsonb_array_length(
     public.preview_import_candidate('53000000-0000-0000-0000-000000000001') -> 'facts')),
  6, 'the preview lists every fact publication would write');
reset role;

select is(
  (select count(*) from public.places where name = 'Bad Predicate Castle'),
  0::bigint, 'previewing created nothing');

select * from finish();
rollback;
