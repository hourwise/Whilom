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

### Phase 0B — Real-data proof ✅ (bounded Yorkshire POC)

The scale gate was roughly **25–50 deliberately varied real heritage records**
drawn from genuine sources, passed end to end through the real pipeline, before
any national-scale ingestion begins. Met, and exceeded, with two sources.

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

**Complete for the bounded Yorkshire POC.** Two genuinely independent sources —
Historic England / NHLE and Wikidata — run through one pipeline with no
per-source branching, and the full lifecycle is demonstrated:

two independent real sources → identity → disagreement → review → governed
publication → traceable canonical data

- 68 real source rows, 30 of them overlapping by NHLE identifier.
- Live cross-source disagreements found without inventing any: Wikidata types
  Bishop Middleham Castle an episcopal palace where NHLE says castle; the two
  sources place the Battle of Stamford Bridge about a kilometre apart; two
  Wikidata items both claim NHLE 1004051.
- Conflicts survive for human review rather than being resolved by the machine,
  and publication of a candidate carrying an unresolved conflict is refused.
- Every published value traces back to its source record and original external
  record.

Publication is now general rather than hard-coded: candidates carry a `facts`
array checked against a registry, and imported place↔person relationships are
materialised into the canonical graph with full provenance. An internal review
workbench (`/admin/imports`, editor-only) lets a human work the queue.

Rights-safe open media is now proven too: Wikimedia Commons runs as a media
source with per-file licence evaluation, and no image can be published unless
Whilom can generate valid attribution for that exact file. Reviewer decisions
also now move the displayed claim deterministically.

**This does not mean national scale is proven.** It means the model holds for a
deliberately adversarial sample. Still unproven: throughput at volume, reviewer
ergonomics at volume, OpenStreetMap, and museum collections. See "Real-data proof" in INGESTION.md for the standing gaps.

## Phase 1 — Shared foundation ✅

Monorepo (pnpm + Turborepo), shared TypeScript packages with the real domain
model, both app skeletons, Supabase project config, CI, and the test framework.

Now includes **database CI**: every pull request builds the schema from nothing
on ephemeral GitHub-hosted Postgres, replays all 21 migrations, runs the pgTAP
suite (61 assertions, including the RLS visibility contract), regenerates the
Supabase types and fails on drift. Local Docker is optional for developers, not
required for CI correctness. There is no hosted Supabase environment.

## Phase 2 — Data MVP 🟡

First ingest connectors (Historic England / NHLE, Wikidata, Wikimedia Commons,
OSM…), each a modular adapter under `ingestion/sources`. Populate places,
categories, coordinates, designations, source records, basic dates/periods,
initial imagery and relationships. Build the duplicate matcher, conflict queue
and manual review tool. See [INGESTION.md](INGESTION.md).

### Phase 2A — Scale gate ✅ (staged experiment to 5,000 records)

Before any regional import, the pipeline was run against **1,000 → 2,500 →
5,000 real NHLE records** with health gates declared and committed *before the
first tier ran*. The experiment found — and the batch fixed — a class of false
merge that was structurally invisible at POC scale: at 5,000 records, 17 of 20
audited automatic matches were wrong, because the statutory list names curtilage
structures after the buildings they stand beside and only becomes dense enough
to produce the collision at a few thousand records in one region.

Full results and the readiness verdict are in [SCALE.md](SCALE.md). The standing
consequence for this phase is that **a regional import is supportable and a
national one is not yet**: matching compares each candidate against the whole
accumulated corpus, which is quadratic and will not survive another order of
magnitude without spatial blocking.

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
