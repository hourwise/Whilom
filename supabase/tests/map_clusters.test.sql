-- pgTAP: the public map shows published heritage and nothing else.
--
-- Two separate claims are held here. First, that a broad view aggregates rather
-- than shipping every place — the whole of Yorkshire is 23,171 points and no
-- browser should be asked to receive them to draw a dozen legible blobs.
-- Second, that the map is a view of the governed publication system and not a
-- window into the ingestion staging area.

begin;
create extension if not exists pgtap;
select plan(20);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.test');
update public.profiles set role = 'editor' where id = '22222222-2222-2222-2222-222222222222';

insert into public.sources (id, kind, name)
values ('50000000-0000-0000-0000-000000000001', 'open_data', 'NHLE');

-- Two tight knots of places plus one outlier, so aggregation has something to do.
insert into public.places (slug, name, place_type, location, status, content_level)
select
  'cluster-a-' || i, 'Cluster A ' || i, 'building',
  extensions.st_setsrid(extensions.st_makepoint(-1.500 + i * 0.0001, 54.000 + i * 0.0001), 4326)::extensions.geography,
  'approved', 1
from generate_series(1, 40) i;

insert into public.places (slug, name, place_type, location, status, content_level)
select
  'cluster-b-' || i, 'Cluster B ' || i, 'church',
  extensions.st_setsrid(extensions.st_makepoint(-1.200 + i * 0.0001, 54.200 + i * 0.0001), 4326)::extensions.geography,
  'approved', 1
from generate_series(1, 25) i;

insert into public.places (slug, name, place_type, location, status, content_level)
values ('lonely', 'Lonely Barn', 'building',
  extensions.st_setsrid(extensions.st_makepoint(-1.900, 54.400), 4326)::extensions.geography, 'approved', 1);

-- Not published. Must never reach the public map by any route.
insert into public.places (id, slug, name, place_type, location, status)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'draft-hall', 'Draft Hall', 'country_house',
  extensions.st_setsrid(extensions.st_makepoint(-1.501, 54.001), 4326)::extensions.geography, 'needs_review');

-- ---------------------------------------------------------------------------
-- Aggregation
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.map_clusters(-2.0, 53.8, -1.0, 54.5, 0.1)),
  3::bigint, 'a broad view returns one cell per knot of places, not one row per place');

select is(
  (select sum(place_count) from public.map_clusters(-2.0, 53.8, -1.0, 54.5, 0.1)),
  66::bigint, 'and the cell counts add up to every published place in view');

select ok(
  (select max(place_count) from public.map_clusters(-2.0, 53.8, -1.0, 54.5, 0.1)) = 40,
  'the largest cell holds the largest knot');

select ok(
  (select count(*) from public.map_clusters(-2.0, 53.8, -1.0, 54.5, 0.1))
    < (select count(*) from public.places where status = 'approved'),
  'aggregating sends strictly less than sending every place');

-- Zooming in on one knot resolves it into places.
select is(
  (select count(*) from public.map_places(-1.51, 53.99, -1.49, 54.01, null, 500)),
  40::bigint, 'a close viewport returns the individual places');

-- ---------------------------------------------------------------------------
-- Only published data
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.map_clusters(-2.0, 53.8, -1.0, 54.5, 0.1)
    where sample_name = 'Draft Hall'),
  0::bigint, 'an unpublished place is not sampled into a cluster');

select is(
  (select sum(place_count) from public.map_clusters(-1.51, 53.99, -1.49, 54.01, 0.1)),
  40::bigint, 'nor counted in one — the draft hall sits inside this cell and is excluded');

select is(
  (select count(*) from public.map_places(-1.51, 53.99, -1.49, 54.01, null, 500)
    where slug = 'draft-hall'),
  0::bigint, 'and never appears as a marker');

-- ---------------------------------------------------------------------------
-- Filters apply before aggregation
-- ---------------------------------------------------------------------------
-- A cluster count that ignored the filter would be worse than no count at all:
-- it would tell the user there are 40 churches here when there are none.
select is(
  (select coalesce(sum(place_count), 0) from public.map_clusters(
    -2.0, 53.8, -1.0, 54.5, 0.1, array['church'])),
  25::bigint, 'filtering by type changes the cluster counts, not just the markers');

select is(
  (select count(*) from public.map_clusters(-2.0, 53.8, -1.0, 54.5, 0.1, array['castle'])),
  0::bigint, 'a filter matching nothing produces no cells rather than empty ones');

-- ---------------------------------------------------------------------------
-- Bounds
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.map_clusters(null, null, null, null)$$,
  '22023', null, 'clusters still require a bounding box');

select throws_ok(
  $$select * from public.map_clusters(-1.4, 54.0, -1.6, 54.1)$$,
  '22023', null, 'an inverted cluster box is refused');

-- The cell size is clamped, so "aggregation" cannot be turned into one cell per
-- place by asking for an absurdly fine grid.
select ok(
  (select count(*) from public.map_clusters(-2.0, 53.8, -1.0, 54.5, 0.0000001))
    <= 2000,
  'an absurdly fine grid is clamped rather than honoured');

select ok(
  (select count(*) from public.map_clusters(-2.0, 53.8, -1.0, 54.5, 0.1, null, null, null, null, null, null, false, 2))
    <= 2,
  'the number of cells returned is capped');

-- ---------------------------------------------------------------------------
-- The map is not a window into staging
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '';
set local role anon;

select ok(
  (select count(*) from public.map_places(-1.51, 53.99, -1.49, 54.01, null, 500)) > 0,
  'an anonymous visitor can discover published heritage');

select ok(
  (select count(*) from public.map_clusters(-2.0, 53.8, -1.0, 54.5, 0.1)) > 0,
  'and can see cluster density');

select throws_ok(
  $$select count(*) from public.import_candidates$$,
  '42501', null, 'but cannot read import candidates');

select throws_ok(
  $$select count(*) from public.import_conflicts$$,
  '42501', null, 'nor unresolved review conflicts');

select is(
  (select count(*) from public.map_places(-1.51, 53.99, -1.49, 54.01, null, 500)
    where slug = 'draft-hall'),
  0::bigint, 'and still cannot see unpublished places');

reset role;

-- ---------------------------------------------------------------------------
-- An ordinary signed-in user gains no canonical write power
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$insert into public.places (slug, name, place_type, location)
     values ('sneaky', 'Sneaky', 'building',
       extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography)$$,
  '42501', null, 'an ordinary user cannot create a canonical place');

reset role;

select * from finish();
rollback;
