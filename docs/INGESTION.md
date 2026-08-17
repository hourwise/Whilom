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

Positional agreement is clamped between **50 m and 150 m**. Uncertainty widens
the radius but can never buy an automatic match: Saltaire is a 1,628-hectare
World Heritage Site whose centroid has a ~2.3 km equivalent radius, and without
the ceiling it auto-matched a listed mill 382 m inside it. A mill within a World
Heritage Site is *contained by* it, not identical to it, and that is now a
regression test.

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

**PUBLISH is not implemented.** Turning candidates into canonical rows is the
remaining step: the runner reports exactly what it *would* publish and what it
would queue, and nothing has been written to any database. The schema it will
publish into is now itself verified in CI — migrations replay from zero, the RLS
contract is executed by pgTAP, and the generated types are held to the schema —
so the target of PUBLISH is no longer the unknown it was.

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
| Generic `structure` classification | 1 |
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

### Positional accuracy

**Coordinate-transformation accuracy is not source-feature positional
accuracy.** The BNG→WGS84 conversion in `transforms/osgb.ts` is pinned to the
Ordnance Survey worked example at **0.44 mm**. That proves the arithmetic is
correct. It says nothing about whether the coordinate fed into it describes the
real site — and for most NHLE records it does not, because the published
easting/northing is a representative point for an area.

`transforms/position.ts` estimates the honest figure instead:

| Record | Method | Accuracy | Why |
| --- | --- | --- | --- |
| Listed building point, 1:1250 | `source_coordinate` | ~5.6 m | 0.6 m digitising + 5 m datum-shift residual |
| Scheduled monument, 33.58 ha | `geometry_centroid` | ~327 m | radius of the circle with the same area |
| Saltaire WHS, 1,628 ha | `geometry_centroid` | ~2,276 m | ditto — a centroid cannot be more precise than the thing it centres |

Both figures travel with the record: `location_method` and
`location_accuracy_m` on the candidate, and the original coordinate, CRS,
conversion identifier and version on the source record. A later, better
transform (OSTN15) will be distinguishable from this one because the conversion
identifier carries a version.

The matcher uses accuracy **only to become more cautious** — see the ceiling in
the deduplication section.

### Deficiencies this POC found

Recorded rather than patched over. These are Phase 0B's real output.

1. ~~**`PlaceType` has no generic building/structure member.**~~ **Fixed** in
   migration `0019`. NHLE's ~380,000 listed buildings are mostly ordinary
   structures whose names ("Numbers 12 and 14, Kirkgate") imply no type; they
   used to fall back to `monument` with confidence 0, a placeholder asserting
   something commemorative that was usually false. `building` and `structure`
   now exist, `structure` being the deliberate catch-all — every designated
   record is a built work, so it is always a true statement.
2. **NHLE carries no town, county or postcode**, so places imported from it
   alone cannot be filtered by location text — and `places.town` / `county` are
   the columns discovery filters on. A reverse-geocoding or ONS-boundary
   enrichment step is needed before NHLE data is usable in Discover.
3. **Type inference is a name-matching heuristic and behaves like one.** Two
   real bugs surfaced during this run: "water management works" inside the
   Fountains scheduling description typed an abbey as an industrial site, and
   singular-only patterns failed to type "Round barrows…" and "Saltaire Mills".
   Both are fixed; the class of bug is not, and this remains the weakest link.
4. ~~**Positional precision varies by an order of magnitude and the schema has
   nowhere to record it.**~~ **Fixed** in migration `0020`. `places` now carries
   `location_method` and `location_accuracy_m`, and `source_records` retains the
   coordinate as published, its CRS, the conversion identifier and version, and
   the source's own stated precision.

   The figure is derived from what the coordinate *is*, not from how precisely
   it was converted: a point gets the digitising floor, while a polygon centroid
   gets the feature's equivalent radius — ~327 m for Fountains Abbey's
   33-hectare precinct. `transforms/osgb.ts` no longer exports an accuracy
   figure at all, so transformation precision and positional accuracy cannot be
   confused. See "Positional accuracy" below.
5. **The pipeline order in the spec puts ENRICH after MATCH**, which discards the
   strongest available matching signal. Implemented as documented above.

None of these was worked around by quietly changing the schema to fit the data.

## Cross-source comparison

Identity and agreement are separate questions. Deciding that two records
describe one place says nothing about whether the sources agree about it, so
comparison (`matching/compare.ts`) is its own stage with three per-field
outcomes:

| Outcome | Meaning |
| --- | --- |
| `AGREEMENT` | Both sources assert the same value. Corroboration. |
| `COMPLEMENTARY` | One asserts a value the other is silent about. |
| `CONFLICT` | Both assert, and the assertions cannot both be true. |

Nearly all useful cross-source data is complementary. Treating that as
disagreement would bury a reviewer, so the rules are deliberately narrow:

- **Predicate identity.** Only like predicates are compared. "Construction began
  1150" and "completed 1180" answer different questions, so a source supplying a
  completion date can never contradict one supplying an inception date.
- **Names are never a conflict.** Sources routinely name a site differently; the
  second name is an alias to record, not a dispute to arbitrate.
- **Identifiers compare as sets per scheme.** A site with several designations
  legitimately carries several list entries — Wikidata's Fountains Abbey item
  links to both 1014395 and 1149811. Overlapping sets corroborate; only sets
  sharing nothing at all disagree.
- **Positions disagree only beyond the sum of both sources' accuracy**, so a
  precise point and a coarse centroid are not forced into false conflict.

### Governed publish

`publish_import_candidate()` (migration 0023) is the only route from candidate
to canonical data. It is one database function rather than a sequence of client
writes, because a partial publish — a place created without its source record —
would be a canonical value nobody can trace.

It refuses to publish a candidate that is unreviewed, rejected, or carrying an
unresolved conflict; requires editor authority read from the database rather
than from anything the client sends; and is idempotent, so a retry returns the
same entity instead of creating a second one. `resolve_import_conflict()`
records a decision from a six-value vocabulary **without erasing the original
disagreement**.

`import_review_queue` is the backend seam for the future moderation UI:
candidate, source, proposed match, confidence, conflict counts and a computed
positional comparison.

## Real-data proof: what is still missing

Phase 0B is **not** met by the above. Outstanding:

- **Persistence is unexecuted.** No candidate has been written to a database,
  and the RLS behaviour around imported rows is untested.
- ~~**Only one source.**~~ **Resolved.** Wikidata is now a full
  `SourceAdapter` (see `sources/wikidata/README.md`), and the two sources
  produce real disagreement: 23 complementary and 9 conflicting comparisons
  over the bounded sample, including a genuine type conflict, a ~1 km
  positional disagreement on a battlefield, and two Wikidata items claiming one
  NHLE identifier.
- **No imagery.** Commons categories are recorded as pointers; no image has been
  ingested, and imagery stays closed until licence/creator/attribution storage is
  proven end to end.
- **No place↔person relationships** have been imported.
- **Routes are untouched** by ingestion.
- **0 field conflicts** in this run is a statement about a single-source sample,
  not evidence that conflict detection works at scale.
