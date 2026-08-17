# Contributing

## Setup

```bash
corepack enable            # provides pnpm 9
pnpm install
```

For anything touching the database, also install the
[Supabase CLI](https://supabase.com/docs/guides/cli) and Docker, then:

```bash
supabase start
supabase db reset          # applies migrations + seed
pnpm db:types              # regenerate packages/database types
```

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
- **Keep enums in sync.** SQL enum types in `0002_enums.sql` mirror the string
  unions in `packages/domain/src/enums.ts` one-for-one. Change both together.
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
