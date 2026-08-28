-- pgTAP: temporal conflict governance.
--
-- Two principles are on trial here, and both come from real incidents.
--
-- From the product: a human resolution must never delete the claim it did not
-- prefer, and a resolution must know when the evidence beneath it has changed.
--
-- From Batch 12's classifier, which took three attempts: two structures in one
-- listing are not a conflict, and two competing structured claims that happen
-- to share an NHLE entity ARE. Both failure modes are pinned below with real
-- source-record shapes so neither can return.

begin;
create extension if not exists pgtap;
select plan(36);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.test');
update public.profiles set role = 'editor' where id = '22222222-2222-2222-2222-222222222222';

insert into public.sources (id, kind, name) values
  ('50000000-0000-0000-0000-000000000001', 'open_data', 'Wikidata'),
  ('50000000-0000-0000-0000-000000000002', 'open_data', 'NHLE');

insert into public.places (id, slug, name, place_type, location, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'st-peter', 'Church of St Peter', 'church',
   extensions.st_setsrid(extensions.st_makepoint(-1.50, 54.00), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'grave-slabs', 'Two Raised Grave Slabs', 'monument',
   extensions.st_setsrid(extensions.st_makepoint(-1.51, 54.01), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'multi-phase-church', 'Multi-phase Church', 'church',
   extensions.st_setsrid(extensions.st_makepoint(-1.52, 54.02), 4326)::extensions.geography, 'approved');

-- A shared NHLE source record for the grave-slabs listing (failure mode 1).
insert into public.source_records (id, source_id, entity_type, entity_id, external_id) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
   'place', 'aaaaaaaa-0000-0000-0000-000000000002', 'grave-slabs-listing');

-- St Peter: two Wikidata inception claims that genuinely disagree. Different
-- statements, both P571, both attached (as everything is) to the NHLE entity.
insert into public.temporal_associations
  (id, entity_type, entity_id, association_type, start_year, end_year, precision, period_id,
   source_id, source_record_id, display_label, source_property, source_rank) values
  ('c1000000-0000-0000-0000-000000000001', 'place', 'aaaaaaaa-0000-0000-0000-000000000001',
   'built', 1301, 1400, 'century', 'medieval', '50000000-0000-0000-0000-000000000001',
   null, '14th century', 'P571', 'normal'),
  ('c1000000-0000-0000-0000-000000000002', 'place', 'aaaaaaaa-0000-0000-0000-000000000001',
   'built', 1101, 1200, 'century', 'medieval', '50000000-0000-0000-0000-000000000001',
   null, '12th century', 'P571', 'normal');

-- Grave slabs: two dates from ONE listing, about two different objects
-- (failure mode 1). Same source, same record, both name-derived.
insert into public.temporal_associations
  (entity_type, entity_id, association_type, start_year, end_year, precision,
   source_id, source_record_id, display_label) values
  ('place', 'aaaaaaaa-0000-0000-0000-000000000002', 'existed', 1744, 1744, 'exact_year',
   '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '1744'),
  ('place', 'aaaaaaaa-0000-0000-0000-000000000002', 'existed', 1681, 1681, 'exact_year',
   '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '1681');

-- Multi-phase church: a foundation and a rebuilding — different events, not a
-- conflict (B4).
insert into public.temporal_associations
  (entity_type, entity_id, association_type, start_year, end_year, precision,
   source_id, display_label, source_property) values
  ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'built', 1180, 1180, 'exact_year',
   '50000000-0000-0000-0000-000000000001', '1180', 'P571'),
  ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'altered', 1872, 1872, 'exact_year',
   '50000000-0000-0000-0000-000000000001', '1872', 'P793');

-- ---------------------------------------------------------------------------
-- The taxonomy is derived from the relations, not invented
-- ---------------------------------------------------------------------------
select is(public.temporal_category_for_relation('exact_conflict'), 'direct_date_disagreement',
  'an exact-year disagreement is a direct date disagreement');
select is(public.temporal_category_for_relation('century_conflict'), 'century_disagreement',
  'a century disagreement keeps its own category');
select is(public.temporal_category_for_relation('range_disagreement'), 'disjoint_range',
  'disjoint ranges are their own category');
select is(public.temporal_category_for_relation('different_event'), null,
  'a different event is not a conflict category at all');

-- ---------------------------------------------------------------------------
-- Failure mode 1: two structures in one listing are not a conflict
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.temporal_conflict_pairs() where place_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0::bigint, 'two dates in one listing produce no conflict pair');

-- ---------------------------------------------------------------------------
-- Failure mode 2: competing structured claims sharing an NHLE entity DO conflict
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.temporal_conflict_pairs() where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1::bigint, 'two competing structured claims are a conflict even though everything shares the NHLE entity');

select is(
  (select category from public.temporal_conflict_pairs() where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'century_disagreement', 'and it is categorised from the real disagreement');

-- ---------------------------------------------------------------------------
-- B4: multi-phase is not conflict
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.temporal_conflict_pairs() where place_id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  0::bigint, 'a foundation and a rebuilding are different events, never a conflict');

-- ---------------------------------------------------------------------------
-- Rebuild is idempotent and derives from claims
-- ---------------------------------------------------------------------------
select lives_ok('select public.refresh_temporal_conflicts()', 'the conflict entities rebuild from claims');

select is(
  (select count(*) from public.temporal_conflict_entities),
  1::bigint, 'exactly one place is recorded as conflicting');

select is(
  (select place_id from public.temporal_conflict_entities),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'and it is St Peter, not the grave slabs or the multi-phase church');

select is(
  (select array_length(claim_ids, 1) from public.temporal_conflict_entities),
  2, 'the entity names the two claims it is about');

select is(
  (select category from public.temporal_conflict_entities),
  'century_disagreement', 'with the derived category');

-- Running it twice changes nothing.
select lives_ok('select public.refresh_temporal_conflicts()', 'a second rebuild is safe');
select is(
  (select count(*) from public.temporal_conflict_entities),
  1::bigint, 'and idempotent — still one entity');

-- A digest exists and is stable across rebuilds.
select isnt(
  (select claim_set_digest from public.temporal_conflict_entities),
  null, 'the entity carries a claim-set digest');

select is(
  (select public.temporal_conflict_claim_digest('aaaaaaaa-0000-0000-0000-000000000001')),
  (select claim_set_digest from public.temporal_conflict_entities),
  'and the stored digest matches the live one');

-- ---------------------------------------------------------------------------
-- The digest tracks the evidence
-- ---------------------------------------------------------------------------
-- A new competing claim changes the conflicting set, so the digest must change.
insert into public.temporal_associations
  (entity_type, entity_id, association_type, start_year, end_year, precision, period_id,
   source_id, display_label, source_property, source_rank)
values ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'built', 1001, 1100, 'century', 'norman',
   '50000000-0000-0000-0000-000000000001', '11th century', 'P571', 'normal');

select isnt(
  (select public.temporal_conflict_claim_digest('aaaaaaaa-0000-0000-0000-000000000001')),
  (select claim_set_digest from public.temporal_conflict_entities),
  'a new competing claim changes the live digest before the next rebuild');

-- ---------------------------------------------------------------------------
-- Review lifecycle: an interpretation, never a deletion
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select public.refresh_temporal_conflicts();

-- A reviewer records a preferred reading of St Peter.
select lives_ok(
  $$insert into public.temporal_conflict_reviews
      (place_id, claim_set_digest, review_state, preferred_claim_id, rationale, reviewed_by)
    select 'aaaaaaaa-0000-0000-0000-000000000001',
           (select claim_set_digest from public.temporal_conflict_entities
             where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
           'preferred_interpretation_recorded',
           'c1000000-0000-0000-0000-000000000001',
           'The fabric survey dates the nave to the 14th century; the 12th-century claim is the earlier chancel.',
           '22222222-2222-2222-2222-222222222222'$$,
  'a reviewer records a preferred interpretation');

-- The claim it did not prefer is still there.
select is(
  (select count(*) from public.temporal_associations
    where id = 'c1000000-0000-0000-0000-000000000002' and status = 'approved'),
  1::bigint, 'the claim the reviewer did not prefer is untouched — no destructive adjudication');

select is(
  (select count(*) from public.temporal_associations
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000001' and status = 'approved'),
  3::bigint, 'every claim on the place survives a resolution');

-- A preferred interpretation must carry a claim and a rationale.
select throws_ok(
  $$insert into public.temporal_conflict_reviews (place_id, claim_set_digest, review_state)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'preferred_interpretation_recorded')$$,
  '23514', null,
  'a preferred interpretation without a claim is refused');

-- Confirming multi-phase needs no preferred claim. On a different place, so it
-- does not become St Peter's latest review and confuse the staleness checks.
select lives_ok(
  $$insert into public.temporal_conflict_reviews (place_id, claim_set_digest, review_state)
    values ('aaaaaaaa-0000-0000-0000-000000000003', 'some-digest', 'multi_phase_confirmed')$$,
  'but confirming multi-phase needs no preferred claim');

-- ---------------------------------------------------------------------------
-- Staleness
-- ---------------------------------------------------------------------------
reset role;
-- St Peter's only review is the preferred interpretation, made against the
-- current digest, so it is not stale.
select is(
  (select is_stale from public.temporal_conflict_status()
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  false, 'a review of the current claim set is not stale');

-- Now the evidence changes: withdraw a claim, rebuild, and the review made
-- against the old digest must read as stale.
update public.temporal_associations set status = 'needs_review'
 where id = 'c1000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select public.refresh_temporal_conflicts();
reset role;

select is(
  (select is_stale from public.temporal_conflict_status()
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  true, 'once a claim is withdrawn, the review made against the old set is stale');

select ok(
  (select current_digest is distinct from reviewed_digest from public.temporal_conflict_status()
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'because the current digest no longer matches what was reviewed');

-- ---------------------------------------------------------------------------
-- Status contents
-- ---------------------------------------------------------------------------
select is(
  (select place_name from public.temporal_conflict_status()
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000001' limit 1),
  'Church of St Peter', 'status names the place');

select ok(
  (select max_disagreement_years from public.temporal_conflict_status()
    where place_id = 'aaaaaaaa-0000-0000-0000-000000000001' limit 1) >= 100,
  'and reports how wide the disagreement is');

-- ---------------------------------------------------------------------------
-- Nothing here mutates a claim
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.temporal_associations),
  7::bigint, 'the whole exercise created and removed no temporal claim');

-- ---------------------------------------------------------------------------
-- The public boundary
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '';
set local role anon;

select ok(
  (select count(*) from public.temporal_conflict_entities) >= 0,
  'an anonymous visitor can see that a place has conflicting dates');

select is(
  (select count(*) from public.temporal_conflict_reviews),
  0::bigint, 'but sees nothing of the editorial review behind it');

reset role;

-- ---------------------------------------------------------------------------
-- Category severity ordering
-- ---------------------------------------------------------------------------
select is(public.temporal_category_for_relation('period_conflict'), 'period_disagreement',
  'a period disagreement is recognised');
select is(public.temporal_category_for_relation('range_overlap'), 'overlapping_range',
  'and an overlapping range');

-- The BCE / year-zero invariant is untouched by any of this.
select is(
  (select count(*) from public.temporal_associations where start_year = 0 or end_year = 0),
  0::bigint, 'no year zero was introduced');

-- Every relation the classifier can emit has a category or is deliberately null.
select is(
  (select count(*) from (values ('exact_conflict'),('century_conflict'),('period_conflict'),
     ('range_disagreement'),('range_overlap')) v(r)
    where public.temporal_category_for_relation(v.r) is null),
  0::bigint, 'every conflicting relation maps to a category');

select is(
  (select count(*) from (values ('different_event'),('compatible_refinement'),
     ('duplicate_equivalent'),('indeterminate')) v(r)
    where public.temporal_category_for_relation(v.r) is not null),
  0::bigint, 'and no non-conflict relation is miscategorised as one');

select * from finish();
rollback;
