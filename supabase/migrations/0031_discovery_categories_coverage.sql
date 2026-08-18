-- 0031_discovery_categories_coverage.sql
-- Three things the public map needs before it can be honest at UK scale:
--
--   1. a small, stable set of display categories, so a legend is ten entries
--      rather than thirty;
--   2. a record of where Whilom's detailed coverage actually reaches, so an
--      empty map can say "not activated here yet" instead of implying that a
--      city has no history;
--   3. period counts for a viewport in one grouped query, so a timeline can
--      show how much it holds without firing one query per epoch.

-- ---------------------------------------------------------------------------
-- Display categories
-- ---------------------------------------------------------------------------
-- Distinct from `place_type`, which stays as rich as the sources warrant. This
-- is a presentation grouping and nothing else: canonical typing must not be
-- coarsened to suit a map key.
create type public.map_display_category as enum (
  'building',
  'religious',
  'fortification',
  'monument',
  'ruin',
  'archaeology',
  'industrial',
  'military',
  'landscape',
  'other'
);

comment on type public.map_display_category is
  'Presentation grouping for map styling and the legend. Derived from place_type; never stored on a place, so canonical typing is never coarsened to suit a key.';

create or replace function public.map_display_category(p_place_type public.place_type)
returns public.map_display_category
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_place_type::text
    when 'church' then 'religious'
    when 'cathedral' then 'religious'
    when 'abbey' then 'religious'
    when 'priory' then 'religious'
    when 'castle' then 'fortification'
    when 'fort' then 'fortification'
    when 'hillfort' then 'fortification'
    when 'monument' then 'monument'
    when 'ruin' then 'ruin'
    when 'lost_structure' then 'ruin'
    when 'archaeological_site' then 'archaeology'
    when 'roman_villa' then 'archaeology'
    when 'battlefield' then 'archaeology'
    when 'industrial_site' then 'industrial'
    when 'canal_structure' then 'industrial'
    when 'railway_site' then 'industrial'
    when 'military_installation' then 'military'
    when 'pillbox' then 'military'
    when 'bunker' then 'military'
    when 'airfield' then 'military'
    when 'garden' then 'landscape'
    when 'historic_landscape' then 'landscape'
    when 'building' then 'building'
    when 'country_house' then 'building'
    when 'museum' then 'building'
    when 'historic_village' then 'building'
    when 'structure' then 'other'
    when 'unknown' then 'other'
    else 'other'
  end::public.map_display_category;
$$;

comment on function public.map_display_category(public.place_type) is
  'Maps the rich canonical taxonomy onto ten display groups. A place typed `structure` or `unknown` becomes `other`, which is the honest answer rather than a guess.';

grant execute on function public.map_display_category(public.place_type) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Coverage
-- ---------------------------------------------------------------------------
-- The map shows the United Kingdom because that is the product's scope. The
-- data behind it is one activated region, and conflating the two would be the
-- most damaging kind of dishonesty this product could commit: a user panning to
-- Southampton and finding nothing must understand that Whilom has not reached
-- there yet, not that Southampton has no history.
create table public.coverage_regions (
  id text primary key,
  display_name text not null,
  /** The activated boundary. */
  area extensions.geography(Polygon, 4326) not null,
  /** Version of the dataset that populated it. */
  dataset_version text,
  activated_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.coverage_regions is
  'Where Whilom has activated detailed heritage coverage. Absence of data outside these areas means "not yet activated", never "no history here".';

create index coverage_regions_area_gix on public.coverage_regions using gist (area);

insert into public.coverage_regions (id, display_name, area, dataset_version, activated_at, note)
values (
  'WHILOM_REGION_YORKSHIRE_V1',
  'Yorkshire and the surrounding area',
  extensions.st_setsrid(extensions.st_makeenvelope(-2.60, 53.20, 0.40, 54.80), 4326)::extensions.geography,
  '1.0.0',
  now(),
  'A band across Yorkshire from the Pennine watershed to the North Sea coast. Approximately the WGS84 extent of the British National Grid envelope the dataset was captured from.'
);

alter table public.coverage_regions enable row level security;
create policy "coverage_regions are public" on public.coverage_regions for select using (true);
create policy "coverage_regions admin" on public.coverage_regions for all
  using (public.is_admin()) with check (public.is_admin());
grant select on public.coverage_regions to anon, authenticated;

/**
 * How much of a viewport Whilom has activated.
 *
 * Returns the fraction covered rather than a boolean, so the UI can distinguish
 * "you are outside coverage" from "you are half in it" — a viewport straddling
 * the boundary is the case where a naive yes/no answer misleads most.
 */
create or replace function public.coverage_for_viewport(
  bbox_sw_lng double precision,
  bbox_sw_lat double precision,
  bbox_ne_lng double precision,
  bbox_ne_lat double precision
)
returns table (
  covered_fraction double precision,
  region_ids text[],
  region_names text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  with viewport as (
    select extensions.st_makeenvelope(bbox_sw_lng, bbox_sw_lat, bbox_ne_lng, bbox_ne_lat, 4326) as g
  ),
  hit as (
    select r.id, r.display_name,
           extensions.st_area(extensions.st_intersection(r.area::extensions.geometry, v.g)) as overlap
      from public.coverage_regions r, viewport v
     where r.area::extensions.geometry operator(extensions.&&) v.g
  )
  select
    least(1.0, coalesce(sum(h.overlap), 0) / nullif(extensions.st_area((select g from viewport)), 0))::double precision,
    coalesce(array_agg(h.id) filter (where h.id is not null), '{}'),
    coalesce(array_agg(h.display_name) filter (where h.id is not null), '{}')
  from hit h;
$$;

comment on function public.coverage_for_viewport is
  'What fraction of a viewport lies inside activated coverage. A fraction rather than a boolean, because a viewport straddling the boundary is exactly where a yes/no answer misleads.';

grant execute on function public.coverage_for_viewport(
  double precision, double precision, double precision, double precision) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Period counts for a viewport
-- ---------------------------------------------------------------------------
-- One grouped query, not one per epoch. Twenty-one separate round trips to
-- label a timeline would cost more than everything else the map does together.
--
-- The number means "Whilom records currently associated with this period in
-- this view". It does not mean "places that existed then", and with dated
-- coverage around 1% of the corpus the difference is enormous.
create or replace function public.period_counts_for_viewport(
  bbox_sw_lng double precision,
  bbox_sw_lat double precision,
  bbox_ne_lng double precision,
  bbox_ne_lat double precision,
  place_types text[] default null,
  q text default null
)
returns table (
  period_id text,
  display_name text,
  display_order integer,
  place_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with visible as (
    select p.id
      from public.places p
     where p.status = 'approved'
       and p.location operator(extensions.&&) extensions.st_makeenvelope(
             bbox_sw_lng, bbox_sw_lat, bbox_ne_lng, bbox_ne_lat, 4326)::extensions.geography
       and (place_types is null or p.place_type::text = any(place_types))
       and (q is null or q = '' or p.search_vector @@ websearch_to_tsquery('english', q))
  )
  select hp.id, hp.display_name, hp.display_order,
         count(distinct ta.entity_id) as place_count
    from public.historical_periods hp
    left join public.temporal_associations ta
      on ta.status = 'approved'
     and ta.entity_type = 'place'
     and ta.entity_id in (select id from visible)
     and (
       ta.period_id = hp.id
       or (ta.start_year is not null and ta.end_year is not null
           and ta.start_year <= hp.end_year and ta.end_year >= hp.start_year)
     )
   group by hp.id, hp.display_name, hp.display_order
   order by hp.display_order;
$$;

comment on function public.period_counts_for_viewport is
  'Records Whilom currently associates with each period in this view. NOT a count of what existed then — dated coverage is a small share of the corpus.';

grant execute on function public.period_counts_for_viewport(
  double precision, double precision, double precision, double precision, text[], text) to anon, authenticated;
