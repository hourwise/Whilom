# Contributing

## Setup

```bash
corepack enable            # provides pnpm 9
pnpm install
```

**You do not need Docker to work on the database.** Whilom's migrations and DB
tests are validated on ephemeral GitHub-hosted Supabase/Postgres in the
`database` CI job: it builds the schema from nothing, replays every migration,
runs pgTAP, regenerates the types and fails on drift. Local Docker is a
convenience, not a requirement, and there is no hosted Supabase environment.

If you do want a local stack, install the
[Supabase CLI](https://supabase.com/docs/guides/cli) and Docker, then:

```bash
supabase start
supabase db reset          # applies migrations + seed
supabase test db           # pgTAP suite
pnpm db:types              # regenerate packages/database types
```

Without Docker, change a migration, push, and let CI tell you. To refresh the
committed types, download the `generated-database-types` artifact from the
`database` job and drop it into
`packages/database/src/generated/database.types.ts`.

## Everyday commands

| Command | Effect |
| --- | --- |
| `pnpm typecheck` | Type-check the whole workspace |
| `pnpm test` | Run Vitest across packages |
| `pnpm build` | Build every package/app |
| `pnpm web` / `pnpm mobile` | Run a single app |

Run `pnpm typecheck` and `pnpm test` before opening a PR.

## Conventions

- **Commits:** Conventional Commits — `feat:`, `fix:`, `chore:`, `docs:`,
  optionally scoped (`feat(web): …`).
- **Branches:** short-lived off `main`, e.g. `feat/discover-map`.
- **TypeScript:** strict; prefer `import type` for type-only imports
  (`verbatimModuleSyntax` is on).

## Working with the schema

- Migrations are append-only and applied in filename order
  (`supabase/migrations/NNNN_name.sql`). Add a new numbered file; never edit an
  applied one once it has shipped.
- **Keep enums in sync.** SQL enum types mirror the string unions in
  `packages/domain/src/enums.ts` one-for-one, and
  `packages/domain/src/enum-parity.test.ts` fails if they drift. Add a value
  with `ALTER TYPE … ADD VALUE` **in a migration of its own** — Postgres refuses
  to use a new enum value in the transaction that adds it.
- **Regenerate the types with any schema change.** CI compares the committed
  `packages/database/src/generated/database.types.ts` against what the
  migrations actually produce, and fails if they differ.
- **New tables need grants.** RLS filters rows *after* the privilege check, so a
  table with policies and no `GRANT` is unreadable. `0021` sets default
  privileges that cover new tables; anything needing writes by `authenticated`
  must be granted explicitly.
- **RLS is mandatory.** Every table enables Row Level Security. Canonical content
  is editor-write / public-read-when-approved; user data is owner-scoped;
  moderation and import tables are privileged. See
  [docs/SCHEMA.md](docs/SCHEMA.md).
- After schema changes, run `pnpm db:types` and commit the regenerated types.

## Boundaries (do not cross)

- No app owns the schema — database contracts live in `packages/database`.
- The service-role key and source credentials are server/ingestion only. Clients
  use the anon key and rely on RLS.
- Data ingestion lives in `ingestion/`, never inside a frontend.

## Secrets

Never commit real secrets. Copy `.env.example` → `.env` (and the per-app
`.env.local.example` files) and fill locally. `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`
are the only values that may reach a client.
