-- pgTAP: the map read contract cannot be used to download a region.
--
-- The map does not exist yet. These assertions exist so that when it is built,
-- the shape it consumes is already bounded — a discovery endpoint that can be
-- coaxed into returning every place in Yorkshire is a performance incident
-- waiting for its first popular day.

begin;
create extension if not exists pgtap;
select plan(16);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test');

insert into public.places (id, slug, name, place_type, location, location_accuracy_m, content_level)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'map-abbey', 'Map Abbey', 'abbey',
   extensions.st_setsrid(extensions.st_makepoint(-1.50, 54.00), 4326)::extensions.geography, 6, 3),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'map-castle', 'Map Castle', 'castle',
   extensions.st_setsrid(extensions.st_makepoint(-1.51, 54.01), 4326)::extensions.geography, 12, 2),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'map-far-away', 'Far Away Hall', 'country_house',
   extensions.st_setsrid(extensions.st_makepoint(-3.90, 51.20), 4326)::extensions.geography, 8, 1);

insert into public.place_designations (place_id, designation, reference)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'scheduled_monument', '1000001');

-- ---------------------------------------------------------------------------
-- Geography is mandatory
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.map_places(null, null, null, null)$$,
  '22023', null, 'there is no unbounded form of the map query');

select throws_ok(
  $$select * from public.map_places(-1.6, 53.9, null, 54.1)$$,
  '22023', null, 'a half-specified viewport is refused');

-- ---------------------------------------------------------------------------
-- The viewport itself is bounded
-- ---------------------------------------------------------------------------
select throws_ok(
  -- A "viewport" spanning the country is a full scan wearing a bounding box.
  $$select * from public.map_places(-8.0, 50.0, 2.0, 59.0)$$,
  '22023', null, 'a viewport larger than the cap is refused outright');

select throws_ok(
  $$select * from public.map_places(-1.4, 54.0, -1.6, 54.1)$$,
  '22023', null, 'an inverted bounding box is refused');

select throws_ok(
  $$select * from public.map_places(-1.5, 54.0, -1.5, 54.0)$$,
  '22023', null, 'an empty bounding box is refused');

select lives_ok(
  $$select * from public.map_places(-1.6, 53.9, -1.4, 54.1)$$,
  'a reasonable viewport is served');

-- ---------------------------------------------------------------------------
-- It returns what is inside the viewport, and nothing else
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1)),
  2::bigint, 'only places inside the viewport are returned');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1) where slug = 'map-far-away'),
  0::bigint, 'a place outside the viewport is absent');

-- ---------------------------------------------------------------------------
-- The row cap is enforced server-side
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 1)),
  1::bigint, 'the caller may ask for fewer rows');

select is(
  -- Asking for a hundred thousand gets the cap, not the region.
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 100000)),
  2::bigint, 'an absurd row request is capped rather than honoured');

select is(
  (select slug from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 1)),
  'map-abbey', 'a truncated result keeps the more substantial place');

-- ---------------------------------------------------------------------------
-- The projection stays small
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from information_schema.columns
    where table_name = 'map_places' or false),
  0::bigint, 'map_places is a function, not a view over everything');

select is(
  (select place_type from public.map_places(-1.6, 53.9, -1.4, 54.1) where slug = 'map-abbey'),
  'abbey', 'the marker carries its type');

select is(
  (select primary_designation from public.map_places(-1.6, 53.9, -1.4, 54.1) where slug = 'map-abbey'),
  'scheduled_monument', 'and a primary designation when one exists');

select is(
  (select location_accuracy_m from public.map_places(-1.6, 53.9, -1.4, 54.1) where slug = 'map-abbey'),
  6::numeric, 'and its positional uncertainty, so the map can be honest about precision');

-- ---------------------------------------------------------------------------
-- Media only when the rights support it
-- ---------------------------------------------------------------------------
insert into public.images (id, storage_path, entity_type, entity_id, thumbnail_url, moderation_status)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'commons/abbey.jpg', 'place',
        'aaaaaaaa-0000-0000-0000-000000000001', 'https://example.test/thumb.jpg', 'approved');

-- No image_rights row yet: nothing may be shown.
select is(
  (select thumbnail_url from public.map_places(-1.6, 53.9, -1.4, 54.1) where slug = 'map-abbey'),
  null, 'a thumbnail with no stored rights never reaches the map');

select * from finish();
rollback;
