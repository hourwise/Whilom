-- 0034_iron_age_boundary.sql
-- Close a hole in the navigation vocabulary.
--
-- 0029 gave the Iron Age an end year of -43. The intent, stated in its own
-- comment, was "ends conventionally at the Roman invasion" — and the Roman
-- invasion is AD 43, not 43 BC. The sign was wrong.
--
-- The consequence was not cosmetic. Roman Britain starts at 43, so every year
-- from 42 BC to AD 42 belonged to no period whatever: a claim dated to the late
-- Iron Age fell through the registry, matched nothing, and became invisible to
-- the period filter. It also made the ruler's axis non-monotonic across the
-- BCE/CE boundary, since two different years mapped to the same position.
--
-- The Iron Age now runs to AD 42, meeting Roman Britain at 43 with no gap.
update public.historical_periods
   set end_year = 42,
       note = 'Ends conventionally at the Roman invasion of AD 43.'
 where id = 'iron_age';

-- Prehistory is the parent band and shares the boundary.
update public.historical_periods
   set end_year = 42
 where id = 'prehistory';

-- Every year from the start of the registry to the end must now fall inside
-- exactly one top-level period. Asserted here rather than trusted, because the
-- same off-by-a-sign is easy to reintroduce and invisible until a filter
-- silently returns nothing.
do $$
declare
  v_gap record;
begin
  for v_gap in
    select a.id as earlier, a.end_year, b.id as later, b.start_year
      from public.historical_periods a
      join public.historical_periods b
        on b.display_order = (
          select min(c.display_order) from public.historical_periods c
           where c.display_order > a.display_order and c.parent_id is null)
     where a.parent_id is null
       and b.start_year <> a.end_year + 1
  loop
    raise exception 'period registry gap: % ends at % but % starts at %',
      v_gap.earlier, v_gap.end_year, v_gap.later, v_gap.start_year;
  end loop;
end;
$$;
