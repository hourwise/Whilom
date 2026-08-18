-- Query performance at scale (health gate G6) and storage growth (G10).
--
-- Run against an ephemeral Supabase started in CI, after loading a tier seed.
-- Emits one JSON object on stdout so the workflow can fold it into the tier's
-- scale-results file.
--
-- Every query here is one the product actually issues:
--   * map-pan      — the bounded-area query behind the place list
--   * radius       — "near me", the search RPC's distance path
--   * text-search  — the search box
--   * filtered     — text plus a type filter, the commonest combination
--   * detail       — a single place by slug, the page load
--
-- Each is run repeatedly and reported at p50/p95 rather than as a single
-- reading, because a single reading of a warm query on an idle runner is not
-- a latency measurement.

\set ON_ERROR_STOP on
\timing off

create temporary table bench_result (
  id text not null,
  description text not null,
  run integer not null,
  duration_ms double precision not null,
  rows_returned bigint not null
);

do $$
declare
  -- Bradford / Leeds, the densest corner of the sample: the honest case for a
  -- bounded-area query is where the records actually cluster.
  sw_lng constant double precision := -1.95;
  sw_lat constant double precision := 53.75;
  ne_lng constant double precision := -1.45;
  ne_lat constant double precision := 53.95;
  centre_lng constant double precision := -1.75;
  centre_lat constant double precision := 53.85;

  warmups constant integer := 3;
  runs constant integer := 25;

  started timestamptz;
  elapsed double precision;
  found bigint;
  i integer;
  a_slug text;
begin
  select slug into a_slug from public.places order by name limit 1;

  for i in 1 .. warmups + runs loop
    -- --- map pan ----------------------------------------------------------
    started := clock_timestamp();
    select count(*) into found from public.search_places(
      bbox_sw_lng => sw_lng, bbox_sw_lat => sw_lat,
      bbox_ne_lng => ne_lng, bbox_ne_lat => ne_lat,
      max_rows => 100);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then
      insert into bench_result values ('map-pan', 'Bounded-area pan over the densest part of the sample', i - warmups, elapsed, found);
    end if;

    -- --- radius -----------------------------------------------------------
    started := clock_timestamp();
    select count(*) into found from public.search_places(
      center_lng => centre_lng, center_lat => centre_lat, radius_m => 5000,
      max_rows => 100);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then
      insert into bench_result values ('radius', 'Everything within 5km of a point, ordered by distance', i - warmups, elapsed, found);
    end if;

    -- --- text search ------------------------------------------------------
    started := clock_timestamp();
    select count(*) into found from public.search_places(q => 'church', max_rows => 100);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then
      insert into bench_result values ('text-search', 'Full-text search for a very common heritage word', i - warmups, elapsed, found);
    end if;

    -- --- text + type filter -----------------------------------------------
    started := clock_timestamp();
    select count(*) into found from public.search_places(
      q => 'hall', place_types => array['country_house', 'building'], max_rows => 100);
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then
      insert into bench_result values ('text-and-type', 'Search text combined with a place-type filter', i - warmups, elapsed, found);
    end if;

    -- --- detail -----------------------------------------------------------
    started := clock_timestamp();
    select count(*) into found from public.places where slug = a_slug;
    elapsed := extract(epoch from clock_timestamp() - started) * 1000;
    if i > warmups then
      insert into bench_result values ('detail', 'Single place by slug, as the detail page loads it', i - warmups, elapsed, found);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Result
-- ---------------------------------------------------------------------------
select json_build_object(
  'places', (select count(*) from public.places),
  'queries', (
    select json_agg(q order by q->>'id')
    from (
      select json_build_object(
        'id', id,
        'description', min(description),
        'runs', count(*),
        'p50Ms', round(percentile_cont(0.5) within group (order by duration_ms)::numeric, 3),
        'p95Ms', round(percentile_cont(0.95) within group (order by duration_ms)::numeric, 3),
        'maxMs', round(max(duration_ms)::numeric, 3),
        'rows', max(rows_returned)
      ) as q
      from bench_result group by id
    ) grouped
  ),
  'storage', (
    select json_build_object(
      'totalBytes', sum(pg_total_relation_size(c.oid)),
      'tables', json_agg(json_build_object(
        'table', relname,
        'rows', n_live_tup,
        'totalBytes', pg_total_relation_size(c.oid),
        'indexBytes', pg_indexes_size(c.oid)
      ) order by pg_total_relation_size(c.oid) desc)
    )
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public' and c.relkind = 'r' and n_live_tup > 0
  )
) as result;
