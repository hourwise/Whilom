-- 0016_views.sql
-- Convenience view exposing place coordinates as plain lng/lat, so clients get
-- usable numbers instead of WKB over PostgREST. `security_invoker = true` (PG15)
-- means the view respects the querying user's RLS on `places`.

create view public.places_geo with (security_invoker = true) as
select
  p.*,
  extensions.st_x(p.location::extensions.geometry) as lng,
  extensions.st_y(p.location::extensions.geometry) as lat
from public.places p;

grant select on public.places_geo to anon, authenticated;
