-- pgTAP: the vocabulary and constraints added in 0019 and 0020.
--
-- These assert the things the TypeScript side assumes: that ordinary heritage
-- can be classified, that a location method must come from the controlled
-- vocabulary, and that accuracy is either a non-negative number or genuinely
-- absent.

begin;
-- supabase test db already provides pgTAP; this keeps the file runnable on
-- its own via psql. It is never created by a migration, so the test framework
-- cannot reach a real deployment.
create extension if not exists pgtap;
select plan(14);

-- ---------------------------------------------------------------------------
-- 0019: ordinary listed heritage has somewhere honest to go
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.places (slug, name, place_type, location)
      values ('a-listed-building', 'The Old Rectory', 'building',
              extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography)$$,
  'an ordinary listed building can be classified as `building`');

select lives_ok(
  $$insert into public.places (slug, name, place_type, location)
      values ('a-listed-structure', 'Numbers 12 And 14 And Attached Railings', 'structure',
              extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography)$$,
  'an untypeable built work can be classified as `structure`');

select throws_ok(
  $$insert into public.places (slug, name, place_type, location)
      values ('nonsense-type', 'Nonsense', 'wharehouse',
              extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography)$$,
  '22P02', null, 'a place_type outside the vocabulary is rejected');

select has_column('public', 'places', 'location_method', 'places records how its coordinate was derived');
select has_column('public', 'places', 'location_accuracy_m', 'places records how good its coordinate is');

-- ---------------------------------------------------------------------------
-- 0020: location method is a controlled vocabulary
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.places (slug, name, place_type, location, location_method, location_accuracy_m)
      values ('a-centroid', 'A Precinct', 'abbey',
              extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography,
              'geometry_centroid', 327.0)$$,
  'a polygon centroid can be recorded with its real uncertainty');

select throws_ok(
  $$insert into public.places (slug, name, place_type, location, location_method)
      values ('bad-method', 'Bad Method', 'castle',
              extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography,
              'vibes')$$,
  '22P02', null, 'a location_method outside the vocabulary is rejected');

-- Negative uncertainty is meaningless, and would quietly widen the matcher's
-- agreement radius if it ever reached it.
select throws_ok(
  $$insert into public.places (slug, name, place_type, location, location_accuracy_m)
      values ('negative-accuracy', 'Negative', 'castle',
              extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography,
              -1)$$,
  '23514', null, 'a negative location accuracy is rejected');

-- Unknown accuracy must stay expressible: NULL means "nobody has assessed
-- this", which is different from claiming a figure.
select lives_ok(
  $$insert into public.places (slug, name, place_type, location, location_accuracy_m)
      values ('unknown-accuracy', 'Unknown', 'castle',
              extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography,
              null)$$,
  'an unassessed coordinate may leave accuracy null');

select is(
  (select count(*) from unnest(enum_range(null::public.location_method))),
  9::bigint,
  'the location_method vocabulary has all nine documented values');

-- ---------------------------------------------------------------------------
-- 0020: source-level position provenance
-- ---------------------------------------------------------------------------
select has_column('public', 'source_records', 'source_crs',
  'source_records keeps the CRS the source published in');
select has_column('public', 'source_records', 'coordinate_conversion',
  'source_records keeps which transformation was applied');

-- A real place and source, so the polymorphic-reference trigger passes and the
-- constraint under test is genuinely the thing that fires.
insert into public.places (id, slug, name, place_type, location)
  values ('dddddddd-0000-0000-0000-000000000001', 'provenance-place', 'Provenance Place', 'castle',
          extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography);
insert into public.sources (id, kind, name)
  values ('99999999-0000-0000-0000-000000000001', 'open_data', 'A Source');

select lives_ok(
  $$insert into public.source_records
      (source_id, entity_type, entity_id, source_lng, source_lat, source_crs,
       source_coordinates, coordinate_conversion, source_precision_m,
       location_accuracy_m, location_method)
    values ('99999999-0000-0000-0000-000000000001', 'place',
            'dddddddd-0000-0000-0000-000000000001', -1.581068, 54.109724, 'EPSG:27700',
            '{"easting":427487,"northing":468286}'::jsonb,
            'osgb36-to-wgs84/helmert-7param@0.1.0', 1.0, 5.6, 'source_coordinate')$$,
  'a source record can retain the coordinate as published and how it was converted');

select throws_ok(
  $$insert into public.source_records
      (source_id, entity_type, entity_id, source_precision_m)
    values ('99999999-0000-0000-0000-000000000001', 'place',
            'dddddddd-0000-0000-0000-000000000001', -5)$$,
  '23514', null, 'a negative source-stated precision is rejected');

select * from finish();
rollback;
