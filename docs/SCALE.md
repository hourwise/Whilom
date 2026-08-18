# Scale readiness

A staged experiment running the real ingestion pipeline over **1,000 → 2,500 →
5,000 real Historic England records**, to answer one question before any
regional import: does the model that worked on 30 records still work on
thousands, and where does it stop working?

**Verdict: `GO_WITH_CORRECTIONS`.** The corrections are in this batch. The
pipeline is ready for a regional import and is *not* ready for a national one,
for a reason this experiment measured rather than guessed at.

---

## How the experiment was run

### The gates were declared first

The ten health gates in `ingestion/scale/gates.ts` were written and committed in
`b59ce30`, before the first tier ran. Every threshold is argued from a product
consequence rather than from observed pipeline behaviour — the review-pressure
gate sits at 20% because at two minutes per decision that is already ~33 hours
of work for one person at the largest tier, which is the practical ceiling for a
project with no moderation staff.

Nothing here was retuned after seeing results. Where a declared gate turned out
to be the wrong question, it is reported as failed and the reason is explained,
not adjusted. (See G9.)

### The data is real and not cherry-picked

A fixed British National Grid envelope over Yorkshire and adjacent Northern
England — `380000,380000` to `545000,530000` — with every intersecting record
taken in list-entry order up to a per-layer quota.

| Designation | Records |
| --- | ---: |
| Listed buildings | 3,603 |
| Scheduled monuments | 1,200 |
| Registered parks and gardens | 183 |
| Registered battlefields | 7 |
| World Heritage Sites | 4 |
| Protected wreck sites | 3 |
| **Total** | **5,000** |

Parks, battlefields, wrecks and World Heritage Sites fall below quota because
the region genuinely holds no more. The sample therefore contains unnamed,
mundane and badly located entries alongside the famous ones, which is the point.

The payloads are not committed. `ingestion/scale/manifest.json` pins the
service, envelope, quotas, ordering, a checksum and all 5,000 list entry
numbers, which is enough to rebuild the dataset byte-for-byte and to audit
exactly which records were used. Tiers are prefixes of a stratified interleave,
so tier 1 is a strict subset of tier 2 and each tier carries the same
designation mix.

### Two lanes

The heritage pipeline is pure TypeScript, so ingestion, matching and review
pressure need no database. Query latency and storage do, and run on the same
GitHub-hosted ephemeral Supabase footing as the rest of the database CI — no
hosted project, no secrets, destroyed with the runner.

---

## What it found

### The experiment failed, which is what it was for

At 5,000 records, **17 of 20 audited automatic matches were wrong.** A sundial
merged into its church. Chest tombs into a chapel. A K6 telephone kiosk into the
post office it stands outside. "2, Westfield Road" into "8, Westfield Road". Two
distinct round barrows into a single barrow.

None of these could occur at the 30-record POC scale, which is why they survived
five batches of work. The statutory list separately designates thousands of
curtilage structures and names each after the building beside it — so name
similarity and physical proximity are at their most persuasive *exactly where
the records are most certainly different things* — and a region only becomes
dense enough for those pairs to meet at a few thousand records.

Three distinct causes, fixed in `0d6c464`:

1. **Two entries in one register are two things.** A source with a stable
   primary key has, by publishing two entries under two keys, asserted that
   there are two entities. Different list entries under a shared designation are
   now vetoed outright — scoped to a shared designation, because one site
   genuinely can hold two, and merging Fountains Abbey's scheduled-monument and
   listed-building records is the *point* of matching.

2. **A name can say it is not the thing it is named after.** Token containment
   was being read as identity, so "Sundial to South of Church of St Mary" scored
   0.95 against "Church of St Mary". Worse, positional tails were stripped
   *before* comparison, so both round barrows reduced to "round barrow" and
   scored 1.00 — the discarded tail was the only discriminator they had.

3. **Containment is not identity, again.** A registered park's centroid sits
   tens of metres from the house it was laid out around and shares its name.
   This is the Saltaire lesson from batch 1 arriving through a different door.

A fourth defect, unrelated to merging: the cross-source comparator was running
on two records from the **same** source. All 142 "cross-source conflicts" at the
1,000-record tier were NHLE against NHLE. Historic England does not disagree
with itself — it holds several designations over overlapping ground — so this
both inflated the conflict rate to 23.9% and would have told a reviewer that two
sources disagreed when only one was ever involved.

### The most important number is not a timing

Review pressure at 5,000 records was **760 queued records (15.2%)**. After the
fix it is **15 (0.30%)**.

Most of the queue was never a real question. A team looking at the "before"
figure would reasonably have concluded that the governed publish model needed
more reviewers, better tooling, or relaxed thresholds. All three would have been
the wrong response to a matcher defect.

---

## Results

All figures from GitHub Actions run `32103417668`, Node 20.11.0, 4 vCPU. Local
runs reproduce the pipeline numbers exactly — the pipeline is deterministic.

### Ingestion and matching

| | 1,000 | 2,500 | 5,000 |
| --- | ---: | ---: | ---: |
| Valid | 999 | 2,499 | 4,997 |
| Rejected | 1 | 1 | 3 |
| New canonical | 999 | 2,489 | 4,971 |
| Automatic matches | 0 | 4 | 11 |
| Queued for review | 0 | 6 | 15 |
| Conflicts | 0 | 0 | 4 |
| Throughput | 2,463/s | 1,653/s | 998/s |
| Match time | 0.26 ms/rec | 0.49 ms/rec | 0.90 ms/rec |
| Comparisons per record | 499 | 1,247 | 2,492 |
| Typed by fallback | 28.7% | 24.1% | 25.6% |

Only 3 records in 5,000 were rejected, all for a missing easting/northing. The
NHLE adapter and normaliser handle the real register essentially completely.

### Query latency (p95, milliseconds)

| Query | 1,000 | 2,500 | 5,000 |
| --- | ---: | ---: | ---: |
| Detail by slug | 0.05 | 0.05 | 0.05 |
| Map pan (bounded area) | 0.32 | 0.35 | 0.77 |
| Radius (5 km) | 0.35 | 0.34 | 0.52 |
| Text search | 0.34 | 0.83 | 1.57 |
| Text + type filter | 0.31 | 0.68 | 1.47 |

Against a 300 ms gate, the worst reading is 1.57 ms. **G6 passes with roughly
190× of headroom** at this corpus size.

### Storage

| | 1,000 | 2,500 | 5,000 |
| --- | ---: | ---: | ---: |
| `places` table | 713 KB | 1,630 KB | 3,129 KB |
| Bytes per place | 710 | 654 | 629 |
| Index bytes | 426 KB | 950 KB | 1,778 KB |

Bytes per place *falls* as the corpus grows, because fixed per-table overhead is
amortised. Growth is linear with a small constant.

### Cost of running the experiment

| Lane | Duration |
| --- | ---: |
| Pipeline ladder (all three tiers) | 29 s |
| Queries, tier 1,000 | 4 m 28 s |
| Queries, tier 2,500 | 2 m 37 s |
| Queries, tier 5,000 | 2 m 58 s |

The pipeline lane is cheap enough to run on any change; the query lanes are
dominated by starting an ephemeral Supabase stack, not by the measurement. This
is why the workflow is path-filtered rather than attached to every pull request.

### Media lane (Wikimedia Commons)

A bounded live probe over eight real Yorkshire categories, 64 files. Two runs
gave meaningfully different results, which is itself the finding:

| | Run 1 | Run 2 |
| --- | ---: | ---: |
| HTTP 429 responses | 0 | 6 |
| Requests retried | 0 | 6 |
| Requests per minute | 36.9 | 14.2 |
| Server latency p95 | 918 ms | 377 ms |

Commons rate-limits us, the existing backoff absorbed every 429 without a
failure, and throughput drops by roughly 60% when it happens. 90.6% of files
passed the rights gate; the remainder were `media_licence_unsupported`, which is
the gate working.

Projected on **requests** rather than files — the file rate is flattered by
these being dense categories returning eight files per request, which a per-place
import would never see — illustrating 5,000 places at two requests each is
roughly **12 hours**. Slow, but not a blocker, and trivially parallelisable if
it ever needs to be.

---

## Gate results

| Gate | Severity | 1,000 | 2,500 | 5,000 |
| --- | --- | :-: | :-: | :-: |
| G1 tier completes | blocking | pass | pass | pass |
| G2 rejection rate ≤ 5% | blocking | pass | pass | pass |
| G3 review pressure ≤ 20% | blocking | pass | pass | pass |
| G4 no false merges | blocking | pass | pass | pass |
| G5 matcher scaling | blocking | pass | pass | pass |
| G6 query p95 ≤ 300 ms | blocking | pass | pass | pass |
| G7 throughput ≥ 20/s | advisory | pass | pass | pass |
| G8 generic typing ≤ 35% | advisory | pass | pass | pass |
| G9 conflict detection live | advisory | **fail** | **fail** | pass |
| G10 storage linearity | advisory | pass | pass | pass |

**G4** was audited by hand over the entire automatic-match population, not a
sample: all 11 merges at 5,000 records are correct. Nine are genuine
cross-designation duplicates — bridges, a tithe barn and Wressle Castle each
holding both a scheduled and a listed designation — and two are the multi-part
geometry rows for Saltaire and Studley Royal, where the NHLE service returns one
row per polygon under a single list entry.

**G9 fails at the two smaller tiers, and the gate was wrong, not the pipeline.**
It requires at least one conflict, on the reasoning that zero conflicts across
thousands of real records would mean the detector is broken. But conflicts
between two records of the *same* source are not a coherent idea, and after that
was corrected a single-source run has almost nothing left to disagree about: 4
conflicts across 5,000 records, all arising from cross-designation matches. The
threshold is being left as declared rather than rewritten to fit. Cross-source
conflict detection is proven by `tests/two-source.test.ts`, where NHLE and
Wikidata produce real disagreement, and not by corpus size.

---

## What this does not prove

> **Resolved in the following batch.** The quadratic candidate discovery
> described below was replaced with a locality-bounded generator, proved to
> reproduce every 1,000 / 2,500 / 5,000 decision exactly. See the
> candidate-generation section at the end of this document for results at
> 10,000 and 25,000 records.

**Matching is quadratic, and this is the finding that limits the verdict.**
Comparisons per record track the corpus exactly — 499 → 1,247 → 2,492 as records
go 1,000 → 2,500 → 5,000 — because `matchCandidate` compares each candidate
against every canonical record accumulated so far. Total work is therefore
O(n²). It is comfortable here (0.9 ms per record at 5,000; 12.5M comparisons in 4.5
seconds) and it will not survive another order of magnitude: 50,000 records
implies well over a billion comparisons.

The matcher's own docstring already says `existingPlaces` "is expected to be a
locality-bounded shortlist — in a real run, the rows within a few kilometres of
the candidate." That shortlist does not exist yet, and the cost of its absence
was measured directly:

| | 1,000 | 2,500 | 5,000 |
| --- | ---: | ---: | ---: |
| Comparisons | 498,501 | 3,116,540 | 12,454,046 |
| Beyond the 5 km limit | 97.03% | 98.25% | 98.83% |
| Within 5 km | 14,829 | 54,460 | 145,278 |

Since the matcher already refuses to match anything beyond 5 km, every one of
those 12.3M comparisons at the largest tier is work whose outcome is known
before it starts. A spatial pre-filter would discard **98.8% of the comparisons
without changing a single decision**, and the wasted share *grows* with the
corpus — which is precisely why the problem gets worse rather than better.

**This is the one piece of work that must happen before a national import, and
it is a bounded change with a provable no-op property.** The residual local
work still grows super-linearly (14.8k → 145k comparisons), so blocking buys
roughly two orders of magnitude, not immunity.

**Full-text search is not index-backed at this size, but the index works.** The
query plans show `places_search_gin` unused: at a few thousand rows the planner
correctly prefers a sequential scan. The timings agree — text search grows
linearly with the corpus, 0.29 → 0.77 → 1.51 ms, which is the sequential-scan
signature. It is fast today because the table is small.

That left the question that actually matters unanswered, so `plans.sql` re-runs
the same queries with sequential scans disabled. At 5,000 records the planner
then chooses a Bitmap Index Scan on `places_search_gin`, returning all 447
matches for "church" in 1.29 ms — the same 447 rows that recomputing the
tsvector from scratch finds, so the index is not merely usable but in agreement
with the data it indexes. **The index is present, usable and correct**; the
planner is simply right not to use it yet. Nothing needs building here — it
needs re-checking once the corpus is large enough for the crossover.

**Other limits of this experiment**, stated plainly:

- **One source.** The tiers run NHLE only. Cross-source identity, conflict and
  agreement at scale are untested; they are proven only on the bounded
  two-source sample.
- **The spatial index is not stressed.** 5,000 records over a 165 × 150 km box
  is sparse. The bounded-area query returns at most 100 rows because it is
  capped, not because that is all there is.
- **Nothing was published.** The tiers stop at a decision. Governed publish,
  RLS on imported rows, and the review workbench under real queue volume are not
  measured here.
- **Percentiles come from a single CI runner.** They describe relative growth
  between tiers reliably; they are not a production latency budget.
- **The Commons probe is 64 files.** It characterises rate limiting and the
  rights mix, not sustained harvesting.

---

## Verdict

### `GO_WITH_CORRECTIONS`

The corrections are in this batch and are verified: all blocking gates pass at
every tier, all 11 automatic matches at 5,000 records are correct, and the
review queue is 15 records rather than 760.

**Supported now:** a regional import on the order of 5,000–10,000 records.
Ingestion, normalisation, typing, rights and the read paths all have substantial
headroom, and review is a half-hour of human work rather than a staffing
problem.

**Required before a national import:**

1. A spatial pre-filter on the matcher's candidate set. Quadratic matching is
   the binding constraint, and the fix is bounded and provably outcome-neutral.
2. A re-check that the planner has switched to `places_search_gin` for text
   search. The index is already proven usable and correct under a forced plan;
   what is unknown is only where the crossover falls.
3. A scale run with two sources, since single-source runs cannot exercise
   cross-source identity or conflict at volume.

**Reproducing:**

```bash
pnpm --filter @whilom/ingestion scale:capture
pnpm --filter @whilom/ingestion scale:run -- --tier 5000
pnpm --filter @whilom/ingestion scale:commons
```

The database lane needs Postgres and therefore CI: run the **Scale test**
workflow, which also runs weekly and on pull requests that touch ingestion,
the domain or validation packages, migrations, or the scale harness itself.

---

# Candidate generation (batch 7)

The quadratic blocker above is resolved. Candidate discovery no longer scans the
corpus; the matcher's scoring, thresholds and decision rules are untouched.

**Verdict: `GO_FOR_LARGER_REGIONAL_DATASET`.**

## Decision equivalence

The optimisation target was candidate discovery, not matcher semantics, so the
bar was exact equality against the corrected exhaustive matcher.

| | 1,000 | 2,500 | 5,000 |
| --- | ---: | ---: | ---: |
| Possible pairs (exhaustive) | 498,501 | 3,119,029 | 12,463,987 |
| Candidate pairs (bounded) | 25,365 | 118,456 | 317,868 |
| Pairs pruned | 473,136 | 3,000,573 | 12,146,119 |
| Pruning rate | 94.91% | 96.20% | 97.45% |
| **Decision differences** | **0** | **0** | **0** |
| Match time, exhaustive | 292 ms | 2,146 ms | 9,299 ms |
| Match time, bounded | 52 ms | 267 ms | 1,095 ms |
| Candidate generation | 18 ms | 54 ms | 121 ms |
| Speedup, end to end | 4.2x | 6.7x | 7.7x |

`5K_DECISION_EQUIVALENCE = PASS` — identical decisions and identical digests.

Keying the comparison by processing ordinal rather than source record id matters
more than it sounds: that id is **not unique**, because the NHLE service returns
one row per geometry part, so Studley Royal and Saltaire each arrive twice under
a single list entry. Keying on it collapsed the pair and reported the survivor as
a difference. It was caught because the digests matched while the diff claimed
five differences — a harness that can produce a false failure can produce a
false pass.

## How it works

Two lookups, unioned and returned in insertion order.

**Spatial.** A uniform 0.05 degree grid. The query radius is read from
`THRESHOLDS.maxPlausibleDistanceMeters` rather than restated, so it cannot drift
from the matcher's own veto; longitude spans are computed at each candidate's
latitude and clamped, since the cosine collapses at the poles.

**Identifier.** External identifiers and designation references, looked up
*regardless of locality*, because the matcher's identity pass has no distance
bound. This path contributes zero candidates across every tier — with a single
source, a designation reference is a record's own list entry — so it is covered
by unit tests instead, including a shared Wikidata QID 200 km away.

**Uncertainty** deliberately does not widen the sweep. It affects the agreement
radius, which is clamped to 50-150 m and only influences scoring; the hard veto
is a flat 5 km. A vague record buying a wider search is exactly how a locality
bound decays back into a full scan, and a test asserts it does not.

Both lookups are in memory because the pipeline decides identity *before*
anything is written — a record's match determines whether it becomes a canonical
row at all — so there is nothing in the database to query yet. They map directly
onto SQL for the day publication becomes incremental: `ST_DWithin` against the
existing `places_location_gix`, and an equality lookup on external identifiers.
**No new index was added**, because none was needed.

## Capacity

| | 1,000 | 2,500 | 5,000 | 10,000 | 25,000 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Possible pairs | 498,501 | 3,119,029 | 12,463,987 | 49,914,161 | 312,033,153 |
| Candidate pairs | 25,365 | 118,456 | 317,868 | 1,390,575 | 6,334,606 |
| Pruning rate | 94.91% | 96.20% | 97.45% | 97.21% | 97.97% |
| Candidates per record | 25.4 | 47.4 | 63.6 | 139.1 | 253.4 |
| Match time per record | 0.068 ms | 0.121 ms | 0.234 ms | 0.529 ms | 0.904 ms |
| Throughput | 4,202/s | 3,720/s | 2,638/s | 1,461/s | 920/s |
| Automatic merges | 0 | 2 | 4 | 9 | 33 |
| Review queue | 0 | 8 | 22 | 46 | 180 |
| Review rate | 0.00% | 0.32% | 0.44% | 0.46% | 0.72% |
| Conflicts | 0 | 0 | 4 | 8 | 16 |
| Rejected | 1 | 1 | 3 | 3 | 5 |

### Observed scaling, stated carefully

Candidates per record still grows roughly with corpus size here — 25 to 253 as
records go 1,000 to 25,000. That is **not** evidence the bound failed. This
experiment grows the corpus by densifying a *fixed* geographic envelope, so local
density is proportional to n by construction, and locality-bounded work is
O(n · local density). In a fixed region those are the same curve.

What changed is the constant, and it is large: 6.3 million comparisons instead of
312 million at 25,000 records, and the pruned share *rises* with scale (94.9% to
98.0%). A national import adds area as well as records, which is the regime where
locality bounding pays properly — but this experiment cannot demonstrate that,
and five measurements are not an asymptotic proof.

## Quality

Every automatic merge was inspected at both larger tiers, not a sample.

| | 10,000 | 25,000 |
| --- | ---: | ---: |
| Auto-merges audited | 9 of 9 | 33 of 33 |
| Correct | 9 | 33 |
| Incorrect | 0 | 0 |
| Uncertain | 0 | 0 |

Reaching that took two correctness fixes, both found *by* the audit.

**A guessed type was counted as evidence of identity.** `CanonicalPlaceRef` did
not carry `placeTypeConfidence` at all, so the matcher consulted only the
candidate's. "Marrick Priory Farmhouse" — typed `monument` at confidence 0.2
because nothing in its name could be recognised — was contributing positive
evidence towards merging with an actual priory 50 m away.

**Containment is not identity, at the level of names.** An intermediate fix let
confidently agreeing place types corroborate a containment match. The 25,000
audit showed why that fails: NHLE place types are *inferred from the name*, so
"Whitby Abbey Cross" is typed `abbey` and the cross base beside All Saints is
typed `church`. The types agreed because they were the same evidence read twice.
Circular corroboration is not corroboration, so containment now earns review and
never a merge.

That removed four false merges — a priory into its farmhouse, an abbey into its
cross, a churchyard cross base into its church, and a village cross group into
the stocks within it — the last of which is the "church versus churchyard cross"
case this matcher has been required to protect since batch 6.

### What it cost

The 5,000-record baseline moved: 11 automatic merges became 4, and review rose
from 15 to 22. The seven that moved are all containment pairs — "Yarm Bridge"
against "Yarm Bridge Over River Tees", "Wressle Castle" against "Ruins of Wressle
Castle", "Bishop's Manor House" against "The Bishop's Manor" — and all seven were
*correct* merges now routed to a human instead.

That is a deliberate trade in the direction this matcher is allowed to be wrong.
It is worth being explicit that the batch-6 statement "all 11 automatic merges at
5,000 records are correct" remains true; seven of them are simply no longer
automatic. Bounded-versus-exhaustive equivalence is unaffected — both strategies
were re-verified against the corrected matcher and still agree exactly.

## Review load

| | 10,000 | 25,000 |
| --- | ---: | ---: |
| Queued | 46 (0.46%) | 180 (0.72%) |
| Reviewer-minutes per 1,000 records | 9.2 | 14.4 |
| Estimated clearance | 1.5 h | 6.0 h |

Causes at 25,000: one name contains the other (106, 58.9%), names not close
enough (27), landscape against a structure inside it (25), type disagreement
(10), location disagreement (6), non-distinctive name (3), below threshold (2),
outside the agreement radius (1).

No new pathological class appeared at scale. The dominant cause is the new
containment rule, which is the expected shape of a deliberately conservative
gate. **Bulk approval is not warranted**: six hours of review for a
25,000-record regional import is not the bottleneck, and the whole queue is
identity judgements a reviewer should actually make.

## Query performance and storage

Measured on ephemeral Supabase in CI, p50/p95 over 25 runs after warmup.

| Query (p95, ms) | 1,000 | 5,000 | 25,000 |
| --- | ---: | ---: | ---: |
| Detail by slug | 0.035 | 0.054 | 0.101 |
| Map pan (bounded area) | 0.275 | 0.828 | 2.267 |
| Radius (5 km) | 0.298 | 0.525 | 1.928 |
| Text search | 0.288 | 1.497 | 7.255 |
| Text + type filter | 0.269 | 1.295 | 7.478 |

Against the 300 ms gate the worst reading at 25,000 records is 7.5 ms, roughly
40x of headroom. The spatial GiST index carries the map and radius queries as
intended.

| Storage | 1,000 | 5,000 | 25,000 |
| --- | ---: | ---: | ---: |
| `places` table | 713 KB | 3,129 KB | 15,237 KB |
| Bytes per place | 710 | 629 | 615 |
| Index bytes | 426 KB | 1,778 KB | 8,446 KB |

Bytes per place *falls* as fixed overhead amortises. Growth is linear.

### No tuning was applied, on purpose

Full-text search is still not index-backed: at 25,000 rows the planner estimates
a sequential scan (cost 1,249) marginally cheaper than the GIN index (cost
1,208 plus heap access) and chooses it. Forcing the index gives 6.7 ms against
the planner's 9.9 ms, so the crossover is close — but at 7 ms p95 against a
300 ms gate this is not a performance problem, and changing the plan to win
3 ms would be tuning against a number nobody is waiting on.

The check that matters is that the index remains correct and usable: forced, it
returns 2,076 rows for "church", exactly matching a from-scratch recomputation
of the tsvector. Worth re-measuring at the next capacity gate, where the
crossover will likely have passed.

**No index was added in this batch.** The two candidate lookups map onto
`places_location_gix` (already present) and an equality lookup on external
identifiers, which is not yet needed because candidate generation runs in memory
before anything is written.

## Same-source and cross-source, permanently separated

`matching/source-relation.ts` now owns the distinction as a named, testable gate
rather than an inline condition. Same-source overlaps are classified
descriptively — repeated entry, multi-designation, distinct entries — and none of
that vocabulary asserts an entry is wrong, because none of it is evidence that
one is.

Making it explicit surfaced a last residue of the batch-6 defect: `MATCH_REVIEW`
was still incrementing the cross-source `Ambiguous` bucket for same-source pairs,
so a single-source run reported comparison outcomes for pairs where no comparison
had been performed. A single-source run now produces zero cross-source
comparisons, asserted by test. At 25,000 records the register's 213 same-source
overlaps produce no conflicts at all; the 16 conflicts are matcher-level
disagreements about type and location.

## National-import gate

**PARTIALLY_RESOLVED.** All-pairs candidate discovery is gone and 98% of the work
with it, which is what blocked a larger *regional* import. What is not yet
demonstrated is behaviour when the corpus grows by area rather than density —
the regime a national import actually occupies — and the in-memory index would
need to become the SQL lookups it was designed to mirror once publication is
incremental rather than whole-run. National import remains ungated and
unauthorised.

---

# Regional activation (batch 8)

`WHILOM_REGION_YORKSHIRE_V1` — the first dataset built to be *used* rather than
measured. 23,315 real Historic England records taken through the production
pipeline into canonical, searchable, fully attributed places.

**Verdict: `GO_FOR_PUBLIC_MAP`.**

## Dataset

A 145 km x 90 km British National Grid band, `(400000, 420000)` to
`(545000, 510000)` in EPSG:27700, from the Pennine watershed east to the North
Sea coast. 13,050 km².

| Designation | Records |
| --- | ---: |
| Listed buildings | 21,039 |
| Scheduled monuments | 2,171 |
| Parks and gardens | 93 |
| Battlefields | 7 |
| World Heritage Sites | 4 |
| Protected wreck sites | 1 |
| **Total** | **23,315** |

Chosen by measurement: four candidate envelopes were probed for record count and
designation coverage, and this is the tightest coherent one that both lands
inside the proven 20,000-25,000 range and still contains all six designation
types. A narrower western box holds no protected wreck at all.

Unlike the scale corpus this applies **no quota and no truncation** — every
protected record inside the boundary is present, because a quota hole is
indistinguishable, to a user, from heritage that does not exist.

## Ingestion and matching

| | |
| --- | ---: |
| Source rows | 23,315 |
| Valid | 23,314 |
| Rejected before candidate | 1 (missing easting/northing) |
| New canonical | 23,146 |
| Confident match | 25 |
| Review (identity) | 125 |
| Review (conflict) | 18 |
| Candidate pairs | 10,129,479 (434.5/record) |
| Throughput | ~680 records/second |

## Publication

Every publication went through `review_import_candidate()` then
`publish_import_candidate()`. Nothing wrote to `places` directly.

| | |
| --- | ---: |
| Candidates considered | 23,171 |
| Published | 23,171 |
| — attached to an existing place | 25 |
| — new places created | 23,146 |
| Refused by the contract | 0 |
| Failed | 0 |
| Left in review | 143 |
| Publish latency p50 / p95 | 13.5 ms / 23.1 ms |
| Throughput | 76 candidates/second |
| Batch size | 500 |

**99.38% of valid records published.** That is a measurement, not a target: the
policy was committed before the run and no threshold was moved to raise it.

Publication is ~9x slower per record than matching, which is the expected shape —
each publication is a real transaction writing a place, a source record,
designations and facts, against matching's in-memory comparison. It was not
optimised, because 5 minutes for a regional import is not a problem worth
solving yet.

## The bug the audit caught

The first activation published 23,171 places and the quality audit reported
**zero automatic merges**, where the plan said twenty-five. Both numbers were
correct, which is what made it worth chasing.

The matcher works in synthetic within-run handles (`run:<id>:<n>`) that mean
nothing to the database, so `matched_entity_id` was never set on the candidate
rows. `publish_import_candidate` took the only path left to it and created a
place — leaving 25 duplicates in a dataset whose entire purpose is not to have
any.

What travels now is the *source record id* the matcher matched. That record has
already been published by the time the match needs it, so its `source_records`
row names the place to attach to; publication is ordered by processing ordinal
to guarantee that. The activation reports attachments and new places separately,
so a silent regression to zero merges cannot hide inside a healthy total again.

A second defect, in the workflow rather than the data: `inputs.replay` is empty
on a `pull_request` event, so `inputs.replay != false` evaluated false and both
idempotency steps were **silently skipped** — the run went green having never
executed a blocking gate. Gate evaluation now asserts the replay evidence
exists, because a blocking gate that can be skipped is not a gate.

## Canonical result

| Table | Rows |
| --- | ---: |
| places | 23,151 (23,146 imported + 5 seed) |
| place_designations | 23,171 |
| source_records | 23,170 |
| facts | 67,323 |
| entity_relationships | 1 |
| import_candidates | 23,314 |
| import_conflicts | 18 |
| review queue | 143 |
| images | 0 |

`source_records` is one fewer than the 23,171 publications because a repeated
list entry — the multi-part geometry case — correctly folded onto one row under
the source-record unique constraint.

Ratios, useful for later national estimation but **not** a national forecast:

| | |
| --- | ---: |
| Source records per place | 1.00 |
| Facts per place | 2.91 |
| Designations per place | 1.00 |
| Review rows per 1,000 source records | 6.1 |

Fact predicates published: `designation_reference` (23,171), `first_designated`
(22,969), `former_name` (19,053), `area_hectares` (2,132).

## Quality

| Gate | Result |
| --- | --- |
| G1 database integrity | PASS — migrations replay, pgTAP green, types drift-free |
| G2 matcher regressions | PASS — 172 ingestion tests |
| G3 automatic merge correctness | PASS — 24 merged places, all audited, all correct |
| G4 provenance | PASS — 23,146 published, 0 without a source record |
| G5 review integrity | PASS — 0 queued rows carry a published entity |
| G6 publication integrity | PASS — 0 orphan facts, source records or relationships |
| G7 idempotency | PASS — replay published 0, every row count identical |
| G8 query usability | PASS — worst p95 15.4 ms against a 300 ms gate |
| G9 review load | 143 rows, 0.61% of candidates |

Every automatic merge was inspected, not sampled. All 24 are
scheduled-monument-plus-listed-building pairs for one structure: Bolton Castle,
Middleham Castle, Helmsley Castle, Richmond Bridge, Kildwick Bridge, Stanley
Ferry Aqueduct, the Swine Cross, and so on. **24 audited, 24 correct, 0
incorrect, 0 uncertain.**

Other checks: 0 invalid coordinates, 0 places outside the declared boundary,
every imported place carries a designation, a licence and an attribution.
Positional accuracy is known for all but the 5 seed rows and is 6 m or better
for 21,663 of them; 8 places exceed 1 km, all large designated landscapes where
a centroid genuinely is imprecise.

Classification spans 26 types — castles, abbeys, priories, cathedrals, churches,
bridges, canal structures, railway and industrial sites, hillforts, pillboxes,
gardens, landscapes — with `structure` (8,269) and `building` (6,122) as honest
fallbacks. `unknown` remains preferable to a confident wrong answer.

## Review load

143 rows, 0.61% of candidates, ~4.8 hours at the documented two-minutes-per-
decision assumption. That is an estimate from a stated assumption, not observed
reviewer productivity.

| Cause | Count |
| --- | ---: |
| One name contains the other | 94 |
| Landscape designation versus a structure inside it | 18 |
| Sources disagree on place type | 10 |
| Names not close enough | 9 |
| Sources disagree on location | 8 |
| Name is not distinctive | 2 |
| Two candidates score alike | 1 |
| Position outside the agreement radius | 1 |

**Bulk review tooling is not justified.** The dominant class is repetitive in
shape but not deterministic in answer: "Whitby Abbey" against "Whitby Abbey
Cross" needs a person precisely because no rule distinguishes it from "Wressle
Castle" against "Ruins of Wressle Castle". Automating it would re-introduce the
false merges the 25,000-record audit removed, to save five hours.

## Product queries

| Query | p50 | p95 | rows |
| --- | ---: | ---: | ---: |
| Place detail | 0.09 ms | 0.28 ms | 6 |
| Nearest (1 km) | 0.37 ms | 0.59 ms | 20 |
| Nearby (2 km) | 0.73 ms | 1.21 ms | 10 |
| Text + bbox | 2.09 ms | 3.38 ms | 100 |
| Review queue | 3.65 ms | 3.96 ms | 143 |
| Filtered bbox | 2.22 ms | 3.97 ms | 100 |
| Radius (5 km) | 2.50 ms | 4.14 ms | 100 |
| Bbox | 3.10 ms | 5.70 ms | 100 |
| Type filter | 5.96 ms | 9.02 ms | 100 |
| Text search | 6.63 ms | 9.16 ms | 100 |
| Map viewport | 9.92 ms | 15.41 ms | 250 |

Worst reading is 15.4 ms against the 300 ms gate — about 20x headroom. No query
tuning was applied and no index was added, because nothing in the measurements
asked for either.

## Map-data contract

`map_places()` establishes the shape and, more importantly, the limits:

- **geography is mandatory** — a null bounding box raises rather than returning
  the region;
- **the viewport is size-capped** at 2.5 x 1.5 degrees, because a "viewport"
  spanning the country is a full scan wearing a bounding box;
- **the row cap is server-side** at 500 — a client asking for 100,000 gets the
  cap;
- results order by content level, so a truncated viewport still looks sensible
  rather than arbitrary;
- thumbnails appear only when stored rights data supports attribution for that
  exact file.

The projection is id, slug, name, type, coordinates, positional accuracy,
primary designation and thumbnail. Nothing that belongs on a place page, because
a map that loads complete records to draw markers will not stay interactive.
16 pgTAP assertions hold those limits. **No map was built.**

## Storage

248.5 MB total for the region.

| Table | Total | Indexes |
| --- | ---: | ---: |
| import_candidates | 137.0 MB | 3.9 MB |
| source_records | 52.8 MB | 3.9 MB |
| facts | 29.3 MB | 15.9 MB |
| places | 14.1 MB | 7.7 MB |
| place_designations | 5.7 MB | 2.1 MB |

The staging table is the largest object in the database — nearly ten times the
canonical `places` table — because it retains the full normalised JSON for every
candidate including those still in review. That is the audit trail working as
intended, but it is the row worth watching first at national scale, and a
retention policy for published candidates will be needed long before the
canonical data becomes expensive.

## Media

No mass Commons enrichment was performed, and none was attempted. The regional
dataset contains no images, which does not block activation: the rights gate,
the attribution builder and the map contract's rights check are all exercised by
their own tests, and the map contract will return a thumbnail only when stored
rights support attribution for that file.

## This does not prove national readiness

Explicitly unresolved:

- **expanding-area behaviour** — this region densifies a fixed envelope; a
  national import grows the area too, which is the regime locality-bounded
  candidate generation was designed for and has never been measured in;
- **persistent SQL / incremental candidate generation** — candidate discovery is
  in memory because the pipeline decides identity before anything is written.
  Incremental publication against an existing corpus needs the `ST_DWithin` and
  identifier lookups the design mirrors, and those do not exist yet;
- **national source-query orchestration** — one envelope and six layers is not
  40 counties;
- **very large table and index behaviour** — 23,000 places is 14 MB; the shape at
  400,000 is untested;
- **long-term media enrichment rate** — measured at ~14 requests/minute against
  Commons, unchanged by this batch;
- **reviewer workload beyond regional scale** — 0.61% is comfortable at 23,000
  and is a different proposition at 400,000;
- **hosted deployment behaviour** — everything here ran on ephemeral CI Postgres.

Phase 2 may now be described as: *regional canonical data pipeline proven at
useful product scale; national-scale readiness remains a separate gate.*
