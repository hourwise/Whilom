# Whilom backend bootstrap readiness

Batch 21A is a preparation and audit batch. There is no Whilom hosted
Supabase project yet, and this document is a future runbook rather than an
instruction to create one now.

## Current readiness

The repository contains 42 ordered migrations, a committed generated database
type file, local seed configuration, regional activation SQL, regional audit
SQL, and pgTAP plans. The machine-readable migration audit is
`supabase/bootstrap/migration-inventory.json`; run
`node scripts/check-migration-inventory.mjs` after any migration change.
The capability and RLS audit is
`supabase/bootstrap/backend-capability-matrix.json`; the executable query
benchmark contract is
`supabase/bootstrap/query-benchmark-contract.json`.

The static result is `READY_WITH_LIVE_VALIDATION_REQUIRED`: the migration
chain is ordered for a blank Supabase database, but no disposable Postgres /
PostGIS replay was available in Batch 21A. The current public schema has
spatial discovery paths and the `places_location_gix` GiST index, but it does
not yet expose a dedicated compact national matcher candidate index. That is a
Batch 21B schema decision, not a reason to rewrite the existing migrations in
this batch.

The first work-unit proposal is `OSGB10_EPSG27700_V1`: a 10,000 metre square
derived from British National Grid easting/northing. It is a logical batching
key, not a PostgreSQL partition. For an incoming point, enumerate every cell
intersecting the point's 5,000 metre-expanded envelope, then let PostGIS
`ST_DWithin` decide exact eligibility. This envelope-derived approach handles
boundaries and corners without a hand-maintained neighbour list. The proposed
cell size remains unvalidated for live record density until Batch 21B.

## Owner-operated hosted sequence

Do these steps only after the owner has created the intended Whilom project.
Do not substitute a project ref from another application.

1. The owner creates a new Whilom Supabase project and records its project ref,
   region, creation time, and dashboard URL.
2. Verify the repository, branch, and approved checkpoint. Confirm this is the
   backend-readiness branch or a later owner-approved Batch 21B branch.
3. Authenticate the Supabase CLI interactively with `supabase login`. Never
   commit an access token or put it in a script.
4. Inspect the installed CLI help, then link only the recorded project:
   `supabase link --project-ref <project-ref>`.
5. Prove the remote project is new. Inspect the remote migration history and
   read-only catalog counts for tables, functions, views, and non-system data.
   Stop immediately if unexpected tables, rows, migrations, users, storage
   objects, or a different project ref are present.
6. Inspect local-vs-remote migration state with the CLI migration-list command
   supported by the installed version. Stop for divergence or an unexplained
   remote migration.
7. Apply the ordered chain from zero using the repository's approved Supabase
   CLI command. Do not use `db reset` against a hosted project.
8. Verify `postgis`, `pg_trgm`, `unaccent`, and `uuid-ossp`, the `extensions`
   schema, the `places.location` geography column, and the GiST indexes.
9. Run the static checks: `node scripts/check-migrations.mjs`,
   `node scripts/check-migration-inventory.mjs`,
   `node scripts/check-pgtap-plans.mjs`, and the migration validation used by
   the repository CI.
10. Run the pgTAP suite against the new database. Stop on any failure.
11. Regenerate types only after the migration and pgTAP checks pass:
    `supabase gen types typescript --linked > packages/database/src/generated/database.types.ts`.
    Review the diff; generated types must not be hand-fabricated.
12. Run the ingestion and web compiler checks and the relevant Vitest suites.
13. Prepare the governed regional artifact from the committed regional
    manifest/cache. The supported commands are
    `pnpm --filter @whilom/ingestion regional:capture` and
    `pnpm --filter @whilom/ingestion regional:activate`; inspect the generated
    plan and CSVs before loading them. `regional-activation-plan.json` is the
    deterministic activation evidence and must reproduce byte-for-byte from
    the same inputs. Runtime measurements, if emitted in
    `regional-activation-telemetry.json`, are operational telemetry only and
    are not part of the activation seal. Do not recapture if the manifest/cache
    digest already matches.
14. Load only the regional CSVs through `supabase/regional/activate.sql` in a
    controlled editor/service-role lane. The SQL is designed to publish via
    the ordinary review and governed publication functions, in source order,
    in batches of 500. Do not bypass those functions with direct canonical
    inserts.
15. Run `supabase/regional/verify.sql` and record source-row, valid/rejected,
    review, conflict, provenance, orphan, and idempotency results.
16. Run the query scenarios in
    `supabase/bootstrap/query-benchmark-contract.json` twice: cold-ish and
    warm. Capture `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans, returned row
    counts, correctness assertions, and index evidence. No new latency gate is
    created by this runbook; classify measurements against the existing
    governed policy.
17. Run exact-radius boundary and corner fixtures, global identifier fixtures,
    duplicate/order fixtures, and same-register governance fixtures.
18. Run public discovery/RLS smoke tests with anonymous and authenticated
    clients, then separately verify editor/admin contribution paths.
19. Record the migration, type, regional, query, RLS, provenance, accounting,
    and idempotency evidence in the approved batch report.
20. Stop. A successful regional bootstrap does not authorize national import,
    200k import, 401,539-record import, production coverage expansion, or
    description retrieval.

## Mandatory stop conditions

Stop before loading data if any of these occurs:

- the project ref or region is not the owner-approved target;
- the remote project is not empty/new, or remote migration history diverges;
- a migration, pgTAP plan, generated-type diff, or schema validation fails;
- PostGIS or a required spatial index is missing;
- RLS/grants expose protected rows or block an intended public read;
- source-row, provenance, review, conflict, duplicate, or accounting totals do
  not match the committed regional manifest and activation plan;
- a repeat activation changes canonical counts or multiplies source/fact/
  relationship rows;
- a query returns incorrect rows, omits a boundary/corner candidate, applies
  geography to a global identifier lookup, or violates deterministic ordering;
- any command attempts to use hosted national data or a production credential
  outside the approved regional lane.

## Future schema handoff

The production candidate contract is deliberately separate from the existing
map/search contract. A later batch must decide whether to add a compact
candidate staging/index representation containing location, source identity,
source-record identity, designation identities, external identifiers,
designation references, and canonical insertion sequence. It must support an
exact PostGIS 5 km query, a global identifier union, shared same-register
governance, deduplication, and deterministic ordering before full payload
hydration. It must not replace the matcher with SQL scoring.

Logical geographic work units may be used to batch locality, but physical
PostgreSQL table partitioning is `NOT DECIDED`. Do not create hundreds of
tables merely to implement a logical tile scheme.

## Batch 21B owner inputs

Before Batch 21B can begin, the owner must provide:

- the newly created project ref and region, confirmed to be empty/new;
- permission to use that disposable/owner-approved project, with no
  production credentials supplied to the repository;
- confirmation of the approved regional dataset/version and whether the
  existing cache digest may be used without recapture;
- the installed Supabase CLI version and the intended local or remote
  validation lane;
- an explicit decision on whether Batch 21B may add a new candidate schema or
  must first validate the current public schema as-is;
- the owner-approved evidence and publication boundary for the regional
  bootstrap. National publication remains a separate authorization.
