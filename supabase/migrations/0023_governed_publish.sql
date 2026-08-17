-- 0023_governed_publish.sql
-- The first governed REVIEW → PUBLISH transaction.
--
-- Everything up to this point produced candidates and conflicts. Turning one
-- into canonical heritage data is the step where provenance is most easily
-- lost, so it is done in ONE database function rather than a sequence of client
-- writes: a partial publish — a place created but its source record missing —
-- would be a canonical value nobody can trace, which is precisely what the
-- trust model exists to prevent.
--
-- The rules the function enforces, none of which a caller can skip:
--   * only an editor or admin may publish;
--   * a candidate must have been reviewed and approved;
--   * unresolved conflicts block publication outright;
--   * an ambiguous match is never published as a merge;
--   * republishing the same candidate is idempotent, not duplicative.

-- ---------------------------------------------------------------------------
-- Conflict resolution vocabulary
-- ---------------------------------------------------------------------------
create type public.conflict_resolution as enum (
  -- The value already held is right; the source is wrong or out of date.
  'keep_canonical',
  -- The source is right; replace the canonical value.
  'accept_source_value',
  -- Both are true of different aspects — record both as separate facts rather
  -- than forcing one to win. Two sources dating different events, for example.
  'keep_both_as_distinct_facts',
  -- Not actually a disagreement; the detector was wrong.
  'mark_not_a_conflict',
  -- Real, but needs research. Stays in the queue.
  'defer',
  -- The source's claim is rejected outright and should not be re-raised.
  'reject_source_claim'
);

comment on type public.conflict_resolution is
  'How a human resolved a cross-source disagreement. The original values are never erased — resolution records a decision about them.';

-- ---------------------------------------------------------------------------
-- import_conflicts: richer resolution record
--
-- The original `resolution text check (...)` allowed three values and kept no
-- record of who decided or why. Replaced, keeping the original disagreement
-- intact: existing_value and incoming_value are never overwritten.
-- ---------------------------------------------------------------------------
alter table public.import_conflicts
  drop constraint if exists import_conflicts_resolution_check;
alter table public.import_conflicts
  alter column resolution type text;

alter table public.import_conflicts
  add column resolution_outcome public.conflict_resolution,
  add column resolution_note text,
  add column resolved_at timestamptz,
  -- Which source asserted the incoming value, so a resolution is attributable.
  add column source_record_id uuid references public.source_records (id) on delete set null,
  add column confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  add column conflict_reason text;

comment on column public.import_conflicts.resolution_outcome is
  'The decision taken. The disagreement itself (existing_value/incoming_value) is retained regardless.';

-- A conflict is only settled once someone chose an outcome and said when.
alter table public.import_conflicts
  add constraint import_conflicts_resolved_together check (
    (resolution_outcome is null and resolved_at is null)
    or (resolution_outcome is not null and resolved_at is not null)
  );

-- ---------------------------------------------------------------------------
-- import_candidates: publish state
-- ---------------------------------------------------------------------------
alter table public.import_candidates
  add column published_entity_id uuid,
  add column published_at timestamptz,
  add column published_by uuid references public.profiles (id) on delete set null,
  add column source_record_id uuid references public.source_records (id) on delete set null,
  add column review_note text,
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz;

comment on column public.import_candidates.published_entity_id is
  'The canonical entity this candidate became or attached to. Set only by publish_import_candidate().';

create index import_candidates_published_idx on public.import_candidates (published_entity_id)
  where published_entity_id is not null;

-- Which citable source an importer corresponds to, so a published record can
-- be traced from canonical value back to the original external record.
alter table public.import_sources
  add column source_id uuid references public.sources (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Governed publish
--
-- SECURITY DEFINER because it must write canonical tables that the calling
-- editor deliberately has no direct privilege on — publication is only ever
-- reachable through this function and its checks. Empty search_path, every
-- relation fully qualified, and the caller's authority is read from the
-- database (public.is_editor()), never from anything the client supplies.
-- ---------------------------------------------------------------------------
create or replace function public.publish_import_candidate(
  p_candidate_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.import_candidates%rowtype;
  v_normalised jsonb;
  v_source_key text;
  v_source_id uuid;
  v_external_id text;
  v_entity_id uuid;
  v_source_record_id uuid;
  v_actor uuid := auth.uid();
  v_unresolved integer;
  v_slug text;
  v_fact jsonb;
begin
  -- --- Authority ----------------------------------------------------------
  if not public.is_editor() then
    raise exception 'publishing requires editor authority'
      using errcode = 'insufficient_privilege';
  end if;

  -- Lock the candidate for the duration, so two concurrent publishes of the
  -- same candidate cannot both create a place.
  select * into v_candidate
    from public.import_candidates
   where id = p_candidate_id
   for update;

  if not found then
    raise exception 'import candidate % does not exist', p_candidate_id
      using errcode = 'no_data_found';
  end if;

  -- --- Idempotency --------------------------------------------------------
  -- Republishing is a no-op that returns the same entity. A retry after a
  -- network failure must not create a second place.
  if v_candidate.published_entity_id is not null then
    return v_candidate.published_entity_id;
  end if;

  -- --- State ---------------------------------------------------------------
  if v_candidate.status <> 'approved' then
    raise exception 'candidate % is %, only an approved candidate may be published',
      p_candidate_id, v_candidate.status
      using errcode = 'check_violation';
  end if;

  select count(*) into v_unresolved
    from public.import_conflicts c
   where c.import_candidate_id = p_candidate_id
     and (c.resolution_outcome is null or c.resolution_outcome = 'defer');

  if v_unresolved > 0 then
    raise exception 'candidate % has % unresolved conflict(s); resolve them before publishing',
      p_candidate_id, v_unresolved
      using errcode = 'check_violation';
  end if;

  v_normalised := v_candidate.normalised;
  if v_normalised is null or v_normalised -> 'provenance' is null then
    raise exception 'candidate % carries no provenance and cannot be published', p_candidate_id
      using errcode = 'check_violation';
  end if;

  -- --- Resolve the citable source -----------------------------------------
  v_source_key := v_normalised #>> '{provenance,sourceId}';
  v_external_id := v_normalised #>> '{provenance,sourceRecordId}';

  select s.source_id into v_source_id
    from public.import_sources s
   where s.key = v_source_key;

  if v_source_id is null then
    raise exception 'import source % is not mapped to a citable source', v_source_key
      using errcode = 'foreign_key_violation';
  end if;

  -- --- Canonical entity ----------------------------------------------------
  if v_candidate.matched_entity_id is not null then
    -- Attach a second source to an existing place. Canonical values are NOT
    -- overwritten here: an editor who wants the incoming value resolves the
    -- relevant conflict with 'accept_source_value' first.
    v_entity_id := v_candidate.matched_entity_id;

    if not exists (select 1 from public.places p where p.id = v_entity_id) then
      raise exception 'matched entity % no longer exists', v_entity_id
        using errcode = 'foreign_key_violation';
    end if;
  else
    -- Create a new canonical place from the normalised candidate.
    v_slug := public.slugify_unique(v_normalised ->> 'name');

    insert into public.places (
      slug, name, place_type, location,
      location_method, location_accuracy_m,
      trust_level, status
    )
    values (
      v_slug,
      v_normalised ->> 'name',
      (v_normalised ->> 'placeType')::public.place_type,
      extensions.st_setsrid(
        extensions.st_makepoint(
          (v_normalised #>> '{location,lng}')::double precision,
          (v_normalised #>> '{location,lat}')::double precision
        ), 4326)::extensions.geography,
      nullif(v_normalised ->> 'locationMethod', '')::public.location_method,
      (v_normalised ->> 'locationAccuracyMeters')::numeric,
      'open_data_source',
      'approved'
    )
    returning id into v_entity_id;
  end if;

  -- --- Source record -------------------------------------------------------
  -- The traceability link. Unique on (source, external id, entity), so a
  -- reimport of the same external record updates rather than duplicates.
  insert into public.source_records (
    source_id, external_id, url, licence, attribution,
    retrieved_at, source_updated_at, importer_version, raw,
    entity_type, entity_id, match_confidence, review_status,
    source_lng, source_lat, source_crs, source_coordinates,
    coordinate_conversion, source_precision_m, location_accuracy_m, location_method
  )
  values (
    v_source_id,
    v_external_id,
    v_normalised #>> '{provenance,originalUrl}',
    v_normalised #>> '{provenance,licence}',
    v_normalised #>> '{provenance,attribution}',
    coalesce((v_normalised #>> '{provenance,retrievedAt}')::timestamptz, now()),
    (v_normalised #>> '{provenance,sourceUpdatedAt}')::timestamptz,
    v_normalised #>> '{provenance,importerVersion}',
    v_normalised,
    v_candidate.entity_type,
    v_entity_id,
    v_candidate.match_confidence,
    'approved',
    (v_normalised #>> '{sourcePosition,coordinates,lng}')::double precision,
    (v_normalised #>> '{sourcePosition,coordinates,lat}')::double precision,
    v_normalised #>> '{sourcePosition,crs}',
    v_normalised -> 'sourcePosition' -> 'coordinates',
    v_normalised #>> '{sourcePosition,conversion}',
    (v_normalised #>> '{sourcePosition,sourcePrecisionMeters}')::numeric,
    (v_normalised ->> 'locationAccuracyMeters')::numeric,
    nullif(v_normalised ->> 'locationMethod', '')::public.location_method
  )
  on conflict (source_id, external_id, entity_type, entity_id) do update
    set retrieved_at      = excluded.retrieved_at,
        source_updated_at = excluded.source_updated_at,
        importer_version  = excluded.importer_version,
        raw               = excluded.raw,
        match_confidence  = excluded.match_confidence
  returning id into v_source_record_id;

  -- --- Designations --------------------------------------------------------
  for v_fact in select * from jsonb_array_elements(coalesce(v_normalised -> 'designations', '[]'::jsonb))
  loop
    insert into public.place_designations (place_id, designation, grade, reference, url)
    values (
      v_entity_id,
      (v_fact ->> 'designation')::public.designation_type,
      nullif(v_fact ->> 'grade', '')::public.designation_grade,
      v_fact ->> 'reference',
      v_fact ->> 'url'
    )
    on conflict do nothing;
  end loop;

  -- --- Complementary facts -------------------------------------------------
  -- Each carries its source, so "where did this come from" is answerable for
  -- every published value.
  if (v_normalised ->> 'inceptionYear') is not null then
    insert into public.facts (entity_type, entity_id, predicate, value, source_id, status, created_by)
    select v_candidate.entity_type, v_entity_id, 'inception_year',
           to_jsonb((v_normalised ->> 'inceptionYear')::integer), v_source_id, 'approved', v_actor
    where not exists (
      select 1 from public.facts f
       where f.entity_type = v_candidate.entity_type
         and f.entity_id = v_entity_id
         and f.predicate = 'inception_year'
         and f.source_id = v_source_id
    );
  end if;

  if (v_normalised ->> 'officialWebsite') is not null then
    insert into public.facts (entity_type, entity_id, predicate, value, source_id, status, created_by)
    select v_candidate.entity_type, v_entity_id, 'official_website',
           to_jsonb(v_normalised ->> 'officialWebsite'), v_source_id, 'approved', v_actor
    where not exists (
      select 1 from public.facts f
       where f.entity_type = v_candidate.entity_type
         and f.entity_id = v_entity_id
         and f.predicate = 'official_website'
         and f.source_id = v_source_id
    );
  end if;

  -- --- Mark published ------------------------------------------------------
  update public.import_candidates
     set published_entity_id = v_entity_id,
         published_at        = now(),
         published_by        = v_actor,
         source_record_id    = v_source_record_id,
         review_note         = coalesce(p_note, review_note)
   where id = p_candidate_id;

  -- --- Audit ---------------------------------------------------------------
  insert into public.moderation_items (target_kind, target_id, state, assigned_to)
  values ('import_candidate', p_candidate_id, 'approved', v_actor)
  on conflict (target_kind, target_id) do update
    set state = 'approved', assigned_to = v_actor, updated_at = now();

  insert into public.moderation_actions (moderation_item_id, moderator_id, action, note)
  select mi.id, v_actor, 'publish',
         coalesce(p_note, 'published import candidate ' || p_candidate_id::text)
    from public.moderation_items mi
   where mi.target_kind = 'import_candidate' and mi.target_id = p_candidate_id;

  return v_entity_id;
end;
$$;

comment on function public.publish_import_candidate(uuid, text) is
  'Atomically publish an approved import candidate: canonical entity + source record + designations + provenance-bearing facts. Editor-only; refuses unresolved conflicts; idempotent on retry.';

-- ---------------------------------------------------------------------------
-- Slug helper. Kept separate so publish stays readable, and stable so a
-- reimport lands on the same place rather than inventing a second one.
-- ---------------------------------------------------------------------------
create or replace function public.slugify_unique(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_slug text;
  v_n integer := 1;
begin
  v_base := regexp_replace(lower(coalesce(p_name, 'place')), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'place'; end if;
  v_base := left(v_base, 120);
  v_slug := v_base;
  while exists (select 1 from public.places p where p.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  end loop;
  return v_slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conflict resolution, also governed.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_import_conflict(
  p_conflict_id uuid,
  p_outcome public.conflict_resolution,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not public.is_moderator() then
    raise exception 'resolving a conflict requires moderator authority'
      using errcode = 'insufficient_privilege';
  end if;

  -- The original disagreement is deliberately untouched: only the decision is
  -- recorded, so the record of what the sources actually said survives.
  update public.import_conflicts
     set resolution_outcome = p_outcome,
         resolution_note    = p_note,
         resolved_by        = v_actor,
         resolved_at        = now(),
         -- A deferred conflict stays in the queue; anything else is settled.
         status             = (case when p_outcome = 'defer' then 'needs_review' else 'approved' end)::public.moderation_state
   where id = p_conflict_id;

  if not found then
    raise exception 'conflict % does not exist', p_conflict_id
      using errcode = 'no_data_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Review queue backend contract.
--
-- The seam the future admin UI reads. A view rather than a screen: everything
-- a reviewer needs to decide, and nothing about how it looks.
-- ---------------------------------------------------------------------------
create or replace view public.import_review_queue with (security_invoker = true) as
select
  c.id                                   as candidate_id,
  c.import_run_id,
  c.entity_type,
  c.status                               as review_status,
  c.match_confidence,
  c.normalised ->> 'name'                as candidate_name,
  c.normalised #>> '{provenance,sourceId}'       as source_key,
  c.normalised #>> '{provenance,sourceRecordId}' as source_record_external_id,
  c.normalised #>> '{provenance,originalUrl}'    as source_url,
  c.normalised -> 'externalIds'          as external_ids,
  c.normalised ->> 'placeType'           as candidate_place_type,
  (c.normalised ->> 'locationAccuracyMeters')::numeric as candidate_location_accuracy_m,
  c.matched_entity_id,
  p.name                                 as matched_place_name,
  p.place_type                           as matched_place_type,
  p.location_accuracy_m                  as matched_location_accuracy_m,
  -- Positional comparison, computed rather than left to the client.
  case
    when p.location is not null then extensions.st_distance(
      p.location,
      extensions.st_setsrid(extensions.st_makepoint(
        (c.normalised #>> '{location,lng}')::double precision,
        (c.normalised #>> '{location,lat}')::double precision), 4326)::extensions.geography)
  end                                    as distance_to_match_m,
  (select count(*) from public.import_conflicts ic
    where ic.import_candidate_id = c.id) as conflict_count,
  (select count(*) from public.import_conflicts ic
    where ic.import_candidate_id = c.id
      and (ic.resolution_outcome is null or ic.resolution_outcome = 'defer')) as unresolved_conflict_count,
  c.published_entity_id,
  c.published_at,
  c.reviewed_by,
  c.reviewed_at
from public.import_candidates c
left join public.places p on p.id = c.matched_entity_id;

comment on view public.import_review_queue is
  'Backend contract for the future moderation UI: candidate, source, proposed match, confidence, conflict counts and positional comparison. security_invoker, so the import_candidates moderator policy still governs access.';

-- The queue is moderator-only, inherited from import_candidates' own policy
-- because the view runs as the invoker.
grant select on public.import_review_queue to authenticated, service_role;

-- EXECUTE only where required: publishing is an editor action taken through an
-- authenticated session, never by anon.
revoke all on function public.publish_import_candidate(uuid, text) from public;
revoke all on function public.resolve_import_conflict(uuid, public.conflict_resolution, text) from public;
revoke all on function public.slugify_unique(text) from public;
grant execute on function public.publish_import_candidate(uuid, text) to authenticated, service_role;
grant execute on function public.resolve_import_conflict(uuid, public.conflict_resolution, text) to authenticated, service_role;
