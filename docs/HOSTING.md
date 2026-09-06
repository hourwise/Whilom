# Whilom hosting readiness

Status: W3 workers.dev preview certified. The isolated preview Worker was
deployed and smoke-tested without creating a custom route, secret, binding,
custom domain, DNS record, or changing `whilom.co.uk`.

## Hosting maturity levels

The compatibility gates are deliberately separate from deployment:

1. **Next production build verified** — passed on Next.js 15.5.24.
2. **OpenNext transform verified** — passed locally and in Linux CI against the
   pinned stack.
3. **Local Linux Workers runtime verified** — passed in compatibility run
   [33180393492](https://github.com/hourwise/Whilom/actions/runs/33180393492),
   which booted `.open-next/worker.js` with Wrangler/workerd and smoke-tested
   HTTP routes.
4. **Real `workers.dev` deployment** — verified for the isolated
   `whilom-web-preview` Worker; HTTPS health, root, and a dynamic route were
   exercised.
5. **Live Supabase integration** — not verified by this compatibility slice.
6. **Custom domain/DNS** — not configured; `whilom.co.uk` is untouched.

## W3 workers.dev preview certification

The W2-certified stack remains suitable for a bounded preview deployment:

- Next.js 15.5.24;
- React and React DOM 18.3.1;
- `@opennextjs/cloudflare` 1.20.4;
- Wrangler 4.127.0;
- pnpm 9.12.0;
- Node 22 for the Wrangler compatibility path.

The preview was deployed under the explicitly non-production identity
`whilom-web-preview` in the authenticated account `Philgeran@gmail.com's
Account` (`b7765d4c91a51c079125912afcd840cf`). The Worker does not use a custom
domain or production route.

Deployment evidence:

- source Git SHA: `b5f7ae919d0a8d6efd35d59515f35e5bf3cbe61b`;
- OpenNext: `1.20.4`;
- Wrangler: `4.127.0`;
- preview URL: `https://whilom-web-preview.philgeran.workers.dev`;
- deployment ID: `958e8513-499d-438f-8102-da494584cf22`;
- Worker version ID: `315f191e-82a2-41fe-9b85-05741d740954`;
- deployment timestamp: `2026-09-06T17:29:51.760789Z`;
- bindings: `ASSETS`, `NEXT_PUBLIC_SUPABASE_URL`, and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`; no D1, KV, R2, Queue, Durable Object, or
  secret binding.

The final upload used the existing OpenNext deploy path with normal Wrangler
bundling. An initial direct `--no-bundle` attempt was rejected by Cloudflare
before a Worker was created because the generated Worker imports the adapter's
local `cloudflare/images.js` module; the adapter-supported bundled dry-run then
passed and the corrected deployment succeeded. No unrelated Worker was
overwritten.

The final active build was produced with the ignored repository `.env` held
outside the project during OpenNext's environment extraction step. Only the
public Supabase URL and anon/publishable credential were supplied as Wrangler
vars. An artifact scan confirmed that the service-role key, PostgreSQL URL,
Supabase access token, and `.env` file were absent from the final
`.open-next` output. No prohibited credential was placed in the repository or
configured as a Worker secret.

An earlier preview version (`eebe7a42-e262-4816-9bd4-398163b741b9`) was
superseded after this artifact audit identified that a local OpenNext build
would otherwise include values from the ignored root `.env`. It is not active;
the current certification covers the sanitized version above. The superseded
version remains visible in Cloudflare deployment history, so any credentials
that were present in that local file should be rotated under the operator's
separate secret-management procedure before production use.

HTTPS smoke evidence:

- `GET /api/health` → `200`, valid JSON, `status: "ok"`, `app: "web"`;
- `GET /` → `200`, non-empty Whilom HTML, no Worker exception;
- `GET /place/w3-preview-probe` → `404` from the expected dynamic place lookup
  for a nonexistent slug, with a rendered Whilom not-found response and no
  Worker exception. This also exercised the public Supabase read/session
  boundary without writing data.

Authenticated account/admin actions, live Yorkshire discovery, and full
Supabase integration remain separate certification gates. The deployment is a
preview-runtime certification, not production release approval.

## Decision for the current Web baseline

Whilom Web is a full-stack Next.js application, not a static export. It uses
the App Router, React Server Components, Server Actions, middleware, dynamic
place/person/trail/account/admin routes, a health route handler, Supabase SSR
cookies, and a client-only MapLibre surface. A static Pages export would remove
or misrepresent those server capabilities, so Cloudflare Pages is not the
primary target for this application.

The current recommendation is:

**`OPENNEXT_PREFERRED_FOR_CURRENT_BASELINE`**

This is a compatibility-based choice, not a claim that a production deployment
has already been certified. OpenNext adapts the output of the existing
`next build` and its Cloudflare adapter documents support for the App Router,
RSC, SSR, route handlers, Server Actions, middleware and image optimisation.
The repository remains on the supported Next 15 line documented by OpenNext.
The W2 security/compatibility patch moves Next and `eslint-config-next` from
15.5.23 to the maintenance-patched 15.5.24 release, satisfying the
`@opennextjs/cloudflare` 1.20.4 peer floor without starting a Next 16
migration. The certified deployment-tool baseline is pinned to
`@opennextjs/cloudflare` 1.20.4 and Wrangler 4.127.0.
The existing middleware is the standard
`@supabase/ssr` cookie-refresh pattern rather than Next.js Node middleware, and
the runtime audit found no application-side `fs`, `path`, `net`, `tls`,
`child_process` or native-module dependency.

Cloudflare now presents vinext as the default path for new Next.js Workers
applications. It is not selected for this baseline: the current vinext
migration guidance is for existing Next.js 16 applications, vinext remains in
beta, and the vinext project targets the latest Next.js line rather than
promising a compatibility layer for this Next 15 application. Upgrading Next
or migrating the application to vinext would be a separate compatibility and
product-risk decision.

The repository now carries a focused Linux GitHub Actions compatibility
workflow at `.github/workflows/web-workers-compat.yml`. It uses the declared
pnpm 9.12.0 toolchain and Node 22 for the pinned Wrangler runtime, performs the
normal Web checks, builds OpenNext, starts the generated Worker locally with
Wrangler/workerd, and checks `/api/health` plus the public `/` route. It has no
Cloudflare credentials and contains no deployment or domain operation.
OpenNext documents that Windows support is not guaranteed, so Linux CI is the
authoritative runtime certification environment.

## Repository preparation

The Web app now has the minimum manual OpenNext shape:

- `apps/web/open-next.config.ts` selects the adapter defaults.
- `apps/web/wrangler.jsonc` points Wrangler at `.open-next/worker.js` and
  `.open-next/assets`, enables `nodejs_compat`, and has no account, route,
  domain, binding, or secret.
- `apps/web/package.json` has build/preview/deploy/type-generation scripts.
  The preview used the equivalent adapter deploy command with an explicit
  `--name whilom-web-preview` override so the W2 default `whilom-web` identity
  was not targeted.
- `apps/web/next.config.mjs` transpiles `@whilom/discovery`, matching the
  other source-distributed workspace packages consumed by Web.
- `.github/workflows/web-workers-compat.yml` is a compatibility-only Linux
  workflow. It never authenticates or contacts a Cloudflare account.

The Workers adapter and Wrangler are build/deployment tooling. They do not
replace Supabase and do not grant the Worker database authority.

## Runtime architecture

```text
Browser
  -> Cloudflare Worker running the OpenNext output
       -> Supabase public/anon APIs and SSR-authenticated requests
```

Supabase remains the source of truth for heritage data, PostGIS discovery,
authentication, RLS, and governed user operations. Whilom does not introduce
D1, KV, R2, a second auth system, or duplicated heritage storage as part of
hosting preparation.

## Environment contract

| Variable | Where it may exist | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser bundle, Worker build/runtime | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser bundle, Worker build/runtime | Public anon/publishable Supabase credential; RLS still applies |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Browser bundle | Optional rights/attribution-aware MapLibre style URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side secret only, if a future server feature genuinely requires it | Not used by the current Web client path and never browser-safe |
| `SUPABASE_DB_URL` | Ingestion/controlled database tooling only | Not a Web runtime variable |

The current Web source uses only the three `NEXT_PUBLIC_*` values above. The
server and middleware Supabase clients use the public anon key plus the
request's auth cookies; they do not import a service-role or PostgreSQL
credential. Workers Builds will need the two public values available at build
time and any genuinely server-only values provided as platform secrets, never
committed to Git.

## Compatibility notes

- `@supabase/ssr` is used through browser, Server Component/Action, Route
  Handler, and middleware clients. Cookie reads/writes remain request-scoped;
  the normal middleware refreshes the session.
- `redirect`, `revalidatePath`, `FormData`, and authenticated Supabase writes
  are used by Server Actions and the admin workbench. They remain server-side
  application features and must be exercised in an OpenNext Workers preview.
- MapLibre is imported only by a client component and is dynamically loaded
  with `ssr: false`; Workers must not execute it during server rendering.
- The only `node:*` imports found in the Web dependency surface were test-only
  filesystem imports. The Worker runtime still uses the adapter's documented
  Node compatibility mode rather than treating arbitrary Node APIs as safe.
- The current health endpoint emits a timestamp and is a liveness route; it is
  not a database health check.

## Future release checklist

1. Keep a passing Linux CI run for the OpenNext build and Workers-runtime
   preview using the declared pnpm version for each relevant release change.
2. Exercise public discovery, Supabase auth cookie refresh, Server Actions,
   admin authorization, dynamic routes, the health route, and the MapLibre
   browser boundary through the preview.
3. Configure Workers Build variables and secrets in the Cloudflare account;
   never put them in the repository or browser bundle unless they are public
   `NEXT_PUBLIC_*` values.
4. Restore valid Wrangler authentication, inspect the target account and
   `whilom-web-preview` name, then validate its isolated `workers.dev` URL
   before any domain change.
5. Attach a custom domain only after the Worker preview is accepted, then
   perform the separate DNS/HTTPS/canonical-host review for `whilom.co.uk`.
6. Keep Supabase migrations, RLS, Auth, and the Yorkshire activation workflow
   under their existing controlled release gates.

The compatibility checks described above were executed by this task. No hosted
deployment step was executed: `whilom.co.uk` is not attached, DNS is untouched,
and the Yorkshire dataset has not been activated.

## W2 security release record

The Web security baseline moved from Next.js 15.5.23 to 15.5.24, with the
matching `eslint-config-next` release. This is a maintenance/security patch and
OpenNext peer-compatibility fix, not a feature upgrade or a Next 16 migration.

The local Linux runtime workflow uses harmless loopback Supabase placeholders
only so the SSR client can be instantiated without contacting the hosted
project. It does not certify Supabase connectivity or authenticated behaviour;
those checks require separately managed public configuration, test identities,
and the later Yorkshire/live-integration gates.

## UI ownership

Future Web visual work continues to follow `docs/UI_DESIGN_SYSTEM.md`. This
hosting document records runtime/deployment concerns only and does not replace
the shared Whilom UI source of truth.
