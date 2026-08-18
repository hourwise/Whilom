-- pgTAP: WHO — people, the graph, and what the public may see of it.
--
-- Two things are held here. That a person can be found and followed through
-- real, sourced graph edges. And that following them never becomes a way into
-- editorial staging.

begin;
create extension if not exists pgtap;
select plan(30);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.test');
update public.profiles set role = 'editor' where id = '22222222-2222-2222-2222-222222222222';

insert into public.sources (id, kind, name)
values ('50000000-0000-0000-0000-000000000001', 'open_data', 'Wikidata');

-- Two architects and a patron, plus two buildings inside coverage and one well
-- outside it.
insert into public.people (id, slug, name, birth_year, death_year, titles, status) values
  ('c0000000-0000-0000-0000-000000000001', 'jane-smith-q1', 'Jane Smith', 1820, 1889, '{architect}', 'approved'),
  ('c0000000-0000-0000-0000-000000000002', 'john-doe-q2', 'John Doe', 1835, 1901, '{architect}', 'approved'),
  ('c0000000-0000-0000-0000-000000000003', 'ada-patron-q3', 'Ada Patron', null, 1877, '{}', 'approved'),
  -- Same name, different person. Names are not identities.
  ('c0000000-0000-0000-0000-000000000004', 'jane-smith-q9', 'Jane Smith', 1650, 1710, '{}', 'approved'),
  -- Not published: must never surface.
  ('c0000000-0000-0000-0000-000000000005', 'draft-person-q8', 'Draft Person', 1900, 1950, '{}', 'needs_review');

insert into public.places (id, slug, name, place_type, location, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'moot-hall', 'Moot Hall', 'building',
   extensions.st_setsrid(extensions.st_makepoint(-1.50, 54.00), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'st-marys', 'St Mary''s Church', 'church',
   extensions.st_setsrid(extensions.st_makepoint(-1.51, 54.01), 4326)::extensions.geography, 'approved'),
  -- Cornwall: a real relationship, well outside activated coverage.
  ('aaaaaaaa-0000-0000-0000-000000000003', 'far-house', 'Far House', 'country_house',
   extensions.st_setsrid(extensions.st_makepoint(-5.05, 50.26), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'draft-hall', 'Draft Hall', 'building',
   extensions.st_setsrid(extensions.st_makepoint(-1.52, 54.02), 4326)::extensions.geography, 'needs_review');

insert into public.entity_relationships
  (subject_type, subject_id, predicate, object_type, object_id, source_id, status) values
  ('person', 'c0000000-0000-0000-0000-000000000001', 'built_by', 'place', 'aaaaaaaa-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'approved'),
  ('person', 'c0000000-0000-0000-0000-000000000001', 'built_by', 'place', 'aaaaaaaa-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'approved'),
  ('person', 'c0000000-0000-0000-0000-000000000001', 'built_by', 'place', 'aaaaaaaa-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'approved'),
  ('person', 'c0000000-0000-0000-0000-000000000002', 'built_by', 'place', 'aaaaaaaa-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'approved'),
  ('person', 'c0000000-0000-0000-0000-000000000003', 'owned_by', 'place', 'aaaaaaaa-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'approved'),
  -- Unpublished place: the edge exists but must not surface.
  ('person', 'c0000000-0000-0000-0000-000000000001', 'built_by', 'place', 'aaaaaaaa-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', 'approved'),
  -- A hidden edge between two published people.
  ('person', 'c0000000-0000-0000-0000-000000000001', 'associated_with', 'person', 'c0000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'needs_review');

-- ---------------------------------------------------------------------------
-- Dates, rendered the way people write them
-- ---------------------------------------------------------------------------
select is(public.format_historical_year(1564), '1564', 'a CE year is a plain number');
select is(public.format_historical_year(-500), '500 BCE', 'a BCE year is never shown negative');
select is(public.format_historical_year(-1), '1 BCE', 'the year before the boundary');
select is(public.format_historical_year(1), '1', 'and the year after it');
select is(public.format_historical_year(null), null, 'an unknown year stays unknown');

select is(public.person_life_dates(1820, 1889), '1820–1889', 'both dates known');
select is(public.person_life_dates(1820, null), 'b. 1820', 'only birth known');
select is(public.person_life_dates(null, 1877), 'd. 1877', 'only death known');
select is(public.person_life_dates(null, null), null,
  'neither known — and Whilom says so rather than inventing one');

-- ---------------------------------------------------------------------------
-- One search box
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.search_discovery('Jane Smith') where kind = 'person'),
  2::bigint, 'two different people share a name and both are offered');

select is(
  (select count(distinct slug) from public.search_discovery('Jane Smith') where kind = 'person'),
  2::bigint, 'each carries its own canonical identity, so they are never merged');

select is(
  (select detail from public.search_discovery('Jane Smith') where kind = 'person' and slug = 'jane-smith-q9'),
  '1650–1710', 'dates disambiguate people a name cannot');

select is(
  (select count(*) from public.search_discovery('Moot Hall') where kind = 'place'),
  1::bigint, 'the same box finds places');

select ok(
  (select lng is not null from public.search_discovery('Moot Hall') where kind = 'place'),
  'a place result carries coordinates so the map can move to it');

select is(
  (select count(*) from public.search_discovery('Draft Person')),
  0::bigint, 'an unpublished person is not searchable');

select ok(
  (select count(*) from public.search_discovery('Jane', 3)) <= 6,
  'results are capped per kind');

-- ---------------------------------------------------------------------------
-- A person's places
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.person_places('c0000000-0000-0000-0000-000000000001')),
  3::bigint, 'the architect''s three published buildings');

select is(
  (select count(*) from public.person_places('c0000000-0000-0000-0000-000000000001')
    where slug = 'draft-hall'),
  0::bigint, 'and not the unpublished one, even though the edge exists');

select is(
  (select predicate from public.person_places('c0000000-0000-0000-0000-000000000003')),
  'owned_by', 'the relationship is reported as stated, not flattened');

select is(
  (select display_category from public.person_places('c0000000-0000-0000-0000-000000000002')),
  'religious', 'and each place carries its display category');

-- A real relationship outside activated coverage is shown and labelled, rather
-- than hidden — that would be a different kind of dishonesty from overstating
-- coverage.
select is(
  (select in_coverage from public.person_places('c0000000-0000-0000-0000-000000000001')
    where slug = 'far-house'),
  false, 'a place beyond activated coverage is flagged, not dropped');

select is(
  (select in_coverage from public.person_places('c0000000-0000-0000-0000-000000000001')
    where slug = 'moot-hall'),
  true, 'and one inside it is marked as covered');

-- ---------------------------------------------------------------------------
-- The reciprocal direction
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.place_people('aaaaaaaa-0000-0000-0000-000000000001')),
  2::bigint, 'a place knows who is connected to it');

select is(
  (select life_dates from public.place_people('aaaaaaaa-0000-0000-0000-000000000003')),
  '1820–1889', 'with their dates, ready to render');

-- ---------------------------------------------------------------------------
-- Related people: only real paths
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.related_people('c0000000-0000-0000-0000-000000000001')),
  2::bigint, 'two people are reachable by a genuine shared place');

select is(
  (select relation_kind from public.related_people('c0000000-0000-0000-0000-000000000001')
    where slug = 'john-doe-q2'),
  'place', 'and the reason is stated rather than implied');

select is(
  (select shared_places from public.related_people('c0000000-0000-0000-0000-000000000001')
    where slug = 'john-doe-q2'),
  1, 'including how many places they share');

select is(
  (select count(*) from public.related_people('c0000000-0000-0000-0000-000000000004')),
  0::bigint, 'a person with no graph path has no related people — never a filler suggestion');

-- ---------------------------------------------------------------------------
-- The public boundary
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '';
set local role anon;

select ok(
  (select count(*) from public.search_discovery('Jane Smith')) > 0,
  'an anonymous visitor can search people');

select ok(
  (select count(*) from public.person_places('c0000000-0000-0000-0000-000000000001')) > 0,
  'and follow them across published places');

select is(
  (select count(*) from public.import_candidates),
  0::bigint, 'while still seeing nothing of the import queue');

-- A hidden person-to-person edge must not leak through the related-people path.
select is(
  (select count(*) from public.related_people('c0000000-0000-0000-0000-000000000001')
    where relation_kind = 'direct'),
  0::bigint, 'an unapproved relationship is not exposed as a direct connection');

reset role;

select * from finish();
rollback;
