-- pgTAP: coverage truthfulness, display categories and the four time modes.
--
-- The claim being protected here is the one that matters most for a UK-wide map
-- sitting on regional data: an empty map means Whilom has not got there yet, and
-- must never be read as "nothing historic here".

begin;
create extension if not exists pgtap;
select plan(26);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test');

insert into public.sources (id, kind, name)
values ('50000000-0000-0000-0000-000000000001', 'open_data', 'NHLE');

insert into public.places (id, slug, name, place_type, location, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'roman-fort', 'Roman fort', 'roman_villa',
   extensions.st_setsrid(extensions.st_makepoint(-1.50, 54.00), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'tudor-hall', 'Tudor hall', 'country_house',
   extensions.st_setsrid(extensions.st_makepoint(-1.51, 54.01), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'undated-barn', 'Undated barn', 'building',
   extensions.st_setsrid(extensions.st_makepoint(-1.52, 54.02), 4326)::extensions.geography, 'approved');

insert into public.temporal_associations
  (entity_type, entity_id, association_type, start_year, end_year, precision, period_id, source_id) values
  ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'built', 43, 409, 'period', 'roman',
   '50000000-0000-0000-0000-000000000001'),
  ('place', 'aaaaaaaa-0000-0000-0000-000000000002', 'built', 1485, 1602, 'period', 'tudor',
   '50000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Display categories
-- ---------------------------------------------------------------------------
select is(public.place_display_category('church')::text, 'religious', 'a church is religious');
select is(public.place_display_category('castle')::text, 'fortification', 'a castle is a fortification');
select is(public.place_display_category('roman_villa')::text, 'archaeology', 'a villa is archaeology');
select is(public.place_display_category('country_house')::text, 'building', 'a country house is a building');
select is(public.place_display_category('canal_structure')::text, 'industrial', 'a lock is industrial');

-- `structure` and `unknown` are honest fallbacks and must stay honest: forcing
-- them into a more interesting group would be a lie told in colour.
select is(public.place_display_category('structure')::text, 'other', 'an unclassified structure is other');
select is(public.place_display_category('unknown')::text, 'other', 'and so is an unknown');

select ok(
  (select count(distinct public.place_display_category(t)) from unnest(enum_range(null::public.place_type)) t) <= 10,
  'the whole taxonomy collapses to at most ten legend entries');

-- ---------------------------------------------------------------------------
-- Coverage
-- ---------------------------------------------------------------------------
select is(
  (select round(covered_fraction::numeric, 2) from public.coverage_for_viewport(-1.6, 53.9, -1.4, 54.1)),
  1.00, 'a viewport wholly inside the activated region is fully covered');

select is(
  (select round(covered_fraction::numeric, 2) from public.coverage_for_viewport(-5.2, 50.1, -5.0, 50.3)),
  0.00, 'a viewport in Cornwall is outside coverage entirely');

select ok(
  (select covered_fraction from public.coverage_for_viewport(-3.5, 53.0, 0.5, 55.0)) between 0.01 and 0.99,
  'a viewport straddling the boundary is partially covered — the case a boolean would misreport');

select is(
  (select region_names[1] from public.coverage_for_viewport(-1.6, 53.9, -1.4, 54.1)),
  'Yorkshire and the surrounding area', 'and it names what is covered');

-- Outside coverage there are no places, and that is a statement about Whilom
-- rather than about the place.
select is(
  (select count(*) from public.map_places(-5.2, 50.1, -5.0, 50.3)),
  0::bigint, 'no records outside coverage');

select ok(
  (select covered_fraction from public.coverage_for_viewport(-5.2, 50.1, -5.0, 50.3)) = 0,
  'and coverage says why: Whilom has not activated here, not that history is absent');

-- ---------------------------------------------------------------------------
-- Time modes
-- ---------------------------------------------------------------------------
-- All time: everything, dated or not.
select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'all', null)),
  3::bigint, 'All time returns every published place, including undated ones');

-- At this time.
select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'at', 200)),
  1::bigint, 'At AD 200 finds the Roman fort');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'at', 1500)),
  1::bigint, 'At 1500 finds the Tudor hall instead');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'at', 800)),
  0::bigint, 'At 800 finds neither — a gap in Whilom, not in history');

-- Up to this time.
select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'until', 1600)),
  2::bigint, 'Up to 1600 includes everything that had begun by then');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'until', 100)),
  1::bigint, 'Up to AD 100 includes only the Roman fort');

-- From this time.
select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'from', 1000)),
  1::bigint, 'From 1000 keeps the Tudor hall and drops the Roman fort');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'from', 1)),
  2::bigint, 'From AD 1 keeps both');

-- The undated barn belongs to no restrictive mode. A record with no temporal
-- evidence must not acquire relevance to a year somebody happened to choose.
select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'at', 1900) where slug = 'undated-barn'),
  0::bigint, 'an undated place never matches a selected year');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'all', null) where slug = 'undated-barn'),
  1::bigint, 'but is still there under All time');

-- The between-range filter survives alongside the modes.
select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, 1485, 1603)),
  1::bigint, 'the explicit range still works');

-- ---------------------------------------------------------------------------
-- Period counts
-- ---------------------------------------------------------------------------
select is(
  (select place_count from public.period_counts_for_viewport(-1.6, 53.9, -1.4, 54.1)
    where period_id = 'roman'),
  1::bigint, 'the Roman period counts one record here');

select is(
  (select place_count from public.period_counts_for_viewport(-1.6, 53.9, -1.4, 54.1)
    where period_id = 'victorian'),
  0::bigint, 'and the Victorian period counts none — which is a fact about Whilom, not the past');

select is(
  (select count(*) from public.period_counts_for_viewport(-1.6, 53.9, -1.4, 54.1)),
  21::bigint, 'every period is reported, so a zero is visible rather than absent');

select * from finish();
rollback;
