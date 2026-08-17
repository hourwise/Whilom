# Data ingestion

The heritage graph is populated by a governed pipeline, not ad-hoc imports. Every
imported assertion keeps its provenance, and an imported claim is never
indistinguishable from an editorial fact or a user claim (spec §34, §35, §39).

Code lives in `ingestion/` and is **server-only** — it runs with the Supabase
service role (which bypasses RLS) and must never be bundled into a client.

## Pipeline stages

```
SOURCE → RAW → NORMALISE → VALIDATE → MATCH/DEDUPE → ENRICH
       → CONFLICT DETECTION → REVIEW (when required) → PUBLISH
```

| Stage | Responsibility | Where |
| --- | --- | --- |
| Source | Fetch records from a national body / dataset | `ingestion/sources/*` (one adapter each) |
| Raw | Persist untouched payloads for audit | `import_raw` |
| Normalise | Map source vocab → domain enums, reproject coords, clean names | `ingestion/transforms` |
| Validate | Zod-check the normalised shape | `@whilom/validation` |
| Match / dedupe | Resolve to a canonical entity or flag ambiguity | `ingestion/matching` → `import_candidates` |
| Enrich | Attach photos/licences, periods, people, links | `ingestion/enrichment` |
| Conflict detection | Field-level diffs vs existing data | `import_conflicts` |
| Review | Human decision on ambiguous matches / conflicts | admin queue |
| Publish | Upsert canonical rows + `source_records` | `places`, `sources`, `source_records`, … |

## Source adapters

Each dataset implements the `SourceAdapter` contract
(`ingestion/sources/source-adapter.ts`): an `id` matching a row in the
`import_sources` registry, and an async-iterable `fetch()` yielding
`RawPlaceRecord`s that already carry full provenance (`sourceId`,
`sourceRecordId`, `originalUrl`, `licence`, `attribution`, `retrievedAt`,
`importerVersion`). Copy `example-adapter.ts` to start a real connector.

Candidate first connectors: Historic England NHLE (official, OGL), Wikidata,
OpenStreetMap, Wikimedia Commons (imagery), and selected museum APIs.

## Deduplication (spec §36)

The same castle may appear in several sources. These become **one canonical
place with multiple `source_records`**, not duplicate locations. Matching signals:
external identifiers, coordinates (PostGIS distance), name + alternative names
(`pg_trgm`), designation, postcode, address, and entity type. Ambiguous matches
never auto-merge — they go to `import_candidates` / `import_conflicts` with
`status = needs_review` for a human.

## Provenance (spec §34)

Every imported record retains: source, source record id, original URL, licence,
attribution, retrieval date, source update date (if known), importer version,
import run, match confidence and review status. `trust_level` on entities and
sources then drives how confidently the UI presents each fact.

## Running (Phase 2)

The runner is not built yet. When it is, a run creates an `import_runs` row,
streams adapter output through the stages above, and records everything so a run
is fully auditable and repeatable. Keep credentials in the root `.env`
(server-side), never in an app.
