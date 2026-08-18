-- pgTAP: imported media cannot be displayed without the rights to display it.
--
-- The invariant: no attribution, no publication. Rights completeness is decided
-- in the database at publication time, so no UI, no editor and no edited row
-- can route around it.

begin;
create extension if not exists pgtap;
select plan(29);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.test');
update public.profiles set role = 'editor' where id = '22222222-2222-2222-2222-222222222222';

insert into public.sources (id, kind, name, licence)
values ('50000000-0000-0000-0000-000000000009', 'open_data', 'Wikimedia Commons', 'per file');
insert into public.import_sources (id, key, display_name, adapter, source_id)
values ('51000000-0000-0000-0000-000000000009', 'wikimedia-commons', 'Wikimedia Commons',
        'commons', '50000000-0000-0000-0000-000000000009');

insert into public.places (id, slug, name, place_type, location)
values ('aaaaaaaa-0000-0000-0000-00000000000a', 'media-abbey', 'Media Abbey', 'abbey',
        extensions.st_setsrid(extensions.st_makepoint(-1.5, 54.0), 4326)::extensions.geography);

create or replace function pg_temp.media(
  p_id uuid, p_file text, p_creator text, p_licence public.media_licence,
  p_assoc public.media_association_outcome, p_entity uuid
) returns void language sql as $$
  insert into public.import_media_candidates (
    id, import_source_id, source_file_id, source_title, source_page_url, media_url,
    thumbnail_url, creator, creator_raw, licence, licence_raw, mime_type, width, height,
    entity_type, entity_id, association_outcome, association_confidence,
    retrieved_at, importer_version, raw, status)
  values (
    p_id, '51000000-0000-0000-0000-000000000009', p_file, replace(p_file, 'File:', ''),
    'https://commons.wikimedia.org/wiki/' || p_file,
    'https://upload.wikimedia.org/' || replace(p_file, 'File:', ''),
    null, p_creator, p_creator, p_licence, p_licence::text, 'image/jpeg', 1000, 800,
    'place', p_entity, p_assoc, 0.9, now(), '0.1.0', '{"probe":true}'::jsonb, 'approved');
$$;

select pg_temp.media('d0000000-0000-0000-0000-000000000001', 'File:Ready.jpg', 'Jane Smith',
  'CC-BY-4.0', 'media_match_confident', 'aaaaaaaa-0000-0000-0000-00000000000a');
select pg_temp.media('d0000000-0000-0000-0000-000000000002', 'File:NoCreator.jpg', null,
  'CC-BY-SA-4.0', 'media_match_confident', 'aaaaaaaa-0000-0000-0000-00000000000a');
select pg_temp.media('d0000000-0000-0000-0000-000000000003', 'File:NoLicence.jpg', 'Jane Smith',
  'UNKNOWN', 'media_match_confident', 'aaaaaaaa-0000-0000-0000-00000000000a');
select pg_temp.media('d0000000-0000-0000-0000-000000000004', 'File:NonReusable.jpg', 'Jane Smith',
  'UNSUPPORTED', 'media_match_confident', 'aaaaaaaa-0000-0000-0000-00000000000a');
select pg_temp.media('d0000000-0000-0000-0000-000000000005', 'File:Ambiguous.jpg', 'Jane Smith',
  'CC-BY-4.0', 'media_match_review', 'aaaaaaaa-0000-0000-0000-00000000000a');
select pg_temp.media('d0000000-0000-0000-0000-000000000006', 'File:PublicDomain.jpg', null,
  'PUBLIC-DOMAIN', 'media_match_confident', 'aaaaaaaa-0000-0000-0000-00000000000a');

-- ---------------------------------------------------------------------------
-- Attribution is generated from stored data, per licence
-- ---------------------------------------------------------------------------
select is(
  public.build_media_attribution('Jane Smith', 'CC-BY-4.0', 'Wikimedia Commons', 'Abbey.jpg'),
  '"Abbey.jpg", by Jane Smith, CC BY 4.0, via Wikimedia Commons',
  'a CC BY credit names the creator and the licence');

select is(
  public.build_media_attribution('Jane Smith', 'CC-BY-SA-3.0', 'Wikimedia Commons', 'Keep.jpg'),
  '"Keep.jpg", by Jane Smith, CC BY-SA 3.0, via Wikimedia Commons',
  'a share-alike credit names its own licence, not a generic one');

select is(
  public.build_media_attribution(null, 'PUBLIC-DOMAIN', 'Wikimedia Commons', 'Old.jpg'),
  '"Old.jpg", Public domain, via Wikimedia Commons',
  'public domain needs no creator, so the component is simply absent');

select is(
  public.build_media_attribution(null, 'CC-BY-SA-4.0', 'Wikimedia Commons', 'X.jpg'),
  null,
  'a licence requiring attribution with no creator yields no attribution at all');

-- ---------------------------------------------------------------------------
-- Rights assessment, per file
-- ---------------------------------------------------------------------------
select is(public.assess_media_rights('d0000000-0000-0000-0000-000000000001'),
  'media_ready'::public.media_rights_state, 'a CC BY file with a creator is ready');
select is(public.assess_media_rights('d0000000-0000-0000-0000-000000000006'),
  'media_ready'::public.media_rights_state, 'a public-domain file with no creator is ready');
select is(public.assess_media_rights('d0000000-0000-0000-0000-000000000002'),
  'media_creator_unknown'::public.media_rights_state, 'CC BY-SA with no creator is not ready');
select is(public.assess_media_rights('d0000000-0000-0000-0000-000000000003'),
  'media_rights_incomplete'::public.media_rights_state, 'an unknown licence is not ready');
select is(public.assess_media_rights('d0000000-0000-0000-0000-000000000004'),
  'media_licence_unsupported'::public.media_rights_state, 'a non-reusable licence is refused');
select is(public.assess_media_rights('d0000000-0000-0000-0000-000000000005'),
  'media_association_review'::public.media_rights_state,
  'rights-perfect media is held back when the subject is uncertain');

select is(
  (select missing_rights_fields from public.import_media_candidates
    where id = 'd0000000-0000-0000-0000-000000000002'),
  array['creator']::text[], 'the reviewer is told exactly what is missing');

-- ---------------------------------------------------------------------------
-- Authorisation
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '';
set local role anon;
select throws_ok(
  $$select public.publish_media_candidate('d0000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon cannot publish imported media');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$select public.publish_media_candidate('d0000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'an ordinary authenticated user cannot publish imported media');
select throws_ok(
  $$select public.review_media_candidate('d0000000-0000-0000-0000-000000000001', 'approved')$$,
  '42501', null, 'an ordinary authenticated user cannot review imported media');
reset role;

-- ---------------------------------------------------------------------------
-- The rights gate cannot be talked around
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select throws_ok(
  $$select public.publish_media_candidate('d0000000-0000-0000-0000-000000000002')$$,
  '23514', null, 'an editor cannot publish media with no creator');
select throws_ok(
  $$select public.publish_media_candidate('d0000000-0000-0000-0000-000000000003')$$,
  '23514', null, 'an editor cannot publish media with no licence');
select throws_ok(
  $$select public.publish_media_candidate('d0000000-0000-0000-0000-000000000004')$$,
  '23514', null, 'an editor cannot publish non-reusable media');
select throws_ok(
  $$select public.publish_media_candidate('d0000000-0000-0000-0000-000000000005')$$,
  '23514', null, 'an editor cannot publish media whose subject is uncertain');

-- An editor cannot even reach for the flag: the table is read-only to them.
select throws_ok(
  $$update public.import_media_candidates set rights_state = 'media_ready'
     where id = 'd0000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'an editor cannot edit rights state directly');
reset role;

-- ...and if something with more privilege did flip it, publication re-assesses
-- from the underlying metadata, so a stale or tampered flag buys nothing.
update public.import_media_candidates
   set rights_state = 'media_ready'
 where id = 'd0000000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $$select public.publish_media_candidate('d0000000-0000-0000-0000-000000000002')$$,
  '23514', null, 'marking a candidate ready by hand does not make it publishable');

-- --- The one that should work ---------------------------------------------
select lives_ok(
  $$select public.publish_media_candidate('d0000000-0000-0000-0000-000000000001')$$,
  'a rights-ready file publishes');
reset role;

select is(
  (select count(*) from public.images where storage_path like '%Ready.jpg'),
  1::bigint, 'the image exists');
select is(
  (select ir.attribution from public.image_rights ir
     join public.images i on i.id = ir.image_id
    where i.storage_path like '%Ready.jpg'),
  '"Ready.jpg", by Jane Smith, CC BY 4.0, via Wikimedia Commons',
  'and carries attribution generated from its own stored rights');
select is(
  (select ir.licence_normalised from public.image_rights ir
     join public.images i on i.id = ir.image_id
    where i.storage_path like '%Ready.jpg'),
  'CC-BY-4.0'::public.media_licence, 'with the normalised licence');
select is(
  (select i.is_community from public.images i where i.storage_path like '%Ready.jpg'),
  false, 'imported open media is not community media — the legal models stay separate');
select isnt(
  (select i.source_record_id from public.images i where i.storage_path like '%Ready.jpg'),
  null, 'and traces back to the source record it came from');

-- --- Idempotency -----------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$select public.publish_media_candidate('d0000000-0000-0000-0000-000000000001')$$,
  'republishing the same file succeeds');
reset role;

select is(
  (select count(*) from public.images where storage_path like '%Ready.jpg'),
  1::bigint, 'reimporting the same Commons file did not create a second image');

-- --- Community uploads are untouched ---------------------------------------
select is(
  (select count(*) from pg_policies
    where tablename = 'images' and policyname = 'images community insert'),
  1::bigint, 'the community upload path still exists and was not altered');

select * from finish();
rollback;
