# Architecture

One monorepo, one Supabase backend, two clients. The website provides depth;
the mobile app provides the real-world experience; the shared heritage graph
connects both (spec §54).

## Boundaries (the rules that keep this honest)

- **No app owns the schema.** Database contracts live in `packages/database`
  (generated Supabase types + typed client factories). `apps/web`, `apps/mobile`
  and `ingestion` are all *clients* of it. (spec §3)
- **Domain meaning lives in `packages/domain`** — entity kinds, relationship
  predicates, controlled vocabularies. Zero runtime dependencies, so anything
  can import it.
- **Discovery semantics have one client-side owner.** `packages/discovery`
  contains the portable period vocabulary, no-year-zero formatting, four time
  modes, ten display categories, bounded map-query builders, coverage wording,
  search/person result shapes and pure graph helpers. Web and Mobile may render
  differently, but they do not define separate historical or discovery rules.
- **UI design has one tracked source of truth.**
  [`docs/UI_DESIGN_SYSTEM.md`](UI_DESIGN_SYSTEM.md) defines Whilom's Heritage
  Archival System / Modern Editorial visual language. Luna's detailed UI plans
  refine that system and Codex/frontend implementation follows it. Web and
  React Native may use platform-specific components, but shared tokens,
  semantics and component-state conventions should not drift.
- **Privileged secrets never enter a client.** The service-role key and source
  credentials are server/ingestion only. Clients use the anon key; access is
  governed by Row Level Security. (spec §38)
- **Ingestion is not inside a frontend.** Import logic lives in `ingestion/`
  with modular per-source adapters. (spec §3, §35)
- **No source gets a special case.** Every source implements the same
  `SourceAdapter` contract and travels the same NORMALISE → VALIDATE → MATCH →
  COMPARE path; the runner takes a list of `{adapter, normalise}` pairs and
  branches on nothing. Historic England and Wikidata are peers.
- **Canonical data has exactly one entrance.** `publish_import_candidate()` is
  the only supported route from an import candidate to a canonical place:
  atomic, editor-only, refuses unresolved conflicts, idempotent on retry.
  Nothing — no client, no ingestion caller — writes canonical heritage tables
  directly. (spec §35, §38)
- **The UI is a caller, not an authority.** The review workbench renders the
  backend's own publish preview and offers only actions the governed functions
  implement. It never writes a canonical table, an import candidate or a
  conflict row itself, and its role gate is one of three layers rather than the
  protection.

- **Media rights are a backend invariant.** An imported image is publishable
  only when Whilom can generate valid attribution for that exact file from
  stored data. The rights gate lives in `publish_media_candidate()`, which
  re-assesses at publication; the UI explains rights state and has no override.
- **Imported media is not community media.** External open media (governed by
  the source's licence) and user-uploaded photographs (governed by the
  uploader's declaration) keep separate legal models and are not merged.

## Internal tooling

`/admin/imports` is the import review workbench: editorial staff only, and
deliberately not part of the public product. It exists so that conflicts the
pipeline surfaces have somewhere to be resolved. See
[INGESTION.md](INGESTION.md).
- **The database is verified in CI, not on a developer's machine.** Migrations
  and the pgTAP/RLS suite run on ephemeral GitHub-hosted Postgres. Local Docker
  is optional for developers, not required for CI correctness — and Whilom has
  no hosted Supabase environment at all. See [SCHEMA.md](SCHEMA.md).
- **Generated types are a contract, not a convenience.** CI regenerates them
  from the migration-produced schema and fails if the committed file differs, so
  the schema cannot drift away from the types the apps compile against.

## Deferred: mobile lint

`apps/mobile` has no lint step. Its script used to be `expo lint`, which
**self-installs** `eslint` + `eslint-config-expo` and writes an `.eslintrc.js`
the first time it runs — so simply running `pnpm lint` mutated the repository
and the lockfile. It is now a deterministic no-op that says so. Giving mobile a
real, checked-in ESLint config is a small task in its own right; it should not
ride along in an unrelated batch.

## Package graph

```
@whilom/domain      (no deps)
      ▲
      ├── @whilom/validation   (+ zod)
      ├── @whilom/database     (+ @supabase/supabase-js, generated types)
      └── @whilom/search       (+ validation)
                 ▲
   ┌─────────────┼───────────────┐
apps/web     apps/mobile      ingestion
```

Mobile's discovery screens depend on a `DiscoveryDataSource`, not on fixture
records or Supabase calls directly. Fixture mode is the safe default; setting
`EXPO_PUBLIC_WHILOM_DATA_MODE=live` opts into the public Supabase read adapter
when `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are both
present. Missing public configuration produces an explicit unavailable state
and makes no network request. The mobile adapter only calls bounded public
read/RPC contracts and never carries service-role or ingestion credentials.

Mobile community and account behaviour follows the same boundary. `apps/mobile`
uses the shared schemas in `@whilom/validation` for credentials, wishlist items,
visits, reviews, correction proposals and user-owned trips. Its
`MobileSessionProvider`, `MobileBehaviourProvider` and `MobileTripProvider` keep
development identity/activity/trip state in memory; fixture actions exercise the
real input shapes without writing to Supabase. The live adapters in
`apps/mobile/src/lib/live-adapters.ts` use the authenticated anon client and RLS
for `wishlists`/`wishlist_items`, `visits`, `reviews`, `corrections` and
owner-scoped `trips`/`trip_days`/`trip_stops` — never a service-role key.

`apps/mobile/src/lib/runtime.ts` is the release-safety gate. In development,
fixture mode is the safe default. Live mode requires both public Supabase
configuration values; missing configuration is an explicit unavailable state
and makes no network request. Production-context fixture mode also fails closed.
Phase 6E keeps `liveWritesAllowed` false, so screens cannot accidentally invoke
the live mutation adapters during remote development; eventual production
authorization remains Supabase Auth plus RLS, not this client-side flag. The
same action states (`idle`, `submitting`, `success`, `error`) are rendered by
platform-specific components. The `fixture@whilom.test` identity is
development-only and is never a live credential or release fallback. Auth
session persistence remains intentionally limited until a managed Expo storage
adapter is introduced and device-tested.

## Data flow

```
Sources ──▶ ingestion (raw → normalise → validate → match/dedupe → enrich
             → conflict detect → review → publish)  ──▶  Supabase (Postgres + PostGIS)
                                                              ▲
                                          RLS-governed reads/writes
                                                              │
                                    apps/web  ◀──────────────┴──────────────▶  apps/mobile
```

## Search

`packages/search` turns validated `PlaceSearchInput` into args for the
`search_places` Postgres RPC (`supabase/migrations/0003_places.sql`). Web and
mobile therefore issue identical queries. The `SearchStrategy` seam leaves room
for a later semantic/NL strategy without changing callers. (spec §37)

## Provenance & trust

Every imported assertion keeps its source, licence, attribution, retrieval date,
importer version and match confidence (spec §34). Display is classified by trust
level (`TrustLevel` in `packages/domain`) so an imported claim, an editorial
fact and a user claim are never indistinguishable. (spec §39)

## Build phases

This scaffold is **Phase 1 — Shared Foundation** (spec §43). Feature work
(Data MVP, Website MVP, Knowledge Platform, Trails, Mobile MVP, …) layers on top
without re-architecting these boundaries.

---

## Benchmark corpus and product dataset

Two distinct things live under `ingestion/`, and conflating them would be a
category error:

- **`scale/`** builds a *benchmark corpus* — nested tiers from 1,000 to 25,000
  records, selected by quota, existing to measure how the pipeline behaves as a
  corpus grows. It ends at metrics.
- **`regional/`** builds a *product dataset* — every protected record inside one
  coherent boundary, existing to be searched. It ends at canonical places with
  provenance, facts, designations and a review queue.

The data flow differs at the point where the benchmark stops:

```
                       benchmark stops here
                              |
source -> normalise -> validate -> candidates -> match -> metrics
                                                    |
                                                    v
                                       conflict / review
                                                    |
                                                    v
                              governed publication (publish_import_candidate)
                                                    |
                                                    v
             canonical places + source records + facts + relationships
                                                    |
                                                    v
                          bounded discovery reads (search_places, map_places)
```

Only the product path writes canonical data, and it does so exclusively through
the governed publication contract.

---

## Discovery

```
published canonical places
        |
        v
map_clusters / map_places        bounded, filtered, SECURITY INVOKER
        |
        v
/explore  (map + period + filters + preview)
/discover (server-rendered list, no map code)
        |
        v
/place/[slug]                    depth lives here, not in the map drawer
```

The map is discovery; the place page is depth. A preview shows only what the
marker payload already carries, so selecting a place costs no extra query and
cannot grow into a second, competing place page.

Directions leave Whilom entirely: coordinates are handed to an external
provider. Discovery and navigation are separate concerns.

See [DISCOVERY.md](DISCOVERY.md).

---

## The discovery model

```
                    WHERE                WHEN                 WHO
                 map viewport        century ruler       unified search
                 + coverage          + epoch bands       + person graph
                      |                    |                   |
                      +--------------------+-------------------+
                                           |
                        map_places / map_clusters  (bounded, invoker)
                                           |
                          published canonical places only
```

`/` and `/explore` are one component. The homepage runs it immersive, giving the
map the viewport; `/explore` opens the same thing with panels expanded. The
place page remains where depth lives — the map is discovery, and a preview shows
only what the marker payload already carries.

Coverage is a first-class concept rather than a caption: the map's scope is the
United Kingdom while the activated data is one region, and `coverage_regions`
exists so the difference is stated by the system rather than remembered by
whoever writes the copy.

See [DISCOVERY.md](DISCOVERY.md).
