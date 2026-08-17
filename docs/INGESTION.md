# Data ingestion

The heritage graph is populated by a governed pipeline, not ad-hoc imports. Every
imported assertion keeps its provenance, and an imported claim is never
indistinguishable from an editorial fact or a user claim (spec §34, §35, §39).

Code lives in `ingestion/` and is **server-only** — it runs with the Supabase
service role (which bypasses RLS) and must never be bundled into a client.

## Pipeline stages

```
SOURCE → RAW → NORMALISE → VALIDATE → MATCH/DEDUPE → ENRICH
       → CONFLICT DETECTION → REVIEW (when required) → PUBLISH
```

| Stage | Responsibility | Where |
| --- | --- | --- |
| Source | Fetch records from a national body / dataset | `ingestion/sources/*` (one adapter each) |
| Raw | Persist untouched payloads for audit | `import_raw` |
| Normalise | Map source vocab → domain enums, reproject coords, clean names | `ingestion/transforms` |
| Validate | Zod-check the normalised shape | `@whilom/validation` |
| Match / dedupe | Resolve to a canonical entity or flag ambiguity | `ingestion/matching` → `import_candidates` |
| Enrich | Attach photos/licences, periods, people, links | `ingestion/enrichment` |
| Conflict detection | Field-level diffs vs existing data | `import_conflicts` |
| Review | Human decision on ambiguous matches / conflicts | admin queue |
| Publish | Upsert canonical rows + `source_records` | `places`, `sources`, `source_records`, … |

One refinement to that order came out of the Yorkshire POC and is now
implemented: **identifier resolution runs before matching**, while content
enrichment stays after it. A shared Wikidata QID is the strongest matching
signal available — NHLE 1014395 (scheduled monument) and 1149811 (listed
building) are provably one abbey because both carry P1216 links to Q540237 — and
it is worthless if it only arrives after the match has been decided. Enrichment
that adds *content* (imagery, periods, people) remains post-match.

## Source adapters

Each dataset implements the `SourceAdapter` contract
(`ingestion/sources/source-adapter.ts`): an `id` matching a row in the
`import_sources` registry, and an async-iterable `fetch()` yielding
`RawPlaceRecord`s that already carry full provenance (`sourceId`,
`sourceRecordId`, `originalUrl`, `licence`, `attribution`, `retrievedAt`,
`importerVersion`). Copy `example-adapter.ts` to start a real connector.

The first real connector is **Historic England / NHLE** — official, OGL v3.0,
no credentials — in `ingestion/sources/historic-england/`. Its dataset, access
mechanism, licence and limitations are documented in the README there. Wikidata,
OpenStreetMap, Wikimedia Commons (imagery) and museum APIs follow.

Adapters FETCH and SHAPE only. They do not reproject coordinates, map vocabulary
or decide types; the untouched source attributes travel through in
`extra.attributes` (what would be persisted to `import_raw`) and NORMALISE does
the rest. That split is what makes a mapping decision auditable after the fact.

## Deduplication (spec §36)

The same castle may appear in several sources. These become **one canonical
place with multiple `source_records`**, not duplicate locations.

The governing rule is asymmetric. Wrongly splitting one castle into two records
is a tidy-up job for an editor; wrongly merging two castles destroys information
and is very hard to notice afterwards. The matcher (`ingestion/matching/`) is
therefore built to produce **false negatives**, and prefers a review queue to a
guess.

### Outcomes

| Outcome | Meaning |
| --- | --- |
| `NEW_CANONICAL` | No plausible existing place; create a new record. |
| `MATCH_CONFIDENT` | Same place, safe to attach automatically. |
| `MATCH_REVIEW` | Plausibly the same place; a human decides. |
| `CONFLICT_REVIEW` | Matched, but the sources disagree on something material. |
| `REJECT_INVALID` | Structurally unusable; never reaches a queue as a place. |

### Signals and thresholds

Scores are a calibrated ordering for triage, not probabilities. Thresholds live
in `THRESHOLDS` in `matching/matcher.ts`.

- **Shared external identifier** (Wikidata QID, NHLE list entry, designation
  reference) — decisive on its own.
- **Distance**, banded against the record's own positional uncertainty (derived
  from NHLE `CaptureScale` plus reprojection residual): within uncertainty
  `+0.45`, ≤250 m `+0.30`, ≤1 km `+0.10`, beyond `-0.10`.
- **Name similarity** over primary and alternative names: `+0.40` when
  distinctive names match, but only `+0.10` when the matching name is *not
  distinctive*; `-0.20` when names disagree.
- **Type compatibility**: `+0.10` compatible, `-0.35` incompatible, and **0 when
  the candidate's type was only guessed** — a guessed type must never be
  evidence that two records are different places.
- **Postcode** `±0.20`, **town** `+0.05` (NHLE supplies neither).

Hard rules that override the score:

- **> 5 km apart cannot be the same place**, whatever else agrees. This is what
  keeps the two real places both named "Middleham Castle", 48 km apart, separate.
- **A non-distinctive name cannot produce an automatic match.** NHLE contains
  hundreds of records named exactly "CHURCH OF ST MARY"; name agreement between
  two of them is worth nothing.
- **A near-tie goes to review.** If a second candidate scores within 0.1 of the
  best, we cannot say *which* place this is — the "several structures in one
  estate" case.
- **A conflict always beats a match**, including when an identifier is shared.

Ambiguous matches never auto-merge — they go to `import_candidates` /
`import_conflicts` with `status = needs_review` for a human.

## Provenance (spec §34)

Every imported record retains: source, source record id, original URL, licence,
attribution, retrieval date, source update date (if known), importer version,
import run, match confidence and review status. `trust_level` on entities and
sources then drives how confidently the UI presents each fact.

## Running (Phase 2)

`pipeline/run.ts` runs the stages above and returns a `RunReport`. In a database
run it will also create an `import_runs` row and persist raw payloads,
candidates and conflicts so a run is fully auditable and repeatable. Keep
credentials in the root `.env` (server-side), never in an app.

**PUBLISH is not implemented.** Turning candidates into canonical rows needs a
database, and this batch ran under a local-storage gate (no Docker, so no local
Supabase). The runner reports exactly what it *would* publish and what it would
queue; nothing has been written to any database.

## Yorkshire real-data POC

30 real, unmodified NHLE records, deliberately chosen to break the model rather
than to flatter it — see `ingestion/sources/historic-england/README.md`. The run
is executed on every `pnpm test` (`ingestion/tests/yorkshire-poc.test.ts`), which
prints the figures below, so this section cannot drift from the truth.

| | |
| --- | --- |
| Source rows | 30 |
| Valid | 30 |
| Rejected | 0 |
| Enriched (Wikidata) | 30 |
| Untyped candidates | 1 |
| Duplicates detected within the run | 3 |
| Field conflicts | 0 |
| `NEW_CANONICAL` | 27 |
| `MATCH_CONFIDENT` | 1 |
| `MATCH_REVIEW` | 2 |
| Runtime | ~5 ms |

What the three duplicate detections were:

- **Fountains Abbey** — NHLE 1014395 (scheduled monument) matched confidently to
  1149811 (listed building) on the shared Wikidata QID Q540237. Correct, and
  reached by identity rather than by guesswork.
- **St Mary's Abbey precinct walls** (1004920) vs **St Mary's Abbey** (1004919),
  256 m apart — sent to review. Correct: these are related but separately
  designated, and only a human should decide whether they are one place.
- **Saltaire** (WHS 1000099) vs **Saltaire Mills** (1133523), 382 m apart — sent
  to review. Correct: a World Heritage Site containing a listed mill is not the
  same entity as the mill.

Cases the sample proved are handled: two different places sharing the name
"Middleham Castle" 48 km apart stayed separate; a weir inside the Fountains
estate was not absorbed into the abbey; a churchyard cross was not merged into
the church it is named after; two identically named Grade I "Church of St Mary"
records 14 km apart stayed separate; a registered park published at
byte-identical coordinates to an abbey was not merged with it.

### Deficiencies this POC found

Recorded rather than patched over. These are Phase 0B's real output.

1. **`PlaceType` has no generic building/structure member.** NHLE's ~380,000
   listed buildings are mostly ordinary structures whose names ("Numbers 12 and
   14 and Attached Railings") imply no type. They currently fall back to
   `monument` with confidence 0, which is a placeholder, not a fact. Adding a
   `building` / `structure` member is a small, justified schema correction, but
   it changes a shared enum and both apps, so it is deliberately **not** made in
   this batch.
2. **NHLE carries no town, county or postcode**, so places imported from it
   alone cannot be filtered by location text — and `places.town` / `county` are
   the columns discovery filters on. A reverse-geocoding or ONS-boundary
   enrichment step is needed before NHLE data is usable in Discover.
3. **Type inference is a name-matching heuristic and behaves like one.** Two
   real bugs surfaced during this run: "water management works" inside the
   Fountains scheduling description typed an abbey as an industrial site, and
   singular-only patterns failed to type "Round barrows…" and "Saltaire Mills".
   Both are fixed; the class of bug is not, and this remains the weakest link.
4. **Positional precision varies by an order of magnitude** (1:1250 to 1:10000
   capture scale) and the schema has nowhere to record it. `places` has no
   positional-uncertainty column, so the matcher's most useful input is lost at
   publication time.
5. **The pipeline order in the spec puts ENRICH after MATCH**, which discards the
   strongest available matching signal. Implemented as documented above.

None of these was worked around by quietly changing the schema to fit the data.

## Real-data proof: what is still missing

Phase 0B is **not** met by the above. Outstanding:

- **Persistence is unexecuted.** No candidate has been written to a database,
  and the RLS behaviour around imported rows is untested.
- **Only one source.** Every genuine cross-source conflict case — two sources
  disagreeing about a name, a date, a position — is still unproven, because
  Wikidata is currently used for identifiers only and agreed with NHLE
  everywhere it was consulted.
- **No imagery.** Commons categories are recorded as pointers; no image has been
  ingested, and imagery stays closed until licence/creator/attribution storage is
  proven end to end.
- **No place↔person relationships** have been imported.
- **Routes are untouched** by ingestion.
- **0 field conflicts** in this run is a statement about a single-source sample,
  not evidence that conflict detection works at scale.
