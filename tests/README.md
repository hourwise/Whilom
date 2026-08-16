# tests/

Cross-cutting / end-to-end tests that span multiple workspaces (e.g. a web
E2E suite driving a seeded Supabase instance, or an ingestion → publish →
read-back integration test).

Unit tests live beside their code as `*.test.ts` within each package. Database
tests live in `supabase/tests/` and run via `supabase test db`.
