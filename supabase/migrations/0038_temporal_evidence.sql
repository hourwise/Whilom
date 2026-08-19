-- 0038_temporal_evidence.sql
-- What Whilom believes about time, why it believes it, and what it may say.
--
-- Migration 0029 already models a temporal claim well: signed years with no
-- year zero, a precision enum that can hold "century" and "period" honestly, an
-- association type, the source's own words, and a derivation. Very little of
-- that needs changing, and this migration deliberately does not redesign it.
--
-- Three things are added, each because batch 11 exposed a question the existing
-- shape could not answer:
--
--   1. **Which field, and which rules.** `derivation` is prose. Answering "why
--      does Whilom believe this place is 14th-century" by reading a sentence
--      works for one record and not for a thousand, so the source field, the
--      raw value and the normaliser version become columns.
--
--   2. **A quarantine.** Values that could not be turned into a defensible span
--      were previously dropped and forgotten. Kept and ranked, they say exactly
--      what a future batch would gain by handling them — and, more importantly,
--      they stop anybody re-adding them as a guess.
--
--   3. **Coverage that cannot be inflated.** "1.03% dated" is one number doing
--      three jobs. Strong evidence, period-only evidence and no evidence are
--      different claims about the corpus, and reporting them together is how a
--      period-level guess passes itself off as a date.

-- ---------------------------------------------------------------------------
-- Evidence columns
-- ---------------------------------------------------------------------------
alter table public.temporal_associations
  /** Which field of the source record the claim came from. */
  add column source_field text,
  /** The source's value exactly as written, before any normalisation. */
  add column raw_value text,
  /**
   * The source's own statement of how precisely it knows the value, where it
   * makes one. Wikidata does; Historic England's names do not.
   */
  add column raw_precision text,
  /** Which third of a century, when the source qualified one. */
  add column century_qualifier text,
  /**
   * What Whilom may display. Stored rather than derived because it is capped by
   * the source's precision, not by the span: a claim bounded 1301-1400 renders
   * as "14th century", and no amount of looking at the years can work that out.
   */
  add column display_label text,
  /** The version of the normalisation rules that produced the span. */
  add column normaliser_version text,
  add constraint temporal_associations_qualifier_known
    check (century_qualifier is null or century_qualifier in ('early', 'mid', 'late'));

comment on column public.temporal_associations.raw_value is
  'The source value verbatim, before normalisation. A later, better normaliser can be re-run against this and checked; without it, a claim can only be trusted.';

comment on column public.temporal_associations.raw_precision is
  'How precisely the SOURCE said it knows this, in the source''s own terms (e.g. Wikidata timePrecision 7). Not Whilom''s interpretation of it.';

comment on column public.temporal_associations.display_label is
  'What Whilom may say out loud. Capped by precision, never by the span: a century claim reads "14th century" even though it matches 1301-1400.';

-- A claim that says it is century-precision must carry a label that does not
-- name a year. This is the batch's central rule, and a constraint is a better
-- home for it than a convention.
alter table public.temporal_associations
  add constraint temporal_associations_label_not_overprecise
  check (
    display_label is null
    or precision not in ('century', 'period', 'decade')
    or display_label !~ '\y[12][0-9]{3}\y'
  );

comment on constraint temporal_associations_label_not_overprecise on public.temporal_associations is
  'A century, decade or period claim may not display a four-digit year. Wikidata stores "14th century" as the value 1350, and this is what stops that leaking into what Whilom says.';

-- ---------------------------------------------------------------------------
-- Quarantine
-- ---------------------------------------------------------------------------
create table public.temporal_quarantine (
  id uuid primary key default extensions.uuid_generate_v4(),
  /** The place the value was attached to, where one is known. */
  entity_type public.entity_type not null default 'place',
  entity_id uuid,
  source_id uuid references public.sources (id) on delete set null,
  source_record_id text,
  source_field text,
  /** The value that could not be read, exactly as the source wrote it. */
  raw_value text not null,
  /** The source's own precision statement, where it made one. */
  raw_precision text,
  /** Which rule declined it. */
  reason text not null,
  note text,
  normaliser_version text,
  created_at timestamptz not null default now()
);

comment on table public.temporal_quarantine is
  'Temporal values Whilom could not turn into a defensible span. Kept rather than dropped so recurrent unhandled formats can be ranked and fixed deliberately, and so nobody quietly re-adds them as a guess.';

create index temporal_quarantine_reason_idx on public.temporal_quarantine (reason);
create index temporal_quarantine_value_idx on public.temporal_quarantine (raw_value);

alter table public.temporal_quarantine enable row level security;
-- Editorial data. The public map has no business seeing what Whilom failed to
-- parse, and the review workbench does.
create policy "temporal_quarantine editors" on public.temporal_quarantine for all
  using (public.is_editor()) with check (public.is_editor());

/**
 * The unhandled formats worth fixing next, most frequent first.
 *
 * Ranking is the point. A hundred distinct one-off strings are not worth a
 * parser; one string appearing four hundred times is.
 */
create or replace function public.temporal_quarantine_ranking(max_rows integer default 50)
returns table (
  reason text,
  raw_value text,
  occurrences bigint,
  example_source_record text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select q.reason,
         q.raw_value,
         count(*) as occurrences,
         min(q.source_record_id) as example_source_record
    from public.temporal_quarantine q
   group by q.reason, q.raw_value
   order by count(*) desc, q.raw_value
   limit least(greatest(coalesce(max_rows, 50), 1), 500);
$$;

comment on function public.temporal_quarantine_ranking is
  'Recurrent unhandled temporal formats, most frequent first, so a future batch can improve coverage where it actually pays.';

-- ---------------------------------------------------------------------------
-- Precision classes
-- ---------------------------------------------------------------------------
/**
 * Group the precision enum into the three answers a coverage report needs.
 *
 * `strong` means the evidence pins a date to a century or better. `period`
 * means Whilom knows the era and nothing narrower — an honest answer, and not
 * the same answer. Reporting them as one number is how "dated coverage"
 * becomes a figure nobody should trust.
 */
create or replace function public.temporal_precision_class(p public.temporal_precision)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p
    when 'exact_year' then 'strong'
    when 'range' then 'strong'
    when 'circa' then 'strong'
    when 'decade' then 'strong'
    when 'century' then 'strong'
    when 'before' then 'bounded'
    when 'after' then 'bounded'
    when 'period' then 'period'
    else 'unknown'
  end;
$$;

grant execute on function public.temporal_precision_class(public.temporal_precision) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Coverage
-- ---------------------------------------------------------------------------
/**
 * How much of the published corpus Whilom can actually place in time.
 *
 * Four mutually exclusive buckets over published places, so the numbers add up
 * to the corpus and none of them can be quoted out of context:
 *
 *   strong      — at least one claim precise to a century or better
 *   period_only — claims exist, but none narrower than a named period
 *   bounded_only— only "before"/"after" evidence
 *   unknown     — no temporal evidence at all
 */
create or replace function public.temporal_coverage()
returns table (
  published_places bigint,
  strong bigint,
  period_only bigint,
  bounded_only bigint,
  unknown bigint,
  any_coverage bigint,
  strong_rate double precision,
  any_rate double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with published as (
    select p.id from public.places p where p.status = 'approved'
  ),
  best as (
    select pl.id,
           max(case public.temporal_precision_class(ta.precision)
                 when 'strong' then 3 when 'bounded' then 2 when 'period' then 1 else 0 end) as rank
      from published pl
      left join public.temporal_associations ta
        on ta.entity_type = 'place' and ta.entity_id = pl.id and ta.status = 'approved'
     group by pl.id
  )
  select
    count(*)::bigint,
    count(*) filter (where rank = 3)::bigint,
    count(*) filter (where rank = 1)::bigint,
    count(*) filter (where rank = 2)::bigint,
    count(*) filter (where rank = 0)::bigint,
    count(*) filter (where rank > 0)::bigint,
    (count(*) filter (where rank = 3))::double precision / nullif(count(*), 0),
    (count(*) filter (where rank > 0))::double precision / nullif(count(*), 0)
  from best;
$$;

comment on function public.temporal_coverage is
  'Temporal coverage in mutually exclusive buckets. Period-only evidence is reported separately from strong evidence, because collapsing them lets a period guess pass for a date.';

grant execute on function public.temporal_coverage() to anon, authenticated;

/**
 * The same question broken down, so a coverage figure can be interrogated
 * rather than merely quoted.
 */
create or replace function public.temporal_coverage_breakdown()
returns table (
  dimension text,
  bucket text,
  precision_class text,
  claims bigint,
  places bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with claims as (
    select ta.id, ta.entity_id, ta.precision, ta.period_id, ta.association_type,
           public.temporal_precision_class(ta.precision) as klass,
           coalesce(s.name, 'unattributed') as source_name,
           public.place_display_category(p.place_type)::text as category
      from public.temporal_associations ta
      join public.places p on p.id = ta.entity_id and p.status = 'approved'
      left join public.sources s on s.id = ta.source_id
     where ta.entity_type = 'place' and ta.status = 'approved'
  )
  select 'source', source_name, klass, count(*)::bigint, count(distinct entity_id)::bigint
    from claims group by source_name, klass
  union all
  select 'category', category, klass, count(*)::bigint, count(distinct entity_id)::bigint
    from claims group by category, klass
  union all
  select 'period', coalesce(period_id, 'unassigned'), klass, count(*)::bigint, count(distinct entity_id)::bigint
    from claims group by period_id, klass
  union all
  select 'association', association_type::text, klass, count(*)::bigint, count(distinct entity_id)::bigint
    from claims group by association_type, klass
  order by 1, 4 desc, 2;
$$;

comment on function public.temporal_coverage_breakdown is
  'Temporal claims by source, display category, period and association type, each split by precision class.';

grant execute on function public.temporal_coverage_breakdown() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rendering a claim
-- ---------------------------------------------------------------------------
/**
 * What Whilom says about a place's dating.
 *
 * Prefers the stored label, which the normaliser capped at the source's own
 * precision. Falls back to formatting the span only for claims that are exact
 * or ranged, where the years ARE the claim. A century or period claim with no
 * label renders as its period name rather than as its bounds, because its
 * bounds are a filtering device and were never asserted by anybody.
 */
create or replace function public.temporal_claim_label(
  p_precision public.temporal_precision,
  p_start_year integer,
  p_end_year integer,
  p_period_id text,
  p_display_label text
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(p_display_label, ''),
    case
      when p_precision = 'exact_year' and p_start_year is not null
        then public.format_historical_year(p_start_year)
      when p_precision = 'range' and p_start_year is not null and p_end_year is not null
        then public.format_historical_year(p_start_year) || '–' || public.format_historical_year(p_end_year)
      when p_precision = 'circa' and p_start_year is not null and p_end_year is not null
        then 'c. ' || public.format_historical_year((p_start_year + p_end_year) / 2)
      else (select hp.display_name from public.historical_periods hp where hp.id = p_period_id)
    end
  );
$$;

comment on function public.temporal_claim_label is
  'Renders a temporal claim without exceeding its precision. A century claim never renders as a year, even though its bounds are years.';

grant execute on function public.temporal_claim_label(
  public.temporal_precision, integer, integer, text, text) to anon, authenticated;

/**
 * Every temporal claim on a place, ready to display.
 *
 * Ordered by how much it says rather than by date: a visitor wants "built
 * 1847" above "medieval" when a place has both.
 */
create or replace function public.place_temporal_claims(p_place_id uuid, max_rows integer default 12)
returns table (
  association_type text,
  label text,
  precision text,
  precision_class text,
  start_year integer,
  end_year integer,
  period_id text,
  period_name text,
  source_name text,
  source_field text,
  raw_value text,
  derivation text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ta.association_type::text,
    public.temporal_claim_label(ta.precision, ta.start_year, ta.end_year, ta.period_id, ta.display_label),
    ta.precision::text,
    public.temporal_precision_class(ta.precision),
    ta.start_year,
    ta.end_year,
    ta.period_id,
    hp.display_name,
    s.name,
    ta.source_field,
    ta.raw_value,
    ta.derivation
  from public.temporal_associations ta
  join public.places p on p.id = ta.entity_id and p.status = 'approved'
  left join public.historical_periods hp on hp.id = ta.period_id
  left join public.sources s on s.id = ta.source_id
  where ta.entity_type = 'place'
    and ta.entity_id = p_place_id
    and ta.status = 'approved'
  order by
    case public.temporal_precision_class(ta.precision)
      when 'strong' then 0 when 'bounded' then 1 when 'period' then 2 else 3 end,
    ta.start_year nulls last
  limit least(greatest(coalesce(max_rows, 12), 1), 50);
$$;

comment on function public.place_temporal_claims is
  'Every dating claim on a place with its evidence: the source, the field, the raw value and the derivation. A place with several phases keeps all of them.';

grant execute on function public.place_temporal_claims(uuid, integer) to anon, authenticated;
