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

- **Two entries in one source's register are two things.** A source with a
  stable primary key has, by publishing two entries under two keys, asserted
  that there are two entities, and no similarity measure may overrule it. This
  is scoped to a *shared designation*, because one site genuinely can hold two:
  Fountains Abbey is scheduled monument 1014395 and listed building 1149811, and
  recognising those as one abbey is the point of matching. Rows sharing a record
  id still merge — the NHLE service returns one row per geometry part, so
  multi-part sites like Saltaire and Studley Royal arrive twice.
- **A name that positions itself against another thing is not that thing.**
  "Sundial to South of Church of St Mary" is a separately protected sundial.
  Names are split into subject and position, and the positional tail is kept as
  a discriminator rather than stripped: "Round barrow 300m south west of Cot Nab
  Farm" and "Round barrow 350m west of Cot Nab Farm" are two barrows, and the
  tail is the only thing that says so. Street numbers are compared for the same
  reason — bigrams rate "2, Westfield Road" and "8, Westfield Road" at 0.93 by
  ignoring the one character that identifies them.
- **A landscape is not a structure inside it.** Registered parks, battlefields
  and World Heritage Sites go to review against listed buildings rather than
  merging with them.
- **Containment is not identity, at the level of names.** When one name merely
  contains the other, that is evidence of *association*: "Whitby Abbey" is
  wholly inside "Whitby Abbey Cross", "Marrick Priory" inside "Marrick Priory
  Farmhouse", "Church of All Saints" inside "Cross base for standing cross in
  churchyard of All Saints Church". Each pair is two separately protected
  things, so containment earns review and never an automatic merge. Place type
  cannot corroborate it: NHLE types are inferred *from the name*, so the cross
  is typed `abbey` and the cross base `church`, and agreeing types are the same
  evidence read twice.
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

### Candidate generation

The matcher decides identity. A separate stage decides only which records are
worth asking it about, and nothing there may ever conclude that two records are
the same place, or that they are not (`matching/candidates.ts`).

Bounding is safe because `matchCandidate` reads its input in exactly two passes
and each has a knowable sufficient set:

1. The **deterministic identity pass** walks the array in order and returns on
   the first record sharing an external identifier or designation reference. It
   applies no distance bound — a shared Wikidata QID matches across the country
   — so identifier candidates are produced regardless of locality.
2. The **scored pass** keeps only records for which `scoreAgainst` is non-null,
   and that returns null unconditionally beyond the plausible-distance veto.

Any superset of *shares an identifier* ∪ *within the radius*, delivered in
insertion order, therefore produces an identical decision. Order is part of the
contract: the scored set is sorted with a stable sort and the near-tie test
compares the top two, so a reordering could swap which of two equal records
wins.

The radius is read from `THRESHOLDS.maxPlausibleDistanceMeters` rather than
restated, so the two cannot drift. Longitude spans are computed at each
candidate's own latitude and clamped, because the cosine collapses at the poles.
Positional uncertainty deliberately does **not** widen the sweep — it affects
the agreement radius, which is clamped to 50–150 m and only influences scoring,
while the hard veto is a flat 5 km. A vague record must not buy a wider search;
that is precisely how a locality bound decays back into a full scan.

This is proved rather than asserted: `scale:equivalence` runs 1,000, 2,500 and
5,000 real records under both strategies and requires zero decision differences.
See [SCALE.md](SCALE.md).

### Comparison is only meaningful between two sources

`compareSources` answers "do the sources agree", which is a question that cannot
be asked of two records from the *same* source. Historic England does not
disagree with itself; it holds several designations over overlapping ground, so
a listed building and the scheduled monument around it differ in type and
position by design. Same-source matches are counted as `withinSourceMatches` and
kept out of the conflict figures entirely. Before this was scoped, every one of
the 1,000-record tier's 142 "cross-source conflicts" was NHLE against NHLE.

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

`import_review_queue` is the backend seam the review workbench reads:
candidate, source, proposed match, confidence, conflict counts and a computed
positional comparison.

### What publication writes

Publication is data-driven. A candidate carries a `facts` array of
predicate/value pairs derived centrally in `ingestion/pipeline/facts.ts`, and
`publish_import_candidate()` iterates it against the `fact_predicates` registry.
An unregistered predicate is refused rather than silently dropped. The initial
vocabulary is `inception_year`, `completion_year`, `demolished_year`,
`official_website`, `commons_category`, `heritage_designation`,
`designation_reference`, `first_designated`, `former_name`, `historic_use` and
`area_hectares`.

Imported relationships are materialised into `entity_relationships` with their
source, source record and import run. Roles map onto the existing domain
predicates — `architect`/`creator` → `built_by`, `owner` → `owned_by`, anything
else → `associated_with` — and the source's own word for the role is kept in the
note, so mapping to a broader predicate does not lose the nuance. People are
resolved through the source's own identifier, never by name, so two people who
share a name stay two people; a newly created person gets a source record of
their own.

**Both are unique per source, not globally.** Two sources asserting the same
fact or the same relationship remain two attributable claims. A reimport of the
same external record collides on that key and updates, so nothing duplicates.

### Publish preview

`preview_import_candidate()` reports exactly what publication would do —
target entity, facts, relationships, conflicts and any blockers — and writes
nothing. The review workbench renders this rather than computing its own view,
so a reviewer never sees an action the engine cannot perform.

## Wikimedia Commons: media, with rights as an invariant

Commons is a **media** source. It proposes pictures of entities Whilom already
knows; it never proposes new canonical places. See
`ingestion/sources/commons/README.md`.

**Mechanism.** The official MediaWiki Action API — `list=categorymembers` to
find files in a category the entity's own Wikidata item names, then
`prop=imageinfo` with `iiprop=extmetadata` for each file's own rights block. No
HTML page is scraped and no article prose is imported. The anonymous API returns
HTTP 429 on bursts (the first capture run was cut off after five categories), so
requests are serialised with ~1.2 s spacing and exponential backoff. That limit
bounds how fast media can ever be ingested and is documented rather than
engineered around.

### The three rules

**File-level rights, never source-level assumptions.** "From Wikimedia Commons"
is not a licence. Commons hosts everything from CC0 to non-reusable fair use,
and the bounded sample of 40 files really does contain six different licences.
Licence is read from each file's own metadata; the raw string is always kept
beside the normalised value as the evidence for the decision.

**No attribution, no publication.** `build_media_attribution()` composes a
credit from stored data and returns NULL when a licence requires a creator and
none is known. That NULL is the gate: `publish_media_candidate()` refuses
anything that is not `media_ready`, and it re-assesses at publication time, so
editing the stored state achieves nothing.

**Association is not identity.** A Commons category for an abbey complex holds
the abbey, the river beside it, the visitor centre, a memorial and an old
engraving. A category match is therefore never confident on its own — only a
structured `depicts` statement naming the entity is. Rights-perfect media with
an uncertain subject is held at `media_association_review`, because a correctly
licensed photograph of the wrong place is still the wrong place.

### Attribution examples

| Licence | Stored | Rendered |
| --- | --- | --- |
| CC BY 4.0 | creator `Jane Smith` | `"Abbey.jpg", by Jane Smith, CC BY 4.0, via Wikimedia Commons` |
| CC BY-SA 3.0 | creator `Jane Smith` | `"Keep.jpg", by Jane Smith, CC BY-SA 3.0, via Wikimedia Commons` |
| Public domain | no creator | `"Old.jpg", Public domain, via Wikimedia Commons` |
| CC BY-SA 4.0 | no creator | *(none — publication refused)* |

## The review workbench

`/admin/imports` and `/admin/imports/[id]`, internal editorial tooling and not
public UI. Editor, moderator and admin only, enforced at three layers: the page
calls `requireEditor()` which reads the role from the database, every mutation
goes through a `SECURITY DEFINER` function that re-checks `is_editor()` in
Postgres, and RLS governs the underlying tables. Hiding the navigation link is
not treated as a security measure.

Differences are classified rather than uniformly alarmed: agreement,
complementary, conflict, positional, ambiguous and missing are distinguished and
sorted so what needs a decision comes first. Most cross-source data is
complementary, and styling it like a conflict would waste the attention the
conflicts deserve.

`/admin/imports/media` reviews imported media: thumbnail, creator, licence,
generated attribution, proposed subject, rights state and exactly which fields
are missing. **There is no "publish anyway".** A reviewer may confirm what an
image shows — a judgement they are qualified to make — but cannot supply a
creator or a licence the source did not state, and there is no parameter through
which they could.

## The staged scale experiment

Phase 0B proved the model on 30 records. That is enough to show a lifecycle
works and far too few to show it *scales*, so the next question was answered by
measurement rather than by argument: 1,000 → 2,500 → 5,000 real NHLE records,
with health gates declared and committed **before the first tier ran**.

Everything lives under `ingestion/scale/`:

| File | Role |
| --- | --- |
| `manifest.json` | Reproducible definition of the dataset. |
| `capture.ts` | Rebuilds the payloads from the manifest. |
| `tier.ts` | Materialises one tier as an ordinary NHLE fixture. |
| `gates.ts` | The ten health gates, with the reasoning for each threshold. |
| `run-tier.ts` | Runs a tier, measures it, evaluates its gates. |
| `db-seed.ts` | Turns accepted candidates into canonical SQL rows. |
| `commons-throughput.ts` | Bounded live probe of the media lane. |

`supabase/scale/benchmark.sql` and `plans.sql` measure the read paths and
capture their query plans. `.github/workflows/scale-test.yml` runs both lanes.

### The dataset is real, and not cherry-picked

A fixed British National Grid envelope over Yorkshire and adjacent Northern
England, every intersecting record taken in list-entry order up to a per-layer
quota. The sample therefore contains unnamed, mundane and poorly located entries
as well as famous ones. Parks (183), battlefields (7), wrecks (3) and World
Heritage Sites (4) fall below quota because the region genuinely holds no more.

The payloads are **not committed**. `manifest.json` pins the service, envelope,
quotas, ordering, a checksum and all 5,000 list entry numbers — enough to
rebuild the dataset byte-for-byte and to audit exactly which records were used,
without 1.8 MB of churn in the history. `capture.ts` refuses to run a partial
tier if the register has changed underneath.

Tiers are **prefixes of a stratified interleave**, so tier 1 is a strict subset
of tier 2 and every tier carries the same designation mix. Taking the first N of
a layer-ordered capture would have made tier 1 entirely listed buildings and
hidden scheduled-monument behaviour until the largest and most expensive run.

### What it found

It failed, which is what it was for. Of 20 audited automatic matches at 5,000
records, **17 were wrong** — and none of them could have occurred at POC scale,
because the statutory list only becomes dense enough to produce them at a few
thousand records in one region. The causes and their fixes are the hard rules in
[Deduplication](#deduplication-spec-36) above; the cases are locked into
`tests/curtilage-merges.test.ts`.

The measurement that matters most is not a timing. It is that **review pressure
was mostly an artefact of a defect**: 760 records queued at 5,000 became 15 once
the matcher stopped proposing merges that were never real questions.

See [SCALE.md](SCALE.md) for the full results and the readiness verdict.

## The regional product dataset

The scale experiments built a **benchmark corpus**. This is a **product dataset**,
and the distinction is not cosmetic.

| | Benchmark (`ingestion/scale/`) | Product (`ingestion/regional/`) |
| --- | --- | --- |
| Selection | first N by list entry, per-layer quotas | every record inside the boundary |
| Purpose | measure behaviour as a corpus grows | be the dataset a user searches |
| Nested tiers | yes, 1k to 25k | no, one region |
| Coverage inside scope | partial by design | complete |
| Ends at | metrics | canonical places, facts, provenance, review queue |

"The first 3,603 listed buildings by list entry number" is exactly right for
measuring how matching scales and exactly wrong for a map: a quota hole is
indistinguishable, to a user, from heritage that does not exist.

### WHILOM_REGION_YORKSHIRE_V1

A 145 km x 90 km British National Grid band, `(400000, 420000)` to
`(545000, 510000)` in EPSG:27700, running from the Pennine watershed east to the
North Sea coast. 23,315 records across all six NHLE layers.

The boundary was chosen by measurement, not taste. Four candidate envelopes were
probed for record count and designation coverage; this is the tightest coherent
one that both lands inside the 20,000-25,000 range already proven safe and still
contains every designation type — a narrower western box holds no protected
wreck at all, and a region that silently drops a designation type is not
representative of the register.

Reproducibility lives in `regional-dataset-manifest.json`: boundary, coordinate
system, exact query, exclusion rules, retrieval timestamp, importer and policy
versions, checksum, and all 23,315 list entry numbers. Payloads are not
committed.

### Publication policy

Declared and committed before the activation ran, and it invents nothing — only
the two states the production contract already treats as safe may publish:

| Matcher outcome | Class | Publishes |
| --- | --- | --- |
| `NEW_CANONICAL` | `AUTO_SAFE` | yes, as a new place |
| `MATCH_CONFIDENT` | `AUTO_SAFE` | yes, attached to the existing place |
| `MATCH_REVIEW` | `REVIEW_REQUIRED` | no |
| `CONFLICT_REVIEW` | `REVIEW_REQUIRED` | no |
| `REJECT_INVALID` | `REJECTED` | never becomes a candidate |

Coverage is subordinate to correctness. There is no target percentage, and no
threshold was loosened to raise one.

### Governed publication

`review_import_candidate()` records the reviewer's decision, then
`publish_import_candidate()` creates the canonical row, its source record,
designations, facts and relationships in one transaction. Nothing writes to
`places` directly — a bulk path would demonstrate that bulk insertion works, not
that the contract does, and the contract is what carries provenance, atomicity,
idempotency and audit.

Batches of 500 with a subtransaction per candidate: the batch bounds the blast
radius, the subtransaction bounds the damage. A replay skips the review step for
anything already published, because the contract correctly refuses to re-review
a published candidate.

See [SCALE.md](SCALE.md) for the activation results.

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
  not evidence that conflict detection works at scale. The scale experiment
  confirms this from the other direction: across 5,000 single-source records
  only 4 conflicts arise, all from cross-designation matches. Conflict detection
  is exercised by the two-source tests, not by corpus size.
