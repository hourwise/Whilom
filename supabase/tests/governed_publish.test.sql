-- pgTAP: the governed REVIEW → PUBLISH transaction (migration 0023).
--
-- The property under test throughout: a canonical value can always be traced
-- back to the external record that produced it, and nothing reaches canonical
-- data except through publish_import_candidate() with its checks satisfied.

begin;
create extension if not exists pgtap;
select plan(30);

-- ---------------------------------------------------------------------------
-- Actors
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'moderator@example.test');

update public.profiles set role = 'editor'    where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set role = 'moderator' where id = '44444444-4444-4444-4444-444444444444';

-- ---------------------------------------------------------------------------
-- A citable source and the importer that maps to it
-- ---------------------------------------------------------------------------
insert into public.sources (id, kind, name, publisher, licence, attribution)
values ('50000000-0000-0000-0000-000000000001', 'open_data',
        'National Heritage List for England', 'Historic England', 'OGL-UK-3.0',
        'Contains Historic England information © Historic England.');

insert into public.import_sources (id, key, display_name, adapter, licence, source_id)
values ('51000000-0000-0000-0000-000000000001', 'historic-england-nhle',
        'Historic England NHLE', 'nhle-adapter', 'OGL-UK-3.0',
        '50000000-0000-0000-0000-000000000001');

insert into public.import_runs (id, import_source_id)
values ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001');

-- A second, independent source, so attaching one is a real cross-source case.
insert into public.sources (id, kind, name, publisher, licence, attribution)
values ('50000000-0000-0000-0000-000000000002', 'open_data', 'Wikidata', 'Wikidata contributors',
        'CC0-1.0', 'Wikidata contributors, CC0 1.0');
insert into public.import_sources (id, key, display_name, adapter, licence, source_id)
values ('51000000-0000-0000-0000-000000000002', 'wikidata', 'Wikidata', 'wikidata-adapter',
        'CC0-1.0', '50000000-0000-0000-0000-000000000002');

-- A normalised candidate, in the shape the ingestion pipeline emits.
create or replace function pg_temp.candidate_json(p_name text, p_external text, p_lng double precision, p_lat double precision)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'provenance', jsonb_build_object(
      'sourceId', 'historic-england-nhle',
      'sourceRecordId', p_external,
      'originalUrl', 'https://historicengland.org.uk/listing/the-list/list-entry/' || p_external,
      'licence', 'OGL-UK-3.0',
      'attribution', 'Contains Historic England information © Historic England.',
      'retrievedAt', '2026-08-17T00:00:00.000Z',
      'importerVersion', '0.1.0',
      'importRunId', 'test-run'),
    'name', p_name,
    'placeType', 'castle',
    'location', jsonb_build_object('lng', p_lng, 'lat', p_lat),
    'locationMethod', 'source_coordinate',
    'locationAccuracyMeters', 5.6,
    'sourcePosition', jsonb_build_object(
      'crs', 'EPSG:27700',
      'coordinates', jsonb_build_object('lng', p_lng, 'lat', p_lat),
      'conversion', 'osgb36-to-wgs84/helmert-7param@0.1.0',
      'sourcePrecisionMeters', 1.0),
    'designations', jsonb_build_array(jsonb_build_object(
      'designation', 'listed_building', 'grade', 'I', 'reference', p_external)),
    'externalIds', jsonb_build_array(jsonb_build_object('scheme', 'nhle', 'value', p_external)),
    'inceptionYear', 1190,
    'officialWebsite', 'https://example.org/' || p_external
  );
$$;

insert into public.import_candidates (id, import_run_id, entity_type, normalised, status)
values
  -- approved, no match: should create a new canonical place
  ('53000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'place',
   pg_temp.candidate_json('Test Castle', '9000001', -1.5, 54.0), 'approved'),
  -- approved, still awaiting review
  ('53000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000001', 'place',
   pg_temp.candidate_json('Needs Review Castle', '9000002', -1.6, 54.1), 'needs_review'),
  -- rejected
  ('53000000-0000-0000-0000-000000000003', '52000000-0000-0000-0000-000000000001', 'place',
   pg_temp.candidate_json('Rejected Castle', '9000003', -1.7, 54.2), 'rejected'),
  -- approved but carries an unresolved conflict
  ('53000000-0000-0000-0000-000000000004', '52000000-0000-0000-0000-000000000001', 'place',
   pg_temp.candidate_json('Conflicted Castle', '9000004', -1.8, 54.3), 'approved');

insert into public.import_conflicts (import_candidate_id, entity_type, field, existing_value, incoming_value, conflict_reason)
values ('53000000-0000-0000-0000-000000000004', 'place', 'place_type',
        '"castle"'::jsonb, '"country_house"'::jsonb, 'sources describe incompatible kinds of place');

-- ---------------------------------------------------------------------------
-- Authorisation
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '';
set local role anon;
select throws_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon cannot publish');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'an ordinary authenticated user cannot publish');
select throws_ok(
  $$select public.resolve_import_conflict(
      (select id from public.import_conflicts limit 1), 'keep_canonical')$$,
  '42501', null, 'an ordinary authenticated user cannot resolve a conflict');
reset role;

-- ---------------------------------------------------------------------------
-- Editor: state machine
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select throws_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-000000000002')$$,
  '23514', null, 'a candidate still awaiting review cannot be published');

select throws_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-000000000003')$$,
  '23514', null, 'a rejected candidate cannot be published');

select throws_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-000000000004')$$,
  '23514', null, 'a candidate with an unresolved conflict cannot be published');

select throws_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-0000000000ff')$$,
  'P0002', null, 'publishing an unknown candidate fails rather than inventing one');

-- --- New canonical entity --------------------------------------------------
select lives_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-000000000001', 'first publish')$$,
  'an approved, conflict-free candidate publishes');

select is(
  (select count(*) from public.places where name = 'Test Castle'),
  1::bigint, 'publishing created exactly one canonical place');

select is(
  (select place_type::text from public.places where name = 'Test Castle'),
  'castle', 'the canonical place carries the normalised type');

select is(
  (select location_method::text from public.places where name = 'Test Castle'),
  'source_coordinate', 'positional method survived publication');

select isnt(
  (select location_accuracy_m from public.places where name = 'Test Castle'),
  null, 'positional accuracy survived publication');

-- --- Provenance invariant --------------------------------------------------
select is(
  (select count(*) from public.source_records sr
     join public.places p on p.id = sr.entity_id
    where p.name = 'Test Castle' and sr.external_id = '9000001'),
  1::bigint, 'a source record links the canonical place to the external record');

select is(
  (select sr.licence from public.source_records sr
     join public.places p on p.id = sr.entity_id
    where p.name = 'Test Castle'),
  'OGL-UK-3.0', 'the licence travelled with the published record');

select is(
  (select sr.source_crs from public.source_records sr
     join public.places p on p.id = sr.entity_id
    where p.name = 'Test Castle'),
  'EPSG:27700', 'the original coordinate reference system survived');

select isnt(
  (select sr.raw from public.source_records sr
     join public.places p on p.id = sr.entity_id
    where p.name = 'Test Castle'),
  null, 'the original payload is retained for audit');

-- Canonical value -> fact -> source -> original external record.
select is(
  (select s.name
     from public.facts f
     join public.sources s on s.id = f.source_id
     join public.places p on p.id = f.entity_id
    where p.name = 'Test Castle' and f.predicate = 'inception_year'),
  'National Heritage List for England',
  'every published fact names the source it came from');

select is(
  (select count(*) from public.place_designations pd
     join public.places p on p.id = pd.place_id
    where p.name = 'Test Castle' and pd.reference = '9000001'),
  1::bigint, 'the designation was attached with its list-entry reference');

-- --- Idempotency -----------------------------------------------------------
select is(
  (select public.publish_import_candidate('53000000-0000-0000-0000-000000000001')),
  (select published_entity_id from public.import_candidates
    where id = '53000000-0000-0000-0000-000000000001'),
  'republishing returns the same entity');

select is(
  (select count(*) from public.places where name = 'Test Castle'),
  1::bigint, 'republishing did not create a second place');

select is(
  (select count(*) from public.source_records where external_id = '9000001'),
  1::bigint, 'republishing did not duplicate the source record');

select is(
  (select count(*) from public.facts f
     join public.places p on p.id = f.entity_id
    where p.name = 'Test Castle' and f.predicate = 'inception_year'),
  1::bigint, 'republishing did not duplicate the fact');

reset role;

-- ---------------------------------------------------------------------------
-- Existing canonical entity: a second source attaches, it does not duplicate
-- ---------------------------------------------------------------------------
insert into public.import_candidates (id, import_run_id, entity_type, normalised, status, matched_entity_id, match_confidence)
select '53000000-0000-0000-0000-000000000005',
       '52000000-0000-0000-0000-000000000001',
       'place',
       jsonb_set(
         pg_temp.candidate_json('Test Castle', 'Q999001', -1.50008, 54.00008),
         '{provenance,sourceId}', '"wikidata"'),
       'approved',
       c.published_entity_id,
       0.98
  from public.import_candidates c
 where c.id = '53000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-000000000005')$$,
  'a matched candidate from a second source publishes');
reset role;

select is(
  (select count(*) from public.places where name = 'Test Castle'),
  1::bigint, 'attaching a second source did not create a duplicate place');

select is(
  (select count(distinct sr.source_id) from public.source_records sr
     join public.places p on p.id = sr.entity_id
    where p.name = 'Test Castle'),
  2::bigint, 'the canonical place now carries records from both sources');

-- ---------------------------------------------------------------------------
-- Conflict resolution unblocks publication, without erasing the disagreement
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select lives_ok(
  $$select public.resolve_import_conflict(
      (select id from public.import_conflicts
        where import_candidate_id = '53000000-0000-0000-0000-000000000004'),
      'keep_canonical', 'Historic England is authoritative on designation')$$,
  'a moderator can resolve a conflict');

select is(
  (select incoming_value from public.import_conflicts
    where import_candidate_id = '53000000-0000-0000-0000-000000000004'),
  '"country_house"'::jsonb,
  'resolving a conflict does not erase what the sources actually said');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$select public.publish_import_candidate('53000000-0000-0000-0000-000000000004')$$,
  'once resolved, the candidate publishes');
reset role;

-- ---------------------------------------------------------------------------
-- Review queue contract
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(
  (select count(*) from public.import_review_queue),
  4::bigint, 'a moderator sees every candidate in the review queue');
reset role;

set local request.jwt.claims = '';
set local role anon;
select is(
  (select count(*) from public.import_review_queue),
  0::bigint, 'anon sees nothing in the review queue');
reset role;

select * from finish();
rollback;
