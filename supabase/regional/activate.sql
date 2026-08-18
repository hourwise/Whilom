-- Governed regional activation.
--
-- Loads the candidates produced by `ingestion/regional/activate.ts` and
-- publishes the safe ones through the ordinary governed contract:
--
--   review_import_candidate(id, 'approved')   the reviewer's decision
--   publish_import_candidate(id)              the governed publication
--
-- Nothing here writes to `places`, `facts`, `source_records` or
-- `entity_relationships` directly. A bulk path that inserted canonical rows
-- would demonstrate that bulk insertion works, not that the contract does — and
-- the contract is what carries provenance, atomicity, idempotency and audit.
--
-- Run twice to prove idempotency; the second run should publish nothing new.

\set ON_ERROR_STOP on
\timing off

-- ---------------------------------------------------------------------------
-- An editor to act as
-- ---------------------------------------------------------------------------
-- Publication requires editor authority. This creates one identity and then
-- acts as it for the whole activation, exactly as a reviewer's session would,
-- rather than reaching around the authority check.
insert into auth.users (id, email)
values ('a0000000-0000-4000-8000-000000000001', 'regional-activation@whilom.test')
on conflict (id) do nothing;

update public.profiles
   set role = 'editor'
 where id = 'a0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Source registry
-- ---------------------------------------------------------------------------
insert into public.sources (id, kind, name, publisher, url, licence, attribution, trust_level)
values (
  'b0000000-0000-4000-8000-000000000001', 'official',
  'National Heritage List for England', 'Historic England',
  'https://historicengland.org.uk/listing/the-list/',
  'OGL-UK-3.0',
  'Contains Historic England information © Historic England. Contains Ordnance Survey data © Crown copyright and database right. Licensed under the Open Government Licence v3.0.',
  'official_source')
on conflict (id) do nothing;

insert into public.import_sources (id, key, display_name, adapter, licence, source_id)
values (
  'c0000000-0000-4000-8000-000000000001', 'historic-england-nhle',
  'Historic England — National Heritage List for England', 'nhle', 'OGL-UK-3.0',
  'b0000000-0000-4000-8000-000000000001')
on conflict (key) do update set source_id = excluded.source_id;

insert into public.import_runs (id, import_source_id, status)
values ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'running')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Staging
-- ---------------------------------------------------------------------------
create temporary table staged_candidates (
  ordinal integer not null,
  id uuid primary key,
  normalised jsonb not null,
  status text not null,
  confidence numeric,
  publication_class text not null,
  policy_reason text,
  matcher_rationale text,
  -- The source record this candidate was matched to, when the matcher was
  -- confident. Resolved to a real place at publish time; see below.
  matched_source_record_id text
);

create temporary table staged_conflicts (
  candidate_id uuid not null,
  field text not null,
  existing_value jsonb,
  incoming_value jsonb
);

\copy staged_candidates (ordinal, id, normalised, status, confidence, publication_class, policy_reason, matcher_rationale, matched_source_record_id) from 'regional-candidates.csv' with (format csv)
\copy staged_conflicts (candidate_id, field, existing_value, incoming_value) from 'regional-conflicts.csv' with (format csv)

-- Candidates are inserted at `needs_review` regardless of class. Approval is a
-- reviewer's act and is performed below through review_import_candidate, so the
-- governed transition is exercised rather than written straight into the column.
insert into public.import_candidates
  (id, import_run_id, entity_type, normalised, match_confidence, status)
select s.id, 'd0000000-0000-4000-8000-000000000001', 'place', s.normalised,
       least(greatest(s.confidence, 0), 1), 'needs_review'
  from staged_candidates s
on conflict (id) do nothing;

-- `predicate` links a conflict to a published fact and is NULL for conflicts
-- about canonical columns. The matcher's conflicts are about place_type and
-- location, which are columns rather than facts, so the link is only set when
-- the field genuinely names a registered predicate — as the column's own
-- comment requires, and as its foreign key enforces.
insert into public.import_conflicts
  (import_candidate_id, entity_type, entity_id, field, predicate, existing_value, incoming_value)
select c.candidate_id, 'place', null, c.field,
       (select fp.predicate from public.fact_predicates fp where fp.predicate = c.field),
       c.existing_value, c.incoming_value
  from staged_conflicts c
 where not exists (
   select 1 from public.import_conflicts x
    where x.import_candidate_id = c.candidate_id and x.field = c.field);

-- ---------------------------------------------------------------------------
-- Governed publication
-- ---------------------------------------------------------------------------
create temporary table publication_log (
  candidate_id uuid not null,
  outcome text not null,          -- published | already_published | refused | failed
  entity_id uuid,
  sqlstate text,
  message text,
  duration_ms double precision not null
);

do $$
declare
  -- Batch size 500: large enough that per-statement overhead is amortised,
  -- small enough that a batch which does fail is a comprehensible unit to
  -- inspect and re-run. Each candidate additionally runs in its own
  -- subtransaction, so one bad record cannot take the other 499 with it.
  batch_size constant integer := 500;
  v_id uuid;
  v_matched_source text;
  v_target uuid;
  v_entity uuid;
  v_started timestamptz;
  v_elapsed double precision;
  v_was_published boolean;
  v_processed integer := 0;
begin
  -- Act as the editor for the whole run.
  perform set_config('request.jwt.claims',
    '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', false);

  -- Processing order, not id order. A confident match always refers to a record
  -- the matcher saw EARLIER in the run, so publishing in that order guarantees
  -- the target place exists by the time the match needs it.
  for v_id, v_matched_source in
    select s.id, nullif(s.matched_source_record_id, '')
      from staged_candidates s
     where s.publication_class = 'AUTO_SAFE'
     order by s.ordinal
  loop
    v_started := clock_timestamp();
    begin
      -- Resolve the match to a real canonical place.
      --
      -- The matcher works in synthetic within-run handles, which mean nothing
      -- here; what it exports is the source record it matched. That record has
      -- already been published, so its source_records row names the place to
      -- attach to. Written onto the candidate — where matched_entity_id is the
      -- matcher's own output, exactly as `normalised` is — and then it is
      -- publish_import_candidate that decides what to do with it.
      if v_matched_source is not null then
        select sr.entity_id into v_target
          from public.source_records sr
         where sr.source_id = 'b0000000-0000-4000-8000-000000000001'
           and sr.external_id = v_matched_source
           and sr.entity_type = 'place'
         limit 1;

        if v_target is not null then
          update public.import_candidates
             set matched_entity_id = v_target
           where id = v_id and published_entity_id is null;
        end if;
      end if;
      -- Already published by an earlier activation? Then re-reviewing is
      -- correctly refused by the contract — a published candidate is history,
      -- and pretending otherwise would imply canonical data can be retracted by
      -- changing a status. So a replay skips straight to publish, which returns
      -- the existing entity and changes nothing. That is the idempotency claim.
      select ic.published_entity_id is not null into v_was_published
        from public.import_candidates ic where ic.id = v_id;

      if not v_was_published then
        perform public.review_import_candidate(v_id, 'approved',
          'Regional activation: auto-safe under publication policy 1.0.0');
      end if;

      v_entity := public.publish_import_candidate(v_id,
        'Regional activation WHILOM_REGION_YORKSHIRE_V1@1.0.0');

      v_elapsed := extract(epoch from clock_timestamp() - v_started) * 1000;
      insert into publication_log
        values (v_id, case when v_was_published then 'already_published' else 'published' end,
                v_entity, null, null, v_elapsed);
    exception
      when insufficient_privilege or check_violation or foreign_key_violation or no_data_found then
        -- A governed refusal. Expected for anything the contract declines, and
        -- recorded rather than swallowed.
        v_elapsed := extract(epoch from clock_timestamp() - v_started) * 1000;
        insert into publication_log
          values (v_id, 'refused', null, sqlstate, sqlerrm, v_elapsed);
      when others then
        v_elapsed := extract(epoch from clock_timestamp() - v_started) * 1000;
        insert into publication_log
          values (v_id, 'failed', null, sqlstate, sqlerrm, v_elapsed);
    end;

    v_processed := v_processed + 1;
    if v_processed % batch_size = 0 then
      raise notice 'published % candidates', v_processed;
    end if;
  end loop;

  raise notice 'activation complete: % candidates considered', v_processed;
end;
$$;

update public.import_runs
   set status = 'succeeded', finished_at = now(),
       stats = (select jsonb_object_agg(outcome, n)
                  from (select outcome, count(*) as n from publication_log group by outcome) t)
 where id = 'd0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Result
-- ---------------------------------------------------------------------------
select json_build_object(
  'candidatesConsidered', (select count(*) from staged_candidates where publication_class = 'AUTO_SAFE'),
  'reviewQueued',         (select count(*) from staged_candidates where publication_class = 'REVIEW_REQUIRED'),
  'published',            (select count(*) from publication_log where outcome = 'published'),
  'attachedToExisting',   (select count(*) from staged_candidates s
                             join publication_log l on l.candidate_id = s.id
                            where l.outcome = 'published'
                              and nullif(s.matched_source_record_id, '') is not null),
  'newPlacesCreated',     (select count(*) from staged_candidates s
                             join publication_log l on l.candidate_id = s.id
                            where l.outcome = 'published'
                              and nullif(s.matched_source_record_id, '') is null),
  'idempotentNoOps',      (select count(*) from publication_log where outcome = 'already_published'),
  'refused',              (select count(*) from publication_log where outcome = 'refused'),
  'failed',               (select count(*) from publication_log where outcome = 'failed'),
  'batchSize',            500,
  'publishLatencyMs', (
    select json_build_object(
      'total', round(sum(duration_ms)::numeric, 1),
      'mean',  round(avg(duration_ms)::numeric, 3),
      'p50',   round(percentile_cont(0.5) within group (order by duration_ms)::numeric, 3),
      'p95',   round(percentile_cont(0.95) within group (order by duration_ms)::numeric, 3),
      'max',   round(max(duration_ms)::numeric, 3))
    from publication_log),
  'recordsPerSecond', (
    select case when sum(duration_ms) > 0
      then round((count(*) / (sum(duration_ms) / 1000))::numeric, 1) else 0 end
    from publication_log),
  'failures', coalesce((
    select json_agg(json_build_object('candidate', candidate_id, 'sqlstate', sqlstate, 'message', left(message, 200)))
      from (select * from publication_log where outcome in ('failed', 'refused') limit 25) f), '[]'::json)
) as activation_result;
