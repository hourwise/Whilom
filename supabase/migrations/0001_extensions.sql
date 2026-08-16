-- 0001_extensions.sql
-- Foundational extensions (spec §33, §37). PostGIS powers all geographic queries.

create schema if not exists extensions;

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions; -- fuzzy name matching / dedup
create extension if not exists unaccent with schema extensions; -- diacritic-insensitive search
