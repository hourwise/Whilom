-- 0026_preferred_claim_resolution.sql
-- Make a reviewer's decision actually decide which claim Whilom displays.
--
-- 0024 gave facts an `is_preferred` flag and 0023 gave conflicts a resolution
-- vocabulary, but nothing connected them: a reviewer could choose
-- `accept_source_value` and the display preference would not move. The decision
-- was recorded and then ignored, which is worse than not offering it.
--
-- Preference is applied deterministically, atomically with the decision, and
-- only where the predicate's semantics call for a single display value.

-- ---------------------------------------------------------------------------
-- Predicate cardinality
--
-- "At most one preferred value" is true of an official website and false of a
-- former name — a place can legitimately have several former names, and forcing
-- one to win would be a data-model lie. Cardinality is therefore a property of
-- the predicate, not a blanket rule.
-- ---------------------------------------------------------------------------
alter table public.fact_predicates
  add column cardinality text not null default 'single'
    check (cardinality in ('single', 'multi'));

comment on column public.fact_predicates.cardinality is
  'single: one preferred display value, so promoting one demotes the others. multi: several values are simultaneously true and no preference is enforced.';

update public.fact_predicates set cardinality = 'multi'
 where predicate in ('former_name', 'historic_use', 'heritage_designation', 'designation_reference');

-- ---------------------------------------------------------------------------
-- Which predicate a conflict is about.
--
-- `field` is free text describing the comparison ('place_type', 'location',
-- 'inception_year'). Only some conflicts concern a published fact, and only
-- those can move a preference, so the link is explicit and nullable rather than
-- inferred from a string at resolution time.
-- ---------------------------------------------------------------------------
alter table public.import_conflicts
  add column predicate text references public.fact_predicates (predicate);

-- Backfill for conflicts whose field already names a registered predicate.
update public.import_conflicts c
   set predicate = c.field
  from public.fact_predicates fp
 where fp.predicate = c.field and c.predicate is null;

comment on column public.import_conflicts.predicate is
  'The fact predicate in dispute, when the conflict concerns a published fact. NULL for conflicts about canonical columns such as location.';

-- ---------------------------------------------------------------------------
-- The single-preferred invariant, enforced by the database rather than by
-- whoever remembers to demote the old value.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_single_preferred_fact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_preferred is not true then
    return new;
  end if;

  -- Multi-valued predicates may have several preferred claims at once; that is
  -- what multi-valued means.
  if not exists (
    select 1 from public.fact_predicates fp
     where fp.predicate = new.predicate and fp.cardinality = 'single'
  ) then
    return new;
  end if;

  -- Demote, never delete: the losing claim keeps its source, its value and its
  -- audit trail, and only stops being the one Whilom shows.
  update public.facts f
     set is_preferred = false
   where f.entity_type = new.entity_type
     and f.entity_id   = new.entity_id
     and f.predicate   = new.predicate
     and f.id <> new.id
     and f.is_preferred;

  return new;
end;
$$;

create trigger facts_single_preferred
  after insert or update of is_preferred on public.facts
  for each row when (new.is_preferred)
  execute function public.enforce_single_preferred_fact();

-- ---------------------------------------------------------------------------
-- Apply a resolution to the stored claims.
--
-- Split out so both paths use it: resolving a conflict after publication acts
-- on facts that already exist, and publishing a candidate whose conflicts were
-- resolved earlier applies the same decision to the facts it is creating.
-- ---------------------------------------------------------------------------
create or replace function public.apply_conflict_preference(p_conflict_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict public.import_conflicts%rowtype;
  v_entity_id uuid;
  v_entity_type public.entity_type;
  v_source_id uuid;
begin
  select * into v_conflict from public.import_conflicts where id = p_conflict_id;
  if not found or v_conflict.predicate is null or v_conflict.resolution_outcome is null then
    return;
  end if;

  -- Which entity the claims belong to, and which source made the incoming one.
  select coalesce(c.published_entity_id, c.matched_entity_id), c.entity_type,
         (select s.source_id from public.import_sources s
           where s.key = c.normalised #>> '{provenance,sourceId}')
    into v_entity_id, v_entity_type, v_source_id
    from public.import_candidates c
   where c.id = v_conflict.import_candidate_id;

  if v_entity_id is null then
    return; -- Nothing published yet; publication will apply the decision.
  end if;

  case v_conflict.resolution_outcome

    -- The value we already hold stays the one we show. The incoming claim keeps
    -- its provenance and simply is not preferred.
    when 'keep_canonical' then
      update public.facts f set is_preferred = false
       where f.entity_type = v_entity_type and f.entity_id = v_entity_id
         and f.predicate = v_conflict.predicate
         and f.source_id is not distinct from v_source_id
         and f.value = v_conflict.incoming_value;

      update public.facts f set is_preferred = true
       where f.entity_type = v_entity_type and f.entity_id = v_entity_id
         and f.predicate = v_conflict.predicate
         and f.value = v_conflict.existing_value
         and f.status <> 'rejected';

    -- The source is right. Promoting it demotes the previous value through the
    -- trigger, so there is one code path for the invariant.
    when 'accept_source_value' then
      update public.facts f set is_preferred = true
       where f.entity_type = v_entity_type and f.entity_id = v_entity_id
         and f.predicate = v_conflict.predicate
         and f.source_id is not distinct from v_source_id
         and f.value = v_conflict.incoming_value
         and f.status <> 'rejected';

    -- The claim is wrong. It stays queryable and attributable — the record of
    -- what the source said is not erased — but it can never be displayed.
    when 'reject_source_claim' then
      update public.facts f
         set is_preferred = false, status = 'rejected'
       where f.entity_type = v_entity_type and f.entity_id = v_entity_id
         and f.predicate = v_conflict.predicate
         and f.source_id is not distinct from v_source_id
         and f.value = v_conflict.incoming_value;

    -- Both true of different aspects, or not a disagreement at all: both claims
    -- stand and the existing display preference is left exactly as it was.
    -- `defer` likewise changes nothing.
    else
      null;
  end case;
end;
$$;

comment on function public.apply_conflict_preference(uuid) is
  'Translate a conflict resolution into preferred/display state. Demotes and rejects; never deletes a claim or its provenance. Idempotent.';

-- ---------------------------------------------------------------------------
-- Resolution now applies the decision as part of the same transaction.
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
  if not public.is_editor() then
    raise exception 'resolving a conflict requires editor authority'
      using errcode = 'insufficient_privilege';
  end if;

  update public.import_conflicts
     set resolution_outcome = p_outcome,
         resolution_note    = p_note,
         resolved_by        = v_actor,
         resolved_at        = now(),
         status             = (case when p_outcome = 'defer' then 'needs_review' else 'approved' end)::public.moderation_state
   where id = p_conflict_id;

  if not found then
    raise exception 'conflict % does not exist', p_conflict_id
      using errcode = 'no_data_found';
  end if;

  -- Atomic with the decision: a reviewer never has to remember a second step,
  -- and the recorded decision and the displayed value cannot disagree.
  perform public.apply_conflict_preference(p_conflict_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Publication applies decisions that were taken before the facts existed.
-- ---------------------------------------------------------------------------
create or replace function public.apply_candidate_preferences(p_candidate_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict_id uuid;
begin
  for v_conflict_id in
    select id from public.import_conflicts
     where import_candidate_id = p_candidate_id
       and resolution_outcome is not null
       and predicate is not null
  loop
    perform public.apply_conflict_preference(v_conflict_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- A source's first claim for a single-valued predicate becomes the displayed
-- one; later sources do not silently take over. Publication then applies any
-- resolutions on top.
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
  v_item jsonb;
  v_predicate text;
  v_person_id uuid;
  v_role text;
  v_has_preferred boolean;
begin
  if not public.is_editor() then
    raise exception 'publishing requires editor authority'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_candidate from public.import_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'import candidate % does not exist', p_candidate_id using errcode = 'no_data_found';
  end if;

  if v_candidate.published_entity_id is not null then
    return v_candidate.published_entity_id;
  end if;

  if v_candidate.status <> 'approved' then
    raise exception 'candidate % is %, only an approved candidate may be published',
      p_candidate_id, v_candidate.status using errcode = 'check_violation';
  end if;

  select count(*) into v_unresolved from public.import_conflicts c
   where c.import_candidate_id = p_candidate_id
     and (c.resolution_outcome is null or c.resolution_outcome = 'defer');
  if v_unresolved > 0 then
    raise exception 'candidate % has % unresolved conflict(s); resolve them before publishing',
      p_candidate_id, v_unresolved using errcode = 'check_violation';
  end if;

  v_normalised := v_candidate.normalised;
  if v_normalised is null or v_normalised -> 'provenance' is null then
    raise exception 'candidate % carries no provenance and cannot be published', p_candidate_id
      using errcode = 'check_violation';
  end if;

  v_source_key := v_normalised #>> '{provenance,sourceId}';
  v_external_id := v_normalised #>> '{provenance,sourceRecordId}';

  select s.source_id into v_source_id from public.import_sources s where s.key = v_source_key;
  if v_source_id is null then
    raise exception 'import source % is not mapped to a citable source', v_source_key
      using errcode = 'foreign_key_violation';
  end if;

  if v_candidate.matched_entity_id is not null then
    v_entity_id := v_candidate.matched_entity_id;
    if not exists (select 1 from public.places p where p.id = v_entity_id) then
      raise exception 'matched entity % no longer exists', v_entity_id
        using errcode = 'foreign_key_violation';
    end if;
  else
    v_slug := public.slugify_unique(v_normalised ->> 'name');
    insert into public.places (
      slug, name, place_type, location, location_method, location_accuracy_m, trust_level, status)
    values (
      v_slug, v_normalised ->> 'name', (v_normalised ->> 'placeType')::public.place_type,
      extensions.st_setsrid(extensions.st_makepoint(
        (v_normalised #>> '{location,lng}')::double precision,
        (v_normalised #>> '{location,lat}')::double precision), 4326)::extensions.geography,
      nullif(v_normalised ->> 'locationMethod', '')::public.location_method,
      (v_normalised ->> 'locationAccuracyMeters')::numeric, 'open_data_source', 'approved')
    returning id into v_entity_id;
  end if;

  insert into public.source_records (
    source_id, external_id, url, licence, attribution, retrieved_at, source_updated_at,
    importer_version, raw, entity_type, entity_id, match_confidence, review_status,
    source_lng, source_lat, source_crs, source_coordinates,
    coordinate_conversion, source_precision_m, location_accuracy_m, location_method)
  values (
    v_source_id, v_external_id,
    v_normalised #>> '{provenance,originalUrl}', v_normalised #>> '{provenance,licence}',
    v_normalised #>> '{provenance,attribution}',
    coalesce((v_normalised #>> '{provenance,retrievedAt}')::timestamptz, now()),
    (v_normalised #>> '{provenance,sourceUpdatedAt}')::timestamptz,
    v_normalised #>> '{provenance,importerVersion}', v_normalised,
    v_candidate.entity_type, v_entity_id, v_candidate.match_confidence, 'approved',
    (v_normalised #>> '{sourcePosition,coordinates,lng}')::double precision,
    (v_normalised #>> '{sourcePosition,coordinates,lat}')::double precision,
    v_normalised #>> '{sourcePosition,crs}', v_normalised -> 'sourcePosition' -> 'coordinates',
    v_normalised #>> '{sourcePosition,conversion}',
    (v_normalised #>> '{sourcePosition,sourcePrecisionMeters}')::numeric,
    (v_normalised ->> 'locationAccuracyMeters')::numeric,
    nullif(v_normalised ->> 'locationMethod', '')::public.location_method)
  on conflict (source_id, external_id, entity_type, entity_id) do update
    set retrieved_at = excluded.retrieved_at, source_updated_at = excluded.source_updated_at,
        importer_version = excluded.importer_version, raw = excluded.raw,
        match_confidence = excluded.match_confidence
  returning id into v_source_record_id;

  for v_item in select * from jsonb_array_elements(coalesce(v_normalised -> 'designations', '[]'::jsonb))
  loop
    insert into public.place_designations (place_id, designation, grade, reference, url)
    values (v_entity_id, (v_item ->> 'designation')::public.designation_type,
            nullif(v_item ->> 'grade', '')::public.designation_grade,
            v_item ->> 'reference', v_item ->> 'url')
    on conflict do nothing;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(v_normalised -> 'facts', '[]'::jsonb))
  loop
    v_predicate := v_item ->> 'predicate';
    if not exists (select 1 from public.fact_predicates fp where fp.predicate = v_predicate) then
      raise exception 'fact predicate % is not registered in fact_predicates', v_predicate
        using errcode = 'check_violation';
    end if;

    -- First claim for a single-valued predicate becomes the displayed one; a
    -- later source does not quietly displace it. Only a reviewer moves it.
    select exists (
      select 1 from public.facts f
       where f.entity_type = v_candidate.entity_type and f.entity_id = v_entity_id
         and f.predicate = v_predicate and f.is_preferred)
      into v_has_preferred;

    insert into public.facts (
      entity_type, entity_id, predicate, value, source_id, source_record_id,
      source_value, confidence, status, created_by, is_preferred)
    values (
      v_candidate.entity_type, v_entity_id, v_predicate, v_item -> 'value',
      v_source_id, v_source_record_id, v_item ->> 'sourceValue',
      v_candidate.match_confidence, 'approved', v_actor, not v_has_preferred)
    on conflict (entity_type, entity_id, predicate, source_id, value)
      where source_id is not null
      do update set source_record_id = excluded.source_record_id,
                    source_value     = excluded.source_value;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(v_normalised -> 'relatedPeople', '[]'::jsonb))
  loop
    v_role := coalesce(v_item ->> 'role', 'associated');
    v_predicate := case v_role
      when 'architect' then 'built_by' when 'creator' then 'built_by'
      when 'owner' then 'owned_by' else 'associated_with' end;
    v_person_id := public.resolve_person_from_source(
      v_item ->> 'label', v_source_id, v_item ->> 'externalId');

    insert into public.entity_relationships (
      subject_type, subject_id, predicate, object_type, object_id, note,
      source_id, source_record_id, import_run_id, confidence, status, created_by)
    values ('place', v_entity_id, v_predicate, 'person', v_person_id,
            'source role: ' || v_role, v_source_id, v_source_record_id,
            v_candidate.import_run_id, v_candidate.match_confidence, 'approved', v_actor)
    on conflict (subject_type, subject_id, predicate, object_type, object_id,
                 coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid))
      do update set source_record_id = excluded.source_record_id,
                    import_run_id    = excluded.import_run_id;
  end loop;

  update public.import_candidates
     set published_entity_id = v_entity_id, published_at = now(), published_by = v_actor,
         source_record_id = v_source_record_id, review_note = coalesce(p_note, review_note)
   where id = p_candidate_id;

  -- Decisions taken while the facts were still hypothetical now apply to the
  -- real rows, in the same transaction that created them.
  perform public.apply_candidate_preferences(p_candidate_id);

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

revoke all on function public.apply_conflict_preference(uuid) from public;
revoke all on function public.apply_candidate_preferences(uuid) from public;
revoke all on function public.enforce_single_preferred_fact() from public;
revoke all on function public.publish_import_candidate(uuid, text) from public;
revoke all on function public.resolve_import_conflict(uuid, public.conflict_resolution, text) from public;
grant execute on function public.publish_import_candidate(uuid, text) to authenticated, service_role;
grant execute on function public.resolve_import_conflict(uuid, public.conflict_resolution, text)
  to authenticated, service_role;
