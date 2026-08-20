-- pgTAP: the temporal evidence model.
--
-- The claim being protected is the one the whole batch rests on: a source that
-- said "14th century" must never be quoted back as a year, however convenient
-- the bounds are for filtering. Bounds and claims are different things, and the
-- database is where that distinction has to survive.
--
-- These assertions interrogate the effective schema and the live query results
-- rather than the text of any migration. That is deliberate: the Iron Age gap
-- in batch 10 survived a green test precisely because the test read an insert
-- statement instead of asking the database what it actually held.

begin;
create extension if not exists pgtap;
select plan(38);

-- The test database carries a seed, so corpus-wide counts are not this file's
-- fixtures alone. Coverage is therefore asserted as a DELTA against what was
-- already there: the arithmetic being tested is the bucketing, not the size of
-- somebody else's seed.
create temporary table coverage_baseline as select * from public.temporal_coverage();

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.test');
update public.profiles set role = 'editor' where id = '22222222-2222-2222-2222-222222222222';

insert into public.sources (id, kind, name) values
  ('50000000-0000-0000-0000-000000000001', 'open_data', 'Wikidata'),
  ('50000000-0000-0000-0000-000000000002', 'open_data', 'NHLE');

insert into public.places (id, slug, name, place_type, location, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'st-marys', 'St Mary''s Church', 'church',
   extensions.st_setsrid(extensions.st_makepoint(-1.50, 54.00), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'town-hall', 'Town Hall', 'building',
   extensions.st_setsrid(extensions.st_makepoint(-1.51, 54.01), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'plain-barn', 'Plain Barn', 'building',
   extensions.st_setsrid(extensions.st_makepoint(-1.52, 54.02), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'hillfort', 'The Hillfort', 'hillfort',
   extensions.st_setsrid(extensions.st_makepoint(-1.53, 54.03), 4326)::extensions.geography, 'approved'),
  -- Unpublished, and used only as a target for the constraint assertions below.
  -- A row inserted to prove a check constraint fires must not quietly become a
  -- fifth data point in the coverage fixture.
  ('aaaaaaaa-0000-0000-0000-000000000009', 'constraint-target', 'Constraint Target', 'building',
   extensions.st_setsrid(extensions.st_makepoint(-1.59, 54.09), 4326)::extensions.geography, 'needs_review');

-- A church with three phases: a century-precision foundation, an exact
-- rebuilding, and a period-level association. All three must survive.
insert into public.temporal_associations
  (entity_type, entity_id, association_type, start_year, end_year, precision, period_id,
   source_id, confidence, original_text, derivation, source_field, raw_value, raw_precision,
   display_label, normaliser_version) values
  ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'built', 1301, 1400, 'century', 'medieval',
   '50000000-0000-0000-0000-000000000001', 0.850, '1350-01-01T00:00:00Z',
   'Wikidata inception (P571) at century precision', 'inception (P571)',
   '1350-01-01T00:00:00Z', '7', '14th century', '1.0.0'),
  ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'altered', 1872, 1872, 'exact_year', 'victorian',
   '50000000-0000-0000-0000-000000000001', 0.850, '1872-01-01T00:00:00Z',
   'Wikidata inception (P571) at year precision', 'inception (P571)',
   '1872-01-01T00:00:00Z', '9', '1872', '1.0.0'),
  ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'associated', 1154, 1484, 'period', 'medieval',
   '50000000-0000-0000-0000-000000000002', 0.700, 'medieval moated site',
   'source names the period', 'Name', 'medieval moated site', null, 'Medieval', '1.0.0'),
  -- A town hall with only a period-level claim.
  ('place', 'aaaaaaaa-0000-0000-0000-000000000002', 'built', 1837, 1900, 'period', 'victorian',
   '50000000-0000-0000-0000-000000000002', 0.700, 'Victorian town hall',
   'source names the period', 'Name', 'Victorian town hall', null, 'Victorian', '1.0.0'),
  -- A BCE claim, to prove the boundary survives storage as well as parsing.
  ('place', 'aaaaaaaa-0000-0000-0000-000000000004', 'built', -400, -301, 'century', 'iron_age',
   '50000000-0000-0000-0000-000000000001', 0.850, '-0400-01-01T00:00:00Z',
   'Wikidata inception (P571) at century precision', 'inception (P571)',
   '-0400-01-01T00:00:00Z', '7', '4th century BCE', '1.0.0');

-- ---------------------------------------------------------------------------
-- The rule the batch exists to enforce
-- ---------------------------------------------------------------------------
select is(
  (select display_label from public.temporal_associations
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000001' and precision = 'century'),
  '14th century', 'a century claim says century');

select ok(
  (select display_label from public.temporal_associations
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000001' and precision = 'century')
    not like '%1350%',
  'and never repeats the year Wikidata happened to store it under');

select throws_ok(
  $$insert into public.temporal_associations
      (entity_type, entity_id, association_type, start_year, end_year, precision, display_label)
    values ('place', 'aaaaaaaa-0000-0000-0000-000000000009', 'built', 1301, 1400, 'century', '1350')$$,
  '23514',
  null,
  'the database refuses a century claim that displays a year');

select lives_ok(
  $$insert into public.temporal_associations
      (entity_type, entity_id, association_type, start_year, end_year, precision, display_label)
    values ('place', 'aaaaaaaa-0000-0000-0000-000000000009', 'built', 1847, 1847, 'exact_year', '1847')$$,
  'while an exact-year claim may display its year, because there the year IS the claim');

-- ---------------------------------------------------------------------------
-- Precision classes
-- ---------------------------------------------------------------------------
select is(public.temporal_precision_class('exact_year'), 'strong', 'an exact year is strong evidence');
select is(public.temporal_precision_class('century'), 'strong', 'so is a century');
select is(public.temporal_precision_class('circa'), 'strong', 'and a circa date');
select is(public.temporal_precision_class('period'), 'period',
  'a period is its own class, never counted as a date');
select is(public.temporal_precision_class('unknown'), 'unknown', 'and unknown stays unknown');

-- Every value of the enum must land somewhere. A precision that fell through
-- would vanish from every coverage report without anything failing.
select is(
  (select count(*) from unnest(enum_range(null::public.temporal_precision)) p
    where public.temporal_precision_class(p) is null),
  0::bigint, 'every precision the schema allows has a class');

-- ---------------------------------------------------------------------------
-- Coverage that cannot be inflated
-- ---------------------------------------------------------------------------
select is(
  (select c.published_places - b.published_places
     from public.temporal_coverage() c, coverage_baseline b),
  4::bigint, 'coverage counts every published place, and only published ones');

select is(
  (select c.strong - b.strong from public.temporal_coverage() c, coverage_baseline b),
  2::bigint, 'two places have evidence precise to a century or better');

select is(
  (select c.period_only - b.period_only from public.temporal_coverage() c, coverage_baseline b),
  1::bigint, 'one has a period and nothing narrower — reported separately, not as a date');

select is(
  (select c.unknown - b.unknown from public.temporal_coverage() c, coverage_baseline b),
  1::bigint, 'and one has no temporal evidence at all');

select is(
  (select strong + period_only + bounded_only + unknown from public.temporal_coverage()),
  (select published_places from public.temporal_coverage()),
  'the buckets are exclusive and account for the whole corpus');

select ok(
  (select strong_rate from public.temporal_coverage()) < (select any_rate from public.temporal_coverage()),
  'strong coverage is never reported as high as any coverage');

-- A place with both a strong and a period-level claim counts once, as strong.
select is(
  (select c.any_coverage - b.any_coverage from public.temporal_coverage() c, coverage_baseline b),
  3::bigint, 'a place with several claims is still one place');

-- ---------------------------------------------------------------------------
-- Several phases, all kept
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.place_temporal_claims('aaaaaaaa-0000-0000-0000-000000000001')),
  3::bigint, 'a church founded, rebuilt and associated keeps all three phases');

select is(
  (select label from public.place_temporal_claims('aaaaaaaa-0000-0000-0000-000000000001') limit 1),
  '1872', 'the most precise claim is offered first');

select is(
  (select association_type from public.place_temporal_claims('aaaaaaaa-0000-0000-0000-000000000001')
    where label = '14th century'),
  'built', 'and each phase keeps the kind of claim it is');

-- The whole point of keeping several: a rebuilt medieval church must be
-- findable in both centuries rather than only the most recent.
select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'at', 1350) where slug = 'st-marys'),
  1::bigint, 'the church is there in 1350');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'at', 1872) where slug = 'st-marys'),
  1::bigint, 'and still there in 1872 — the newest date did not overwrite the oldest');

-- ---------------------------------------------------------------------------
-- Provenance
-- ---------------------------------------------------------------------------
select is(
  (select source_field from public.place_temporal_claims('aaaaaaaa-0000-0000-0000-000000000001')
    where label = '14th century'),
  'inception (P571)', 'a claim names the field it came from');

select is(
  (select raw_value from public.place_temporal_claims('aaaaaaaa-0000-0000-0000-000000000001')
    where label = '14th century'),
  '1350-01-01T00:00:00Z', 'and the value exactly as the source wrote it');

select is(
  (select raw_precision from public.temporal_associations
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000001' and precision = 'century'),
  '7', 'including the source''s own statement of how precisely it knew it');

select ok(
  (select derivation is not null and derivation <> ''
     from public.temporal_associations
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000001' and precision = 'century'),
  'so "why does Whilom believe this" is answerable without reading ingestion code');

-- ---------------------------------------------------------------------------
-- BCE, and the year that does not exist
-- ---------------------------------------------------------------------------
select is(
  (select label from public.place_temporal_claims('aaaaaaaa-0000-0000-0000-000000000004')),
  '4th century BCE', 'a BCE century renders as BCE and never as a negative number');

select is(
  (select count(*) from public.temporal_associations
    where start_year = 0 or end_year = 0),
  0::bigint, 'no stored claim contains year zero');

select throws_ok(
  $$insert into public.temporal_associations
      (entity_type, entity_id, association_type, start_year, end_year, precision)
    values ('place', 'aaaaaaaa-0000-0000-0000-000000000009', 'built', 0, 100, 'range')$$,
  '23514',
  null,
  'and the database refuses one');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'at', -350) where slug = 'hillfort'),
  1::bigint, 'a BCE year selects a BCE place');

-- ---------------------------------------------------------------------------
-- Quarantine
-- ---------------------------------------------------------------------------
insert into public.temporal_quarantine (source_record_id, raw_value, reason, note) values
  ('1000001', 'various dates', 'vague_language', 'gestures at the past without dating it'),
  ('1000002', 'various dates', 'vague_language', 'gestures at the past without dating it'),
  ('1000003', 'ancient', 'vague_language', 'gestures at the past without dating it');

select is(
  (select raw_value from public.temporal_quarantine_ranking(5) limit 1),
  'various dates', 'the most frequent unhandled format ranks first');

select is(
  (select occurrences from public.temporal_quarantine_ranking(5) limit 1),
  2::bigint, 'with a count, so a future batch can see what handling it would buy');

select is(
  (select count(*) from public.temporal_quarantine),
  3::bigint, 'nothing that failed to parse was silently dropped');

-- ---------------------------------------------------------------------------
-- Rendering
-- ---------------------------------------------------------------------------
select is(
  public.temporal_claim_label('century', 1301, 1400, 'medieval', null),
  'Medieval', 'an unlabelled century claim falls back to its period, not to its bounds');

select is(
  public.temporal_claim_label('exact_year', 1847, 1847, 'victorian', null),
  '1847', 'an exact year renders as the year');

select is(
  public.temporal_claim_label('range', 1845, 1848, 'victorian', null),
  '1845–1848', 'a range renders as a range');

-- ---------------------------------------------------------------------------
-- The public boundary
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '';
set local role anon;

select ok(
  (select count(*) from public.place_temporal_claims('aaaaaaaa-0000-0000-0000-000000000001')) > 0,
  'a visitor can see why a place is dated as it is');

select is(
  (select count(*) from public.temporal_quarantine),
  0::bigint, 'but sees nothing of what Whilom failed to parse');

reset role;

select * from finish();
rollback;
