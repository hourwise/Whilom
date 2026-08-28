-- 0041_same_record_components.sql
-- A source is not disagreeing with itself when it describes two things at once.
--
-- 0040's classifier works exactly as specified and, run against the real
-- corpus, reported 120 "conflicts" of which a large share are nothing of the
-- kind. The examples say it plainly:
--
--   "2 Raised Grave Slabs One to John Scott Dated 1744 the Other to Gregory
--    Tomlinson Dated 1681"                                  -> exact_conflict
--   "Allerston medieval manorial centre, dovecotes and 17th century gunpowder
--    works"                                             -> range_disagreement
--   "All the Medieval Monuments, C18 Font and C18 Sundial" -> range_disagreement
--
-- Each is one list entry describing several structures of different dates.
-- Whilom read both dates correctly and then compared them as though two
-- sources had contradicted each other. One source stated both, in one
-- sentence, about different objects.
--
-- The pairwise classifier in 0040 is left alone: it compares spans and knows
-- nothing about provenance, which is the right division of labour. The
-- corpus-level views gain the provenance test.

/**
 * Whether two claims are components of one written description.
 *
 * The first attempt at this asked only whether the claims shared a source
 * record, and suppressed every conflict in the corpus — 217 pairs and 0
 * conflicts, which is not a credible number. The reason is worth recording:
 * Wikidata claims are attached to the NHLE source record, because the list
 * entry is the join key. So EVERY claim on a place shares a source record
 * whichever source produced it, and the test silenced genuine cross-source
 * disagreement along with the false positives.
 *
 * The measured false-positive class is narrower than that. It is claims read
 * out of ONE PIECE OF TEXT: the name extractor is built to produce several
 * claims from one string, and the grave-slabs entry above is one sentence
 * about two objects. A structured statement produces one claim and is
 * comparable with any other.
 *
 * So the test is: both claims name-derived, from the same source, from the
 * same record. Everything structured stays comparable — which is what keeps
 * two competing Wikidata inception dates visible as the conflict they are.
 */
create or replace function public.temporal_same_description(
  a_source_id uuid, a_record uuid, a_property text,
  b_source_id uuid, b_record uuid, b_property text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select a_property is null and b_property is null
     and a_record is not null and b_record is not null and a_record = b_record
     and a_source_id is not null and b_source_id is not null and a_source_id = b_source_id;
$$;

comment on function public.temporal_same_description is
  'True when two claims were read out of one piece of source text. "The C18 font and the medieval monuments" is one description of two objects, not two sources in conflict. Structured statements always stay comparable.';

grant execute on function public.temporal_same_description(uuid, uuid, text, uuid, uuid, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conflicts, provenance-aware
-- ---------------------------------------------------------------------------
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
    -- One description of several structures is not a disagreement.
    and not public.temporal_same_description(
          a.source_id, a.source_record_id, a.source_property,
          b.source_id, b.source_record_id, b.source_property)
    and public.temporal_claim_relation(
      a.association_type, a.precision, a.start_year, a.end_year,
      b.association_type, b.precision, b.start_year, b.end_year)
      in ('exact_conflict', 'century_conflict', 'period_conflict', 'range_disagreement', 'range_overlap')
  order by p.name, a.id
  limit least(greatest(coalesce(max_rows, 200), 1), 1000);
$$;

comment on function public.temporal_conflicts is
  'Pairs of approved claims that genuinely disagree. Compatible refinements, different event types and components of one description are all excluded, because none of them is a conflict.';

-- ---------------------------------------------------------------------------
-- Relation summary, with the new category visible
-- ---------------------------------------------------------------------------
create or replace function public.temporal_relation_summary()
returns table (relation text, pairs bigint, places bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case
      when public.temporal_same_description(
             a.source_id, a.source_record_id, a.source_property,
             b.source_id, b.source_record_id, b.source_property)
        then 'same_description_components'
      else public.temporal_claim_relation(
        a.association_type, a.precision, a.start_year, a.end_year,
        b.association_type, b.precision, b.start_year, b.end_year)
    end as relation,
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
  'Every relation kind between co-located claims, including agreements and single-description components, so the report can say how much the sources actually agree.';
