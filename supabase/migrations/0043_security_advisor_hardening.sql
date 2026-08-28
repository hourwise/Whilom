-- 0043_security_advisor_hardening.sql
--
-- Bounded hardening for the live Supabase Security Advisor findings observed
-- after migration 0042. Historical migrations are intentionally unchanged.
--
-- The API roles receive direct EXECUTE grants for newly-created functions in
-- the hosted project. REVOKE from PUBLIC alone is therefore insufficient:
-- explicit anon/authenticated grants must also be removed.

-- ---------------------------------------------------------------------------
-- Fix the eleven mutable search paths without changing function bodies.
-- Every object reference in these functions is either pg_catalog, explicitly
-- schema-qualified, or a trigger-row field. The search function also qualifies
-- its PostGIS calls with extensions., so pg_catalog is sufficient and safest.
-- ---------------------------------------------------------------------------
alter function public.set_updated_at()
  set search_path = pg_catalog;
alter function public.places_update_search_vector()
  set search_path = pg_catalog;
alter function public.search_places(
  text, double precision, double precision, double precision,
  double precision, double precision, double precision, double precision,
  text[], text[], text, boolean, integer, integer
)
  set search_path = pg_catalog;
alter function public.people_update_search_vector()
  set search_path = pg_catalog;
alter function public.events_update_search_vector()
  set search_path = pg_catalog;
alter function public.objects_update_search_vector()
  set search_path = pg_catalog;
alter function public.entity_exists(public.entity_type, uuid)
  set search_path = pg_catalog;
alter function public.check_relationship_endpoints()
  set search_path = pg_catalog;
alter function public.check_entity_reference()
  set search_path = pg_catalog;
alter function public.routes_update_search_vector()
  set search_path = pg_catalog;
alter function public.collections_update_search_vector()
  set search_path = pg_catalog;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER execution policy
--
-- B: side-effect-free visibility/role helpers are deliberately callable by
-- the public API and are used by RLS expressions.
--
-- A: these are deliberate client/workbench RPCs. Each has an explicit
-- editor-authority check in its body; anon is never granted execution.
--
-- C: trigger, event-trigger, publication helper, rights-assessment and
-- derived-data functions are internal. Their SECURITY DEFINER owners may
-- still invoke them from the A RPCs and triggers after direct API EXECUTE is
-- revoked.
-- ---------------------------------------------------------------------------

-- Remove inherited/direct API privileges from all 24 Advisor functions first.
revoke execute on function public.apply_candidate_preferences(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.apply_conflict_preference(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.assess_media_rights(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.collection_is_public(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.current_app_role()
  from public, anon, authenticated, service_role;
revoke execute on function public.enforce_single_preferred_fact()
  from public, anon, authenticated, service_role;
revoke execute on function public.guard_profile_role()
  from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_user()
  from public, anon, authenticated, service_role;
revoke execute on function public.image_is_visible(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.is_admin()
  from public, anon, authenticated, service_role;
revoke execute on function public.is_editor()
  from public, anon, authenticated, service_role;
revoke execute on function public.is_moderator()
  from public, anon, authenticated, service_role;
revoke execute on function public.place_is_public(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.preview_import_candidate(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.publish_import_candidate(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.publish_media_candidate(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.refresh_temporal_conflicts()
  from public, anon, authenticated, service_role;
revoke execute on function public.resolve_import_conflict(
  uuid, public.conflict_resolution, text
)
  from public, anon, authenticated, service_role;
revoke execute on function public.resolve_person_from_source(text, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.review_import_candidate(
  uuid, public.moderation_state, text
)
  from public, anon, authenticated, service_role;
revoke execute on function public.review_media_candidate(
  uuid, public.moderation_state, uuid, text
)
  from public, anon, authenticated, service_role;
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;
revoke execute on function public.route_is_public(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.slugify_unique(text)
  from public, anon, authenticated, service_role;

-- B: intentionally exposed, side-effect-free read helpers.
grant execute on function public.collection_is_public(uuid)
  to anon, authenticated, service_role;
grant execute on function public.current_app_role()
  to anon, authenticated, service_role;
grant execute on function public.image_is_visible(uuid)
  to anon, authenticated, service_role;
grant execute on function public.is_admin()
  to anon, authenticated, service_role;
grant execute on function public.is_editor()
  to anon, authenticated, service_role;
grant execute on function public.is_moderator()
  to anon, authenticated, service_role;
grant execute on function public.place_is_public(uuid)
  to anon, authenticated, service_role;
grant execute on function public.route_is_public(uuid)
  to anon, authenticated, service_role;

-- A: intentionally exposed authenticated/workbench RPCs with body-level
-- editor checks; service_role remains available for backend workflows.
grant execute on function public.preview_import_candidate(uuid)
  to authenticated, service_role;
grant execute on function public.publish_import_candidate(uuid, text)
  to authenticated, service_role;
grant execute on function public.publish_media_candidate(uuid, text)
  to authenticated, service_role;
grant execute on function public.resolve_import_conflict(
  uuid, public.conflict_resolution, text
)
  to authenticated, service_role;
grant execute on function public.review_import_candidate(
  uuid, public.moderation_state, text
)
  to authenticated, service_role;
grant execute on function public.review_media_candidate(
  uuid, public.moderation_state, uuid, text
)
  to authenticated, service_role;

-- C: no direct API grants. These remain callable by their SECURITY DEFINER
-- owner from the governed RPCs or by their trigger/event-trigger machinery.
