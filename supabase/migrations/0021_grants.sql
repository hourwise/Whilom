-- 0021_grants.sql
-- Grant the table privileges the API roles need. Without these, nothing works.
--
-- FOUND BY RUNNING THE SCHEMA FOR THE FIRST TIME. Every RLS test failed with
-- "permission denied for table places" when acting as `anon`, because the
-- schema had never granted anything to anyone.
--
-- RLS is a row filter applied *after* the privilege check, not instead of it. A
-- table with perfect policies and no GRANT is simply unreadable: PostgREST
-- would have returned a permission error for every anonymous request against
-- every table in the schema. A new Supabase project gets these grants from the
-- platform's own bootstrap migration; Whilom's schema was hand-written and
-- never included them, and nothing detected that until the database actually
-- ran.
--
-- The grants below are deliberately narrower than the Supabase default of
-- `grant all ... to anon, authenticated`:
--
--   anon           SELECT only. An anonymous visitor never writes anything.
--   authenticated  SELECT/INSERT/UPDATE/DELETE, because RLS is what decides
--                  which rows — but only on the tables users legitimately
--                  write to. Canonical heritage tables stay read-only at the
--                  privilege level as well as the policy level, so a mistake
--                  in a future policy cannot by itself open up canonical data.
--   service_role   everything; it bypasses RLS and runs ingestion.
--
-- Row visibility remains entirely governed by the policies in 0004-0018.

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Baseline: read for everyone, full access for the service role.
-- ---------------------------------------------------------------------------
grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables an ordinary signed-in user may write to. Everything absent from this
-- list is canonical or administrative and stays read-only for `authenticated`,
-- whatever a policy might say.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    -- personal history
    'visits', 'visit_photos', 'wishlists', 'wishlist_items',
    'trips', 'trip_days', 'trip_stops',
    -- community contributions, all moderated
    'reviews', 'comments', 'contributions', 'corrections', 'reports',
    -- own profile, own uploads
    'profiles', 'images', 'image_rights',
    -- badges are awarded to the user
    'user_badges'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Anything added later inherits the same shape, so a new table is never
-- accidentally unreadable — the failure mode this migration exists to fix.
-- ---------------------------------------------------------------------------
alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
