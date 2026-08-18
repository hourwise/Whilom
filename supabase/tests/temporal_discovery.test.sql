-- pgTAP: time, honestly modelled.
--
-- The rule these exist to hold: a building listed in 1967 was not built in 1967.
-- Whilom would rather say "we do not know when this was built" than fill a map
-- with Victorian abbeys.

begin;
create extension if not exists pgtap;
select plan(27);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.test');
update public.profiles set role = 'editor' where id = '22222222-2222-2222-2222-222222222222';

insert into public.sources (id, kind, name)
values ('50000000-0000-0000-0000-000000000001', 'open_data', 'NHLE');

insert into public.places (id, slug, name, place_type, location, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'roman-villa', 'Roman villa', 'roman_villa',
   extensions.st_setsrid(extensions.st_makepoint(-1.50, 54.00), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'iron-age-fort', 'Iron Age hillfort', 'hillfort',
   extensions.st_setsrid(extensions.st_makepoint(-1.51, 54.01), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'undated-barn', 'A barn', 'building',
   extensions.st_setsrid(extensions.st_makepoint(-1.52, 54.02), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'hidden-place', 'Hidden', 'building',
   extensions.st_setsrid(extensions.st_makepoint(-1.53, 54.03), 4326)::extensions.geography, 'needs_review');

-- ---------------------------------------------------------------------------
-- The period registry is a navigation vocabulary
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.historical_periods), 21::bigint,
  'the registry spans prehistory to today');

select ok(
  (select start_year from public.historical_periods where id = 'iron_age') < 0,
  'the Iron Age starts before the common era');

select is(
  (select end_year from public.historical_periods where id = 'iron_age'), -43,
  'and ends at the conventional Roman invasion, as a negative year');

select is(
  (select start_year from public.historical_periods where id = 'roman'), 43,
  'Roman Britain starts in a positive year');

-- No year zero: -1 is 1 BCE and 1 is 1 CE, which is what every source uses even
-- though it makes the arithmetic awkward.
select throws_ok(
  $$insert into public.historical_periods (id, display_name, start_year, end_year, display_order)
    values ('bad', 'Bad', 0, 100, 999)$$,
  '23514', null, 'year zero is rejected in the registry');

select throws_ok(
  $$insert into public.historical_periods (id, display_name, start_year, end_year, display_order)
    values ('backwards', 'Backwards', 100, 50, 999)$$,
  '23514', null, 'a period cannot end before it starts');

-- ---------------------------------------------------------------------------
-- Temporal associations
-- ---------------------------------------------------------------------------
insert into public.temporal_associations
  (entity_type, entity_id, association_type, start_year, end_year, precision, period_id,
   source_id, original_text, derivation)
values
  ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'built', 43, 409, 'period', 'roman',
   '50000000-0000-0000-0000-000000000001', 'Roman', 'source names the period'),
  ('place', 'aaaaaaaa-0000-0000-0000-000000000002', 'built', -800, -43, 'period', 'iron_age',
   '50000000-0000-0000-0000-000000000001', 'Iron Age', 'source names the period');

select throws_ok(
  $$insert into public.temporal_associations (entity_type, entity_id, association_type, start_year, end_year)
    values ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'built', 0, 100)$$,
  '23514', null, 'year zero is rejected in a temporal claim too');

select throws_ok(
  $$insert into public.temporal_associations (entity_type, entity_id, association_type, start_year, end_year)
    values ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'built', 1500, 1400)$$,
  '23514', null, 'a claim cannot end before it starts');

select is(
  (select precision::text from public.temporal_associations
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'period', 'a period-level claim says so rather than pretending to a year');

select isnt(
  (select original_text from public.temporal_associations
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  null, 'the source''s own words are kept as the evidence');

select isnt(
  (select source_id from public.temporal_associations
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  null, 'and the claim is attributable');

-- ---------------------------------------------------------------------------
-- Matching a period: overlap, not containment
-- ---------------------------------------------------------------------------
select ok(
  public.place_matches_period('aaaaaaaa-0000-0000-0000-000000000001', 'roman'),
  'a Roman villa matches Roman Britain');

select ok(
  not public.place_matches_period('aaaaaaaa-0000-0000-0000-000000000001', 'victorian'),
  'and does not match the Victorian period');

select ok(
  public.place_matches_period('aaaaaaaa-0000-0000-0000-000000000002', 'iron_age'),
  'a BCE claim matches its BCE period');

select ok(
  not public.place_matches_period('aaaaaaaa-0000-0000-0000-000000000003', 'roman'),
  'a place with no temporal claim matches nothing, rather than everything');

-- A claim spanning a boundary belongs to both sides of it.
insert into public.temporal_associations
  (entity_type, entity_id, association_type, start_year, end_year, precision,
   source_id, original_text)
values
  ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'built', 1450, 1600, 'range',
   '50000000-0000-0000-0000-000000000001', 'C15-C16');

select ok(
  public.place_matches_period('aaaaaaaa-0000-0000-0000-000000000003', 'medieval'),
  'a span crossing a boundary matches the earlier period');

select ok(
  public.place_matches_period('aaaaaaaa-0000-0000-0000-000000000003', 'tudor'),
  'and the later one — overlap, not containment');

select ok(
  not public.place_matches_period('aaaaaaaa-0000-0000-0000-000000000003', 'victorian'),
  'but not a period it never reached');

-- A claim spanning BCE into CE must not be broken by the missing year zero.
insert into public.temporal_associations
  (entity_type, entity_id, association_type, start_year, end_year, precision,
   source_id, original_text)
values
  ('place', 'aaaaaaaa-0000-0000-0000-000000000002', 'existed', -100, 200, 'range',
   '50000000-0000-0000-0000-000000000001', 'late Iron Age into the Roman period');

select ok(
  public.place_matches_period('aaaaaaaa-0000-0000-0000-000000000002', 'roman'),
  'a claim crossing the BCE/CE boundary reaches the Roman period');

select ok(
  public.place_matches_period('aaaaaaaa-0000-0000-0000-000000000002', 'iron_age'),
  'and still reaches the Iron Age');

-- ---------------------------------------------------------------------------
-- The map respects time
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1)),
  3::bigint, 'with no period selected, every published place is offered');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, 'roman')),
  -- Two: the villa, and the hillfort whose "late Iron Age into the Roman
  -- period" span reaches forward into it. Overlap is the point.
  2::bigint, 'selecting Roman narrows to the places with a claim reaching it');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, 'victorian')),
  0::bigint, 'a period Whilom holds no records for returns nothing — which is not the same as nothing existing');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, -1000, -1)),
  1::bigint, 'a BCE date range finds the BCE place');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, 1, 500)),
  2::bigint, 'a CE range finds the Roman villa and the claim that crosses into it');

-- ---------------------------------------------------------------------------
-- Designation dates must never become historic dates
-- ---------------------------------------------------------------------------
insert into public.place_designations (place_id, designation, reference)
values ('aaaaaaaa-0000-0000-0000-000000000003', 'listed_building', '1234567');

insert into public.facts (entity_type, entity_id, predicate, value, source_id)
values ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'first_designated',
        '"1967-05-12"'::jsonb, '50000000-0000-0000-0000-000000000001');

-- The barn was listed in 1967. Nothing about that may make it a 1967 building.
select is(
  (select count(*) from public.temporal_associations
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000003'
      and start_year >= 1960 and start_year <= 1975),
  0::bigint, 'a listing date does not become a construction date');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, 'postwar')),
  0::bigint, 'and the barn does not appear under Post-war because of when it was listed');

select * from finish();
rollback;
