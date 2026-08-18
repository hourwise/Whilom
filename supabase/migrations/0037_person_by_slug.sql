-- 0037_person_by_slug.sql
-- Resolve a person from the slug in a shared link.
--
-- The discovery URL carries ?person=<slug>, but nothing could turn that back
-- into a person: search resolves names, not slugs, and public.people has a
-- read policy without an explicit grant to anon. So a link to a person opened
-- in a new tab restored the parameter and none of the meaning — the panel
-- stayed shut and the map ignored the filter. A shared link that silently
-- loses what it was sharing is worse than one that fails.
--
-- Returns the same shape as a search_discovery person row so the caller can
-- treat a resolved link and a chosen search result identically.
create or replace function public.person_by_slug(p_slug text)
returns table (
  kind text,
  id uuid,
  slug text,
  display_name text,
  detail text,
  context text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    'person'::text,
    pe.id,
    pe.slug,
    pe.name,
    public.person_life_dates(pe.birth_year, pe.death_year),
    nullif(array_to_string(pe.titles, ', '), '')
  from public.people pe
  where pe.slug = p_slug
    and pe.status = 'approved'
  limit 1;
$$;

comment on function public.person_by_slug is
  'Resolves the slug in a shared discovery link back to a published person. Same shape as a search_discovery person row, so a restored link and a chosen result are handled identically. Unpublished people resolve to nothing.';

grant execute on function public.person_by_slug(text) to anon, authenticated;
