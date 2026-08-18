-- 0032_people_discovery.sql
-- WHO: searching for people, and following them across the map.
--
-- All SECURITY INVOKER. RLS on `people`, `places` and `entity_relationships`
-- already decides what the public may see; a definer route would be a second,
-- weaker copy of that judgement.

-- ---------------------------------------------------------------------------
-- People are searchable
-- ---------------------------------------------------------------------------
create or replace function public.people_update_search_vector()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', array_to_string(coalesce(new.titles, '{}'), ' ')), 'B');
  return new;
end;
$$;

drop trigger if exists people_search_vector_update on public.people;
create trigger people_search_vector_update
  before insert or update on public.people
  for each row execute function public.people_update_search_vector();

update public.people set name = name;

create index if not exists people_search_gin on public.people using gin (search_vector);
create index if not exists people_dates_idx on public.people (birth_year, death_year);

-- Relationship lookups run in both directions, and only the subject side was
-- indexed by the primary key's leading columns.
create index if not exists entity_relationships_object_idx
  on public.entity_relationships (object_type, object_id, predicate)
  where status = 'approved';

-- ---------------------------------------------------------------------------
-- How a person's dates are shown
-- ---------------------------------------------------------------------------
-- Never a negative year, never a year zero, and never a precision the source
-- did not give. "1564–1616" where both are known; "b. 1564" where only one is;
-- "dates unknown" rather than a plausible guess.
create or replace function public.format_historical_year(p_year integer)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_year is null then null
    when p_year < 0 then abs(p_year)::text || ' BCE'
    else p_year::text
  end;
$$;

comment on function public.format_historical_year(integer) is
  'Public year rendering. Signed years are an internal convention; a visitor sees "500 BCE", never "-500", and never a year zero because none exists.';

create or replace function public.person_life_dates(p_birth integer, p_death integer)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_birth is null and p_death is null then null
    when p_birth is not null and p_death is not null
      then public.format_historical_year(p_birth) || '–' || public.format_historical_year(p_death)
    when p_birth is not null then 'b. ' || public.format_historical_year(p_birth)
    else 'd. ' || public.format_historical_year(p_death)
  end;
$$;

grant execute on function public.format_historical_year(integer) to anon, authenticated;
grant execute on function public.person_life_dates(integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- One search box
-- ---------------------------------------------------------------------------
-- Places and people from a single query, tagged by kind. A person should not
-- have to know which tab Whilom files them under before they can be found.
--
-- Deliberately lightweight: enough to disambiguate and draw a result row, and
-- nothing that belongs on a full page.
create or replace function public.search_discovery(
  q text,
  max_rows integer default 12
)
returns table (
  kind text,
  id uuid,
  slug text,
  display_name text,
  -- Place: type. Person: life dates.
  detail text,
  -- Place: locality/designation. Person: titles.
  context text,
  lng double precision,
  lat double precision,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with query as (select websearch_to_tsquery('english', coalesce(q, '')) as tsq),
  capped as (select least(greatest(coalesce(max_rows, 12), 1), 25) as n)
  (
    select
      'person'::text,
      pe.id, pe.slug, pe.name,
      public.person_life_dates(pe.birth_year, pe.death_year),
      nullif(array_to_string(pe.titles, ', '), ''),
      null::double precision, null::double precision,
      ts_rank(pe.search_vector, (select tsq from query))
    from public.people pe
    where pe.status = 'approved'
      and pe.search_vector @@ (select tsq from query)
    order by ts_rank(pe.search_vector, (select tsq from query)) desc, pe.name
    limit (select n from capped)
  )
  union all
  (
    select
      'place'::text,
      p.id, p.slug, p.name,
      replace(p.place_type::text, '_', ' '),
      coalesce(p.town, p.county),
      extensions.st_x(p.location::extensions.geometry),
      extensions.st_y(p.location::extensions.geometry),
      ts_rank(p.search_vector, (select tsq from query))
    from public.places p
    where p.status = 'approved'
      and p.search_vector @@ (select tsq from query)
    order by ts_rank(p.search_vector, (select tsq from query)) desc, p.content_level desc, p.name
    limit (select n from capped)
  );
$$;

comment on function public.search_discovery is
  'Unified place and person search, tagged by kind and capped per kind. Queries Whilom''s own canonical data — never a live third-party lookup on every keystroke.';

grant execute on function public.search_discovery(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- A person's places
-- ---------------------------------------------------------------------------
-- Relationships are stored person→place for some predicates and place→person
-- for others, so both directions are read and the predicate is reported as
-- stated rather than flattened to "associated with".
create or replace function public.person_places(
  p_person_id uuid,
  max_rows integer default 200
)
returns table (
  place_id uuid,
  slug text,
  name text,
  place_type text,
  display_category text,
  lng double precision,
  lat double precision,
  predicate text,
  relationship_note text,
  in_coverage boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with edges as (
    select r.object_id as place_id, r.predicate, r.note
      from public.entity_relationships r
     where r.status = 'approved'
       and r.subject_type = 'person' and r.subject_id = p_person_id
       and r.object_type = 'place'
    union
    select r.subject_id, r.predicate, r.note
      from public.entity_relationships r
     where r.status = 'approved'
       and r.object_type = 'person' and r.object_id = p_person_id
       and r.subject_type = 'place'
  )
  select
    p.id, p.slug, p.name, p.place_type::text,
    public.map_display_category(p.place_type)::text,
    extensions.st_x(p.location::extensions.geometry),
    extensions.st_y(p.location::extensions.geometry),
    e.predicate, e.note,
    -- A canonical relationship is worth showing even where detailed discovery
    -- has not been activated; the flag lets the UI say which is which rather
    -- than hiding a real connection.
    exists (select 1 from public.coverage_regions c
             where p.location operator(extensions.&&) c.area)
  from edges e
  join public.places p on p.id = e.place_id
  where p.status = 'approved'
  order by p.name
  limit least(greatest(coalesce(max_rows, 200), 1), 500);
$$;

comment on function public.person_places is
  'Published places connected to a person, with the relationship as stated. Reads both edge directions; flags whether each place sits inside activated coverage.';

grant execute on function public.person_places(uuid, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- People connected to a place
-- ---------------------------------------------------------------------------
create or replace function public.place_people(
  p_place_id uuid,
  max_rows integer default 50
)
returns table (
  person_id uuid,
  slug text,
  name text,
  life_dates text,
  predicate text,
  relationship_note text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with edges as (
    select r.subject_id as person_id, r.predicate, r.note
      from public.entity_relationships r
     where r.status = 'approved'
       and r.object_type = 'place' and r.object_id = p_place_id
       and r.subject_type = 'person'
    union
    select r.object_id, r.predicate, r.note
      from public.entity_relationships r
     where r.status = 'approved'
       and r.subject_type = 'place' and r.subject_id = p_place_id
       and r.object_type = 'person'
  )
  select pe.id, pe.slug, pe.name,
         public.person_life_dates(pe.birth_year, pe.death_year),
         e.predicate, e.note
  from edges e
  join public.people pe on pe.id = e.person_id
  where pe.status = 'approved'
  order by pe.name
  limit least(greatest(coalesce(max_rows, 50), 1), 100);
$$;

comment on function public.place_people is
  'People connected to a place. The reciprocal of person_places, and the other half of following a thread through the graph.';

grant execute on function public.place_people(uuid, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Related people
-- ---------------------------------------------------------------------------
-- Only real graph paths. Two kinds are offered and they are kept apart, because
-- "his wife" and "also worked on this building" are not the same claim:
--
--   direct  an explicit person-to-person edge
--   place   both connected to the same published place
--
-- No similarity scoring, no "people also viewed". A relationship Whilom cannot
-- point at is not a relationship Whilom should assert.
create or replace function public.related_people(
  p_person_id uuid,
  max_rows integer default 12
)
returns table (
  person_id uuid,
  slug text,
  name text,
  life_dates text,
  relation_kind text,
  relation_detail text,
  shared_places integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with direct as (
    select case when r.subject_id = p_person_id then r.object_id else r.subject_id end as person_id,
           r.predicate
      from public.entity_relationships r
     where r.status = 'approved'
       and r.subject_type = 'person' and r.object_type = 'person'
       and (r.subject_id = p_person_id or r.object_id = p_person_id)
  ),
  mine as (
    select place_id from public.person_places(p_person_id, 500)
  ),
  via_place as (
    select pp.person_id, count(distinct pp.place_id)::integer as shared
      from (
        select o.person_id, m.place_id
          from mine m
          join lateral public.place_people(m.place_id, 100) o on true
      ) pp
     where pp.person_id <> p_person_id
     group by pp.person_id
  )
  select pe.id, pe.slug, pe.name,
         public.person_life_dates(pe.birth_year, pe.death_year),
         case when d.person_id is not null then 'direct' else 'place' end,
         case when d.person_id is not null then replace(d.predicate, '_', ' ')
              else 'connected to the same place' end,
         coalesce(v.shared, 0)
    from public.people pe
    left join direct d on d.person_id = pe.id
    left join via_place v on v.person_id = pe.id
   where pe.status = 'approved'
     and pe.id <> p_person_id
     and (d.person_id is not null or v.person_id is not null)
   -- An explicit edge outranks a shared building, and more shared places
   -- outranks fewer.
   order by (d.person_id is not null) desc, coalesce(v.shared, 0) desc, pe.name
   limit least(greatest(coalesce(max_rows, 12), 1), 50);
$$;

comment on function public.related_people is
  'People reachable from this one by a real graph path: an explicit person-to-person edge, or a shared published place. Never similarity scoring.';

grant execute on function public.related_people(uuid, integer) to anon, authenticated;
