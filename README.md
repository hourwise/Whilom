# Whilom

**History, where it happened.**

A UK heritage discovery, research and travel platform: an in-depth **web
knowledge platform** and a location-aware **mobile companion**, sharing one
Supabase backend and one heritage graph. The same account and the same history
follow a user from desktop research to standing at the actual site.

> Places connected to people, stories, objects and journeys. The website
> provides the depth; the mobile app provides the real-world experience.

The repository holds the shared foundation, the full database schema, and a
working web MVP. Feature phases build on top â€” see the [documentation](#documentation).

## Layout

```
whilom/
  apps/
    web/        Next.js 15 â€” deep discovery, research, journey planning (Part A)
    mobile/     Expo / React Native â€” location-aware companion (Part B)
  packages/
    domain/     Entity kinds, relationship predicates, controlled vocabularies (zero deps)
    database/   Generated Supabase types + typed client factories (owns the DB contract)
    validation/ Zod schemas for API/forms/community/ingestion boundaries
    search/     Shared search query construction â†’ search_places RPC
    config/     Shared tsconfig
  supabase/     migrations Â· functions Â· tests Â· seed
  ingestion/    Modular source adapters + governed pipeline (server-only)
  docs/         Architecture, schema, roadmap & design notes
```

Internally the two clients are referred to as **Whilom Web** and **Whilom
Mobile**; publicly both are simply **Whilom**.

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Boundaries, package graph, data flow, trust model |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Database schema reference (23 migrations, RLS, governed publish, type contract) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased build plan (Phase 0â€“9) and current status |
| [docs/INGESTION.md](docs/INGESTION.md) | The governed data-ingestion pipeline design |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Dev setup, workspace commands, conventions |

## Prerequisites

- Node 20.11+ (`.nvmrc`) and **pnpm 9** (`corepack enable`)
- [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker â€” **optional**,
  see below

### Where the database is verified

**Whilom's database migrations and DB tests are validated on ephemeral,
GitHub-hosted Supabase/Postgres infrastructure. Local Docker is optional for
developers, not required for CI correctness.**

Every pull request builds the schema from nothing, replays all migrations, runs
the pgTAP/RLS suite, regenerates the TypeScript types and fails if the committed
types no longer match the schema. No hosted Supabase project exists or is used,
and the database job requires no secrets. You can contribute to the schema
without ever installing Docker: push, and read the `database` job.

Steps 1 and 2 below are therefore optional conveniences for working offline.

## Getting started

```bash
pnpm install

# 1) OPTIONAL â€” local Supabase stack (Postgres + PostGIS + Auth + Studio)
supabase start
supabase db reset          # applies migrations + loads supabase/seed/seed.sql
supabase test db           # pgTAP suite

# 2) OPTIONAL â€” regenerate database types (CI does this and checks for drift)
pnpm db:types

# 3) Configure env (values printed by `supabase start`)
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local
# set EXPO_PUBLIC_* for mobile similarly

# 4) Run an app
pnpm web                   # Next.js on http://localhost:3000
pnpm mobile                # Expo dev server
```

## Workspace scripts

| Command | Effect |
| --- | --- |
| `pnpm dev` | Run all `dev` tasks via Turborepo |
| `pnpm build` | Build every package/app |
| `pnpm typecheck` | Type-check the whole workspace |
| `pnpm lint` | Lint the whole workspace |
| `pnpm test` | Run Vitest across packages |
| `pnpm db:types` | Regenerate `packages/database` types from local Supabase |

## Non-negotiable boundaries

- No app owns the schema â€” contracts live in `packages/database`.
- The service-role key and source credentials are **server/ingestion only**;
  clients use the anon key and rely on Row Level Security.
- Ingestion lives in `ingestion/`, never inside a frontend.

## Status

- **Foundation + schema** â€” full database schema in place (see
  [docs/SCHEMA.md](docs/SCHEMA.md)): 16 migrations, 46 tables, all with RLS.
- **Phase 3 â€” Website MVP** (`apps/web`) â€” built and building green: discovery
  with search + filters, place / person / trail pages, email+password auth,
  account dashboard, and wishlist / visit / review / correction actions. Plain
  neutral styling (`globals.css`) pending a design direction. Discovery is
  list-based for now â€” an interactive map is the next add.
- `apps/mobile` is still the placeholder scaffold (Phase 6).

Next candidates: an interactive map on discovery, **Phase 2 â€” Data MVP** (source
connectors + duplicate matcher to populate real places), or a basic admin /
moderation UI. See [docs/ROADMAP.md](docs/ROADMAP.md).

### Running the web app

```bash
supabase start && supabase db reset          # DB + seed (needs Docker)
cp apps/web/.env.local.example apps/web/.env.local   # fill from `supabase start`
pnpm db:types                                # optional: typed queries
pnpm web                                     # http://localhost:3000
```

## Branding note

The name is a working brand. Before any paid branding, app-store listings,
domains or marketing, run a formal UKIPO / Companies House / app-store / domain
clearance pass â€” sensible housekeeping, not a blocker for development.

## License

Not yet chosen. The code is currently unlicensed (all rights reserved) until a
`LICENSE` file is added â€” decide before making the repository public.
