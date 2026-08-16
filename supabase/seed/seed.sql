-- seed.sql — Yorkshire Phase-0 test set (spec §42). Deliberately mixed entity
-- types + one worked example of the graph (place ↔ person ↔ source ↔ route).
-- Runs via `supabase db reset` under the service role (RLS bypassed).

-- Categories -----------------------------------------------------------------
insert into public.place_categories (slug, name) values
  ('religious', 'Religious'),
  ('military', 'Military'),
  ('prehistoric', 'Prehistoric'),
  ('museum', 'Museums');

-- Places ---------------------------------------------------------------------
insert into public.places
  (slug, name, place_type, content_level, primary_period, access_cost, is_visitable, summary, county, location)
values
  ('conisbrough-castle', 'Conisbrough Castle', 'castle', 3, 'medieval', 'paid', true,
   'A 12th-century castle with a rare cylindrical keep, near Doncaster.', 'South Yorkshire',
   extensions.st_setsrid(extensions.st_makepoint(-1.2289, 53.4849), 4326)),
  ('fountains-abbey', 'Fountains Abbey', 'abbey', 4, 'medieval', 'paid', true,
   'One of the largest and best-preserved Cistercian monasteries in England.', 'North Yorkshire',
   extensions.st_setsrid(extensions.st_makepoint(-1.5836, 54.1108), 4326)),
  ('rievaulx-abbey', 'Rievaulx Abbey', 'abbey', 3, 'medieval', 'paid', true,
   'Ruined Cistercian abbey in the North York Moors.', 'North Yorkshire',
   extensions.st_setsrid(extensions.st_makepoint(-1.1160, 54.2570), 4326)),
  ('stanwick-iron-age-fortifications', 'Stanwick Iron Age Fortifications', 'hillfort', 1, 'prehistoric', 'free', true,
   'Extensive Iron Age earthworks associated with the Brigantes.', 'North Yorkshire',
   extensions.st_setsrid(extensions.st_makepoint(-1.7360, 54.4900), 4326)),
  ('eden-camp', 'Eden Camp', 'museum', 3, 'wwii', 'paid', true,
   'A WWII modern-history museum in a former prisoner-of-war camp.', 'North Yorkshire',
   extensions.st_setsrid(extensions.st_makepoint(-0.7620, 54.1660), 4326));

-- Category links -------------------------------------------------------------
insert into public.place_category_links (place_id, category_id)
select p.id, c.id from public.places p, public.place_categories c
where (p.slug in ('fountains-abbey', 'rievaulx-abbey') and c.slug = 'religious')
   or (p.slug = 'stanwick-iron-age-fortifications' and c.slug = 'prehistoric')
   or (p.slug = 'eden-camp' and c.slug = 'museum');

-- Access detail --------------------------------------------------------------
insert into public.place_access (place_id, access_cost, is_visitable, public_access, expected_visit_minutes, official_url)
select id, 'paid', true, true, 120, 'https://www.english-heritage.org.uk/'
from public.places where slug in ('rievaulx-abbey', 'conisbrough-castle');

-- A person + source + relationship (worked graph example) --------------------
insert into public.people (slug, name, titles, birth_year, death_year, biography, trust_level)
values ('aelred-of-rievaulx', 'Aelred of Rievaulx', array['Abbot'], 1110, 1167,
        'Cistercian monk and abbot of Rievaulx, and an influential medieval writer.', 'editorially_verified');

insert into public.sources (kind, name, publisher, url, licence, attribution, trust_level)
values ('official', 'National Heritage List for England', 'Historic England',
        'https://historicengland.org.uk/listing/the-list/', 'OGL', 'Historic England', 'official_source');

insert into public.entity_relationships (subject_type, subject_id, predicate, object_type, object_id, verified, source_id, confidence)
select 'person', pe.id, 'lived_at', 'place', pl.id, true, s.id, 1.0
from public.people pe, public.places pl, public.sources s
where pe.slug = 'aelred-of-rievaulx' and pl.slug = 'rievaulx-abbey'
  and s.name = 'National Heritage List for England';

-- A themed route with two database-place stops ------------------------------
insert into public.routes (slug, name, route_type, difficulty, theme, period, description, trust_level)
values ('cistercian-abbeys-of-yorkshire', 'Cistercian Abbeys of Yorkshire', 'driving', 'easy',
        'Medieval Monasteries', 'medieval',
        'A driving trail linking the great ruined Cistercian houses of Yorkshire.', 'editorially_verified');

insert into public.route_stops (route_id, position, place_id, description)
select r.id, s.position, p.id, s.descr
from public.routes r
join (values (1, 'fountains-abbey', 'Begin at the grandest of the ruins.'),
             (2, 'rievaulx-abbey', 'End amid the moorland setting of Rievaulx.')) as s(position, slug, descr)
  on true
join public.places p on p.slug = s.slug
where r.slug = 'cistercian-abbeys-of-yorkshire';
