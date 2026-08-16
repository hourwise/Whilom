# Heritage Platform

A UK heritage discovery, research and travel platform: an in-depth **web
knowledge platform** and a location-aware **mobile companion**, sharing one
Supabase backend and one heritage graph.

> Places connected to people, stories, objects and journeys. The website
> provides the depth; the mobile app provides the real-world experience.

This repository is the **Phase 1 — Shared Foundation** scaffold. It wires the
monorepo, the shared TypeScript packages (with the real domain model), both app
skeletons and the initial database + ingestion contracts. Feature phases build
on top; see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Layout

```
apps/
  web/        Next.js 15 — deep discovery, research, journey planning (Part A)
  mobile/     Expo / React Native — location-aware companion (Part B)
packages/
  domain/     Entity kinds, relationship predicates, controlled vocabularies (zero deps)
  database/   Generated Supabase types + typed client factories (owns the DB contract)
  validation/ Zod schemas for API/forms/community/ingestion boundaries
  search/     Shared search query construction → search_places RPC
  config/     Shared tsconfig
supabase/     migrations · functions · tests · seed
ingestion/    Modular source adapters + governed pipeline (server-only)
docs/         Architecture & design notes
```

## Prerequisites

- Node 20.11+ (`.nvmrc`) and **pnpm 9** (`corepack enable`)
- [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker (for local DB)

## Getting started

```bash
pnpm install

# 1) Start the local Supabase stack (Postgres + PostGIS + Auth + Studio)
supabase start
supabase db reset          # applies migrations + loads supabase/seed/seed.sql

# 2) Generate database types into packages/database
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

- No app owns the schema — contracts live in `packages/database`.
- The service-role key and source credentials are **server/ingestion only**;
  clients use the anon key and rely on Row Level Security.
- Ingestion lives in `ingestion/`, never inside a frontend.

## Status

Phase 1 scaffold. The apps render placeholder screens that import the shared
domain to prove end-to-end wiring. Next up: **Phase 2 — Data MVP** (first source
connectors, duplicate matcher, review tool) and **Phase 3 — Website MVP**.
