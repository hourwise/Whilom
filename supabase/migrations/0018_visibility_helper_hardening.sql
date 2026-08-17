-- 0018_visibility_helper_hardening.sql
-- Hardening pass over the SECURITY DEFINER helpers added in 0017, plus a fix to
-- the profile role guard that made the role model impossible to administer.
--
-- Findings from auditing 0017 (none of it was previously executed against a
-- real Postgres, so this is the first time any of it has been exercised):
--
--   1. `set search_path = public` names a schema that is writable in some
--      deployments. A SECURITY DEFINER function runs as its owner, so anything
--      resolved through a mutable search path is a privilege-escalation surface.
--      Replaced with `set search_path = ''` and full qualification of every
--      relation and function. pg_catalog remains implicitly available, so
--      operators and `exists` still resolve.
--
--   2. EXECUTE was left at the PostgreSQL default, which grants it to PUBLIC.
--      The policies genuinely need `anon` and `authenticated` to execute these
--      (a policy expression is evaluated as the querying role), but nothing else
--      needs them. Now revoked from PUBLIC and granted explicitly.
--
--   3. Information disclosure was reviewed and is nil by design: each helper
--      answers only "is this id publicly visible", which is itself public
--      information, and returns false indistinguishably for a hidden row and for
--      an id that does not exist. No helper returns any attribute value.
--
--   4. Recursion was reviewed. These bypass RLS on the parent by design — that
--      is the point, it avoids evaluating the parent's policies once per child
--      row — and no policy on the parent calls back into them.
--
--   5. Argument safety: every body is a single static SELECT with the argument
--      bound as a parameter. There is no dynamic SQL anywhere.

-- ---------------------------------------------------------------------------
-- Helpers, re-declared with an empty search_path and full qualification.
-- ---------------------------------------------------------------------------
create or replace function public.place_is_public(p_place_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.places p
    where p.id = p_place_id and p.status = 'approved'
  );
$$;

create or replace function public.route_is_public(p_route_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.routes r
    where r.id = p_route_id and r.status = 'approved'
  );
$$;

create or replace function public.collection_is_public(p_collection_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.collections c
    where c.id = p_collection_id and c.is_published and c.status = 'approved'
  );
$$;

create or replace function public.image_is_visible(p_image_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.images i
    where i.id = p_image_id
      and (i.moderation_status = 'approved' or i.uploaded_by = auth.uid())
  );
$$;

-- The role helpers from 0003 have the same mutable-search_path weakness and are
-- far more security-critical: is_admin() gates every privileged write.
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    'user'::public.app_role
  );
$$;

create or replace function public.is_editor()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_app_role() in ('editor', 'moderator', 'admin');
$$;

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_app_role() in ('moderator', 'admin');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_app_role() = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- Explicit EXECUTE. RLS policy expressions run as the querying role, so anon
-- and authenticated must be able to call these; nothing else needs to.
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.place_is_public(uuid)',
    'public.route_is_public(uuid)',
    'public.collection_is_public(uuid)',
    'public.image_is_visible(uuid)',
    'public.current_app_role()',
    'public.is_editor()',
    'public.is_moderator()',
    'public.is_admin()'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to anon, authenticated, service_role', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- guard_profile_role: allow administration to actually happen.
--
-- 0003 refuses any role change unless public.is_admin(). is_admin() resolves
-- through auth.uid(), which is NULL for the service role, for a migration and
-- for any direct SQL session — so the trigger refused role changes from every
-- context capable of making the FIRST admin, and from the service role that
-- admin tooling would use. The role model was unadministrable and, because
-- nothing had ever run against a database, nobody had hit it.
--
-- Widening this to "an authenticated non-admin may not change roles" is safe:
-- the trigger is defence in depth behind RLS, and RLS on profiles gives anon no
-- UPDATE path at all ("users update own profile" requires auth.uid() = id).
-- So a NULL auth.uid() here means a trusted server-side context, not a visitor.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'only an admin may change a profile role'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- handle_new_user() has the same mutable search_path and runs on every sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Explorer'));
  return new;
end;
$$;

comment on function public.place_is_public(uuid) is
  'True when the place is approved, i.e. readable by anon/authenticated. Used by child-table RLS. SECURITY DEFINER with an empty search_path; discloses only public visibility, never attribute values.';
