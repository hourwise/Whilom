-- 0027_commons_media.sql
-- Wikimedia Commons as Whilom's first external media source, with rights as a
-- hard invariant rather than a hope.
--
-- The governing rule: Whilom must not display an imported image unless it can
-- generate valid attribution for that exact file from stored data. "From
-- Wikimedia Commons" is not a licence, a category is not proof of subject, and
-- a URL is not permission.
--
-- The existing media model is extended rather than replaced. `images` and
-- `image_rights` already separate community uploads from everything else via
-- `is_community`, and that separation is deliberately preserved: imported open
-- media and user-owned photographs have different legal models and must not
-- share one.

-- ---------------------------------------------------------------------------
-- Licence vocabulary
--
-- Normalised so reusability is a decision about a known value rather than a
-- string comparison, while the source's own wording is always kept alongside.
-- ---------------------------------------------------------------------------
create type public.media_licence as enum (
  'CC0-1.0',
  'PUBLIC-DOMAIN',
  'CC-BY-2.0', 'CC-BY-2.5', 'CC-BY-3.0', 'CC-BY-4.0',
  'CC-BY-SA-2.0', 'CC-BY-SA-2.5', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0',
  'OTHER-REUSABLE',
  -- Present and readable, but not usable on the terms Whilom needs.
  'UNSUPPORTED',
  -- Missing or unparseable. Distinct from UNSUPPORTED: one is a licence we
  -- decline, the other is an absence of evidence.
  'UNKNOWN'
);

comment on type public.media_licence is
  'Normalised licence identity. Never replaces the raw source value, which is always retained for audit.';

-- Which normalised licences may be displayed at all, and whether displaying
-- them obliges Whilom to name the creator.
create table public.media_licence_terms (
  licence            public.media_licence primary key,
  display_name       text not null,
  licence_url        text,
  is_reusable        boolean not null,
  requires_attribution boolean not null,
  requires_share_alike boolean not null default false
);

insert into public.media_licence_terms
  (licence, display_name, licence_url, is_reusable, requires_attribution, requires_share_alike) values
  ('CC0-1.0',       'CC0 1.0',        'https://creativecommons.org/publicdomain/zero/1.0/', true,  false, false),
  ('PUBLIC-DOMAIN', 'Public domain',  null,                                                  true,  false, false),
  ('CC-BY-2.0',     'CC BY 2.0',      'https://creativecommons.org/licenses/by/2.0/',        true,  true,  false),
  ('CC-BY-2.5',     'CC BY 2.5',      'https://creativecommons.org/licenses/by/2.5/',        true,  true,  false),
  ('CC-BY-3.0',     'CC BY 3.0',      'https://creativecommons.org/licenses/by/3.0/',        true,  true,  false),
  ('CC-BY-4.0',     'CC BY 4.0',      'https://creativecommons.org/licenses/by/4.0/',        true,  true,  false),
  ('CC-BY-SA-2.0',  'CC BY-SA 2.0',   'https://creativecommons.org/licenses/by-sa/2.0/',     true,  true,  true),
  ('CC-BY-SA-2.5',  'CC BY-SA 2.5',   'https://creativecommons.org/licenses/by-sa/2.5/',     true,  true,  true),
  ('CC-BY-SA-3.0',  'CC BY-SA 3.0',   'https://creativecommons.org/licenses/by-sa/3.0/',     true,  true,  true),
  ('CC-BY-SA-4.0',  'CC BY-SA 4.0',   'https://creativecommons.org/licenses/by-sa/4.0/',     true,  true,  true),
  ('OTHER-REUSABLE','Other reusable', null,                                                  true,  true,  false),
  ('UNSUPPORTED',   'Not reusable',   null,                                                  false, true,  false),
  ('UNKNOWN',       'Unknown',        null,                                                  false, true,  false);

alter table public.media_licence_terms enable row level security;
create policy "media_licence_terms read" on public.media_licence_terms for select using (true);
create policy "media_licence_terms admin" on public.media_licence_terms for all
  using (public.is_admin()) with check (public.is_admin());
grant select on public.media_licence_terms to anon, authenticated;
grant all on public.media_licence_terms to service_role;

-- ---------------------------------------------------------------------------
-- Rights readiness and association outcomes
-- ---------------------------------------------------------------------------
create type public.media_rights_state as enum (
  'media_ready',
  'media_rights_incomplete',
  'media_licence_unsupported',
  'media_creator_unknown',
  'media_association_review',
  'media_invalid'
);

create type public.media_association_outcome as enum (
  'media_match_confident',
  'media_match_review',
  'media_no_match'
);

comment on type public.media_rights_state is
  'Backend truth about whether a file can be displayed. The UI may explain it; it may never override it.';

-- ---------------------------------------------------------------------------
-- Media candidates: the review staging area, before anything is displayable.
-- ---------------------------------------------------------------------------
create table public.import_media_candidates (
  id uuid primary key default extensions.uuid_generate_v4(),
  import_run_id uuid references public.import_runs (id) on delete set null,
  import_source_id uuid not null references public.import_sources (id) on delete cascade,

  -- Stable identity from the source. A reimport of the same file lands on the
  -- same row rather than creating a second picture of the same thing.
  source_file_id text not null,
  source_title text,
  source_page_url text not null,
  media_url text,
  thumbnail_url text,

  -- Rights, as published and as normalised. Both are kept: the normalised value
  -- is what logic acts on, the raw value is the evidence for that decision.
  creator text,
  creator_raw text,
  licence public.media_licence not null default 'UNKNOWN',
  licence_raw text,
  licence_url text,
  attribution_text text,

  mime_type text,
  width integer,
  height integer,
  caption text,

  -- Proposed subject. Association is a claim about what the image shows and is
  -- kept separate from rights: a perfectly licensed photo of the wrong place is
  -- still the wrong place.
  entity_type public.entity_type not null default 'place',
  entity_id uuid,
  association_outcome public.media_association_outcome not null default 'media_no_match',
  association_confidence numeric(4, 3) check (association_confidence between 0 and 1),
  association_evidence jsonb not null default '{}',
  -- Where structured data names several subjects, all are retained rather than
  -- one being chosen arbitrarily.
  depicted_entity_ids uuid[] not null default '{}',

  rights_state public.media_rights_state not null default 'media_rights_incomplete',
  missing_rights_fields text[] not null default '{}',

  retrieved_at timestamptz not null default now(),
  source_updated_at timestamptz,
  importer_version text,
  raw jsonb not null default '{}',

  status public.moderation_state not null default 'needs_review',
  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  published_image_id uuid references public.images (id) on delete set null,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  unique (import_source_id, source_file_id)
);

create index import_media_candidates_state_idx on public.import_media_candidates (rights_state);
create index import_media_candidates_entity_idx on public.import_media_candidates (entity_type, entity_id);
create index import_media_candidates_status_idx on public.import_media_candidates (status);

alter table public.import_media_candidates enable row level security;
create policy "import_media_candidates editor read" on public.import_media_candidates
  for select using (public.is_editor());
create policy "import_media_candidates admin" on public.import_media_candidates for all
  using (public.is_admin()) with check (public.is_admin());
grant select on public.import_media_candidates to authenticated;
grant all on public.import_media_candidates to service_role;

-- ---------------------------------------------------------------------------
-- Imported media provenance on the existing tables.
-- ---------------------------------------------------------------------------
alter table public.images
  add column source_id uuid references public.sources (id) on delete set null,
  add column source_record_id uuid references public.source_records (id) on delete set null,
  add column mime_type text,
  add column thumbnail_url text;

alter table public.image_rights
  add column licence_normalised public.media_licence,
  add column licence_raw text,
  add column creator_raw text,
  add column source_file_id text,
  add column retrieved_at timestamptz,
  add column raw jsonb;

comment on column public.image_rights.licence_raw is
  'The licence exactly as the source stated it. Normalisation informs logic; this is the evidence.';

-- ---------------------------------------------------------------------------
-- Attribution, generated from stored data alone.
--
-- Deliberately a database function: attribution must be derivable without
-- fetching the source page at render time, and must be identical wherever it is
-- shown. Different licences need different components, so it is composed rather
-- than templated from one sentence.
-- ---------------------------------------------------------------------------
create or replace function public.build_media_attribution(
  p_creator text,
  p_licence public.media_licence,
  p_source_name text,
  p_title text default null
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_terms public.media_licence_terms%rowtype;
  v_parts text[] := '{}';
begin
  select * into v_terms from public.media_licence_terms where licence = p_licence;
  if not found then
    return null;
  end if;

  if p_title is not null and p_title <> '' then
    v_parts := v_parts || ('"' || p_title || '"');
  end if;

  -- A licence requiring attribution cannot produce attribution without a
  -- creator. Returning NULL here is what makes the rights gate work: no
  -- attribution, no publication.
  if v_terms.requires_attribution then
    if p_creator is null or btrim(p_creator) = '' then
      return null;
    end if;
    v_parts := v_parts || ('by ' || p_creator);
  elsif p_creator is not null and btrim(p_creator) <> '' then
    -- Not required, but naming the creator anyway is the decent thing.
    v_parts := v_parts || ('by ' || p_creator);
  end if;

  v_parts := v_parts || v_terms.display_name;

  if p_source_name is not null and p_source_name <> '' then
    v_parts := v_parts || ('via ' || p_source_name);
  end if;

  return array_to_string(v_parts, ', ');
end;
$$;

comment on function public.build_media_attribution(text, public.media_licence, text, text) is
  'Compose display attribution from stored rights metadata. Returns NULL when a licence requires attribution and no creator is known — which is what blocks publication.';

-- ---------------------------------------------------------------------------
-- Rights assessment. One place decides whether a file may be displayed.
-- ---------------------------------------------------------------------------
create or replace function public.assess_media_rights(p_candidate_id uuid)
returns public.media_rights_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.import_media_candidates%rowtype;
  v_terms public.media_licence_terms%rowtype;
  v_missing text[] := '{}';
  v_state public.media_rights_state;
  v_attribution text;
  v_source_name text;
begin
  select * into c from public.import_media_candidates where id = p_candidate_id;
  if not found then
    raise exception 'media candidate % does not exist', p_candidate_id using errcode = 'no_data_found';
  end if;

  if c.source_file_id is null or c.source_page_url is null or c.media_url is null then
    if c.media_url is null then v_missing := v_missing || 'media_url'::text; end if;
    if c.source_page_url is null then v_missing := v_missing || 'source_page_url'::text; end if;
    update public.import_media_candidates
       set rights_state = 'media_invalid', missing_rights_fields = v_missing
     where id = p_candidate_id;
    return 'media_invalid';
  end if;

  select * into v_terms from public.media_licence_terms where licence = c.licence;

  select s.name into v_source_name
    from public.import_sources isrc
    left join public.sources s on s.id = isrc.source_id
   where isrc.id = c.import_source_id;

  v_attribution := public.build_media_attribution(c.creator, c.licence, v_source_name, c.source_title);

  if c.licence = 'UNKNOWN' then
    v_missing := v_missing || 'licence'::text;
    v_state := 'media_rights_incomplete';
  elsif not v_terms.is_reusable then
    v_state := 'media_licence_unsupported';
  elsif v_terms.requires_attribution and (c.creator is null or btrim(c.creator) = '') then
    v_missing := v_missing || 'creator'::text;
    v_state := 'media_creator_unknown';
  elsif v_attribution is null then
    v_missing := v_missing || 'attribution'::text;
    v_state := 'media_rights_incomplete';
  elsif c.retrieved_at is null then
    v_missing := v_missing || 'retrieved_at'::text;
    v_state := 'media_rights_incomplete';
  elsif c.entity_id is null or c.association_outcome <> 'media_match_confident' then
    -- Rights are fine; we are simply not sure enough what it shows.
    v_state := 'media_association_review';
  else
    v_state := 'media_ready';
  end if;

  update public.import_media_candidates
     set rights_state = v_state,
         missing_rights_fields = v_missing,
         attribution_text = coalesce(v_attribution, attribution_text)
   where id = p_candidate_id;

  return v_state;
end;
$$;

comment on function public.assess_media_rights(uuid) is
  'Decide whether a media candidate may be displayed, per file. Rights and subject association are assessed separately because a correctly licensed photo of the wrong place is still wrong.';

-- ---------------------------------------------------------------------------
-- Governed media publication.
-- ---------------------------------------------------------------------------
create or replace function public.publish_media_candidate(
  p_candidate_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.import_media_candidates%rowtype;
  v_actor uuid := auth.uid();
  v_state public.media_rights_state;
  v_image_id uuid;
  v_source_id uuid;
  v_source_record_id uuid;
  v_source_name text;
  v_attribution text;
  v_licence_url text;
begin
  if not public.is_editor() then
    raise exception 'publishing media requires editor authority' using errcode = 'insufficient_privilege';
  end if;

  select * into c from public.import_media_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'media candidate % does not exist', p_candidate_id using errcode = 'no_data_found';
  end if;

  -- Reimport and retry are the same thing here: the file already has an image.
  if c.published_image_id is not null then
    return c.published_image_id;
  end if;

  -- Re-assessed at publication time from what is actually stored, so a stale
  -- readiness flag or an edited row cannot let an unrightsed file through.
  v_state := public.assess_media_rights(p_candidate_id);
  if v_state <> 'media_ready' then
    raise exception 'media candidate % is %, only media_ready media may be published',
      p_candidate_id, v_state using errcode = 'check_violation';
  end if;

  select * into c from public.import_media_candidates where id = p_candidate_id;

  select isrc.source_id, s.name into v_source_id, v_source_name
    from public.import_sources isrc
    left join public.sources s on s.id = isrc.source_id
   where isrc.id = c.import_source_id;

  if v_source_id is null then
    raise exception 'media import source is not mapped to a citable source'
      using errcode = 'foreign_key_violation';
  end if;

  v_attribution := public.build_media_attribution(c.creator, c.licence, v_source_name, c.source_title);
  if v_attribution is null then
    raise exception 'attribution could not be generated for media candidate %', p_candidate_id
      using errcode = 'check_violation';
  end if;

  select licence_url into v_licence_url from public.media_licence_terms where licence = c.licence;

  insert into public.source_records (
    source_id, external_id, url, licence, attribution, retrieved_at, source_updated_at,
    importer_version, raw, entity_type, entity_id, review_status)
  values (
    v_source_id, c.source_file_id, c.source_page_url, c.licence::text, v_attribution,
    c.retrieved_at, c.source_updated_at, c.importer_version, c.raw,
    c.entity_type, c.entity_id, 'approved')
  on conflict (source_id, external_id, entity_type, entity_id) do update
    set retrieved_at = excluded.retrieved_at, raw = excluded.raw,
        attribution = excluded.attribution, licence = excluded.licence
  returning id into v_source_record_id;

  -- `is_community` stays false: this is imported open media, governed by the
  -- source's licence, not by an uploader's declaration.
  insert into public.images (
    storage_path, caption, alt_text, width, height, entity_type, entity_id,
    is_community, moderation_status, source_id, source_record_id, mime_type, thumbnail_url)
  values (
    c.media_url, c.caption, c.source_title, c.width, c.height, c.entity_type, c.entity_id,
    false, 'approved', v_source_id, v_source_record_id, c.mime_type, c.thumbnail_url)
  returning id into v_image_id;

  -- If this insert fails the whole transaction unwinds, so an image can never
  -- exist without the rights that justify showing it.
  insert into public.image_rights (
    image_id, creator, source, licence, attribution, licence_url, source_url,
    ownership_declared, licence_normalised, licence_raw, creator_raw,
    source_file_id, retrieved_at, raw)
  values (
    v_image_id, c.creator, coalesce(v_source_name, 'Wikimedia Commons'),
    c.licence::text, v_attribution, coalesce(c.licence_url, v_licence_url), c.source_page_url,
    false, c.licence, c.licence_raw, c.creator_raw, c.source_file_id, c.retrieved_at, c.raw);

  update public.import_media_candidates
     set published_image_id = v_image_id, published_at = now(), published_by = v_actor,
         status = 'approved', review_note = coalesce(p_note, review_note)
   where id = p_candidate_id;

  insert into public.moderation_items (target_kind, target_id, state, assigned_to)
  values ('import_media_candidate', p_candidate_id, 'approved', v_actor)
  on conflict (target_kind, target_id) do update
    set state = 'approved', assigned_to = v_actor, updated_at = now();

  insert into public.moderation_actions (moderation_item_id, moderator_id, action, note)
  select mi.id, v_actor, 'publish_media',
         coalesce(p_note, 'published media candidate ' || p_candidate_id::text)
    from public.moderation_items mi
   where mi.target_kind = 'import_media_candidate' and mi.target_id = p_candidate_id;

  return v_image_id;
end;
$$;

comment on function public.publish_media_candidate(uuid, text) is
  'Atomically publish a rights-ready media candidate: image + rights + source record. Editor-only. Re-assesses rights at publication; refuses anything not media_ready. Idempotent.';

-- ---------------------------------------------------------------------------
-- Reviewer decision on a media candidate. Cannot bypass rights: it records a
-- decision, and publication remains a separate, gated act.
-- ---------------------------------------------------------------------------
create or replace function public.review_media_candidate(
  p_candidate_id uuid,
  p_decision public.moderation_state,
  p_entity_id uuid default null,
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
    raise exception 'reviewing media requires editor authority' using errcode = 'insufficient_privilege';
  end if;

  if p_decision not in ('approved', 'rejected', 'needs_review') then
    raise exception 'a reviewer may only approve, reject or defer media'
      using errcode = 'check_violation';
  end if;

  update public.import_media_candidates
     set status = p_decision,
         review_note = coalesce(p_note, review_note),
         reviewed_by = v_actor,
         reviewed_at = now(),
         -- Correcting the subject is a legitimate reviewer action; inventing a
         -- creator or a licence is not, and there is no parameter for it.
         entity_id = coalesce(p_entity_id, entity_id),
         association_outcome = case
           when p_entity_id is not null then 'media_match_confident'::public.media_association_outcome
           else association_outcome end
   where id = p_candidate_id;

  if not found then
    raise exception 'media candidate % does not exist', p_candidate_id using errcode = 'no_data_found';
  end if;

  perform public.assess_media_rights(p_candidate_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Review queue for media, mirroring the fact/relationship queue.
-- ---------------------------------------------------------------------------
create or replace view public.media_review_queue with (security_invoker = true) as
select
  c.id                        as candidate_id,
  c.source_file_id,
  c.source_title,
  c.source_page_url,
  c.thumbnail_url,
  c.media_url,
  c.creator,
  c.licence,
  t.display_name              as licence_name,
  coalesce(c.licence_url, t.licence_url) as licence_url,
  t.is_reusable,
  t.requires_attribution,
  c.attribution_text,
  c.rights_state,
  c.missing_rights_fields,
  c.association_outcome,
  c.association_confidence,
  c.entity_id,
  p.name                      as entity_name,
  c.status                    as review_status,
  c.published_image_id,
  c.retrieved_at,
  isrc.key                    as source_key
from public.import_media_candidates c
left join public.media_licence_terms t on t.licence = c.licence
left join public.places p on p.id = c.entity_id
join public.import_sources isrc on isrc.id = c.import_source_id;

comment on view public.media_review_queue is
  'Backend contract for media review: file, rights state, missing fields, generated attribution and proposed subject. security_invoker, so the candidate policy governs access.';

grant select on public.media_review_queue to authenticated, service_role;

revoke all on function public.assess_media_rights(uuid) from public;
revoke all on function public.publish_media_candidate(uuid, text) from public;
revoke all on function public.review_media_candidate(uuid, public.moderation_state, uuid, text) from public;
revoke all on function public.build_media_attribution(text, public.media_licence, text, text) from public;
grant execute on function public.publish_media_candidate(uuid, text) to authenticated, service_role;
grant execute on function public.review_media_candidate(uuid, public.moderation_state, uuid, text)
  to authenticated, service_role;
grant execute on function public.build_media_attribution(text, public.media_licence, text, text)
  to authenticated, service_role;
