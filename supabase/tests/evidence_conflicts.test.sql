-- pgTAP: what happens when sources disagree, and when they only appear to.
--
-- The distinction this file exists to protect: a church founded in the twelfth
-- century and rebuilt in 1872 is two facts. Reporting that as a conflict would
-- bury the real disagreements under noise, and resolving it would delete half
-- the building's history.
--
-- As in batch 11, every assertion interrogates live state rather than the text
-- of a migration.

begin;
create extension if not exists pgtap;
select plan(39);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test');

insert into public.sources (id, kind, name) values
  ('50000000-0000-0000-0000-000000000001', 'open_data', 'Wikidata'),
  ('50000000-0000-0000-0000-000000000002', 'open_data', 'NHLE');

insert into public.places (id, slug, name, place_type, location, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'st-marys', 'St Mary''s Church', 'church',
   extensions.st_setsrid(extensions.st_makepoint(-1.50, 54.00), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'town-hall', 'Town Hall', 'building',
   extensions.st_setsrid(extensions.st_makepoint(-1.51, 54.01), 4326)::extensions.geography, 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'the-barn', 'The Barn', 'building',
   extensions.st_setsrid(extensions.st_makepoint(-1.52, 54.02), 4326)::extensions.geography, 'approved');

-- ---------------------------------------------------------------------------
-- Classifying a pair
-- ---------------------------------------------------------------------------
select is(
  public.temporal_claim_relation('built', 'exact_year', 1180, 1180, 'altered', 'exact_year', 1872, 1872),
  'different_event',
  'founded 1180 and rebuilt 1872 are two facts, not a disagreement');

select is(
  public.temporal_claim_relation('built', 'exact_year', 1847, 1847, 'built', 'exact_year', 1848, 1848),
  'exact_conflict',
  'built 1847 and built 1848 is a real disagreement');

select is(
  public.temporal_claim_relation('built', 'century', 1301, 1400, 'built', 'century', 1201, 1300),
  'century_conflict',
  'the 14th century and the 13th century disagree');

select is(
  public.temporal_claim_relation('built', 'period', 43, 409, 'built', 'period', 1154, 1484),
  'period_conflict',
  'Roman and medieval disagree');

select is(
  public.temporal_claim_relation('built', 'century', 1301, 1400, 'built', 'exact_year', 1350, 1350),
  'compatible_refinement',
  'a source that says 1350 refines a source that says 14th century rather than contradicting it');

select is(
  public.temporal_claim_relation('built', 'exact_year', 1847, 1847, 'built', 'exact_year', 1847, 1847),
  'duplicate_equivalent',
  'two sources saying the same thing is agreement');

select is(
  public.temporal_claim_relation('built', 'range', 1840, 1850, 'built', 'range', 1845, 1860),
  'range_overlap',
  'overlapping ranges are reported as overlap, not as equality');

select is(
  public.temporal_claim_relation('built', 'range', 1600, 1650, 'built', 'range', 1800, 1850),
  'range_disagreement',
  'ranges that never meet disagree');

select is(
  public.temporal_claim_relation('built', 'exact_year', null, null, 'built', 'exact_year', 1848, 1848),
  'indeterminate',
  'a claim with no years cannot be compared, and says so rather than guessing');

-- Symmetry: the answer must not depend on argument order.
select is(
  public.temporal_claim_relation('built', 'century', 1301, 1400, 'built', 'exact_year', 1350, 1350),
  public.temporal_claim_relation('built', 'exact_year', 1350, 1350, 'built', 'century', 1301, 1400),
  'the relation is the same whichever claim is asked about first');

-- ---------------------------------------------------------------------------
-- Across the corpus
-- ---------------------------------------------------------------------------
insert into public.temporal_associations
  (entity_type, entity_id, association_type, start_year, end_year, precision, period_id,
   source_id, display_label, source_property, source_rank) values
  -- A church with a foundation and a rebuilding: two facts.
  ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'built', 1180, 1180, 'exact_year', 'medieval',
   '50000000-0000-0000-0000-000000000001', '1180', 'P571', 'normal'),
  ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'altered', 1872, 1872, 'exact_year', 'victorian',
   '50000000-0000-0000-0000-000000000001', '1872', 'P793', 'normal'),
  -- A town hall two sources genuinely disagree about.
  ('place', 'aaaaaaaa-0000-0000-0000-000000000002', 'built', 1847, 1847, 'exact_year', 'victorian',
   '50000000-0000-0000-0000-000000000001', '1847', 'P571', 'normal'),
  ('place', 'aaaaaaaa-0000-0000-0000-000000000002', 'built', 1848, 1848, 'exact_year', 'victorian',
   '50000000-0000-0000-0000-000000000002', '1848', null, null),
  -- A barn one source dates loosely and another precisely: agreement.
  ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'built', 1701, 1800, 'century', 'georgian',
   '50000000-0000-0000-0000-000000000002', '18th century', null, null),
  ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'built', 1750, 1750, 'exact_year', 'georgian',
   '50000000-0000-0000-0000-000000000001', '1750', 'P571', 'preferred');

select is(
  (select count(*) from public.temporal_conflicts()),
  1::bigint, 'exactly one genuine conflict across the corpus');

select is(
  (select place_slug from public.temporal_conflicts()),
  'town-hall', 'and it is the place the sources actually disagree about');

select is(
  (select relation from public.temporal_conflicts()),
  'exact_conflict', 'classified as an exact conflict');

select is(
  (select count(*) from public.temporal_conflicts() where place_slug = 'st-marys'),
  0::bigint, 'the church is not a conflict — it has a foundation and a rebuilding');

select is(
  (select count(*) from public.temporal_conflicts() where place_slug = 'the-barn'),
  0::bigint, 'and neither is the barn, where the precise claim refines the loose one');

select is(
  (select pairs from public.temporal_relation_summary() where relation = 'different_event'),
  1::bigint, 'the summary counts agreement as well as disagreement');

select is(
  (select pairs from public.temporal_relation_summary() where relation = 'compatible_refinement'),
  1::bigint, 'including refinements');

select ok(
  (select count(*) from public.temporal_conflicts() where a_source = b_source) = 0,
  'a conflict names both sources so it can be adjudicated');

-- Which claim lands on which side of the pair depends on the order of two
-- random uuids, so the assertion must not assume an orientation. Exactly one
-- of the two carries a property and the other is name-derived.
select is(
  (select coalesce(a_property, b_property) from public.temporal_conflicts()),
  'P571', 'and the property the claim came from, whichever side it sits on');

-- ---------------------------------------------------------------------------
-- One record describing several structures is not a disagreement
-- ---------------------------------------------------------------------------
-- Measured against the real corpus, this was the largest single cause of false
-- conflicts: "2 Raised Grave Slabs One to John Scott Dated 1744 the Other to
-- Gregory Tomlinson Dated 1681" is one listing about two objects, and Whilom
-- was comparing them as though two sources had contradicted each other.
insert into public.source_records (id, source_id, entity_type, entity_id, external_id)
values ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
        'place', 'aaaaaaaa-0000-0000-0000-000000000001', 'shared-listing');

insert into public.temporal_associations
  (entity_type, entity_id, association_type, start_year, end_year, precision,
   source_id, source_record_id, display_label) values
  ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'existed', 1744, 1744, 'exact_year',
   '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '1744'),
  ('place', 'aaaaaaaa-0000-0000-0000-000000000001', 'existed', 1681, 1681, 'exact_year',
   '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '1681');

select ok(
  public.temporal_same_description(
    '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', null,
    '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', null),
  'two claims read out of one piece of text are recognised as one description');

select ok(
  not public.temporal_same_description(
    '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'P571',
    '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'P571'),
  'but two structured statements stay comparable, even on the same record');

select ok(
  not public.temporal_same_description(null, null, null, null, null, null),
  'and an unknown record is never treated as shared, which would silence real disagreements');

select is(
  (select count(*) from public.temporal_conflicts()
    where place_slug = 'st-marys' and relation = 'exact_conflict'),
  0::bigint, 'two dates in one listing are not reported as a conflict');

select is(
  (select pairs from public.temporal_relation_summary() where relation = 'same_description_components'),
  1::bigint, 'they are reported as components of one description instead');

-- ---------------------------------------------------------------------------
-- Multiple phases survive
-- ---------------------------------------------------------------------------
-- The point of not resolving conflicts: both phases still drive the map.
select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'at', 1180) where slug = 'st-marys'),
  1::bigint, 'the church is findable at its foundation');

select is(
  (select count(*) from public.map_places(-1.6, 53.9, -1.4, 54.1, null, 250, null, null, null,
    null, null, false, 'at', 1872) where slug = 'st-marys'),
  1::bigint, 'and at its rebuilding');

select is(
  (select count(*) from public.place_temporal_claims('aaaaaaaa-0000-0000-0000-000000000002')),
  2::bigint, 'both sides of a disagreement are kept; neither importer wins by running last');

-- ---------------------------------------------------------------------------
-- Rank
-- ---------------------------------------------------------------------------
select is(
  (select source_rank from public.temporal_associations
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000003' and start_year = 1750),
  'preferred', 'the source''s own confidence signal is preserved');

select throws_ok(
  $$insert into public.temporal_associations
      (entity_type, entity_id, association_type, start_year, end_year, precision, source_rank)
    values ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'built', 1900, 1900, 'exact_year', 'deprecated')$$,
  '23514',
  null,
  'a statement the source marks deprecated may not be stored as evidence at all');

select throws_ok(
  $$insert into public.temporal_associations
      (entity_type, entity_id, association_type, start_year, end_year, precision, source_rank)
    values ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'built', 1900, 1900, 'exact_year', 'excellent')$$,
  '23514',
  null,
  'and an unrecognised rank is refused rather than stored');

select lives_ok(
  $$insert into public.temporal_associations
      (entity_type, entity_id, association_type, start_year, end_year, precision, source_rank)
    values ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'existed', 1900, 1900, 'exact_year', 'normal')$$,
  'while a normal-rank statement is ordinary evidence');

-- ---------------------------------------------------------------------------
-- Provenance carried by the new properties
-- ---------------------------------------------------------------------------
select is(
  (select source_property from public.temporal_associations
    where entity_id = 'aaaaaaaa-0000-0000-0000-000000000001' and association_type = 'altered'),
  'P793', 'a claim records which source property produced it');

select ok(
  (select count(distinct source_property) from public.temporal_associations
    where source_property is not null) >= 2,
  'claims from different properties stay distinguishable');

-- ---------------------------------------------------------------------------
-- The batch 11 contract still holds under the new sources
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.temporal_associations
      (entity_type, entity_id, association_type, start_year, end_year, precision, display_label, source_property)
    values ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'associated', 410, 1484, 'period', '1350', 'P2348')$$,
  '23514',
  null,
  'a period claim from the new vocabulary still may not display a year');

select lives_ok(
  $$insert into public.temporal_associations
      (entity_type, entity_id, association_type, start_year, end_year, precision, display_label, source_property)
    values ('place', 'aaaaaaaa-0000-0000-0000-000000000003', 'associated', 410, 1484, 'period', 'Middle Ages', 'P2348')$$,
  'while the source''s own broader term is exactly what it should say');

-- A term broader than any registry period keeps its own words.
select is(
  (select public.temporal_claim_label('period', 410, 1484, null, 'Middle Ages')),
  'Middle Ages', 'and Whilom repeats the source rather than substituting its nearest period name');

select is(
  (select count(*) from public.temporal_associations
    where start_year = 0 or end_year = 0),
  0::bigint, 'no new source introduced a year zero');

-- ---------------------------------------------------------------------------
-- The public boundary
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '';
set local role anon;

select ok(
  (select count(*) from public.temporal_conflicts()) >= 0,
  'a visitor may see that sources disagree');

select is(
  (select count(*) from public.temporal_quarantine),
  0::bigint, 'but still sees nothing of what Whilom refused to read');

reset role;

select * from finish();
rollback;
