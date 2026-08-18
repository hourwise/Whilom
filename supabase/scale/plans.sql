-- Query plans at scale.
--
-- The timings in benchmark.sql say whether the read paths are fast enough; this
-- says *why*, which is what makes a regression diagnosable. A sequential scan
-- that is fast at 5,000 rows is not fast at 500,000, and only the plan shows
-- the difference.
--
-- BUFFERS is included because on a CI runner with a warm cache, shared-buffer
-- hits are a more stable signal of how much work a query does than wall time.

\set ON_ERROR_STOP on
\pset pager off

\echo '=== map pan: bounded area over the densest part of the sample ==='
explain (analyze, buffers, verbose off)
select * from public.search_places(
  bbox_sw_lng => -1.95, bbox_sw_lat => 53.75,
  bbox_ne_lng => -1.45, bbox_ne_lat => 53.95,
  max_rows => 100);

\echo ''
\echo '=== radius: everything within 5km of a point, ordered by distance ==='
explain (analyze, buffers, verbose off)
select * from public.search_places(
  center_lng => -1.75, center_lat => 53.85, radius_m => 5000,
  max_rows => 100);

\echo ''
\echo '=== text search: a very common heritage word ==='
explain (analyze, buffers, verbose off)
select * from public.search_places(q => 'church', max_rows => 100);

\echo ''
\echo '=== text search combined with a place-type filter ==='
explain (analyze, buffers, verbose off)
select * from public.search_places(
  q => 'hall', place_types => array['country_house', 'building'], max_rows => 100);

\echo ''
\echo '=== detail: a single place by slug ==='
explain (analyze, buffers, verbose off)
select * from public.places where slug = (select slug from public.places order by name limit 1);

\echo ''
\echo '=== index usage so far ==='
select relname, indexrelname, idx_scan, idx_tup_read
from pg_stat_user_indexes
where schemaname = 'public' and relname = 'places'
order by idx_scan desc;

-- ---------------------------------------------------------------------------
-- Is the full-text index usable, or merely present?
-- ---------------------------------------------------------------------------
--
-- At a few thousand rows the planner correctly prefers a sequential scan for a
-- common word, so the plans above do not exercise `places_search_gin` at all.
-- That leaves the important question unanswered: a query that is fast today
-- because the table is small tells us nothing about the same query at national
-- scale. Forcing the planner's hand answers it — if the index cannot be used,
-- or returns different rows, that is a defect visible now rather than after an
-- import.
set enable_seqscan = off;

\echo ''
\echo '=== text search with sequential scans disabled (index viability) ==='
explain (analyze, buffers, verbose off)
select * from public.search_places(q => 'church', max_rows => 100);

\echo ''
\echo '=== the same, with a type filter ==='
explain (analyze, buffers, verbose off)
select * from public.search_places(
  q => 'hall', place_types => array['country_house', 'building'], max_rows => 100);

reset enable_seqscan;

\echo ''
\echo '=== row counts agree with and without the index ==='
select
  (select count(*) from public.search_places(q => 'church', max_rows => 100)) as with_planner_choice,
  (select count(*) from public.places
    where status = 'approved' and search_vector @@ websearch_to_tsquery('english', 'church')) as direct;
