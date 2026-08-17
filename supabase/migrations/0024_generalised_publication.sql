-- 0024_generalised_publication.sql
-- Remove the hard-coded publication bottleneck.
--
-- 0023 published exactly two facts, each with its own bespoke IF block:
--   if inceptionYear   -> insert fact
--   if officialWebsite -> insert fact
-- Every other imported fact was dropped on the floor, and imported place↔person
-- relationships were never materialised at all — they reached the candidate and
-- stopped there. Adding a third fact meant editing a stored procedure, which is
-- not a data model, it is a queue of future migrations.
--
-- This migration makes publication data-driven: the candidate carries a `facts`
-- array and a `relatedPeople` array, and publish iterates them against a
-- registry of allowed predicates.

-- ---------------------------------------------------------------------------
-- Publishable fact vocabulary
--
-- A registry table rather than an enum, so adding a predicate is an INSERT
-- rather than a migration — while still being enforced, because publish rejects
-- anything not registered. That keeps "extensible" and "governed" compatible.
-- ---------------------------------------------------------------------------
create table public.fact_predicates (
  predicate   text primary key,
  label       text not null,
  -- How the value should be read: informs display and comparison, and stops a
  -- year being published into a field that expects a URL.
  value_kind  text not null check (value_kind in ('integer', 'text', 'url', 'date', 'number')),
  description text,
  created_at  timestamptz not null default now()
);

comment on table public.fact_predicates is
  'Registry of fact predicates publication is allowed to write. Extend with an INSERT; publish_import_candidate() refuses anything absent from here.';

insert into public.fact_predicates (predicate, label, value_kind, description) values
  ('inception_year',        'Built / founded',        'integer', 'Year the place came into being. Compared only against another inception year.'),
  ('completion_year',       'Completed',              'integer', 'Year construction finished — a different claim from inception.'),
  ('demolished_year',       'Demolished',             'integer', 'Year the structure was lost.'),
  ('official_website',      'Official website',       'url',     'Site published by the current custodian.'),
  ('commons_category',      'Wikimedia Commons',      'text',    'Commons category. A pointer only; no image is ingested.'),
  ('heritage_designation',  'Heritage designation',   'text',    'Designation as the source words it, retained alongside the structured designation.'),
  ('designation_reference', 'Designation reference',  'text',    'The source''s own list-entry identifier.'),
  ('first_designated',      'First designated',       'date',    'When statutory protection was first conferred.'),
  ('former_name',           'Formerly known as',      'text',    'A previous name for the place.'),
  ('historic_use',          'Historic use',           'text',    'What the place was used for.'),
  ('area_hectares',         'Area (ha)',              'number',  'Extent as published by the source.');

alter table public.fact_predicates enable row level security;
create policy "fact_predicates read" on public.fact_predicates for select using (true);
create policy "fact_predicates admin" on public.fact_predicates for all
  using (public.is_admin()) with check (public.is_admin());
grant select on public.fact_predicates to anon, authenticated;
grant all on public.fact_predicates to service_role;

-- ---------------------------------------------------------------------------
-- facts: full provenance and a stable identity
-- ---------------------------------------------------------------------------
alter table public.facts
  -- Which specific external record asserted this. `source_id` alone only says
  -- "Wikidata said so"; this says which item, on which retrieval.
  add column source_record_id uuid references public.source_records (id) on delete set null,
  -- The value exactly as the source expressed it, before typing.
  add column source_value text,
  -- Set by a reviewer resolving a conflict. Display picks the preferred claim;
  -- the losing claims are still here, still attributable.
  add column is_preferred boolean not null default false;

comment on column public.facts.is_preferred is
  'Reviewer-chosen display value. Never deletes competing claims — Whilom must always be able to say "Source A says X, Source B says Y, a reviewer chose Z".';

-- Idempotency. The natural key is the claim itself: this entity, this
-- predicate, this value, from this source. A reimport of the same record
-- collides and updates; two INDEPENDENT sources asserting the same value are
-- deliberately two rows, because cross-source agreement is itself information
-- and collapsing it would erase who corroborated what.
create unique index facts_source_claim_uniq
  on public.facts (entity_type, entity_id, predicate, source_id, value)
  where source_id is not null;

create index facts_predicate_idx on public.facts (predicate);
create index facts_source_record_idx on public.facts (source_record_id);

-- ---------------------------------------------------------------------------
-- entity_relationships: provenance and per-source identity
--
-- The original unique constraint was
--   (subject_type, subject_id, predicate, object_type, object_id)
-- which makes an edge global and therefore UNSHAREABLE: the moment Historic
-- England and Wikidata both assert "Titus Salt founded Saltaire", the second
-- source's claim is rejected as a duplicate and its provenance is lost. That
-- contradicts the rule that agreement must not erase attribution, so the
-- constraint is replaced with one scoped by source.
-- ---------------------------------------------------------------------------
alter table public.entity_relationships
  add column source_record_id uuid references public.source_records (id) on delete set null,
  add column import_run_id uuid references public.import_runs (id) on delete set null;

alter table public.entity_relationships
  drop constraint if exists entity_relationships_subject_type_subject_id_predicate_obje_key;

-- coalesce so editorially-created edges (no source) still cannot be duplicated;
-- NULLs would otherwise compare as distinct and allow unlimited copies.
create unique index entity_relationships_source_claim_uniq
  on public.entity_relationships (
    subject_type, subject_id, predicate, object_type, object_id,
    coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index entity_relationships_source_record_idx
  on public.entity_relationships (source_record_id);

-- ---------------------------------------------------------------------------
-- Resolve or create the person a source names, with provenance.
--
-- Identity comes from the source's own identifier where there is one: a person
-- already imported from Wikidata Q1234 is found through their source record,
-- not by matching on a name, so two people called John Carr stay two people.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_person_from_source(
  p_label text,
  p_source_id uuid,
  p_external_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
  v_slug text;
begin
  if p_external_id is not null then
    select sr.entity_id into v_person_id
      from public.source_records sr
     where sr.source_id = p_source_id
       and sr.external_id = p_external_id
       and sr.entity_type = 'person'
     limit 1;
    if v_person_id is not null then
      return v_person_id;
    end if;
  end if;

  -- No prior import from this source. Create the person, then record where
  -- they came from, so even a newly created person is traceable.
  v_slug := regexp_replace(lower(coalesce(p_label, 'person')), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'person'; end if;

  -- An existing person with this slug is reused rather than duplicated, but
  -- only as a fallback when the source gave no identifier to match on.
  select p.id into v_person_id from public.people p where p.slug = v_slug;
  if v_person_id is null then
    insert into public.people (slug, name, trust_level, status)
    values (v_slug, p_label, 'open_data_source', 'approved')
    returning id into v_person_id;
  end if;

  if p_external_id is not null then
    insert into public.source_records (
      source_id, external_id, entity_type, entity_id, review_status, retrieved_at
    )
    values (p_source_id, p_external_id, 'person', v_person_id, 'approved', now())
    on conflict (source_id, external_id, entity_type, entity_id) do nothing;
  end if;

  return v_person_id;
end;
$$;

revoke all on function public.resolve_person_from_source(text, uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Publish, generalised.
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
begin
  if not public.is_editor() then
    raise exception 'publishing requires editor authority'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_candidate
    from public.import_candidates
   where id = p_candidate_id
   for update;

  if not found then
    raise exception 'import candidate % does not exist', p_candidate_id
      using errcode = 'no_data_found';
  end if;

  if v_candidate.published_entity_id is not null then
    return v_candidate.published_entity_id;
  end if;

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
    v_entity_id := v_candidate.matched_entity_id;
    if not exists (select 1 from public.places p where p.id = v_entity_id) then
      raise exception 'matched entity % no longer exists', v_entity_id
        using errcode = 'foreign_key_violation';
    end if;
  else
    v_slug := public.slugify_unique(v_normalised ->> 'name');
    insert into public.places (
      slug, name, place_type, location, location_method, location_accuracy_m,
      trust_level, status
    )
    values (
      v_slug,
      v_normalised ->> 'name',
      (v_normalised ->> 'placeType')::public.place_type,
      extensions.st_setsrid(extensions.st_makepoint(
        (v_normalised #>> '{location,lng}')::double precision,
        (v_normalised #>> '{location,lat}')::double precision), 4326)::extensions.geography,
      nullif(v_normalised ->> 'locationMethod', '')::public.location_method,
      (v_normalised ->> 'locationAccuracyMeters')::numeric,
      'open_data_source',
      'approved'
    )
    returning id into v_entity_id;
  end if;

  -- --- Source record -------------------------------------------------------
  insert into public.source_records (
    source_id, external_id, url, licence, attribution,
    retrieved_at, source_updated_at, importer_version, raw,
    entity_type, entity_id, match_confidence, review_status,
    source_lng, source_lat, source_crs, source_coordinates,
    coordinate_conversion, source_precision_m, location_accuracy_m, location_method
  )
  values (
    v_source_id, v_external_id,
    v_normalised #>> '{provenance,originalUrl}',
    v_normalised #>> '{provenance,licence}',
    v_normalised #>> '{provenance,attribution}',
    coalesce((v_normalised #>> '{provenance,retrievedAt}')::timestamptz, now()),
    (v_normalised #>> '{provenance,sourceUpdatedAt}')::timestamptz,
    v_normalised #>> '{provenance,importerVersion}',
    v_normalised,
    v_candidate.entity_type, v_entity_id, v_candidate.match_confidence, 'approved',
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
  for v_item in select * from jsonb_array_elements(coalesce(v_normalised -> 'designations', '[]'::jsonb))
  loop
    insert into public.place_designations (place_id, designation, grade, reference, url)
    values (
      v_entity_id,
      (v_item ->> 'designation')::public.designation_type,
      nullif(v_item ->> 'grade', '')::public.designation_grade,
      v_item ->> 'reference',
      v_item ->> 'url'
    )
    on conflict do nothing;
  end loop;

  -- --- Facts, data-driven --------------------------------------------------
  -- Every entry in `facts` is published if its predicate is registered. No
  -- per-field branching: adding a predicate is a row in fact_predicates plus a
  -- mapping in the ingestion normaliser.
  for v_item in select * from jsonb_array_elements(coalesce(v_normalised -> 'facts', '[]'::jsonb))
  loop
    v_predicate := v_item ->> 'predicate';

    if not exists (select 1 from public.fact_predicates fp where fp.predicate = v_predicate) then
      raise exception 'fact predicate % is not registered in fact_predicates', v_predicate
        using errcode = 'check_violation';
    end if;

    insert into public.facts (
      entity_type, entity_id, predicate, value, source_id, source_record_id,
      source_value, confidence, status, created_by
    )
    values (
      v_candidate.entity_type, v_entity_id, v_predicate,
      v_item -> 'value', v_source_id, v_source_record_id,
      v_item ->> 'sourceValue',
      v_candidate.match_confidence, 'approved', v_actor
    )
    -- Same claim from the same source: refresh the link, do not duplicate.
    on conflict (entity_type, entity_id, predicate, source_id, value)
      where source_id is not null
      do update set source_record_id = excluded.source_record_id,
                    source_value     = excluded.source_value;
  end loop;

  -- --- Relationships -------------------------------------------------------
  for v_item in select * from jsonb_array_elements(coalesce(v_normalised -> 'relatedPeople', '[]'::jsonb))
  loop
    v_role := coalesce(v_item ->> 'role', 'associated');
    v_predicate := case v_role
      when 'architect' then 'built_by'
      when 'creator'   then 'built_by'
      when 'owner'     then 'owned_by'
      else 'associated_with'
    end;

    v_person_id := public.resolve_person_from_source(
      v_item ->> 'label', v_source_id, v_item ->> 'externalId');

    insert into public.entity_relationships (
      subject_type, subject_id, predicate, object_type, object_id,
      note, source_id, source_record_id, import_run_id, confidence, status, created_by
    )
    values (
      'place', v_entity_id, v_predicate, 'person', v_person_id,
      -- The source's own word for the role, so mapping to a broader predicate
      -- does not lose the nuance. "founder" is not the same as "associated".
      'source role: ' || v_role,
      v_source_id, v_source_record_id, v_candidate.import_run_id,
      v_candidate.match_confidence, 'approved', v_actor
    )
    on conflict (subject_type, subject_id, predicate, object_type, object_id,
                 coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid))
      do update set source_record_id = excluded.source_record_id,
                    import_run_id    = excluded.import_run_id;
  end loop;

  update public.import_candidates
     set published_entity_id = v_entity_id,
         published_at        = now(),
         published_by        = v_actor,
         source_record_id    = v_source_record_id,
         review_note         = coalesce(p_note, review_note)
   where id = p_candidate_id;

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
  'Atomically publish an approved candidate: canonical entity, source record, designations, registered facts and sourced relationships. Editor-only, refuses unresolved conflicts, idempotent.';

revoke all on function public.publish_import_candidate(uuid, text) from public;
grant execute on function public.publish_import_candidate(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Publish preview: exactly what publication WOULD do, mutating nothing.
--
-- This is the contract the review workbench reads, and it is a function rather
-- than logic in the UI so the reviewer sees what the engine will actually do
-- rather than a client's guess at it.
-- ---------------------------------------------------------------------------
create or replace function public.preview_import_candidate(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidate public.import_candidates%rowtype;
  v_normalised jsonb;
  v_source_id uuid;
  v_result jsonb;
  v_place public.places%rowtype;
begin
  if not public.is_editor() then
    raise exception 'previewing an import requires editor authority'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_candidate from public.import_candidates where id = p_candidate_id;
  if not found then
    raise exception 'import candidate % does not exist', p_candidate_id
      using errcode = 'no_data_found';
  end if;

  v_normalised := v_candidate.normalised;
  select s.source_id into v_source_id
    from public.import_sources s
   where s.key = v_normalised #>> '{provenance,sourceId}';

  if v_candidate.matched_entity_id is not null then
    select * into v_place from public.places where id = v_candidate.matched_entity_id;
  end if;

  v_result := jsonb_build_object(
    'candidateId', p_candidate_id,
    'status', v_candidate.status,
    'alreadyPublished', v_candidate.published_entity_id is not null,
    'action', case
      when v_candidate.published_entity_id is not null then 'already_published'
      when v_candidate.matched_entity_id is not null then 'attach_to_existing'
      else 'create_new_place' end,
    'canonicalEntity', case
      when v_place.id is not null then jsonb_build_object(
        'id', v_place.id, 'name', v_place.name, 'slug', v_place.slug,
        'placeType', v_place.place_type,
        'locationAccuracyM', v_place.location_accuracy_m)
      else null end,
    'candidate', jsonb_build_object(
      'name', v_normalised ->> 'name',
      'placeType', v_normalised ->> 'placeType',
      'locationAccuracyM', v_normalised ->> 'locationAccuracyMeters',
      'externalIds', coalesce(v_normalised -> 'externalIds', '[]'::jsonb)),
    'sourceMapped', v_source_id is not null,
    -- Facts that would be written, with those already held by this source
    -- marked, so a reviewer can see what is genuinely new.
    'facts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'predicate', f ->> 'predicate',
        'value', f -> 'value',
        'registered', exists (select 1 from public.fact_predicates fp where fp.predicate = f ->> 'predicate'),
        'alreadyPresent', v_candidate.matched_entity_id is not null and exists (
          select 1 from public.facts ef
           where ef.entity_id = v_candidate.matched_entity_id
             and ef.predicate = f ->> 'predicate'
             and ef.source_id = v_source_id
             and ef.value = f -> 'value')))
        from jsonb_array_elements(coalesce(v_normalised -> 'facts', '[]'::jsonb)) f
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', r ->> 'label',
        'role', r ->> 'role',
        'externalId', r ->> 'externalId',
        'predicate', case coalesce(r ->> 'role', 'associated')
          when 'architect' then 'built_by'
          when 'creator'   then 'built_by'
          when 'owner'     then 'owned_by'
          else 'associated_with' end))
        from jsonb_array_elements(coalesce(v_normalised -> 'relatedPeople', '[]'::jsonb)) r
    ), '[]'::jsonb),
    'designations', coalesce(v_normalised -> 'designations', '[]'::jsonb),
    'conflicts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'field', c.field,
        'existingValue', c.existing_value, 'incomingValue', c.incoming_value,
        'reason', c.conflict_reason,
        'resolution', c.resolution_outcome,
        'resolved', c.resolution_outcome is not null and c.resolution_outcome <> 'defer'))
        from public.import_conflicts c where c.import_candidate_id = p_candidate_id
    ), '[]'::jsonb),
    'blockers', (
      select coalesce(jsonb_agg(reason), '[]'::jsonb) from (
        select 'candidate is ' || v_candidate.status::text as reason
         where v_candidate.status <> 'approved'
        union all
        select 'unresolved conflicts: ' || count(*)::text
          from public.import_conflicts c
         where c.import_candidate_id = p_candidate_id
           and (c.resolution_outcome is null or c.resolution_outcome = 'defer')
        having count(*) > 0
        union all
        select 'import source is not mapped to a citable source'
         where v_source_id is null
      ) b)
  );

  return v_result;
end;
$$;

comment on function public.preview_import_candidate(uuid) is
  'Non-mutating preview of exactly what publish_import_candidate() would do. STABLE; editor-only. The contract the review workbench renders.';

revoke all on function public.preview_import_candidate(uuid) from public;
grant execute on function public.preview_import_candidate(uuid) to authenticated, service_role;
