-- 0025_review_workbench_access.sql
-- Let editors actually use the review workbench, and give the UI a governed
-- action for every decision it offers.
--
-- Two gaps found while building the workbench:
--
--   1. `import_candidates` and `import_conflicts` are moderator-only, but
--      `is_editor()` is a WIDER set than `is_moderator()` (editor, moderator,
--      admin vs moderator, admin). So an editor could publish a candidate —
--      publish_import_candidate() checks is_editor() — while being unable to
--      SELECT the candidate they were publishing, or see it in the review
--      queue at all. The workbench would have rendered an empty list to
--      exactly the people it is for.
--
--   2. There was no governed way to record a review decision. Approving a
--      candidate meant writing `import_candidates.status` directly, which the
--      UI must not do and an editor could not do anyway.
--
-- Reads widen to editors; writes stay closed. Every mutation still goes through
-- a SECURITY DEFINER function that checks authority server-side.

-- ---------------------------------------------------------------------------
-- Editors may READ the review material. They still may not write it directly.
-- ---------------------------------------------------------------------------
create policy "import_candidates editor read" on public.import_candidates
  for select using (public.is_editor());
create policy "import_conflicts editor read" on public.import_conflicts
  for select using (public.is_editor());
create policy "import_runs editor read" on public.import_runs
  for select using (public.is_editor());
create policy "import_sources editor read" on public.import_sources
  for select using (public.is_editor());

-- The audit trail an editor needs for the candidate they are reviewing, and
-- nothing else: these policies are scoped to import-candidate moderation items,
-- so reviewing an import does not open up moderation of community content.
create policy "moderation_items editor read imports" on public.moderation_items
  for select using (public.is_editor() and target_kind = 'import_candidate');

create policy "moderation_actions editor read imports" on public.moderation_actions
  for select using (
    public.is_editor()
    and exists (
      select 1 from public.moderation_items mi
       where mi.id = moderation_item_id and mi.target_kind = 'import_candidate'
    )
  );

-- ---------------------------------------------------------------------------
-- Record a review decision.
--
-- The only supported way to move a candidate through the review states, so the
-- workbench never writes `import_candidates` itself. Restricted to the states a
-- reviewer can legitimately choose: a candidate cannot be marked 'published'
-- here, because publication is what publish_import_candidate() does.
-- ---------------------------------------------------------------------------
create or replace function public.review_import_candidate(
  p_candidate_id uuid,
  p_decision public.moderation_state,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_prior public.moderation_state;
begin
  if not public.is_editor() then
    raise exception 'reviewing an import candidate requires editor authority'
      using errcode = 'insufficient_privilege';
  end if;

  if p_decision not in ('approved', 'rejected', 'needs_review') then
    raise exception 'a reviewer may only approve, reject or defer a candidate'
      using errcode = 'check_violation';
  end if;

  select status into v_prior from public.import_candidates where id = p_candidate_id;
  if not found then
    raise exception 'import candidate % does not exist', p_candidate_id
      using errcode = 'no_data_found';
  end if;

  -- A published candidate is history. Re-reviewing it would imply the canonical
  -- data could be retracted by changing a status, which is not true.
  if exists (select 1 from public.import_candidates c
              where c.id = p_candidate_id and c.published_entity_id is not null) then
    raise exception 'candidate % is already published and cannot be re-reviewed', p_candidate_id
      using errcode = 'check_violation';
  end if;

  update public.import_candidates
     set status      = p_decision,
         review_note = coalesce(p_note, review_note),
         reviewed_by = v_actor,
         reviewed_at = now()
   where id = p_candidate_id;

  -- Audit. The prior state is recorded so a decision history reads as a
  -- sequence of transitions rather than a set of final values.
  insert into public.moderation_items (target_kind, target_id, state, assigned_to)
  values ('import_candidate', p_candidate_id, p_decision, v_actor)
  on conflict (target_kind, target_id) do update
    set state = excluded.state, assigned_to = excluded.assigned_to, updated_at = now();

  insert into public.moderation_actions (moderation_item_id, moderator_id, action, note)
  select mi.id, v_actor,
         'review:' || v_prior::text || '->' || p_decision::text,
         p_note
    from public.moderation_items mi
   where mi.target_kind = 'import_candidate' and mi.target_id = p_candidate_id;
end;
$$;

comment on function public.review_import_candidate(uuid, public.moderation_state, text) is
  'Record a reviewer decision on an import candidate. Editor-only; refuses to re-review a published candidate; audits the transition.';

-- ---------------------------------------------------------------------------
-- Conflict resolution moves from moderator to editor, matching the workbench.
--
-- The workbench is editor-gated and offers resolution actions, so requiring
-- moderator here would have shown editors buttons that always failed. Editors
-- are already trusted to publish canonical heritage data; resolving a
-- disagreement is a lesser act than that.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_import_conflict(
  p_conflict_id uuid,
  p_outcome public.conflict_resolution,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not public.is_editor() then
    raise exception 'resolving a conflict requires editor authority'
      using errcode = 'insufficient_privilege';
  end if;

  update public.import_conflicts
     set resolution_outcome = p_outcome,
         resolution_note    = p_note,
         resolved_by        = v_actor,
         resolved_at        = now(),
         status             = (case when p_outcome = 'defer' then 'needs_review' else 'approved' end)::public.moderation_state
   where id = p_conflict_id;

  if not found then
    raise exception 'conflict % does not exist', p_conflict_id
      using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function public.review_import_candidate(uuid, public.moderation_state, text) from public;
revoke all on function public.resolve_import_conflict(uuid, public.conflict_resolution, text) from public;
grant execute on function public.review_import_candidate(uuid, public.moderation_state, text)
  to authenticated, service_role;
grant execute on function public.resolve_import_conflict(uuid, public.conflict_resolution, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Decision history, for the workbench's audit panel. Read-only by construction:
-- moderation_actions has no update or delete policy, so history cannot be
-- rewritten through any UI.
-- ---------------------------------------------------------------------------
create or replace view public.import_decision_history with (security_invoker = true) as
select
  mi.target_id      as candidate_id,
  ma.id             as action_id,
  ma.action,
  ma.note,
  ma.created_at,
  ma.moderator_id,
  pr.display_name   as moderator_name
from public.moderation_items mi
join public.moderation_actions ma on ma.moderation_item_id = mi.id
left join public.profiles pr on pr.id = ma.moderator_id
where mi.target_kind = 'import_candidate';

comment on view public.import_decision_history is
  'Append-only decision trail for an import candidate. security_invoker, so the moderation_actions policy governs access.';

grant select on public.import_decision_history to authenticated, service_role;
