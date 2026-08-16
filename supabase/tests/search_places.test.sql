-- pgTAP test for the search_places RPC (run with `supabase test db`).
-- Assumes seed data loaded.

begin;
select plan(3);

-- Text search finds the abbey.
select ok(
  exists (select 1 from public.search_places(q => 'Fountains') where slug = 'fountains-abbey'),
  'text search matches Fountains Abbey'
);

-- Type filter excludes non-castles.
select is(
  (select count(*) from public.search_places(place_types => array['castle'])
    where place_type <> 'castle'),
  0::bigint,
  'castle filter returns only castles'
);

-- Radius around Ripon (near Fountains) finds it within 10km.
select ok(
  exists (
    select 1 from public.search_places(
      center_lng => -1.5836, center_lat => 54.1108, radius_m => 10000
    ) where slug = 'fountains-abbey'
  ),
  'radius query finds nearby abbey'
);

select * from finish();
rollback;
