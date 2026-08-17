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
