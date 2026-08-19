-- 0042_conflict_governance.sql
-- Make temporal disagreement a governed state, not a query result.
--
-- Batch 12 built the classifier: temporal_conflicts() finds pairs of claims on
-- one place that genuinely disagree, and against the real corpus it reports 80.
-- What Batch 12 did NOT build is anywhere to record that a human has looked at
-- one — so a reviewed conflict and an unreviewed one are indistinguishable, and
-- a review, once made, has no way to know it has gone stale.
--
-- This migration adds three things and takes nothing away:
--
--   1. a durable conflict entity, rebuilt from the source claims rather than
--      stored in parallel with them, so a conflict can never disagree with the
--      evidence it summarises;
--   2. a review lifecycle whose resolutions are INTERPRETATIONS with
--      provenance — a preferred reading never deletes the claim it did not
--      prefer;
--   3. a claim-set digest, so a review knows when the claims underneath it have
--      changed and it can no longer speak for them.
--
-- The governing rule from the brief, enforced structurally below: no automated
-- destructive adjudication. Nothing here mutates or removes a temporal claim.

-- ---------------------------------------------------------------------------
-- The taxonomy, derived from the real 80
-- ---------------------------------------------------------------------------
-- Not invented. The corpus's genuine conflicts are 60 direct-date, 17
-- disjoint-range and 3 century, so the categories are exactly the shapes the
-- data actually takes. `temporal_claim_relation` already emits these; this
-- names them as a governed type.
create type public.temporal_conflict_category as enum (
  'direct_date_disagreement',   -- two exact years differ: "built 1847" vs "built 1848"
  'century_disagreement',       -- century claims naming different centuries
  'period_disagreement',        -- period claims naming different periods
  'disjoint_range',             -- ranges that never meet
  'overlapping_range'           -- ranges overlap without either containing the other
);

comment on type public.temporal_conflict_category is
  'The kinds of genuine temporal disagreement the corpus contains. Derived from the real conflict set (60 direct-date, 17 disjoint-range, 3 century), not from an imagined ontology.';

create or replace function public.temporal_category_for_relation(relation text)
returns public.temporal_conflict_category
language sql
immutable
security invoker
set search_path = ''
as $$
  select case relation
    when 'exact_conflict' then 'direct_date_disagreement'
    when 'century_conflict' then 'century_disagreement'
    when 'period_conflict' then 'period_disagreement'
    when 'range_disagreement' then 'disjoint_range'
    when 'range_overlap' then 'overlapping_range'
    else null
  end::public.temporal_conflict_category;
$$;

grant execute on function public.temporal_category_for_relation(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conflicting claim pairs
-- ---------------------------------------------------------------------------
-- The classifier at claim-id granularity, so a conflict entity can name exactly
-- which claims it is about. Shares every exclusion with temporal_conflicts():
-- different events, compatible refinements and single-description components are
-- not disagreements.
create or replace function public.temporal_conflict_pairs()
returns table (
  place_id uuid,
  a_id uuid,
  b_id uuid,
  relation text,
  category public.temporal_conflict_category,
  disagreement_years integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.entity_id,
    a.id, b.id,
    public.temporal_claim_relation(
      a.association_type, a.precision, a.start_year, a.end_year,
      b.association_type, b.precision, b.start_year, b.end_year) as relation,
    public.temporal_category_for_relation(public.temporal_claim_relation(
      a.association_type, a.precision, a.start_year, a.end_year,
      b.association_type, b.precision, b.start_year, b.end_year)),
    abs(coalesce(a.start_year, 0) - coalesce(b.start_year, 0))
  from public.temporal_associations a
  join public.temporal_associations b
    on b.entity_type = a.entity_type
   and b.entity_id = a.entity_id
   and b.id > a.id
  join public.places p on p.id = a.entity_id and p.status = 'approved'
  where a.entity_type = 'place'
    and a.status = 'approved'
    and b.status = 'approved'
    and not public.temporal_same_description(
          a.source_id, a.source_record_id, a.source_property,
          b.source_id, b.source_record_id, b.source_property)
    and public.temporal_claim_relation(
      a.association_type, a.precision, a.start_year, a.end_year,
      b.association_type, b.precision, b.start_year, b.end_year)
      in ('exact_conflict', 'century_conflict', 'period_conflict', 'range_disagreement', 'range_overlap');
$$;

comment on function public.temporal_conflict_pairs is
  'Every genuinely conflicting pair of claims, at claim-id granularity, so a conflict entity can reference exactly the claims it summarises.';

grant execute on function public.temporal_conflict_pairs() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The claim-set digest
-- ---------------------------------------------------------------------------
/**
 * A deterministic fingerprint of the claims in conflict on a place.
 *
 * Computed from each claim's SEMANTIC signature — association, precision, span,
 * source property and source — not its uuid, so it survives a re-import that
 * assigns new row ids to the same evidence. That is the property stale
 * detection needs: the digest changes when the evidence changes, and only then.
 *
 * A place with no conflict has no digest (null), which is distinct from a place
 * whose conflict has an empty history.
 */
create or replace function public.temporal_conflict_claim_digest(p_place_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  with involved as (
    select distinct c.id, c.association_type, c.precision, c.start_year, c.end_year,
           c.source_property, coalesce(c.source_id, '00000000-0000-0000-0000-000000000000'::uuid) as src
      from public.temporal_associations c
     where c.entity_type = 'place'
       and c.entity_id = p_place_id
       and c.status = 'approved'
       and c.id in (
         select a_id from public.temporal_conflict_pairs() where place_id = p_place_id
         union
         select b_id from public.temporal_conflict_pairs() where place_id = p_place_id
       )
  ),
  signatures as (
    select
      i.association_type || '|' || i.precision || '|' ||
      coalesce(i.start_year::text, '') || '|' || coalesce(i.end_year::text, '') || '|' ||
      coalesce(i.source_property, '') || '|' || i.src::text as sig
    from involved i
    order by sig
  )
  select case when count(*) = 0 then null else md5(string_agg(sig, ';')) end
    from signatures;
$$;

comment on function public.temporal_conflict_claim_digest is
  'A deterministic fingerprint of the conflicting claims on a place, over their semantic signatures rather than their row ids, so it is stable across re-import and changes only when the evidence changes.';

grant execute on function public.temporal_conflict_claim_digest(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The durable conflict entity
-- ---------------------------------------------------------------------------
-- Rebuilt from claims, never written alongside them. One row per place that
-- currently holds conflicting claims.
create table public.temporal_conflict_entities (
  id uuid primary key default extensions.uuid_generate_v4(),
  place_id uuid not null references public.places (id) on delete cascade,
  /** The most severe category present on the place. */
  category public.temporal_conflict_category not null,
  /** The claims in conflict, so the entity names its own evidence. */
  claim_ids uuid[] not null,
  /** How many pairs disagree, for triage. */
  pair_count integer not null,
  /** The widest disagreement in years, for triage. */
  max_disagreement_years integer not null,
  /** The fingerprint of the conflicting claim set at detection time. */
  claim_set_digest text not null,
  detected_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  unique (place_id)
);

comment on table public.temporal_conflict_entities is
  'A place that currently holds conflicting temporal claims. Rebuilt from the claims by refresh_temporal_conflicts(); never a parallel store that could drift from the evidence.';

create index temporal_conflict_entities_category_idx on public.temporal_conflict_entities (category);

alter table public.temporal_conflict_entities enable row level security;
-- Public may see that sources disagree — it is the honest state of the data.
create policy "temporal_conflict_entities are public" on public.temporal_conflict_entities for select using (true);
create policy "temporal_conflict_entities admin" on public.temporal_conflict_entities for all
  using (public.is_editor()) with check (public.is_editor());
grant select on public.temporal_conflict_entities to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rebuild
-- ---------------------------------------------------------------------------
/**
 * Rebuild the conflict entities from the current claims.
 *
 * Idempotent: a place's row is upserted, and places that no longer conflict are
 * removed. The severity order (a period disagreement outranks an overlapping
 * range) decides the category when a place has more than one kind.
 */
create or replace function public.refresh_temporal_conflicts()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  with pair_rows as (
    select place_id, a_id, b_id, category, disagreement_years
      from public.temporal_conflict_pairs()
  ),
  per_place as (
    select
      pr.place_id,
      -- The single most severe category on the place. No DISTINCT — ordering by
      -- a CASE with DISTINCT would require the CASE in the argument list, and
      -- taking the first of the severity-ordered list needs neither.
      (array_agg(pr.category order by
        case pr.category
          when 'period_disagreement' then 1
          when 'century_disagreement' then 2
          when 'direct_date_disagreement' then 3
          when 'disjoint_range' then 4
          when 'overlapping_range' then 5
        end))[1] as category,
      count(*) as pair_count,
      max(pr.disagreement_years) as max_years
    from pair_rows pr
    group by pr.place_id
  ),
  claims_per_place as (
    -- The distinct claims a place's conflicts touch, sorted, computed without
    -- nesting aggregates.
    select place_id, array_agg(claim_id order by claim_id) as claim_ids
    from (
      select place_id, a_id as claim_id from pair_rows
      union
      select place_id, b_id from pair_rows
    ) u
    group by place_id
  )
  insert into public.temporal_conflict_entities
    (place_id, category, claim_ids, pair_count, max_disagreement_years, claim_set_digest, refreshed_at)
  select
    pp.place_id, pp.category, cpp.claim_ids, pp.pair_count, coalesce(pp.max_years, 0),
    public.temporal_conflict_claim_digest(pp.place_id), now()
  from per_place pp
  join claims_per_place cpp on cpp.place_id = pp.place_id
  on conflict (place_id) do update set
    category = excluded.category,
    claim_ids = excluded.claim_ids,
    pair_count = excluded.pair_count,
    max_disagreement_years = excluded.max_disagreement_years,
    claim_set_digest = excluded.claim_set_digest,
    refreshed_at = now();

  get diagnostics affected = row_count;

  -- Drop entities for places that no longer conflict.
  delete from public.temporal_conflict_entities e
   where not exists (select 1 from public.temporal_conflict_pairs() p where p.place_id = e.place_id);

  return affected;
end;
$$;

comment on function public.refresh_temporal_conflicts is
  'Rebuild the conflict entities from the current claims. Idempotent, and the only writer of temporal_conflict_entities.';

grant execute on function public.refresh_temporal_conflicts() to authenticated;

-- ---------------------------------------------------------------------------
-- Review lifecycle
-- ---------------------------------------------------------------------------
create type public.temporal_conflict_review_state as enum (
  'unreviewed',
  'reviewed_unresolved',
  'multi_phase_confirmed',
  'preferred_interpretation_recorded',
  'source_error_confirmed',
  'no_longer_conflicting'
);

comment on type public.temporal_conflict_review_state is
  'Where a human review of a conflict has got to. A preferred interpretation records a reading; it never deletes the claim it did not prefer.';

create table public.temporal_conflict_reviews (
  id uuid primary key default extensions.uuid_generate_v4(),
  place_id uuid not null references public.places (id) on delete cascade,
  /**
   * The digest of the claim set that was reviewed. A review speaks only for the
   * evidence it saw; if the place's current digest differs, the review is stale.
   */
  claim_set_digest text not null,
  review_state public.temporal_conflict_review_state not null,
  /**
   * The claim a reviewer reads as correct, when they record one. An
   * INTERPRETATION, not a verdict — the other claims remain, with provenance,
   * and a later reader can disagree.
   */
  preferred_claim_id uuid references public.temporal_associations (id) on delete set null,
  rationale text,
  /** The reviewer. Nullable, because Whilom has no admin auth yet and this is
      the backend contract, not an invented identity. */
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz not null default now(),
  constraint temporal_conflict_reviews_interpretation_has_claim
    check (review_state <> 'preferred_interpretation_recorded' or preferred_claim_id is not null),
  constraint temporal_conflict_reviews_interpretation_has_rationale
    check (review_state <> 'preferred_interpretation_recorded' or (rationale is not null and rationale <> ''))
);

comment on table public.temporal_conflict_reviews is
  'The human layer over a conflict. Each review references the claim-set digest it saw; a preferred interpretation carries a claim, a rationale and the reviewer, and never removes a claim.';

create index temporal_conflict_reviews_place_idx on public.temporal_conflict_reviews (place_id, reviewed_at desc);

alter table public.temporal_conflict_reviews enable row level security;
-- Reviews are editorial. The public sees that a conflict exists, not the
-- editorial deliberation over it.
create policy "temporal_conflict_reviews editors" on public.temporal_conflict_reviews for all
  using (public.is_editor()) with check (public.is_editor());

-- ---------------------------------------------------------------------------
-- Status, including staleness
-- ---------------------------------------------------------------------------
/**
 * Each conflict with its latest review and whether that review still speaks for
 * the current evidence.
 *
 * A review is stale when the claim set has changed under it — a new claim
 * arrived, one was withdrawn, a source was corrected — so its digest no longer
 * matches the place's. A stale review is shown but must not be treated as
 * authoritative, which is the whole reason the digest exists.
 */
create or replace function public.temporal_conflict_status(max_rows integer default 200)
returns table (
  place_id uuid,
  place_slug text,
  place_name text,
  category public.temporal_conflict_category,
  pair_count integer,
  max_disagreement_years integer,
  current_digest text,
  review_state public.temporal_conflict_review_state,
  reviewed_digest text,
  is_stale boolean,
  preferred_claim_id uuid,
  rationale text,
  reviewed_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.place_id, p.slug, p.name, e.category, e.pair_count, e.max_disagreement_years,
    e.claim_set_digest,
    coalesce(r.review_state, 'unreviewed'),
    r.claim_set_digest,
    case when r.id is null then false else r.claim_set_digest is distinct from e.claim_set_digest end,
    r.preferred_claim_id, r.rationale, r.reviewed_at
  from public.temporal_conflict_entities e
  join public.places p on p.id = e.place_id
  left join lateral (
    select * from public.temporal_conflict_reviews rv
     where rv.place_id = e.place_id
     order by rv.reviewed_at desc
     limit 1
  ) r on true
  order by e.max_disagreement_years desc, p.name
  limit least(greatest(coalesce(max_rows, 200), 1), 1000);
$$;

comment on function public.temporal_conflict_status is
  'Every conflict entity with its latest review and a staleness flag. A review whose digest no longer matches the place has gone stale and is not authoritative.';

grant execute on function public.temporal_conflict_status(integer) to anon, authenticated;
