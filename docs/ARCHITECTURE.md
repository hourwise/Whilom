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
