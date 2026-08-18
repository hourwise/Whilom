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
| `0017_child_row_visibility.sql` | Parent-gated read policies for place/route/collection/image child rows |
| `0018_visibility_helper_hardening.sql` | `SECURITY DEFINER` helpers pinned to an empty `search_path`; explicit EXECUTE; role-guard fix |
| `0019_place_type_structures.sql` | `place_type` gains `building` and `structure` |
| `0020_location_accuracy.sql` | `location_method` enum; positional accuracy on `places` and position provenance on `source_records` |
| `0021_grants.sql` | Table privileges for `anon`/`authenticated`/`service_role` |
| `0022_place_type_unknown.sql` | `place_type` gains `unknown`; `structure` stops being a universal fallback |
| `0023_governed_publish.sql` | `conflict_resolution` enum, publish state on candidates, `publish_import_candidate()`, `resolve_import_conflict()`, `import_review_queue` |
| `0024_generalised_publication.sql` | `fact_predicates` registry, fact/relationship provenance and per-source identity, data-driven publish, `preview_import_candidate()` |
| `0025_review_workbench_access.sql` | Editor read access to review material, `review_import_candidate()`, `import_decision_history` |
| `0026_preferred_claim_resolution.sql` | Predicate cardinality, single-preferred trigger, resolutions that move display state |
| `0027_commons_media.sql` | `media_licence` vocabulary and terms, media candidates, rights readiness, `build_media_attribution()`, `publish_media_candidate()`, `media_review_queue` |

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

**Enums mirror the domain package.** The SQL enum types match the string unions
in `packages/domain/src/enums.ts` one-for-one, enforced by
`packages/domain/src/enum-parity.test.ts`, which reads the migrations and
applies `create type` and `alter type … add value` in filename order. Add a
value with `ALTER TYPE … ADD VALUE` and mirror it in the domain package, in a
migration of its own — Postgres refuses to *use* a new enum value in the
transaction that adds it.

**Positional accuracy is explicit.** A PostGIS point is a claim of infinite
precision, and for heritage data that claim is usually false. `places` carries
`location_method` (a nine-value controlled vocabulary) and `location_accuracy_m`
(the radius the real feature is expected to lie within, NULL when unassessed);
`source_records` keeps what each source published — the original coordinate, its
CRS, the transformation identifier and version, the source's own stated
precision, and our estimate.

> **Coordinate-transformation accuracy is not source-feature positional
> accuracy.** Whilom's BNG→WGS84 conversion is pinned to the Ordnance Survey
> worked example at 0.44 mm; that proves the arithmetic, not the location. For a
> polygon centroid the honest figure comes from the feature's own extent —
> Fountains Abbey's 33-hectare precinct gives ~327 m.

**`place_type` stays broad, and `structure` is not a wildcard.** `building` and
`structure` exist so ordinary listed heritage — most of the ~380,000 NHLE
entries — has an honest classification instead of being forced into `monument`.

`structure` means **a constructed work with no more specific type**. It is *not*
a universal heritage fallback: battlefields, designed landscapes, protected
wrecks, earthworks and demolished sites are not built works, and 0022 adds
`unknown` so a record whose designation implies nothing about form can say so.
The ingestion fallback is designation-aware — scheduled monument →
`archaeological_site`, registered park → `historic_landscape`, listed building →
`structure`, otherwise `unknown`. Detailed subtype belongs in
`place_categories`/`place_tags`, which extend without a migration.

**Canonical data has one entrance.** `publish_import_candidate()` is the only
supported route from an import candidate to a canonical place. It is atomic,
editor-only, refuses unresolved conflicts, and is idempotent on retry; see
[INGESTION.md](INGESTION.md).

**Publication is data-driven, not hard-coded.** Candidates carry a `facts` array
of predicate/value pairs, and publish iterates it against the
`fact_predicates` registry — an unregistered predicate is refused. Adding a fact
is an `INSERT` into the registry plus a mapping in
`ingestion/pipeline/facts.ts`; it is never an edit to a stored procedure.

**Agreement never erases attribution.** `facts` and `entity_relationships` are
unique *per source*, not globally. Two sources asserting the same value are two
rows with two sources, because who corroborated what is itself information. The
original `entity_relationships` constraint was global, which silently rejected
the second source's claim as a duplicate; `0024` replaces it.

**A reviewer's decision moves the displayed value.** `facts.is_preferred` is set
by `resolve_import_conflict()` atomically with the decision, and preference is a
property of the predicate: `fact_predicates.cardinality` marks `official_website`
as single-valued and `former_name` as multi-valued, so a blanket "one preferred
row" rule is never imposed where several values are simultaneously true. A
trigger enforces the invariant by *demoting*, never deleting, so Whilom can
always still say "Source A said X, Source B said Y, a reviewer chose Z".

**Media rights are file-level and non-negotiable.** `media_licence` normalises
what a file states while `image_rights.licence_raw` keeps the original wording as
evidence. `publish_media_candidate()` re-assesses rights at publication and
refuses anything that is not `media_ready`, so a stale flag or an edited row
cannot get an unrightsed image published. Imported open media keeps
`images.is_community = false`: the legal model for external open media and for
user-uploaded photographs is not the same and the two are not merged.

**Grants are not optional.** RLS filters rows *after* the privilege check, so a
table with perfect policies and no `GRANT` is simply unreadable. `0021` grants
read to `anon`/`authenticated`, writes to `authenticated` only on the tables
users legitimately write to, and sets default privileges so a future table
cannot be silently unreadable.

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
- **Parent-gated child rows** (0017): a child row is publicly readable only when
  its parent is. The parent conditions genuinely differ and are encoded
  separately — a route must be `approved`, a collection must be **both**
  published and approved, and image rights follow the image (approved, or owned
  by the caller, or moderator). Lookup vocabularies that name no entity
  (`place_categories`, `place_tags`, `sources`, `badges`) stay world-readable.

All of the above is executed, not asserted: **106 pgTAP assertions across six
files** in `supabase/tests/` cover approved-vs-draft child visibility, editor
access, that authenticating alone grants nothing, that ordinary users cannot
write canonical records by any route, and the whole governed publish state
machine including authorisation, conflict refusal and idempotency.

## Where the schema is validated

**Whilom's database migrations and DB tests are validated on ephemeral,
GitHub-hosted Supabase/Postgres infrastructure. Local Docker is optional for
developers, not required for CI correctness.**

The `database` job in `.github/workflows/ci.yml` builds the schema from nothing
on every pull request:

1. start a throwaway Supabase stack (Studio, image proxy, edge runtime and the
   log pipeline excluded — none is needed to verify migrations or run pgTAP);
2. `supabase db reset`, which replays every migration from an empty database and
   loads the seed;
3. `supabase test db`, the pgTAP suite in `supabase/tests/`;
4. `supabase gen types typescript --local`;
5. diff the result against the committed types.

No hosted Supabase project is involved and the job needs no secrets, so it also
runs on forks. Whilom has no hosted Supabase environment.

### The generated type contract

```
migrations → fresh CI database → supabase gen types → compare with committed
```

`packages/database/src/generated/database.types.ts` is generated from the real
migration-produced schema and committed. **A schema change without regenerated
types fails CI.** The candidate is generated into a temp directory so CI never
mutates the working tree, and is uploaded as the `generated-database-types`
artifact — which is how you refresh the committed file without Docker.

### Locally (optional)

```bash
supabase start
supabase db reset          # apply all migrations + seed
supabase test db           # pgTAP suite
pnpm db:types              # regenerate the committed types
```

pgTAP is created inside each test's own transaction rather than by a migration,
so the test framework never reaches a real deployment.
