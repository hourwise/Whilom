-- Deterministic quality audit of the published regional dataset.
--
-- Sampling is by hash of the row's own id rather than random(), so the same
-- database always yields the same sample and a finding can be re-examined
-- rather than merely re-rolled. Famous places get no special treatment: the
-- hash does not know what Fountains Abbey is.
--
-- Emits JSON for the activation summary. Reading it is a human job — this file
-- selects what to look at, it does not decide whether the data is good.

\set ON_ERROR_STOP on
\pset pager off

-- A stable ordering key per row.
create or replace function pg_temp.sample_key(p uuid)
returns bigint language sql immutable as $$
  select ('x' || substr(md5(p::text), 1, 15))::bit(60)::bigint;
$$;

select json_build_object(

  -- --- Every automatic merge -----------------------------------------------
  -- Auto-merges get no sampling while the count stays inspectable. This is the
  -- class with the worst failure mode: a wrong split is a tidy-up job, a wrong
  -- merge destroys information and is very hard to notice once published.
  'automaticMerges', (
    select json_build_object(
      'total', count(*),
      'records', coalesce(json_agg(json_build_object(
        'candidateId', ic.id,
        'sourceRecordId', ic.normalised #>> '{provenance,sourceRecordId}',
        'name', ic.normalised ->> 'name',
        'placeType', ic.normalised ->> 'placeType',
        'placeTypeConfidence', ic.normalised ->> 'placeTypeConfidence',
        'publishedInto', p.name,
        'publishedSlug', p.slug,
        'confidence', ic.match_confidence,
        'sourceRecordsOnTarget', (
          select count(*) from public.source_records sr
           where sr.entity_type = 'place' and sr.entity_id = p.id))
        order by ic.id), '[]'::json))
    from public.import_candidates ic
    join public.places p on p.id = ic.published_entity_id
    -- A merge is a publication that attached to a place another candidate had
    -- already created, which is exactly the set worth auditing.
    where (select count(*) from public.source_records sr
            where sr.entity_type = 'place' and sr.entity_id = p.id) > 1),

  -- --- New canonical places ------------------------------------------------
  'newCanonicals', (
    select coalesce(json_agg(row_to_json(t) order by t.name), '[]'::json) from (
      select p.slug, p.name, p.place_type::text as place_type, p.location_accuracy_m,
             round(extensions.st_x(p.location::extensions.geometry)::numeric, 5) as lng,
             round(extensions.st_y(p.location::extensions.geometry)::numeric, 5) as lat,
             (select string_agg(d.designation::text, ',') from public.place_designations d where d.place_id = p.id) as designations,
             (select count(*) from public.facts f where f.entity_type = 'place' and f.entity_id = p.id) as facts,
             (select count(*) from public.source_records sr where sr.entity_type = 'place' and sr.entity_id = p.id) as source_records
        from public.places p
       order by pg_temp.sample_key(p.id)
       limit 50) t),

  -- --- Review-queued identity cases ---------------------------------------
  'reviewCases', (
    select coalesce(json_agg(row_to_json(t) order by t.name), '[]'::json) from (
      select ic.normalised ->> 'name' as name,
             ic.normalised ->> 'placeType' as place_type,
             ic.normalised #>> '{provenance,sourceRecordId}' as source_record_id,
             ic.match_confidence,
             (select count(*) from public.import_conflicts c where c.import_candidate_id = ic.id) as conflicts
        from public.import_candidates ic
       where ic.status = 'needs_review' and ic.published_entity_id is null
       order by pg_temp.sample_key(ic.id)
       limit 30) t),

  -- --- Conflicts -----------------------------------------------------------
  'conflictCases', (
    select coalesce(json_agg(row_to_json(t) order by t.name), '[]'::json) from (
      select ic.normalised ->> 'name' as name,
             c.field, c.existing_value, c.incoming_value, c.status::text as status
        from public.import_conflicts c
        join public.import_candidates ic on ic.id = c.import_candidate_id
       order by pg_temp.sample_key(c.id)
       limit 20) t),

  -- --- Unusual or fallback classification ----------------------------------
  -- `unknown` is a legitimate answer. What is worth checking is whether the
  -- fallback types are being used as a dumping ground for things that had a
  -- perfectly readable name.
  'unusualClassification', (
    select coalesce(json_agg(row_to_json(t) order by t.name), '[]'::json) from (
      select p.slug, p.name, p.place_type::text as place_type,
             (select string_agg(d.designation::text, ',') from public.place_designations d where d.place_id = p.id) as designations
        from public.places p
       where p.place_type in ('unknown', 'structure', 'building', 'lost_structure', 'ruin')
       order by pg_temp.sample_key(p.id)
       limit 30) t),

  -- --- Large positional uncertainty ----------------------------------------
  'largePositionalUncertainty', (
    select coalesce(json_agg(row_to_json(t) order by t.location_accuracy_m desc), '[]'::json) from (
      select p.slug, p.name, p.place_type::text as place_type, p.location_accuracy_m,
             (select string_agg(d.designation::text, ',') from public.place_designations d where d.place_id = p.id) as designations
        from public.places p
       where p.location_accuracy_m is not null
       order by p.location_accuracy_m desc, pg_temp.sample_key(p.id)
       limit 20) t),

  -- --- Facts and relationships, with their provenance ----------------------
  'factsAndRelationships', (
    select coalesce(json_agg(row_to_json(t) order by t.name), '[]'::json) from (
      select p.name, f.predicate, f.value, f.source_value,
             f.source_id is not null as has_source,
             f.source_record_id is not null as has_source_record,
             s.name as source_name
        from public.facts f
        join public.places p on p.id = f.entity_id and f.entity_type = 'place'
        left join public.sources s on s.id = f.source_id
       order by pg_temp.sample_key(f.id)
       limit 20) t),

  -- --- Provenance completeness --------------------------------------------
  'provenance', (
    select json_build_object(
      'publishedPlaces', count(*),
      'withSourceRecord', count(*) filter (
        where exists (select 1 from public.source_records sr
                       where sr.entity_type = 'place' and sr.entity_id = p.id)),
      'withDesignation', count(*) filter (
        where exists (select 1 from public.place_designations d where d.place_id = p.id)),
      'withLicence', count(*) filter (
        where exists (select 1 from public.source_records sr
                       where sr.entity_type = 'place' and sr.entity_id = p.id
                         and sr.licence is not null)),
      'withAttribution', count(*) filter (
        where exists (select 1 from public.source_records sr
                       where sr.entity_type = 'place' and sr.entity_id = p.id
                         and sr.attribution is not null)))
    from public.places p)

) as audit;
