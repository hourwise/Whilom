-- 0029_temporal_discovery.sql
-- Time as a first-class dimension of discovery.
--
-- Whilom's question is "where — and when — do you want to explore", and the
-- second half of that needs a model that can hold prehistory as comfortably as
-- last century. Three things are established here:
--
--   1. a period registry, which is a NAVIGATION VOCABULARY and not source truth;
--   2. temporal associations, which are provenance-backed claims about when
--      something was built, used, altered, lost or connected to an event;
--   3. a survival-status seam, so a future Whilom can show what used to be here
--      without the schema assuming everything historic still stands.
--
-- ---------------------------------------------------------------------------
-- Years
-- ---------------------------------------------------------------------------
-- Years are signed integers using the HISTORICAL convention: -1 is 1 BCE, 1 is
-- 1 CE, and there is no year zero. Astronomical numbering (where 0 = 1 BCE) is
-- more convenient arithmetically and wrong in every source a historian will
-- quote, so the awkward convention is the correct one and the constraint below
-- enforces it.
--
-- Deliberately NOT a date or timestamp. A `date` cannot express "Bronze Age",
-- "probably 12th century" or "before 1500", and forcing it to would manufacture
-- precision the evidence does not support.

-- ---------------------------------------------------------------------------
-- How precisely a date is known
-- ---------------------------------------------------------------------------
create type public.temporal_precision as enum (
  'exact_year',      -- "built 1732"
  'circa',           -- "c.1732"
  'decade',          -- "the 1730s"
  'century',         -- "18th century", "C18"
  'period',          -- "medieval", "Iron Age" — a named period and nothing finer
  'range',           -- an explicit span the source gives
  'before',          -- terminus ante quem
  'after',           -- terminus post quem
  'unknown'
);

comment on type public.temporal_precision is
  'How precisely a temporal claim is known. `period` and `century` are honest answers; inventing `exact_year` from them is not.';

-- ---------------------------------------------------------------------------
-- What kind of temporal claim this is
-- ---------------------------------------------------------------------------
create type public.temporal_association_type as enum (
  'built',        -- construction / creation
  'existed',      -- known to stand during this span
  'altered',      -- rebuilt, extended, remodelled
  'used_as',      -- a documented historical use
  'event',        -- something happened here
  'lost',         -- demolished, destroyed, abandoned
  'associated'    -- connected to the period without a stronger claim
);

comment on type public.temporal_association_type is
  'Why a place is relevant to a time. "built" and "existed" answer "what was here then"; "event" and "used_as" answer "what happened then". Keeping them apart is what lets those become separate discovery modes.';

-- ---------------------------------------------------------------------------
-- Survival status
-- ---------------------------------------------------------------------------
-- The seam for lost places. Left NULL for every existing record because the
-- current sources do not state it, and a guessed "surviving" would be an
-- invented claim about the real world. NULL means "not known", which is true.
create type public.survival_status as enum (
  'surviving',
  'partial',
  'ruined',
  'demolished',
  'lost',
  'archaeological',
  'unknown'
);

alter table public.places
  add column survival_status public.survival_status;

comment on column public.places.survival_status is
  'Whether the place still stands. NULL means the sources do not say — which is the honest answer for the entire current corpus, and is not the same as "surviving".';

-- ---------------------------------------------------------------------------
-- Period registry
-- ---------------------------------------------------------------------------
-- A UK-oriented discovery vocabulary. These boundaries are conventions for
-- navigation, not historical assertions: the Iron Age did not end everywhere in
-- Britain on a Tuesday in AD 43. Source-backed dates remain the authoritative
-- claim; a period is how a person finds their way to them.
create table public.historical_periods (
  id text primary key,
  display_name text not null,
  -- Signed years, historical convention, inclusive.
  start_year integer not null,
  end_year integer not null,
  display_order integer not null,
  parent_id text references public.historical_periods (id) on delete set null,
  /** Shown in the UI so the convention is visible rather than implied. */
  note text,
  constraint historical_periods_no_year_zero
    check (start_year <> 0 and end_year <> 0),
  constraint historical_periods_ordered
    check (end_year >= start_year)
);

comment on table public.historical_periods is
  'Navigation vocabulary for time. Boundaries are UI conventions, deliberately approximate, and never overwrite what a source actually claimed.';

create index historical_periods_span_idx on public.historical_periods (start_year, end_year);
create index historical_periods_order_idx on public.historical_periods (display_order);

insert into public.historical_periods (id, display_name, start_year, end_year, display_order, parent_id, note) values
  ('prehistory',     'Prehistory',              -900000, -43,   10, null, 'Everything before written record in Britain.'),
  ('palaeolithic',   'Palaeolithic',            -900000, -10001, 20, 'prehistory', 'Old Stone Age.'),
  ('mesolithic',     'Mesolithic',              -10000, -4001,  30, 'prehistory', 'Middle Stone Age.'),
  ('neolithic',      'Neolithic',               -4000,  -2201,  40, 'prehistory', 'New Stone Age; first farming.'),
  ('bronze_age',     'Bronze Age',              -2200,  -801,   50, 'prehistory', null),
  ('iron_age',       'Iron Age',                -800,   -43,    60, 'prehistory', 'Ends conventionally at the Roman invasion.'),
  ('roman',          'Roman Britain',           43,     409,    70, null, null),
  ('early_medieval', 'Anglo-Saxon & Viking',    410,    1065,   80, null, 'Also called the Early Medieval period.'),
  ('norman',         'Norman',                  1066,   1153,   90, null, 'From the Conquest.'),
  ('medieval',       'Medieval',                1154,   1484,  100, null, 'Later medieval; the Normans are listed separately.'),
  ('tudor',          'Tudor',                   1485,   1602,  110, null, null),
  ('stuart',         'Stuart',                  1603,   1713,  120, null, 'Includes the Civil War and Interregnum.'),
  ('georgian',       'Georgian',                1714,   1836,  130, null, 'Includes the Regency.'),
  ('victorian',      'Victorian',               1837,   1900,  140, null, null),
  ('edwardian',      'Edwardian',               1901,   1913,  150, null, null),
  ('wwi',            'First World War',         1914,   1918,  160, null, null),
  ('interwar',       'Interwar',                1919,   1938,  170, null, null),
  ('wwii',           'Second World War',        1939,   1945,  180, null, null),
  ('postwar',        'Post-war',                1946,   1979,  190, null, null),
  ('late_20th',      'Late 20th century',       1980,   1999,  200, null, null),
  ('contemporary',   'Today',                   2000,   2100,  210, null, null);

alter table public.historical_periods enable row level security;
create policy "historical_periods are public" on public.historical_periods for select using (true);
create policy "historical_periods admin" on public.historical_periods for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.historical_periods to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Temporal associations
-- ---------------------------------------------------------------------------
-- A provenance-backed claim that an entity relates to a span of time. Carries
-- the same attribution machinery as `facts` rather than a parallel one: the
-- source, the source record, and the source's own words.
create table public.temporal_associations (
  id uuid primary key default extensions.uuid_generate_v4(),
  entity_type public.entity_type not null default 'place',
  entity_id uuid not null,
  association_type public.temporal_association_type not null,

  -- The span, signed years, inclusive. Both null is legitimate: a claim can
  -- name a period without the registry pinning it to years.
  start_year integer,
  end_year integer,
  precision public.temporal_precision not null default 'unknown',

  -- The navigation period this maps onto, when one applies.
  period_id text references public.historical_periods (id) on delete set null,

  -- Provenance. `source_id` is nullable only for future editorial claims;
  -- everything imported carries one.
  source_id uuid references public.sources (id) on delete set null,
  source_record_id uuid references public.source_records (id) on delete set null,
  confidence numeric(4, 3) check (confidence between 0 and 1),

  -- The source's own words, kept verbatim. Normalisation informs logic; this is
  -- the evidence, and it is what lets a later, better extractor be checked
  -- against what was actually written.
  original_text text,
  -- How the years were arrived at, so a claim can be re-derived or retracted.
  derivation text,

  status public.moderation_state not null default 'approved',
  created_at timestamptz not null default now(),

  constraint temporal_associations_no_year_zero
    check ((start_year is null or start_year <> 0) and (end_year is null or end_year <> 0)),
  constraint temporal_associations_ordered
    check (start_year is null or end_year is null or end_year >= start_year)
);

comment on table public.temporal_associations is
  'When an entity relates to time, and why we believe it. Never derived from designation or import dates — being listed in 1967 says nothing about when a building was built.';

comment on column public.temporal_associations.derivation is
  'How the years were reached, e.g. period-registry lookup from the source''s own period word. Lets a claim be audited or withdrawn rather than merely trusted.';

-- The query the map runs: entity within a span.
create index temporal_associations_entity_idx
  on public.temporal_associations (entity_type, entity_id);
create index temporal_associations_span_idx
  on public.temporal_associations (start_year, end_year)
  where status = 'approved';
create index temporal_associations_period_idx
  on public.temporal_associations (period_id)
  where status = 'approved';

-- One claim per source per entity per type per span: a repeat import refreshes
-- rather than duplicates, which is what keeps activation idempotent.
create unique index temporal_associations_unique_claim
  on public.temporal_associations (
    entity_type, entity_id, association_type,
    coalesce(period_id, ''),
    coalesce(start_year, -2147483648),
    coalesce(end_year, 2147483647),
    coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.temporal_associations enable row level security;

-- Public read is scoped to what the place itself exposes: a temporal claim
-- about a hidden place must not become a way to learn the place exists.
create policy "temporal_associations follow their place" on public.temporal_associations
  for select using (
    status = 'approved'
    and (
      (entity_type = 'place' and public.place_is_public(entity_id))
      or entity_type <> 'place'
    )
  );

create policy "temporal_associations editor write" on public.temporal_associations
  for all using (public.is_editor()) with check (public.is_editor());

grant select on public.temporal_associations to anon, authenticated;
grant insert, update, delete on public.temporal_associations to authenticated;
