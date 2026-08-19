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
  v_person uuid;
  v_p_w double precision; v_p_s double precision;
  v_p_e double precision; v_p_n double precision;
  i integer;
  started timestamptz;
  elapsed double precision;
  n_rows bigint;
  n_places bigint;
  n_bytes bigint;
begin
  -- The best-connected person, so the person lane measures a real workload
  -- rather than somebody with a single building.
  select r.subject_id into v_person
    from public.entity_relationships r
   where r.subject_type = 'person' and r.object_type = 'place' and r.status = 'approved'
   group by r.subject_id
   order by count(*) desc
   limit 1;

  -- The viewport that person actually occupies. Measuring them inside a fixed
  -- box tests nothing: the best-connected architect here worked around York,
  -- and a western box returns a truthful, useless zero. Selecting a person in
  -- the UI fits the map to their places, so the bench does the same.
  if v_person is not null then
    select min(pp.lng) - 0.05, min(pp.lat) - 0.05,
           max(pp.lng) + 0.05, max(pp.lat) + 0.05
      into v_p_w, v_p_s, v_p_e, v_p_n
      from public.person_places(v_person) pp;
    -- map_places refuses a box wider than 2.5 x 1.5 degrees. A person whose
    -- work is spread wider than that is clamped around its centre rather than
    -- dropped, so the lane still measures something.
    if v_p_e - v_p_w > 2.5 then
      v_p_w := (v_p_w + v_p_e) / 2 - 1.24; v_p_e := v_p_w + 2.48;
    end if;
    if v_p_n - v_p_s > 1.5 then
      v_p_s := (v_p_s + v_p_n) / 2 - 0.74; v_p_n := v_p_s + 1.48;
    end if;
  end if;

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

    -- --- Time modes over the dense urban viewport ------------------------
    foreach p in array array['at', 'until', 'from'] loop
      started := clock_timestamp();
      select count(*), coalesce(sum(place_count), 0), 0
        into n_rows, n_places, n_bytes
        from public.map_clusters(-1.95, 53.75, -1.45, 53.95, 0.03,
          null, null, null, null, null, null, false, 400, p, 1850) c;
      elapsed := extract(epoch from clock_timestamp() - started) * 1000;
      if i > warmups then
        insert into discovery_bench values ('urban', 'mode:' || p, i - warmups, elapsed, n_rows, n_places, n_bytes);
      end if;
    end loop;

    -- --- Period counts for the timeline ----------------------------------
    -- One grouped query for all twenty-one epochs, not one query per label.
    started := clock_timestamp();
    select count(*), coalesce(sum(place_count), 0), 0
      into n_rows, n_places, n_bytes
      from public.period_counts_for_viewport(-1.95, 53.75, -1.45, 53.95) c;
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then
      insert into discovery_bench values ('urban', 'period-counts', i - warmups, elapsed, n_rows, n_places, n_bytes);
    end if;

    -- --- Coverage for the default UK view ---------------------------------
    started := clock_timestamp();
    select count(*), 0, 0 into n_rows, n_places, n_bytes
      from public.coverage_for_viewport(-8.6, 49.9, 1.8, 60.9) c;
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then
      insert into discovery_bench values ('uk', 'coverage', i - warmups, elapsed, n_rows, n_places, n_bytes);
    end if;

    -- --- Search: places and people from one box ---------------------------
    started := clock_timestamp();
    select count(*), 0, coalesce(octet_length(coalesce(json_agg(sr)::text, '[]')), 0)
      into n_rows, n_places, n_bytes
      from public.search_discovery('hall') sr;
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then
      insert into discovery_bench values ('search', 'mixed', i - warmups, elapsed, n_rows, n_places, n_bytes);
    end if;

    started := clock_timestamp();
    select count(*), 0, 0 into n_rows, n_places, n_bytes
      from public.search_discovery('john') sr;
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then
      insert into discovery_bench values ('search', 'person', i - warmups, elapsed, n_rows, n_places, n_bytes);
    end if;

    -- --- Following a person ------------------------------------------------
    if v_person is not null then
      started := clock_timestamp();
      select count(*), count(*), coalesce(octet_length(coalesce(json_agg(pp)::text, '[]')), 0)
        into n_rows, n_places, n_bytes
        from public.person_places(v_person) pp;
      elapsed := extract(epoch from clock_timestamp() - started) * 1000;
      if i > warmups then
        insert into discovery_bench values ('person', 'places', i - warmups, elapsed, n_rows, n_places, n_bytes);
      end if;

      started := clock_timestamp();
      select count(*), 0, 0 into n_rows, n_places, n_bytes
        from public.related_people(v_person) rp;
      elapsed := extract(epoch from clock_timestamp() - started) * 1000;
      if i > warmups then
        insert into discovery_bench values ('person', 'related', i - warmups, elapsed, n_rows, n_places, n_bytes);
      end if;

      -- WHO + WHERE together, over the person's own extent.
      if v_p_w is null then continue; end if;
      started := clock_timestamp();
      select count(*), count(*), 0 into n_rows, n_places, n_bytes
        from public.map_places(v_p_w, v_p_s, v_p_e, v_p_n, null, 250, null, null, null,
          null, null, false, 'all', null, v_person) mp;
      elapsed := extract(epoch from clock_timestamp() - started) * 1000;
      if i > warmups then
        insert into discovery_bench values ('person', 'map', i - warmups, elapsed, n_rows, n_places, n_bytes);
      end if;
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
       where derivation ilike '%designat%' or derivation ilike '%listed%'),
    -- Coverage in mutually exclusive buckets. A single "dated" figure lets
    -- period-level evidence pass itself off as a date; these cannot.
    'coverage', (select row_to_json(c) from public.temporal_coverage() c),
    'byPrecisionClass', (
      select coalesce(json_object_agg(klass, n), '{}'::json)
        from (select public.temporal_precision_class("precision") as klass, count(*) as n
                from public.temporal_associations where status = 'approved' group by 1) t),
    'bySource', (
      select coalesce(json_object_agg(name, n), '{}'::json)
        from (select coalesce(s.name, 'name-derived') as name, count(*) as n
                from public.temporal_associations ta
                left join public.sources s on s.id = ta.source_id
               where ta.status = 'approved' group by 1) t),
    'byAssociation', (
      select coalesce(json_object_agg(association_type, n), '{}'::json)
        from (select association_type::text, count(*) as n
                from public.temporal_associations where status = 'approved' group by 1) t),
    'multiPhasePlaces', (
      select count(*) from (
        select entity_id from public.temporal_associations
         where entity_type = 'place' and status = 'approved'
         group by entity_id having count(distinct (start_year, end_year)) > 1) t),
    -- A claim that says century but displays a year would be the exact defect
    -- this batch exists to prevent, so it is counted rather than assumed absent.
    'overpreciseLabels', (
      select count(*) from public.temporal_associations
       where "precision" in ('century', 'period', 'decade')
         -- Word-bounded, matching the check constraint exactly. Without the
         -- boundaries this counted "1870s", which is the CORRECT rendering of
         -- a decade claim, and reported eleven violations that were not.
         and display_label ~ '\y[12][0-9]{3}\y'),
    'quarantined', (select count(*) from public.temporal_quarantine),
    'quarantineRanking', (
      select coalesce(json_agg(row_to_json(q)), '[]'::json)
        from (select * from public.temporal_quarantine_ranking(15)) q)
  ),
  'people', json_build_object(
    'total', (select count(*) from public.people),
    'withDates', (select count(*) from public.people
                   where birth_year is not null or death_year is not null),
    'connectedToAPlace', (select count(distinct r.subject_id) from public.entity_relationships r
                           where r.subject_type = 'person' and r.object_type = 'place'
                             and r.status = 'approved'),
    'personPlaceLinks', (select count(*) from public.entity_relationships
                          where subject_type = 'person' and object_type = 'place'),
    -- How much of the graph is actually connected person-to-person. Stated as
    -- a corpus fact so an empty related-people result reads as the shape of
    -- this dataset rather than a broken query.
    'withRelatedPeople', (
      select count(*) from public.people pe
       where pe.status = 'approved'
         and exists (select 1 from public.related_people(pe.id))),
    'sharedPlaces', (
      select count(*) from (
        select r.object_id
          from public.entity_relationships r
         where r.subject_type = 'person' and r.object_type = 'place'
           and r.status = 'approved'
         group by r.object_id having count(distinct r.subject_id) > 1) t),
    'examples', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        select pe.name,
               public.person_life_dates(pe.birth_year, pe.death_year) as life_dates,
               count(*) as places
          from public.entity_relationships r
          join public.people pe on pe.id = r.subject_id
         where r.subject_type = 'person' and r.object_type = 'place' and r.status = 'approved'
         group by pe.name, pe.birth_year, pe.death_year
         order by count(*) desc, pe.name
         limit 5) t)
  ),
  'coverage', (
    select json_build_object(
      'ukViewportFraction', round(covered_fraction::numeric, 4),
      'regions', region_names)
    from public.coverage_for_viewport(-8.6, 49.9, 1.8, 60.9)),
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
