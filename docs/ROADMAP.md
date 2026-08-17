# Roadmap

The build is sequenced so the data model is proven on one interface (web) before
a second (mobile) is developed. Status markers: ✅ done · 🟡 partial · ⬜ not started.

## Phase 0 — Proof of concept ✅ (data model)

One controlled test area (Yorkshire), ~5 deliberately different entities in the
seed exercising places, taxonomy, a person, a source, a relationship and a
route. Gate: don't scale nationally until the model holds. The model is in place;
real ingestion (Phase 2) will stress it further.

## Phase 1 — Shared foundation ✅

Monorepo (pnpm + Turborepo), shared TypeScript packages with the real domain
model, both app skeletons, Supabase project config, CI, and the test framework.

## Phase 2 — Data MVP ⬜

First ingest connectors (Historic England / NHLE, Wikidata, OSM…), each a modular
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
