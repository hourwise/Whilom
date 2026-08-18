-- Discovery readiness at real regional density.
--
-- Runs after the regional activation, against the published 23,171-place
-- dataset, and answers the question the map has to survive: what happens when
-- somebody actually looks at Yorkshire.
--
-- Five real viewports are measured, chosen because they are the shapes the map
-- will genuinely be asked for rather than the ones that flatter it:
--
--   region        the whole of WHILOM_REGION_YORKSHIRE_V1
--   urban         Leeds/Bradford, the densest corner
--   historic      central York, dense and small
--   rural         the Dales, sparse
--   empty         open sea off the coast, where the answer is nothing
--
-- Payload size is measured as the JSON the RPC would return, because "how many
-- rows" is not the question a browser cares about.

\set ON_ERROR_STOP on
\timing off
\pset pager off

create temporary table discovery_bench (
  scenario text not null,
  query_kind text not null,
  run integer not null,
  duration_ms double precision not null,
  rows_returned bigint not null,
  places_represented bigint not null,
  payload_bytes bigint not null
);

do $$
declare
  -- Viewport definitions: name, sw_lng, sw_lat, ne_lng, ne_lat, cell size.
  scenarios constant jsonb := jsonb_build_array(
    jsonb_build_object('name', 'region',   'sw_lng', -2.60, 'sw_lat', 53.20, 'ne_lng',  0.40, 'ne_lat', 54.80, 'cell', 0.15),
    jsonb_build_object('name', 'urban',    'sw_lng', -1.95, 'sw_lat', 53.75, 'ne_lng', -1.45, 'ne_lat', 53.95, 'cell', 0.03),
    jsonb_build_object('name', 'historic', 'sw_lng', -1.10, 'sw_lat', 53.94, 'ne_lng', -1.05, 'ne_lat', 53.97, 'cell', 0.005),
    jsonb_build_object('name', 'rural',    'sw_lng', -2.20, 'sw_lat', 54.20, 'ne_lng', -1.90, 'ne_lat', 54.40, 'cell', 0.03),
    jsonb_build_object('name', 'empty',    'sw_lng',  0.10, 'sw_lat', 54.10, 'ne_lng',  0.35, 'ne_lat', 54.30, 'cell', 0.03)
  );
  -- Period stops worth measuring: the ones a person is most likely to press.
  periods constant text[] := array['roman', 'medieval', 'victorian', 'wwii'];

  warmups constant integer := 2;
  runs constant integer := 15;

  s jsonb;
  p text;
  i integer;
  started timestamptz;
  elapsed double precision;
  n_rows bigint;
  n_places bigint;
  n_bytes bigint;
begin
  for i in 1 .. warmups + runs loop
    for s in select * from jsonb_array_elements(scenarios) loop

      -- --- Clusters (the broad view) ------------------------------------
      started := clock_timestamp();
      select count(*), coalesce(sum(place_count), 0),
             coalesce(octet_length(coalesce(json_agg(c)::text, '[]')), 0)
        into n_rows, n_places, n_bytes
        from public.map_clusters(
          (s->>'sw_lng')::double precision, (s->>'sw_lat')::double precision,
          (s->>'ne_lng')::double precision, (s->>'ne_lat')::double precision,
          (s->>'cell')::double precision) c;
      elapsed := extract(epoch from clock_timestamp() - started) * 1000;
      if i > warmups then
        insert into discovery_bench values
          (s->>'name', 'clusters', i - warmups, elapsed, n_rows, n_places, n_bytes);
      end if;

      -- --- Places (the close view) --------------------------------------
      -- The region viewport is larger than map_places allows on purpose, so it
      -- is skipped: refusing it is the contract working, not a gap.
      if (s->>'name') <> 'region' then
        started := clock_timestamp();
        select count(*), count(*),
               coalesce(octet_length(coalesce(json_agg(pl)::text, '[]')), 0)
          into n_rows, n_places, n_bytes
          from public.map_places(
            (s->>'sw_lng')::double precision, (s->>'sw_lat')::double precision,
            (s->>'ne_lng')::double precision, (s->>'ne_lat')::double precision,
            null, 250) pl;
        elapsed := extract(epoch from clock_timestamp() - started) * 1000;
        if i > warmups then
          insert into discovery_bench values
            (s->>'name', 'places', i - warmups, elapsed, n_rows, n_places, n_bytes);
        end if;
      end if;
    end loop;

    -- --- Temporal filtering, over the dense urban viewport ---------------
    foreach p in array periods loop
      started := clock_timestamp();
      select count(*), coalesce(sum(place_count), 0), 0
        into n_rows, n_places, n_bytes
        from public.map_clusters(-1.95, 53.75, -1.45, 53.95, 0.03,
          null, p) c;
      elapsed := extract(epoch from clock_timestamp() - started) * 1000;
      if i > warmups then
        insert into discovery_bench values
          ('urban', 'period:' || p, i - warmups, elapsed, n_rows, n_places, n_bytes);
      end if;
    end loop;

    -- --- Period + type + bbox, the combined case -------------------------
    started := clock_timestamp();
    select count(*), coalesce(sum(place_count), 0), 0
      into n_rows, n_places, n_bytes
      from public.map_clusters(-1.95, 53.75, -1.45, 53.95, 0.03,
        array['archaeological_site', 'roman_villa', 'hillfort'], 'roman') c;
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then
      insert into discovery_bench values
        ('urban', 'period+type', i - warmups, elapsed, n_rows, n_places, n_bytes);
    end if;

    -- --- Explicit date range ---------------------------------------------
    started := clock_timestamp();
    select count(*), coalesce(sum(place_count), 0), 0
      into n_rows, n_places, n_bytes
      from public.map_clusters(-1.95, 53.75, -1.45, 53.95, 0.03,
        null, null, -2200, 410) c;
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then
      insert into discovery_bench values
        ('urban', 'daterange', i - warmups, elapsed, n_rows, n_places, n_bytes);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Result
-- ---------------------------------------------------------------------------
select json_build_object(
  'publishedPlaces', (select count(*) from public.places where status = 'approved'),
  'temporal', json_build_object(
    'associations', (select count(*) from public.temporal_associations),
    'placesWithTemporal', (select count(distinct entity_id)
                             from public.temporal_associations where entity_type = 'place'),
    'coverageRate', (
      select round(
        (select count(distinct entity_id) from public.temporal_associations where entity_type = 'place')::numeric
        / greatest((select count(*) from public.places where status = 'approved'), 1), 5)),
    'byPeriod', (
      select coalesce(json_object_agg(period_id, n), '{}'::json)
        from (select period_id, count(*) as n from public.temporal_associations
               where period_id is not null group by 1 order by 2 desc) t),
    'byPrecision', (
      select coalesce(json_object_agg(precision, n), '{}'::json)
        from (select precision::text, count(*) as n from public.temporal_associations group by 1) t),
    -- The correctness claim this whole model exists to hold.
    'derivedFromDesignationDate', (
      select count(*) from public.temporal_associations
       where derivation ilike '%designat%' or derivation ilike '%listed%')
  ),
  'scenarios', (
    select json_agg(row order by row->>'scenario', row->>'queryKind') from (
      select json_build_object(
        'scenario', scenario,
        'queryKind', query_kind,
        'runs', count(*),
        'p50Ms', round(percentile_cont(0.5) within group (order by duration_ms)::numeric, 3),
        'p95Ms', round(percentile_cont(0.95) within group (order by duration_ms)::numeric, 3),
        'rowsReturned', max(rows_returned),
        'placesRepresented', max(places_represented),
        'payloadBytes', max(payload_bytes)) as row
      from discovery_bench group by scenario, query_kind) grouped),

  'gates', json_build_object(
    -- No map query may casually hand over the whole corpus.
    'noQueryReturnsTheCorpus', (
      select max(rows_returned) < 1000 from discovery_bench),
    'worstP95Ms', (
      select round(max(p95)::numeric, 3) from (
        select percentile_cont(0.95) within group (order by duration_ms) as p95
          from discovery_bench group by scenario, query_kind) t),
    'largestPayloadBytes', (select max(payload_bytes) from discovery_bench),
    'regionClusterRows', (
      select max(rows_returned) from discovery_bench
       where scenario = 'region' and query_kind = 'clusters'),
    'regionPlacesRepresented', (
      select max(places_represented) from discovery_bench
       where scenario = 'region' and query_kind = 'clusters'))
) as discovery;
