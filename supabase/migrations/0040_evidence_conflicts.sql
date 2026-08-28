-- 0040_evidence_conflicts.sql
-- What to do when two sources disagree, and how to tell that from two sources
-- describing different things.
--
-- Batch 11 imported from one external source and conflict was theoretical.
-- Batch 12 adds governed events and a controlled period vocabulary alongside
-- the register's own words, so a place can now carry claims from several
-- properties of several sources — and the difference between
--
--     founded 1180 / rebuilt 1872          (two facts)
--     built 1847 / built 1848              (a disagreement)
--
-- has to be decided by something better than which importer ran last.
--
-- Nothing here silently resolves anything. Whilom's evidence model keeps every
-- provenance-backed claim; this migration only *classifies* the relationships
-- so a disagreement can be seen, counted and reviewed instead of averaged away.

-- ---------------------------------------------------------------------------
-- Statement provenance
-- ---------------------------------------------------------------------------
alter table public.temporal_associations
  /** Which source property produced this, e.g. P571, P793, P2348. */
  add column source_property text,
  /**
   * The source's own confidence signal, where it has one.
   *
   * Wikidata ranks each statement preferred, normal or deprecated. Deprecated
   * means its own editors consider it wrong or superseded, and those are never
   * imported — but recording the rank of what WAS imported is what lets a later
   * reviewer see that a claim came in as `preferred` rather than assume it.
   */
  add column source_rank text,
  add constraint temporal_associations_rank_known
    check (source_rank is null or source_rank in ('preferred', 'normal', 'deprecated'));

comment on column public.temporal_associations.source_property is
  'The source property a claim came from. Two claims from different properties are usually different facts, not a conflict.';

-- A deprecated statement must not reach the table at all. The importer refuses
-- them; this makes the rule structural rather than a property of one importer.
alter table public.temporal_associations
  add constraint temporal_associations_no_deprecated_evidence
  check (source_rank is null or source_rank <> 'deprecated');

comment on constraint temporal_associations_no_deprecated_evidence on public.temporal_associations is
  'A statement the source itself marks deprecated is known-bad evidence and may not be stored as approved evidence at all.';

create index temporal_associations_property_idx
  on public.temporal_associations (source_property)
  where status = 'approved';

-- ---------------------------------------------------------------------------
-- Classifying a pair of claims
-- ---------------------------------------------------------------------------
/**
 * How two temporal claims about the same place relate.
 *
 * Returned as a label rather than a boolean, because "these disagree" and
 * "these describe different events" need different handling and a boolean
 * would collapse them.
 *
 *   duplicate_equivalent  identical span, identical meaning — agreement
 *   different_event       different association types; a church founded in the
 *                         12th century and rebuilt in 1872 is two facts
 *   compatible_refinement one span contains the other: "14th century" and
 *                         "1350" agree, and the narrower is more informative
 *   range_overlap         spans overlap without either containing the other
 *   exact_conflict        both exact years, and different
 *   century_conflict      century-level claims naming different centuries
 *   period_conflict       period-level claims naming different periods
 *   range_disagreement    spans that do not meet at all
 */
create or replace function public.temporal_claim_relation(
  a_association public.temporal_association_type,
  a_precision public.temporal_precision,
  a_start integer,
  a_end integer,
  b_association public.temporal_association_type,
  b_precision public.temporal_precision,
  b_start integer,
  b_end integer
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    -- Different kinds of claim are different facts about the same place. This
    -- test comes first deliberately: a demolition in 1940 does not contradict a
    -- construction in 1780, and treating it as a conflict would bury the real
    -- disagreements under noise.
    when a_association is distinct from b_association then 'different_event'
    when a_start is null or b_start is null or a_end is null or b_end is null then 'indeterminate'
    when a_start = b_start and a_end = b_end then 'duplicate_equivalent'
    -- One span inside the other: the source that knows more is not in conflict
    -- with the source that knows less.
    when (a_start >= b_start and a_end <= b_end) or (b_start >= a_start and b_end <= a_end)
      then 'compatible_refinement'
    when a_start <= b_end and b_start <= a_end then 'range_overlap'
    when a_precision = 'exact_year' and b_precision = 'exact_year' then 'exact_conflict'
    when a_precision = 'century' and b_precision = 'century' then 'century_conflict'
    when a_precision = 'period' and b_precision = 'period' then 'period_conflict'
    else 'range_disagreement'
  end;
$$;

comment on function public.temporal_claim_relation is
  'How two temporal claims relate. "founded 1180" and "rebuilt 1872" are different events, not a conflict — distinguishing that is what keeps real disagreements visible.';

grant execute on function public.temporal_claim_relation(
  public.temporal_association_type, public.temporal_precision, integer, integer,
  public.temporal_association_type, public.temporal_precision, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conflicts across the corpus
-- ---------------------------------------------------------------------------
/**
 * Every pair of approved claims on the same place, classified.
 *
 * Ordered by claim id so each pair appears once rather than twice, and so the
 * output is stable between runs.
 */
create or replace function public.temporal_conflicts(max_rows integer default 200)
returns table (
  place_id uuid,
  place_slug text,
  place_name text,
  relation text,
  a_label text,
  a_association text,
  a_source text,
  a_property text,
  b_label text,
  b_association text,
  b_source text,
  b_property text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id, p.slug, p.name,
    public.temporal_claim_relation(
      a.association_type, a.precision, a.start_year, a.end_year,
      b.association_type, b.precision, b.start_year, b.end_year),
    public.temporal_claim_label(a.precision, a.start_year, a.end_year, a.period_id, a.display_label),
    a.association_type::text,
    coalesce(sa.name, 'name-derived'),
    a.source_property,
    public.temporal_claim_label(b.precision, b.start_year, b.end_year, b.period_id, b.display_label),
    b.association_type::text,
    coalesce(sb.name, 'name-derived'),
    b.source_property
  from public.temporal_associations a
  join public.temporal_associations b
    on b.entity_type = a.entity_type
   and b.entity_id = a.entity_id
   and b.id > a.id
  join public.places p on p.id = a.entity_id and p.status = 'approved'
  left join public.sources sa on sa.id = a.source_id
  left join public.sources sb on sb.id = b.source_id
  where a.entity_type = 'place'
    and a.status = 'approved'
    and b.status = 'approved'
    and public.temporal_claim_relation(
      a.association_type, a.precision, a.start_year, a.end_year,
      b.association_type, b.precision, b.start_year, b.end_year)
      in ('exact_conflict', 'century_conflict', 'period_conflict', 'range_disagreement', 'range_overlap')
  order by p.name, a.id
  limit least(greatest(coalesce(max_rows, 200), 1), 1000);
$$;

comment on function public.temporal_conflicts is
  'Pairs of approved claims on the same place that genuinely disagree. Compatible refinements and different event types are excluded, because they are not conflicts.';

grant execute on function public.temporal_conflicts(integer) to anon, authenticated;

/**
 * A count of every relation kind across the corpus, for the build report.
 *
 * Includes the agreeable ones. A report showing only conflicts cannot say
 * whether the sources mostly agree, which is the more interesting number.
 */
create or replace function public.temporal_relation_summary()
returns table (relation text, pairs bigint, places bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    public.temporal_claim_relation(
      a.association_type, a.precision, a.start_year, a.end_year,
      b.association_type, b.precision, b.start_year, b.end_year) as relation,
    count(*)::bigint,
    count(distinct a.entity_id)::bigint
  from public.temporal_associations a
  join public.temporal_associations b
    on b.entity_type = a.entity_type
   and b.entity_id = a.entity_id
   and b.id > a.id
  join public.places p on p.id = a.entity_id and p.status = 'approved'
  where a.entity_type = 'place'
    and a.status = 'approved'
    and b.status = 'approved'
  group by 1
  order by 2 desc;
$$;

comment on function public.temporal_relation_summary is
  'Every relation kind between co-located claims, agreements included, so the report can say how much the sources agree rather than only where they do not.';

grant execute on function public.temporal_relation_summary() to anon, authenticated;
