-- seed.sql — a handful of Yorkshire test entities (spec §42 Phase 0 area).
-- Deliberately mixed types to exercise the model. Run via `supabase db reset`.

insert into public.places (slug, name, place_type, content_level, period, cost, is_visitable, summary, location)
values
  ('conisbrough-castle', 'Conisbrough Castle', 'castle', 3, 'medieval', 'paid', true,
   'A 12th-century castle with a rare cylindrical keep, near Doncaster.',
   extensions.st_setsrid(extensions.st_makepoint(-1.2289, 53.4849), 4326)),
  ('fountains-abbey', 'Fountains Abbey', 'abbey', 4, 'medieval', 'paid', true,
   'One of the largest and best-preserved Cistercian monasteries in England.',
   extensions.st_setsrid(extensions.st_makepoint(-1.5836, 54.1108), 4326)),
  ('stanwick-iron-age-fortifications', 'Stanwick Iron Age Fortifications', 'hillfort', 1, 'prehistoric', 'free', true,
   'Extensive Iron Age earthworks associated with the Brigantes.',
   extensions.st_setsrid(extensions.st_makepoint(-1.7360, 54.4900), 4326)),
  ('eden-camp', 'Eden Camp', 'museum', 3, 'wwii', 'paid', true,
   'A WWII modern history museum housed in a former prisoner-of-war camp.',
   extensions.st_setsrid(extensions.st_makepoint(-0.7620, 54.1660), 4326)),
  ('rievaulx-abbey', 'Rievaulx Abbey', 'abbey', 3, 'medieval', 'paid', true,
   'Ruined Cistercian abbey in the North York Moors.',
   extensions.st_setsrid(extensions.st_makepoint(-1.1160, 54.2570), 4326));
