-- 0002_enums.sql
-- Controlled vocabularies as Postgres enum types. These mirror the string
-- unions in `packages/domain/src/enums.ts` — keep the two in sync.
--
-- Note: relationship *predicates* are deliberately NOT an enum. They live as
-- text validated against the domain registry so new relationship types never
-- require a migration (spec §5).

create type public.app_role as enum ('user', 'contributor', 'editor', 'moderator', 'admin');

create type public.entity_type as enum ('place', 'person', 'event', 'object', 'route', 'collection', 'source');

create type public.place_type as enum (
  'castle', 'country_house', 'palace', 'abbey', 'priory', 'cathedral', 'church',
  'ruin', 'fort', 'battlefield', 'hillfort', 'roman_villa', 'settlement',
  'industrial_site', 'railway_site', 'canal_structure', 'military_installation',
  'airfield', 'bunker', 'pillbox', 'archaeological_site', 'museum', 'monument',
  'garden', 'historic_landscape', 'historic_village', 'lost_structure'
);

create type public.historical_period as enum (
  'prehistoric', 'roman', 'early_medieval', 'medieval', 'tudor', 'stuart',
  'georgian', 'victorian', 'edwardian', 'wwi', 'interwar', 'wwii', 'cold_war', 'modern'
);

create type public.event_type as enum (
  'battle', 'siege', 'construction', 'demolition', 'fire', 'royal_visit',
  'political_event', 'archaeological_discovery', 'industrial_event', 'wartime_event'
);

create type public.object_type as enum (
  'archaeological_artefact', 'weapon', 'manuscript', 'painting', 'photograph',
  'architectural_fragment', 'furniture', 'personal_possession'
);

create type public.route_type as enum (
  'walking', 'hiking', 'urban_walking_tour', 'driving', 'cycling', 'multi_day_trail'
);

create type public.route_difficulty as enum ('easy', 'moderate', 'hard', 'severe');

create type public.transport_mode as enum ('walking', 'cycling', 'driving', 'public_transport');

create type public.access_cost as enum ('free', 'paid', 'donation', 'exterior_only');

create type public.trust_level as enum (
  'official_source', 'open_data_source', 'editorially_verified',
  'community_submitted', 'community_review', 'unverified_suggestion'
);

create type public.moderation_state as enum (
  'submitted', 'automatically_screened', 'needs_review', 'approved', 'rejected', 'superseded'
);

create type public.source_kind as enum (
  'official', 'open_data', 'publication', 'website', 'museum', 'archive', 'editorial'
);

create type public.designation_type as enum (
  'listed_building', 'scheduled_monument', 'world_heritage_site', 'conservation_area',
  'registered_park_garden', 'registered_battlefield', 'protected_wreck', 'undesignated'
);

create type public.designation_grade as enum ('I', 'II*', 'II', 'A', 'B', 'C');

create type public.facility_type as enum (
  'parking', 'toilets', 'cafe', 'restaurant', 'shop', 'picnic_area', 'baby_changing',
  'accessible_toilets', 'ev_charging', 'picnic_allowed', 'dog_friendly', 'indoor', 'outdoor'
);

create type public.accessibility_feature as enum (
  'wheelchair_access', 'limited_mobility_suitable', 'accessible_parking',
  'step_free_areas', 'pushchair_suitable'
);

create type public.badge_category as enum ('milestone', 'place_type', 'period', 'region', 'trail', 'community');

create type public.contribution_type as enum (
  'review', 'comment', 'tip', 'photograph', 'correction', 'historical_claim',
  'new_place_suggestion', 'relationship_suggestion'
);

create type public.report_reason as enum (
  'incorrect_information', 'incorrect_access', 'blocked_path', 'facility_correction',
  'inappropriate', 'spam', 'copyright_concern', 'other'
);

create type public.wishlist_kind as enum ('wishlist', 'favourites', 'custom');
