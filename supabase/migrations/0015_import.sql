-- 0015_import.sql
-- Governed ingestion pipeline (spec §35, §36). These tables are server/ingestion
-- only: the service role (used by `ingestion/`) bypasses RLS, and the policies
-- here expose the queues to admins/moderators for review — never to the public.

-- Registry of automated connectors (one per national body / dataset).
create table public.import_sources (
  id uuid primary key default extensions.uuid_generate_v4(),
  key text unique not null,         -- matches SourceAdapter.id, e.g. 'historic-england-nhle'
  display_name text not null,
  adapter text not null,            -- adapter module identifier
  licence text,
  base_url text,
  enabled boolean not null default true,
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.import_runs (
  id uuid primary key default extensions.uuid_generate_v4(),
  import_source_id uuid not null references public.import_sources (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}',
  error text
);
create index import_runs_source_idx on public.import_runs (import_source_id);

-- Raw, unmodified payloads as fetched (spec §35 RAW INGESTION; audit trail).
create table public.import_raw (
  id uuid primary key default extensions.uuid_generate_v4(),
  import_run_id uuid not null references public.import_runs (id) on delete cascade,
  import_source_id uuid not null references public.import_sources (id) on delete cascade,
  external_id text,
  payload jsonb not null,
  retrieved_at timestamptz not null default now()
);
create index import_raw_run_idx on public.import_raw (import_run_id);

-- Normalised candidates awaiting match/dedup/publish (spec §35, §36).
create table public.import_candidates (
  id uuid primary key default extensions.uuid_generate_v4(),
  import_run_id uuid not null references public.import_runs (id) on delete cascade,
  import_raw_id uuid references public.import_raw (id) on delete set null,
  entity_type public.entity_type not null default 'place',
  normalised jsonb not null,
  matched_entity_id uuid,           -- canonical entity if a confident match was found
  match_confidence numeric(4, 3) check (match_confidence between 0 and 1),
  status public.moderation_state not null default 'needs_review',
  created_at timestamptz not null default now()
);
create index import_candidates_run_idx on public.import_candidates (import_run_id);
create index import_candidates_status_idx on public.import_candidates (status);

-- Field-level conflicts between incoming and existing data (spec §35, §36).
create table public.import_conflicts (
  id uuid primary key default extensions.uuid_generate_v4(),
  import_candidate_id uuid not null references public.import_candidates (id) on delete cascade,
  entity_type public.entity_type not null,
  entity_id uuid,                   -- the canonical row in conflict, if known
  field text not null,
  existing_value jsonb,
  incoming_value jsonb,
  resolution text check (resolution in ('keep_existing', 'use_incoming', 'manual')),
  resolved_by uuid references public.profiles (id) on delete set null,
  status public.moderation_state not null default 'needs_review',
  created_at timestamptz not null default now()
);
create index import_conflicts_candidate_idx on public.import_conflicts (import_candidate_id);

-- ---------------------------------------------------------------------------
-- RLS — no public access. Admins manage the registry/runs; moderators work the
-- candidate/conflict review queues. The service role bypasses RLS entirely.
-- ---------------------------------------------------------------------------
alter table public.import_sources enable row level security;
alter table public.import_runs enable row level security;
alter table public.import_raw enable row level security;
alter table public.import_candidates enable row level security;
alter table public.import_conflicts enable row level security;

create policy "import_sources admin" on public.import_sources for all
  using (public.is_admin()) with check (public.is_admin());
create policy "import_runs admin" on public.import_runs for all
  using (public.is_admin()) with check (public.is_admin());
create policy "import_raw admin" on public.import_raw for all
  using (public.is_admin()) with check (public.is_admin());
create policy "import_candidates moderator" on public.import_candidates for all
  using (public.is_moderator()) with check (public.is_moderator());
create policy "import_conflicts moderator" on public.import_conflicts for all
  using (public.is_moderator()) with check (public.is_moderator());
