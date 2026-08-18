-- Regional activation verification.
--
-- Runs after `activate.sql` against the same ephemeral database and emits one
-- JSON object covering the declared activation gates, canonical quality, the
-- product read paths and database growth.
--
-- Every gate here was declared in `ingestion/regional/policy.ts` before the
-- activation ran.

\set ON_ERROR_STOP on
\timing off
\pset pager off

-- ---------------------------------------------------------------------------
-- Product query timings
-- ---------------------------------------------------------------------------
create temporary table query_bench (
  id text not null,
  run integer not null,
  duration_ms double precision not null,
  rows_returned bigint not null
);

do $$
declare
  -- Leeds/Bradford: the densest corner of the region, which is the honest case
  -- for a bounded-area query. Measuring an empty moor would flatter the index.
  sw_lng constant double precision := -1.95;
  sw_lat constant double precision := 53.75;
  ne_lng constant double precision := -1.45;
  ne_lat constant double precision := 53.95;
  c_lng  constant double precision := -1.75;
  c_lat  constant double precision := 53.85;
  warmups constant integer := 3;
  runs    constant integer := 25;
  started timestamptz;
  elapsed double precision;
  found bigint;
  i integer;
  a_slug text;
  a_place uuid;
begin
  select slug, id into a_slug, a_place from public.places order by name limit 1;

  for i in 1 .. warmups + runs loop
    -- bbox: the map pan
    started := clock_timestamp();
    select count(*) into found from public.search_places(
      bbox_sw_lng => sw_lng, bbox_sw_lat => sw_lat,
      bbox_ne_lng => ne_lng, bbox_ne_lat => ne_lat, max_rows => 100);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then insert into query_bench values ('bbox', i - warmups, elapsed, found); end if;

    -- radius: "near me"
    started := clock_timestamp();
    select count(*) into found from public.search_places(
      center_lng => c_lng, center_lat => c_lat, radius_m => 5000, max_rows => 100);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then insert into query_bench values ('radius', i - warmups, elapsed, found); end if;

    -- nearest: the smallest useful radius, ordered by distance
    started := clock_timestamp();
    select count(*) into found from public.search_places(
      center_lng => c_lng, center_lat => c_lat, radius_m => 1000, max_rows => 20);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then insert into query_bench values ('nearest', i - warmups, elapsed, found); end if;

    -- text
    started := clock_timestamp();
    select count(*) into found from public.search_places(q => 'church', max_rows => 100);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then insert into query_bench values ('text-search', i - warmups, elapsed, found); end if;

    -- type filter
    started := clock_timestamp();
    select count(*) into found from public.search_places(
      place_types => array['castle', 'abbey', 'priory'], max_rows => 100);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then insert into query_bench values ('type-filter', i - warmups, elapsed, found); end if;

    -- text + geography, the commonest real combination
    started := clock_timestamp();
    select count(*) into found from public.search_places(
      q => 'hall', bbox_sw_lng => sw_lng, bbox_sw_lat => sw_lat,
      bbox_ne_lng => ne_lng, bbox_ne_lat => ne_lat, max_rows => 100);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then insert into query_bench values ('text-and-bbox', i - warmups, elapsed, found); end if;

    -- filtered bbox: type within a viewport
    started := clock_timestamp();
    select count(*) into found from public.search_places(
      place_types => array['church'], bbox_sw_lng => sw_lng, bbox_sw_lat => sw_lat,
      bbox_ne_lng => ne_lng, bbox_ne_lat => ne_lat, max_rows => 100);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then insert into query_bench values ('filtered-bbox', i - warmups, elapsed, found); end if;

    -- place detail: canonical row, designations, facts, provenance
    started := clock_timestamp();
    select (
      (select count(*) from public.places p where p.slug = a_slug)
      + (select count(*) from public.place_designations d where d.place_id = a_place)
      + (select count(*) from public.facts f where f.entity_type = 'place' and f.entity_id = a_place)
      + (select count(*) from public.source_records sr where sr.entity_type = 'place' and sr.entity_id = a_place)
      + (select count(*) from public.entity_relationships r where r.subject_type = 'place' and r.subject_id = a_place)
    ) into found;
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then insert into query_bench values ('place-detail', i - warmups, elapsed, found); end if;

    -- nearby places, as a detail page shows them
    started := clock_timestamp();
    select count(*) into found from public.search_places(
      center_lng => c_lng, center_lat => c_lat, radius_m => 2000, max_rows => 10);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then insert into query_bench values ('nearby', i - warmups, elapsed, found); end if;

    -- the bounded map projection, as the future map will call it
    started := clock_timestamp();
    select count(*) into found from public.map_places(sw_lng, sw_lat, ne_lng, ne_lat, null, 250);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then insert into query_bench values ('map-viewport', i - warmups, elapsed, found); end if;

    -- the review queue, as a reviewer opens it
    started := clock_timestamp();
    select count(*) into found from public.import_candidates
     where status = 'needs_review' and published_entity_id is null;
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then insert into query_bench values ('review-queue', i - warmups, elapsed, found); end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Result
-- ---------------------------------------------------------------------------
select json_build_object(

  'rowCounts', json_build_object(
    'places',                (select count(*) from public.places),
    'place_designations',    (select count(*) from public.place_designations),
    'source_records',        (select count(*) from public.source_records),
    'facts',                 (select count(*) from public.facts),
    'entity_relationships',  (select count(*) from public.entity_relationships),
    'import_candidates',     (select count(*) from public.import_candidates),
    'import_conflicts',      (select count(*) from public.import_conflicts),
    'import_candidates_published', (select count(*) from public.import_candidates where published_entity_id is not null),
    'review_queue',          (select count(*) from public.import_candidates where status = 'needs_review' and published_entity_id is null),
    'images',                (select count(*) from public.images),
    'people',                (select count(*) from public.people)
  ),

  'ratios', (
    select json_build_object(
      'sourceRecordsPerPlace',  round((select count(*) from public.source_records)::numeric / greatest(count(*), 1), 4),
      'factsPerPlace',          round((select count(*) from public.facts)::numeric / greatest(count(*), 1), 4),
      'relationshipsPerPlace',  round((select count(*) from public.entity_relationships)::numeric / greatest(count(*), 1), 4),
      'designationsPerPlace',   round((select count(*) from public.place_designations)::numeric / greatest(count(*), 1), 4))
    from public.places),

  -- --- Declared gates -----------------------------------------------------
  'gates', json_build_object(

    -- G4: every published canonical place traces to a source record.
    'G4_provenance', (
      select json_build_object(
        'publishedPlaces', count(*),
        'withoutSourceRecord', count(*) filter (
          where not exists (select 1 from public.source_records sr
                             where sr.entity_type = 'place' and sr.entity_id = p.id)),
        'passed', count(*) filter (
          where not exists (select 1 from public.source_records sr
                             where sr.entity_type = 'place' and sr.entity_id = p.id)) = 0)
      from public.places p
      where exists (select 1 from public.import_candidates ic where ic.published_entity_id = p.id)),

    -- G5: being in the review queue must actually prevent publication.
    'G5_review_integrity', (
      select json_build_object(
        'needsReviewWithEntity', count(*),
        'passed', count(*) = 0)
      from public.import_candidates
      where status = 'needs_review' and published_entity_id is not null),

    -- G6: no orphan facts, relationships or source records.
    'G6_publication_integrity', (
      select json_build_object(
        'orphanFacts', (select count(*) from public.facts f
                         where f.entity_type = 'place'
                           and not exists (select 1 from public.places p where p.id = f.entity_id)),
        'orphanSourceRecords', (select count(*) from public.source_records sr
                                 where sr.entity_type = 'place'
                                   and not exists (select 1 from public.places p where p.id = sr.entity_id)),
        'orphanRelationships', (select count(*) from public.entity_relationships r
                                 where r.subject_type = 'place'
                                   and not exists (select 1 from public.places p where p.id = r.subject_id)),
        'factsWithoutSource', (select count(*) from public.facts f
                                where f.source_id is null and f.entity_type = 'place'),
        'passed',
          (select count(*) from public.facts f where f.entity_type = 'place'
             and not exists (select 1 from public.places p where p.id = f.entity_id)) = 0
          and (select count(*) from public.source_records sr where sr.entity_type = 'place'
                 and not exists (select 1 from public.places p where p.id = sr.entity_id)) = 0
          and (select count(*) from public.entity_relationships r where r.subject_type = 'place'
                 and not exists (select 1 from public.places p where p.id = r.subject_id)) = 0)),

    -- G8: product queries stay interactive.
    'G8_query_usability', (
      select json_build_object(
        'worstP95Ms', max(p95),
        'passed', max(p95) <= 300)
      from (select percentile_cont(0.95) within group (order by duration_ms) as p95
              from query_bench group by id) t),

    -- G9: review load, reported not enforced.
    'G9_review_load', (
      select json_build_object(
        'reviewRows', (select count(*) from public.import_candidates
                        where status = 'needs_review' and published_entity_id is null),
        'candidates', (select count(*) from public.import_candidates),
        'reviewRate', round(
          (select count(*) from public.import_candidates
            where status = 'needs_review' and published_entity_id is null)::numeric
          / greatest((select count(*) from public.import_candidates), 1), 5)))
  ),

  -- --- Canonical quality ---------------------------------------------------
  'quality', json_build_object(
    'placeTypes', (
      select json_object_agg(place_type, n)
        from (select place_type::text, count(*) as n from public.places group by 1 order by 2 desc) t),
    'designations', (
      select coalesce(json_object_agg(designation, n), '{}'::json)
        from (select designation::text, count(*) as n from public.place_designations group by 1) t),
    'invalidCoordinates', (
      select count(*) from public.places p
       where extensions.st_x(p.location::extensions.geometry) not between -8.7 and 1.8
          or extensions.st_y(p.location::extensions.geometry) not between 49.8 and 61.0),
    'outsideRegion', (
      -- Every published place must sit inside the declared boundary. A record
      -- outside it would mean the region is not what the manifest says.
      select count(*) from public.places p
       where extensions.st_x(p.location::extensions.geometry) not between -2.6 and 0.4
          or extensions.st_y(p.location::extensions.geometry) not between 53.2 and 54.8),
    'missingAccuracy', (select count(*) from public.places where location_accuracy_m is null),
    'accuracyBands', (
      select json_object_agg(band, n) from (
        select case
          when location_accuracy_m is null then 'unknown'
          when location_accuracy_m <= 10 then '0-10m'
          when location_accuracy_m <= 50 then '11-50m'
          when location_accuracy_m <= 200 then '51-200m'
          when location_accuracy_m <= 1000 then '201-1000m'
          else 'over-1000m' end as band, count(*) as n
        from public.places group by 1) t),
    'placesWithDesignation', (
      select count(distinct place_id) from public.place_designations),
    'placesWithFacts', (
      select count(distinct entity_id) from public.facts where entity_type = 'place'),
    'factPredicates', (
      select coalesce(json_object_agg(predicate, n), '{}'::json)
        from (select predicate, count(*) as n from public.facts group by 1) t),
    -- Rights live on image_rights, not images. "Rights-ready" means stored data
    -- can support attribution for that exact file — the same bar the map
    -- contract enforces.
    'rightsReadyMedia', (
      select count(*) from public.images i
        join public.image_rights r on r.image_id = i.id
       where i.moderation_status = 'approved'
         and r.attribution is not null and r.licence is not null),
    'imagesWithoutRights', (
      select count(*) from public.images i
       where not exists (select 1 from public.image_rights r where r.image_id = i.id))
  ),

  -- --- Product queries -----------------------------------------------------
  'queries', (
    select json_agg(q order by q->>'id') from (
      select json_build_object(
        'id', id,
        'runs', count(*),
        'p50Ms', round(percentile_cont(0.5) within group (order by duration_ms)::numeric, 3),
        'p95Ms', round(percentile_cont(0.95) within group (order by duration_ms)::numeric, 3),
        'maxMs', round(max(duration_ms)::numeric, 3),
        'rows', max(rows_returned)) as q
      from query_bench group by id) grouped),

  -- --- Storage -------------------------------------------------------------
  'storage', (
    select json_build_object(
      'totalBytes', coalesce(sum(pg_total_relation_size(c.oid)), 0),
      'tables', coalesce(json_agg(json_build_object(
        'table', c.relname,
        'rows', greatest(c.reltuples::bigint, 0),
        'totalBytes', pg_total_relation_size(c.oid),
        'indexBytes', pg_indexes_size(c.oid))
        order by pg_total_relation_size(c.oid) desc), '[]'::json))
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and pg_total_relation_size(c.oid) > 0)

) as verification;
