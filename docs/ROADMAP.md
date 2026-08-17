# Roadmap

The build is sequenced so the data model is proven on one interface (web) before
a second (mobile) is developed. Status markers: ✅ done · 🟡 partial · ⬜ not started.

## Phase 0 — Proof of concept

Phase 0 was originally written as one gate and marked done off the schema work
alone. That conflated two different proofs, so it is split here. Only the first
is complete, and the second is the one that actually licenses national scale.

### Phase 0A — Schema / data-model proof ✅

One controlled test area (Yorkshire), ~5 deliberately different entities in the
seed exercising places, taxonomy, a person, a source, a relationship and a
route. This demonstrated that the relational model can represent: places,
taxonomy, people, sources, relationships, routes and seed data.

What it demonstrates is that the model is *expressible* — hand-authored records
that were designed to fit do fit.

### Phase 0B — Real-data proof ⬜

**Not complete.** The scale gate is roughly **25–50 deliberately varied real
heritage records** drawn from genuine sources, passed end to end through the
real pipeline, before any national-scale ingestion begins.

The point of this phase is to break the model early, not to accumulate records.
It must stress:

- multiple source representations of the same site;
- deduplication;
- provenance retained end to end;
- conflicting field values between sources;
- imagery rights and attribution;
- place ↔ person relationships;
- routes;
- obscure sites as well as famous ones.

Fixtures compiling, tests passing, or a matcher running cleanly do **not**
satisfy this gate. Phase 0B is met only when real records from a real source
have been through normalise → validate → match → conflict → review, the
deficiencies found have been recorded, and the schema has been corrected where
the data genuinely demanded it.

Current status: the Historic England / NHLE adapter, normaliser and matcher
exist and run over an official-schema Yorkshire sample (see
[INGESTION.md](INGESTION.md)). The **real-data path is proven** end to end short
of publication, and the schema it publishes into is now itself proven — RLS,
constraints and generated types all execute in CI.

Still outstanding for 0B: **real cross-source conflict behaviour**, which cannot
be demonstrated with one source. Wikidata is currently used for identifiers
only and agreed with NHLE everywhere it was consulted, so no genuine
disagreement has ever been exercised. Imagery rights and place↔person
relationships also remain unproven end to end. See "Real-data proof" in INGESTION.md for the standing gaps.

## Phase 1 — Shared foundation ✅

Monorepo (pnpm + Turborepo), shared TypeScript packages with the real domain
model, both app skeletons, Supabase project config, CI, and the test framework.

Now includes **database CI**: every pull request builds the schema from nothing
on ephemeral GitHub-hosted Postgres, replays all 21 migrations, runs the pgTAP
suite (61 assertions, including the RLS visibility contract), regenerates the
Supabase types and fails on drift. Local Docker is optional for developers, not
required for CI correctness. There is no hosted Supabase environment.

## Phase 2 — Data MVP 🟡

Blocked on Phase 0B for anything national; the bounded POC is under way. First
ingest connectors (Historic England / NHLE, Wikidata, OSM…), each a modular
adapter under `ingestion/sources`. Populate places, categories, coordinates,
designations, source records, basic dates/periods, initial imagery and
relationships. Build the duplicate matcher, conflict queue and manual review
tool. See [INGESTION.md](INGESTION.md).

## Phase 3 — Website MVP 🟡

Home, discover, search, filters, place page, sign-up/login, wishlist, visits,
photos, reviews, corrections, related places, basic people profiles, basic
admin/moderation.

Done: discovery + filters (list-based), place / person / trail pages, auth,
account, wishlist / visit / review / correction. **Remaining:** interactive map,
photo uploads, admin/moderation UI.

## Phase 4 — Knowledge platform ⬜

Multi-page locations, timelines, people, events, entity relationships, objects,
museum connections, thematic collections, editorial system, richer SEO pages.
(The schema already supports all of this; this phase is UI + editorial tooling.)

## Phase 5 — Trails and trips ⬜

Walking-route database, route editor, trail pages, route stops, itinerary
builder, day planner, saved trips, thematic trails. (Schema present: `routes`,
`route_stops`, `route_geometry`, `trips`, `trip_days`, `trip_stops`.)

## Phase 6 — Mobile MVP ⬜

On the proven backend: auth, nearby map, location search, filters, place page,
navigation handoff, wishlist, visits, reviews, photo uploads, saved trips, route
display, profile.

## Phase 7 — Field features ⬜

GPS route following, offline trips/trails, current-position progress, personal
travel map, badges, richer corrections, notifications.

## Phase 8 — Advanced discovery ⬜

"I'm going here", "fill two hours", "surprise me", "free day out", "rainy day",
along-my-route, natural-language trip requests, personalised suggestions — all
grounded in database records, never invented.

## Phase 9 — Historical map / knowledge features ⬜

Historic maps, overlays, lost places, period maps, family/ownership graphs,
relationship visualisation, then-and-now photography, audio guides, education
material.

## MVP definition (spec §52)

Web MVP: open the site → browse/search → filter → open a useful place page →
understand why it matters → see related nearby → create an account → save a place
→ record a visit → submit a review/photo → see a related person → follow a
curated trail. All of this is reachable today except photo upload.
