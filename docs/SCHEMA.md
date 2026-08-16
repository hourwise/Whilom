# Database schema

The full Whilom schema (spec §33) lives in `supabase/migrations/`, applied in
order. 46 tables, all with Row Level Security enabled. TypeScript row types are
generated from it into `packages/database` — the schema is the source of truth,
never the app code.

## Migration map

| File | Domain |
| --- | --- |
| `0001_extensions.sql` | PostGIS, uuid-ossp, pg_trgm, unaccent |
| `0002_enums.sql` | 21 enum types (mirror of `@whilom/domain`) |
| `0003_profiles_and_helpers.sql` | Profiles, roles, `set_updated_at`, `is_editor/moderator/admin` |
| `0004_places.sql` | places, categories, tags, designations, access, facilities, accessibility, `search_places` |
| `0005_people_events_objects.sql` | people, events, objects |
| `0006_relationships_sources_facts.sql` | sources, source_records, facts, entity_relationships (the graph) |
| `0007_media.sql` | images, image_rights |
| `0008_community.sql` | reviews, comments, tips |
| `0009_visits_wishlists.sql` | visits, visit_photos, wishlists, wishlist_items |
| `0010_routes.sql` | routes, route_stops, route_geometry |
| `0011_trips.sql` | trips, trip_days, trip_stops |
| `0012_collections.sql` | collections, collection_entities |
| `0013_badges.sql` | badges, user_badges |
| `0014_contributions_moderation.sql` | contributions, corrections, reports, moderation_items, moderation_actions |
| `0015_import.sql` | import_sources, import_runs, import_raw, import_candidates, import_conflicts |
| `0016_views.sql` | `places_geo` view (exposes lng/lat; `security_invoker`) |

## Key design decisions

**Polymorphic graph, not a maze of join tables.** `entity_relationships`
(subject_type/subject_id → predicate → object_type/object_id) is a single
flexible edge table so new relationship kinds never need a migration (spec §5).
`predicate` is **text**, validated against the `PREDICATE_SCHEMAS` registry in
`@whilom/domain` — deliberately not an enum, for the same reason. Because a FK
can't span tables, `entity_exists()` + `BEFORE` triggers enforce that every
polymorphic endpoint (relationships, facts, source_records, comments,
collection_entities) points at a real row.

**Provenance is first-class.** `sources` + `source_records` let one canonical
place carry many source records (spec §36), and `facts` attaches atomic,
source-tagged assertions to any entity (spec §34). `trust_level` on entities and
sources drives the content-trust display model (spec §39), so an imported claim
is never indistinguishable from an editorial fact or a user claim.

**Enums mirror the domain package.** All 21 SQL enum types match the string
unions in `packages/domain/src/enums.ts` one-for-one (checked by a parity
script). `place_type`, `historical_period`, etc. are enums; add a value with
`ALTER TYPE ... ADD VALUE` and mirror it in the domain package.

**Denormalised filter columns.** `places` keeps `place_type`, `primary_period`,
`access_cost`, `is_visitable` on the row for fast filtering, with full visitor
detail in `place_access`. Weighted `tsvector` columns power text search;
`search_places()` is the single RPC both apps call via `@whilom/search`.

## RLS model (spec §38)

Roles live on `profiles.role` (`user < contributor < editor < moderator <
admin`), read by `SECURITY DEFINER` helpers to avoid policy recursion. Four
patterns:

- **Canonical content** (places, people, events, objects, relationships,
  sources, facts, routes, collections): public read when `approved`; writes are
  `is_editor()` only. Ingestion uses the service role, which bypasses RLS.
- **Community content** (reviews, comments, tips, images): read when approved or
  own; insert as self with `submitted` status; edit/delete own while unapproved;
  moderators manage all. Users can never self-approve.
- **Private user data** (visits, wishlists, trips): strictly owner-scoped, with
  optional public read where the owner set `is_public`.
- **Privileged** (moderation_*, import_*, badges award): moderator/admin only;
  moderation_actions are append-only (no update/delete policy), and badges can
  never be self-awarded.

## Regenerating types

```bash
supabase start
supabase db reset          # apply all migrations + seed
pnpm db:types              # regenerate packages/database/src/generated/database.types.ts
```

> Local validation needs the Supabase stack (Docker) or a Postgres with PostGIS.
> `supabase test db` runs the pgTAP suite in `supabase/tests/`.
