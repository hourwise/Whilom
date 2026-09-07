# Whilom hosting readiness

Status: W3-R3A public Supabase boundary certified for anonymous discovery. The
hardened preview Worker and basic Worker/SSR surfaces are healthy, and the
resumed Supabase project now responds to the exact public RPC contract. No
custom route, secret, binding, custom domain, DNS record, or change to
`whilom.co.uk` was made.

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
5. **Live Supabase integration** — anonymous public discovery verified;
   authenticated/session and mutation paths remain separate gates.
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
`.open-next` output. No prohibited credential was committed, passed as a Worker
variable, or retained in the final Worker artifact. The pre-existing ignored
`.env` remains local-only.

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

## W3-R2 hardened preview certification retry

The W3-R2 hardened build and deployment were re-run from
`codex/whilom-web-workers-env-hardening` at source SHA
`9c794ca224984cae5a2dfc291246b5764c7cc7fc`. Wrangler was invoked in a
sanitized child environment with `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_API_KEY`, and `CLOUDFLARE_EMAIL` removed. The repository-local
Wrangler then authenticated through the stored OAuth session as the expected
Cloudflare account with Workers write permission. No credential values were
printed or committed.

The sanctioned build completed with the existing pinned stack and the
fail-closed Workers artifact audit passed (`1377` files scanned). The active
preview target remained exactly `whilom-web-preview`:

- preview URL: `https://whilom-web-preview.philgeran.workers.dev`;
- deployment ID: `cc683498-8886-4e35-8e3f-939ab5275d26`;
- Worker version ID: `9425551e-fc1e-466f-9ca3-eff78b8a0e89`;
- deployment timestamp: `2026-09-06T20:52:38.914448Z`;
- deployment source SHA: `9c794ca224984cae5a2dfc291246b5764c7cc7fc`.

The basic live Worker checks passed:

- `GET /api/health` → `200`, JSON `{ status: "ok", app: "web" }`;
- `GET /` → `200`, non-empty SSR HTML with no Worker exception;
- `GET /place/w3-preview-probe` → `404`, expected rendered not-found output
  for the nonexistent dynamic place, with no Worker exception.

The public Supabase boundary did not pass this retry. Anonymous `GET
/discover` returned `200` and the normal Whilom page, but rendered the
application's explicit `Could not reach the database` fallback instead of a
result count or empty-result state. The route catches the underlying public
`search_places` read failure, so the response proves graceful handling rather
than successful live Supabase discovery. Wrangler tail captured no uncaught
Worker exception for the request. Authenticated session refresh and all
Server Actions remain untested; every available Server Action is an auth or
mutation operation, so none was invoked during this certification retry.

Accordingly, this retry is recorded as
`WHILOM_WEB_HARDENED_PREVIEW_BLOCKED_RUNTIME`, not as live Supabase or
production readiness. The public configuration remains restricted to the
approved Web values, and no service-role, database, access-token, or Cloudflare
credential was supplied to the Worker. No Supabase or Auth mutation, DNS,
custom-domain, Yorkshire, Mobile, or production Worker operation was performed.

## W3-R3 public Supabase diagnosis

W3-R3 was a read-only diagnosis from branch
`codex/whilom-web-workers-env-hardening` at SHA
`22c283d6a880c0a4c29cdd8496dcf7212d7e679c`. The application call path and
repository contract were inspected before making network requests. The
`/discover` Server Component calls the typed public `search_places` RPC through
the `@supabase/ssr` server client. The migration-defined function has the same
14 optional arguments used by the application, returns the expected place
projection, is `STABLE` SQL invoker code, and reads approved `public.places`
rows under the public-read RLS policy. No Web-side contract mismatch was found.

The public configuration was checked without printing credentials:

- URL protocol: `https`;
- URL host: `dpeqeschhcdfxcyhksbn.supabase.co`, matching the expected project
  reference;
- anon key: present, non-placeholder;
- sanitized OpenNext artifact: the expected host and public-key fingerprint
  were present in the generated output.

The first direct read-only Supabase reachability check was:

```text
GET https://dpeqeschhcdfxcyhksbn.supabase.co/rest/v1/
```

It failed before TLS or HTTP with:

```text
TypeError: fetch failed
causeCode: ENOTFOUND
getaddrinfo ENOTFOUND dpeqeschhcdfxcyhksbn.supabase.co
```

The Windows resolver independently reported that the DNS name does not exist.
Cloudflare and Google DNS-over-HTTPS queries both returned DNS `Status: 3`
(`NXDOMAIN`) with no A records. Therefore the failure is at public hostname
resolution, before PostgREST, RPC dispatch, grants, RLS, response parsing, or
Next/OpenNext request construction can be tested. The direct `search_places`
RPC was intentionally not sent after the basic HTTPS gate failed.

This explains why the deployed `/discover` page renders its existing graceful
database fallback, but it does not prove whether the project reference is
currently active, whether the Supabase project endpoint has changed, or whether
the project is unavailable for another platform reason. Those facts require a
read-only check in the Supabase dashboard/account environment. No Web code fix,
dependency change, redeployment, or Supabase operation was performed in W3-R3.

The next controlled step is to verify the current project endpoint and project
availability for `dpeqeschhcdfxcyhksbn`. If the endpoint differs, update only
the sanctioned public Web configuration and repeat the isolated build/audit;
if the endpoint is correct but remains globally NXDOMAIN, resolve the Supabase
project/network availability issue before any W4 work. The current W3-R3
classification is `WHILOM_WEB_PUBLIC_SUPABASE_BLOCKED_NETWORK`.

## W3-R3A resumed public Supabase certification

The Whilom Supabase project was confirmed inactive during W3-R3 and was resumed
by the operator. The repository configuration was correct throughout:

- project ref: `dpeqeschhcdfxcyhksbn`;
- API URL: `https://dpeqeschhcdfxcyhksbn.supabase.co`;
- no public configuration or application source change was required.

After resumption, the existing endpoint passed the bounded read-only sequence:

- DNS resolved with IPv4 records;
- TLS connected successfully with an authorized TLS 1.3 session;
- `GET /rest/v1/` reached Supabase/PostgREST and returned HTTP `401` with the
  safe message `Secret API key required`. This root OpenAPI-style endpoint is
  not the application read contract and does not invalidate the public RPC
  check.

The exact repository-defined public RPC was then called with the public key and
the conservative body `{ "max_rows": 1, "row_offset": 0 }`:

- `POST /rest/v1/rpc/search_places` → HTTP `200`;
- JSON response was an empty array;
- returned row count: `0`;
- no PostgREST, signature, grant, schema-cache, or RLS error.

The existing deployed Worker was tested without rebuilding or redeploying:

- `/api/health` → HTTP `200`, `{ status: "ok", app: "web" }`;
- `/` → HTTP `200`, normal Whilom SSR;
- `/discover` → HTTP `200`, no database fallback, `0 results`, and the
  truthful `No places match those filters.` empty state;
- `/discover?text=church` → HTTP `200`, no fallback, empty state;
- `/discover?period=roman` → HTTP `200`, no fallback, empty state.

The empty result is expected because the hosted project has not received the
Yorkshire or another heritage dataset. No real place slug was available, so no
real `/place/...` route could be selected in this slice. Anonymous middleware
and SSR therefore passed the public reachability/RPC/page-rendering chain;
authenticated sessions and mutation Server Actions remain separate gates.

This resolves the W3-R3 network diagnosis as a Supabase project-availability
issue, not a Web URL, OpenNext, RPC signature, grant, or RLS defect. The
existing Worker was sufficient once the project resumed. No rebuild,
redeployment, schema change, migration, grant, RLS change, Auth operation, or
data mutation was performed. The W3-R3A classification is
`WHILOM_WEB_PUBLIC_SUPABASE_CERTIFIED`.

## W3-R4B authenticated SSR certification

One dedicated Whilom hosted test identity was provisioned through the deployed
`/signup` flow by the human operator, confirmed through the normal Supabase
email-confirmation flow, and used to establish a real preview session. No
service-role key, admin API, password reset, or direct administrative user
creation was used. The identity is retained as the designated certification
identity; its email and credentials are intentionally not recorded here.

The pre-signup side-effect review found only the intended bounded footprint:
the `auth.users` insert invokes `public.handle_new_user()`, which creates one
`public.profiles` row with the default `user` role and display name. No other
Auth user-creation trigger or external hook was configured. A read-only
post-provision query confirmed:

- one matching Auth identity, confirmed and with a recorded sign-in;
- one matching profile with role `user`;
- zero wishlists, visits, reviews, corrections, or trips.

Hosted Auth configuration has email/password signup enabled and requires email
confirmation. Its current `site_url` is still `http://localhost:3000` with an
empty redirect allow-list. The confirmation itself succeeded, but the email
link's final navigation could not reach that local host. After confirmation,
the operator signed in at the preview origin and the authenticated session was
verified there. This redirect configuration remains a hosting/Auth follow-up;
it was not changed in this certification.

Authenticated preview evidence:

- `/account` rendered the authenticated profile and the account navigation
  changed to `Account` plus `Sign out`;
- repeated requests across `/account`, `/`, `/discover`, and `/explore`
  retained the authenticated state through OpenNext/Cloudflare middleware;
- `/admin/imports` for the ordinary `user` role resolved to `/not-found`, with
  no admin content or import action exposed;
- the normal application sign-out action cleared the session;
- after sign-out, `/account` and `/admin/imports` redirected to `/login`, while
  the public routes remained available;
- expiry-based token refresh was not directly exercised; session propagation
  across repeated requests was certified.

Post-sign-out public regression remained green:

- `/api/health` → HTTP `200`, JSON `status: "ok"`, `app: "web"`;
- `/` → HTTP `200` normal SSR;
- `/discover` → HTTP `200`, no database fallback, truthful zero-result state.

Wishlist, visit, review, correction, profile-edit, admin, and import Server
Actions were intentionally not invoked. No Yorkshire or place data exists in
the hosted database, and no place-dependent mutation was attempted. No
password, token, cookie, confirmation value, or privileged credential was
printed, committed, or retained in repository evidence.

The W3-R4B result is `WHILOM_WEB_AUTHENTICATED_SSR_CERTIFIED`. The next
hosting follow-up is to correct the hosted Auth preview redirect configuration
before treating email-confirmation navigation as release-ready; this is
separate from the already-certified session/SSR boundary.

## W3-R4C hosted Auth redirect hardening

W3-R4C found that the hosted email-confirmation flow was still using the
Supabase project's stale default Site URL, `http://localhost:3000`, because the
Web signup action did not supply an `emailRedirectTo` value and the application
had no confirmation callback. The hosted project also had an empty redirect
allow-list. That combination made a real hosted confirmation attempt finish at
localhost even though the Whilom preview itself was healthy.

The Web application now has an explicit exact-origin policy in
`apps/web/src/lib/auth-redirect.ts`. Signup derives the callback from the
request's exact `Host` value and passes only one of these approved origins to
Supabase:

- `https://whilom-web-preview.philgeran.workers.dev`;
- `https://whilom.co.uk` for the future production host; or
- `http://localhost:3000` for a separately configured local-development
  project.

Unknown hosts fail closed and are never reflected into an Auth redirect URL.
The exact callback path is `/auth/confirm`; it does not accept an arbitrary
post-confirmation destination.

Because the project uses Supabase's default email provider on the current free
tier, the Management API rejected an attempt to install the custom
`TokenHash`/`RedirectTo` email template: hosted template modification requires
an upgraded plan or custom SMTP. The callback therefore supports the default
provider's supported PKCE-code and fragment session results, as well as the
token-hash form needed by a future custom template. It establishes the normal
public Supabase browser session and immediately replaces the URL with the clean
`/account` route. Auth material is not retained in the final browser URL. A
recovery token is rejected until Whilom has a dedicated password-update flow;
the current task does not pretend that recovery is implemented.

The hosted Auth configuration was changed only as follows:

- Site URL: `https://whilom-web-preview.philgeran.workers.dev` for the current
  temporary preview certification;
- exact redirect allow-list entries:
  `https://whilom-web-preview.philgeran.workers.dev/auth/confirm` and
  `https://whilom.co.uk/auth/confirm`;
- no wildcard, provider, password-policy, role, RLS, schema, or user change.

The preview callback is not the permanent production identity. W4 must first
attach and validate `https://whilom.co.uk`, then change the Supabase Site URL
to that canonical production origin while retaining only the exact callback
URLs required during the transition. No DNS or custom-domain action was taken
by W3-R4C.

The Web-only validation passed typecheck, focused callback-policy tests, lint,
the sanitized OpenNext build, and the fail-closed Workers artifact audit. The
preview-only redeployment used the hardened OAuth-sanitized path and produced
Worker version `16d0b74f-385d-479d-88d7-808a43a61404`. Read-only live checks
then passed `/api/health`, `/`, `/discover`, anonymous `/account` and
`/admin/imports` protection, authenticated `/account` with the retained
ordinary-user identity, ordinary-user `/admin/imports` denial, and sign-out.

At the end of W3-R4C, a fresh first-time confirmation-link click was still
pending. That gate was closed by W3-R4D using one additional
operator-controlled identity. No password or confirmation value belongs in
repository evidence.

## W3-R4D final email-confirmation acceptance and W3 closure

The hosted email-confirmation gate is now closed for the preview environment.
The second dedicated certification identity used the real `/signup` flow; the
confirmation email was delivered, its link was accepted, and the browser
returned to the approved Workers preview callback rather than
`http://localhost:3000`. The final stable URL was clean of Auth token material,
and the authenticated account surface was reachable. The operator entered the
password and opened the confirmation link privately; neither was provided to
Codex or retained in repository evidence.

A read-only hosted verification of the newest certification identity confirmed:

- two total Auth identities, with one newest identity;
- the newest identity is email-confirmed;
- one corresponding profile with the normal `user` role;
- zero wishlists, visits, reviews, corrections, trips, comments, tips, or
  reports for that identity.

The current transition configuration is intentionally exact and temporary:

- Site URL: `https://whilom-web-preview.philgeran.workers.dev`;
- redirect allow-list:
  `https://whilom-web-preview.philgeran.workers.dev/auth/confirm`;
  `https://whilom.co.uk/auth/confirm`;
- no wildcard redirect and no unrelated Auth configuration change.

The confirmation path is therefore:

`/signup` → hosted email → `/auth/confirm` on the approved preview origin →
clean `/account`.

The callback is application-owned and the signup action supplies the exact
approved callback origin. The prior localhost redirect defect is resolved.
The preview Site URL is not the permanent production identity. W4 must first
attach and verify `https://whilom.co.uk`, then make that origin the canonical
Supabase Site URL and retain only the exact callback URLs needed for the
preview-to-production transition. No W4 domain or DNS action was taken here.

Final preview regression evidence remained green:

- `/api/health` → HTTP `200`, JSON `status: "ok"`, `app: "web"`;
- `/` → HTTP `200` normal SSR;
- `/discover` → HTTP `200`, no database fallback, truthful zero-result state;
- anonymous `/account` and `/admin/imports` → `/login`;
- the operator's authenticated ordinary-user session rendered `/account` and
  was denied admin content at `/admin/imports`;
- sign-out completed, and subsequent `/account` access was denied again.

Expiry-based token refresh was not directly exercised. Session propagation and
the normal sign-out boundary were certified. Place-dependent mutations,
wishlist/visit/review/correction actions, admin imports, Yorkshire activation,
and all unrelated Server Actions remained untested and untouched.

With the hardened Workers build, environment leakage guard, real Cloudflare
deployment, HTTPS health/root, public Supabase RPC, public SSR, signup,
email-confirmation redirect, login, authenticated SSR, session propagation,
ordinary-user authorization, and sign-out all certified, W3 hosting/runtime
certification is complete for the preview environment.

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

## W3-S1 Workers environment boundary

OpenNext 1.20.4 has an important monorepo behaviour: its environment extractor
reads `.env`, `.env.production`, `.env.development`, `.env.test`, and the
corresponding local files from both the app directory and the detected
monorepo root. Because the Web app is below the repository root, a developer's
ignored root `.env` is therefore in scope. During the OpenNext build,
`compileEnvFiles` serialises the extracted values into
`.open-next/cloudflare/next-env.mjs`; that module is then included in the
generated Worker bundle. This is an OpenNext extraction/bundling path, not a
Supabase or Wrangler database feature.

The sanctioned Workers commands now enforce the boundary without moving,
renaming, deleting, or modifying the real developer `.env`:

```text
corepack pnpm --filter @whilom/web workers:build
corepack pnpm --filter @whilom/web workers:preview
corepack pnpm --filter @whilom/web workers:deploy
corepack pnpm --filter @whilom/web workers:audit
```

`workers:build`, `workers:preview`, and `workers:deploy` run
`scripts/build-workers-safe.mjs`. The script stages only `apps/web` in a
temporary directory, reuses the already-installed locked dependencies through
a process-local Corepack pnpm 9.12 shim, and supplies OpenNext with a
temporary `.env` containing only the approved public variables. OpenNext then
runs the required standalone Next production build and its Workers transform
inside that isolated directory. The temporary file is removed before the
generated output is audited and copied to the ignored app output directory.
The user's root `.env` is never written or moved, so an interrupted command
cannot strand it in a replacement state.

`scripts/audit-workers-artifact.mjs` is the fail-closed artifact gate. It
rejects packaged `.env`/`.dev.vars` files, parses every OpenNext
`next-env.mjs` export, rejects any environment key outside the approved public
allowlist, checks Wrangler variables and prohibited Cloudflare storage/secret
bindings, and scans the output for prohibited key names or supplied forbidden
material. It reports paths and key names only; it never prints environment
values. A future local or CI deployment must use the sanctioned package
scripts, and must not bypass them with a direct lower-level
`opennextjs-cloudflare build` when a developer-local `.env` exists.

The deterministic synthetic boundary regression is:

```text
corepack pnpm test:workers-env
```

It loads a temporary fixture environment containing synthetic service-role and
unrelated API-key values, verifies that the sanctioned process environment and
temporary `.env` contain only the fixture's public values, audits a clean
representative artifact, and verifies that an injected contaminated artifact is
rejected. It never uses the user's real credential values as test fixtures and
never deploys. The Linux compatibility workflow additionally runs the full
sanctioned OpenNext build before applying the same audit to its generated
Worker.

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
