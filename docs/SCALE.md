# National scale — evidence and product implications

Batch 13 measured how far Whilom's architecture reaches beyond its 23k regional corpus, using the existing already-licensed Historic England source. This records the evidence and what it means for the next product batch. It does not build UI.

---

## The national source

Measured from the FeatureServer's own aggregate endpoints (`national:audit` → `national-source-audit.json`):

|                                  |                                                                  |
| -------------------------------- | ---------------------------------------------------------------- |
| National total                   | **401,539** records across 11 layers                             |
| Listed Building points           | 379,685 (94.6%)                                                  |
| Scheduled Monuments              | 20,001                                                           |
| Parks, Battlefields, Wrecks, WHS | 1,853                                                            |
| ListEntry range                  | 1021466 – 1497496                                                |
| Null geometry (dominant layer)   | **0**                                                            |
| Occupied OS 100km cells          | 27                                                               |
| Densest cell                     | **TQ (London), 12.9%**                                           |
| Next four                        | TL 9.1%, SP 9.1%, ST 9.0%, SU 8.8%                               |
| Currently ingested               | ~23,315 (21,039 listed-building points in the regional envelope) |
| Candidate new records            | **378,224 (17.2×)**                                              |

The distribution matters more than the total: heritage is heavily concentrated, and the densest five cells hold ~49% of listed buildings. A national map is a density problem before it is a row-count problem.

---

## The scale ladder

`national:capture` builds a deterministic, geographically stratified 100k sample — per-cell quota proportional to national share, ListEntry-ascending within a cell, interleaved so every prefix carries the national mix. `national:ladder` runs the ordinary pipeline through the same `buildTierMetrics` as the regional ladder.

Measured in fresh processes:

| Stage    | rec/s | ms/rec | comparisons/rec | heap MB | classification       |
| -------- | ----- | ------ | --------------- | ------- | -------------------- |
| 25,000   | 6,197 | 0.044  | 113             | 225     | **PASS**             |
| 50,000   | 5,737 | 0.054  | 134             | 276     | **PASS**             |
| ~100,000 | 2,198 | 0.316  | 205             | 483     | **FAIL_PERFORMANCE** |

**Maximum proven scale: `PROVEN_SAFE_TO_50K`.**

### What failed, and why it is not an architectural dead end

Between 50k and 100k, per-record match time grew **5.8× for 2× records**. That fails the architectural half of the regional G5 gate: per-record cost must grow sub-linearly with the corpus, or total match cost is super-quadratic. The gate was not moved — it is the regional standard applied between the stages that ran.

But the shape of the failure is diagnostic:

- Comparisons per record grew only **1.8×** (113 → 205), which is sub-quadratic and expected as density rises.
- Per-_comparison_ time grew ~4×, and heap doubled (213 → 483 MB).

So the cost is **not** candidate-count blowup — the bounded candidate generation is behaving. It is per-operation inflation consistent with **GC pressure from holding the entire canonical set in one in-process array**. The absolute is still 0.32 ms/record, 150× under the 50 ms ceiling; the regression is the trend, not the current speed.

The bounded remediation (Batch 14): **chunked / streamed ingestion that bounds live memory** — process the national corpus in geographic batches rather than accumulating 400k canonical places in one array — plus, if needed, a finer spatial grid in the densest cells. Neither touches the matcher's correctness, which was proven equivalent to exhaustive in earlier batches.

---

## Conflicts at scale

Two distinct measures, easily confused:

- **Ingestion conflicts** (`CONFLICT_REVIEW`): two source records for one place disagree during matching. The ladder measured 0 at 25k and 50k, **37 at ~100k** — they appear as density rises and near-duplicate names cluster. Rate 0.037% of valid records.
- **Temporal conflicts** (`temporal_conflicts()`): two published temporal claims on a place disagree. These come from the Wikidata enrichment, which is bounded to the regional corpus, so the national ladder does not exercise them. The regional corpus holds **80**.

Projecting temporal conflicts to national scale: the 80 arise on ~23k places with Wikidata temporal coverage. Wikidata coverage is roughly proportional to corpus size, so a national corpus would carry on the order of **1,000–1,400** temporal conflicts — an order of magnitude more than 80. That is the number that decides the product question below, and it is why Batch 13 built durable conflict governance rather than treating 80 as a permanent scale.

---

## Product implications for the next batch

Not built here — captured so the next batch is evidence-led.

### Map

- **Clustering already exists** (`map_clusters`) and returns 95 rows for the whole region. At 17× density it must be validated against the densest national cells (London, Bath, York). The backend mechanism is sound; the question is cell sizing at national zoom levels.
- The initial UK-wide view already clusters. Pin limits (`map_places` caps at 500) are in place.
- Dense urban areas are the real test — a bounded density test against real high-density viewports (TQ, ST, SU) is the natural first Batch 14 map task.

### Timeline

- Temporal filtering scales with claims, and Batch 11's period-count query is already O(claims), not O(corpus) — it held at 8 ms. National temporal coverage stays a small share, so the timeline's honesty ("most places are undated") becomes _more_ important, not less.
- Multi-phase places and conflicting dates both grow with the corpus; the ruler must not imply a single date for a place that has several or disputed ones.

### Place detail

- A place with conflicting claims eventually needs an honest indicator: **"Sources disagree on the date of this place."** The data contract for this now exists (`temporal_conflict_status`), which reports the disagreement and its category **without claiming which source is correct**. Whilom must never imply it knows the answer when it does not.

### Search

- No measured search impact from the pipeline lane (search is a DB read path, exercised by the query lane). Place-name search is a GIN index and scales with rows, not with density; person and related-place lookups are unaffected by NHLE expansion.

---

## National expansion decision

**`PERFORMANCE_REMEDIATION_REQUIRED`.**

Data integrity is correct at every stage exercised — every source row reached a recorded outcome, no false merges, geometry and provenance intact. The blocker is performance: per-record match time regresses super-linearly beyond 50k, from a diagnosed and bounded cause (memory/GC, not candidate blowup). The full 401k dataset was **not** exercised — the pilot proves to ~100k and fails there, so nothing is claimed beyond 50k.

The next corpus size is **not** a flag flip. It is: apply the chunked-ingestion remediation, re-run the ladder to 100k and 200k, and only then decide whether a first bounded national expansion (e.g. one additional region, or one grade, or a 100k stratified slice) is safe to publish.

---

## Batch 14 — bounded-stream remediation and re-measurement

Batch 14 started from PR #13 at `7c0afc1e6ea19795fc16d192b91f7d2e31873cc7`. The existing Batch 13 sample was reused unchanged: **99,990 records**, geographically stratified across the same national distribution. The 200k checkpoint was added to the ladder contract, but this captured sample did not contain enough records to exercise it; no 200k or full-national result is claimed.

### Measured root-cause result

The Batch 13 diagnosis was directionally correct but incomplete.

- **Measured:** post-GC heap at ~100k fell from **483 MB** in the in-memory path to **183 MB** in the streamed path; the payload cache peaked at its configured **2,048 records**, while compact spatial/identifier metadata remained available for all 99,619 canonical records.
- **Measured:** comparisons remained **204.6/record**, and integrity remained exact: **99,990 source rows, 99,954 valid, 36 rejected, 37 ingestion conflicts**.
- **Inferred:** retaining full canonical/source payloads in one array was a material memory-pressure contributor, not the sole performance bottleneck.
- **Measured after remediation:** synchronous spill-payload reads and cache misses became the new bottleneck. At ~100k there were **2,687,858 cache misses**, and per-record match time still grew **6.43× for 2× records**. The original whole-corpus heap trend was reduced, but the architectural growth gate still failed.

This is therefore classified as **`REMEDIATION_INSUFFICIENT`** for national expansion. The change is correctness-preserving and materially reduces retained heap, but it is not yet a safe national execution shape under the unchanged growth gate.

### Remediation design

The production runner now accepts a `CandidateStore`. The ordinary regional path continues to use the existing in-memory `CandidateIndex`. The national path uses `ChunkedCandidateIndex`:

1. NHLE tier fixtures are streamed as NDJSON, so the adapter does not parse the full tier into one feature array.
2. Full canonical/source payloads are appended to a spill file. In-memory state holds compact insertion-order pointers, spatial-cell membership, identifier membership, and a bounded LRU payload cache.
3. A 4,096-source-row chunk lifecycle clears the payload cache. If Node is run with `--expose-gc`, the harness collects at that boundary so heap measurements distinguish retained data from collectible garbage.
4. Same-source overlap governance uses compact source identity metadata and does not reload a full payload. Cross-source comparison still reloads the full counterpart payload when required.

This is a bounded working-set design, not a publication path: it writes only local benchmark/import spill state and does not touch Supabase or the canonical production corpus.

### Cross-chunk correctness guarantee

Chunk boundaries do not evict correctness data. Every future query inspects the complete set of spatial cells touched by the matcher’s own **5,000 m** plausible radius, including immediately adjacent and diagonal cells, and the identifier index is global because shared identifiers may match across the country. Returned candidates are sorted by their original insertion sequence before they reach the matcher. Distant records are excluded only when the matcher itself would veto them. Deterministic tests cover same-cell, adjacent, diagonal, edge, distant, cross-geography identifier, duplicate, and stable-order cases.

### Equivalence evidence

The old in-memory and streamed stores were run over identical synthetic boundary data and compared by a SHA-256 digest of source record id, outcome, matched source record id, and conflicts. The digest matched. Duplicate counts and outcome histograms matched as well. The full ingestion suite also remains green, including source relation, conflict governance, provenance, idempotency, and matcher tests.

### Batch 14 national ladder

Fresh-process measurements from `national-ladder.ts`, with `--expose-gc` enabled for the explicit chunk-boundary memory snapshots:

| Stage | Records |   rec/s | match ms/record | comparisons/record | heap / RSS MB | integrity                                                    | classification       |
| ----- | ------: | ------: | --------------: | -----------------: | ------------: | ------------------------------------------------------------ | -------------------- |
| 25k   |  25,000 | 1,286.4 |           0.086 |              113.1 |      52 / 309 | 24,982 valid; 18 rejected; accounted                         | **PASS**             |
| 50k   |  50,000 | 1,239.7 |           0.088 |              133.7 |     127 / 364 | 49,976 valid; 24 rejected; accounted                         | **PASS**             |
| ~100k |  99,990 |   313.5 |           0.553 |              204.6 |     183 / 669 | 99,954 valid; 36 rejected; accounted; 37 ingestion conflicts | **FAIL_PERFORMANCE** |
| ~200k |       — |       — |               — |                  — |             — | sample unavailable                                           | **NOT_RUN**          |

The new path proves **`PROVEN_SAFE_TO_50K`** under the existing gates, not 100k. The absolute 0.553 ms/record value is far below the 50 ms ceiling; the failure is the unchanged growth gate, with 6.43× per-record match-time growth for 2× records. Temporal evidence conflicts were not generated by this single-source national ladder and remain governed separately by PR #13’s conflict lifecycle.

### Database/query scale

No meaningful >23k ephemeral database run was exercised in Batch 14. Hosted Supabase was intentionally untouched, and no safe local database workflow was available without introducing the prohibited infrastructure boundary. Therefore there is no new national confidence claim for coverage, viewport clusters, map places, period counts, search, category filters, or temporal filters. Existing regional query evidence remains the only measured query-scale evidence.

### National publication recommendation

Do not activate a national slice from this batch. Scaling capability is not publication authorization, and this implementation has not passed the national growth gate. The next publication step remains owner-authorized and should be considered only after a second remediation replaces per-candidate spill reads with a locality-aware batch/index strategy while retaining the same insertion-order and identifier guarantees.

### Remaining bottleneck and Batch 15 recommendation

The remaining bottleneck is the disk-backed candidate payload access pattern: the compact index bounds retained payload memory, but a 2,048-record cache causes repeated synchronous reads as the national density rises. Batch 15 should benchmark a locality-aware persisted index or controlled geographic batches with overlap, then repeat the machine-checked digest gate at 25k/50k/100k/200k before any publication decision. It should also add a safe ephemeral database lane if the existing CI mechanism can run without hosted infrastructure. No UI redesign, Historic England description retrieval, or remote deployment is part of that recommendation.

## Batch 15 — national locality remediation and 200k proof

Batch 15 is stacked directly on Batch 14. It does not change the matcher’s
eligibility rules, the 5,000 m plausible radius, identifier semantics, source
governance, or canonical publication data.

### Status at a glance

| Classification                    | Result                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Maximum proven safe scale         | **`PROVEN_SAFE_TO_50K`**                                                                                              |
| National expansion classification | **`REMEDIATION_INSUFFICIENT`**                                                                                        |
| Ephemeral database lane           | **`DEFERRED`** — CI uses `supabase start`, but Docker is unavailable in this environment; no hosted database was used |
| National publication performed    | **NO**                                                                                                                |

The Batch 15 locality design removes the measured per-candidate random-read
amplification, and the 200k capture and run completed with exact accounting.
The existing growth gate still fails at the 50k → 100k transition. The low
absolute ms/record values are not treated as a pass when that authoritative
trend gate fails.

### Part A — measured Batch 14 I/O failure

The instrumented Batch 14 single-file spill store measured the following before
the locality change:

| Stage |                                                        Payload lookups | Cache hits | Cache misses / physical reads | Hit ratio |  Bytes read |
| ----- | ---------------------------------------------------------------------: | ---------: | ----------------------------: | --------: | ----------: |
| 25k   |                                                              2,825,937 |  2,719,756 |                       106,181 |    96.24% | 221,078,526 |
| 50k   |                                                              6,681,208 |  6,390,553 |                       290,655 |    95.65% | 606,467,832 |
| ~100k | approximately 2,687,858 cache misses were already recorded by Batch 14 |            |                               |           |             |

This confirmed that the LRU was not a correctness mechanism: an eviction was
safe, but every later miss synchronously reread one JSONL payload from the
corpus-wide spill file. The dominant failure was read amplification and page
locality, not candidate-count growth alone.

### Part B — locality-aware design

`ChunkedCandidateIndex` now writes two aligned append-only page streams per
coarse 0.5° geographic working region:

1. canonical pages contain only `CanonicalPlaceRef` payloads needed by spatial
   candidate generation;
2. deferred candidate pages contain the full `PlaceCandidate` payload and are
   read only when cross-source comparison calls `getCandidate`.

The fine 0.05° spatial grid and the existing radius-cell enumeration are
unchanged. Candidate sequence numbers are collected from same, adjacent,
vertical, horizontal, diagonal, boundary, and corner cells, then sorted by
canonical insertion sequence before reaching the matcher. The identifier index
remains global and independent of the geographic page, so a distant exact
identifier match cannot be lost. Page caches remain bounded (65,536 canonical
payload records, with a smaller deferred candidate-page cache); the cache is
retained across 4,096-row chunks but evicts by LRU. Chunk boundaries therefore
measure lifecycle without destroying locality.

The matcher’s decisions remain unchanged. The only matcher-file change is an
exact hot-path optimization: when instrumentation is enabled, the geodesic
distance used for the decision is reused for the counters instead of being
computed twice.

### I/O evidence after remediation

The final split-page implementation measured:

| Stage | Payload lookups |  Page hits | Page misses / physical reads | Hit ratio |    Bytes read | Read amplification |
| ----- | --------------: | ---------: | ---------------------------: | --------: | ------------: | -----------------: |
| 25k   |       2,825,937 |  2,825,776 |                          161 |  99.9943% |        88,987 |              1.22× |
| 50k   |       6,681,208 |  6,680,955 |                          253 |  99.9962% |       132,702 |              1.15× |
| ~100k |      20,458,498 | 20,455,256 |                        3,242 |  99.9842% |   289,208,479 |            195.40× |
| ~200k |      71,687,863 | 71,658,668 |                       29,195 |  99.9593% | 3,073,918,335 |            230.23× |

The page hit ratio and physical-read count are the direct measured proof that
the repeated one-record synchronous read pattern was removed. Byte
amplification remains high at national density because a miss reads a whole
bounded page while only one logical payload triggered that miss; this is why
both hit ratio and bytes/read amplification are reported rather than hiding one
behind the other.

### Equivalence and boundary evidence

The focused machine checks compare the in-memory `CandidateIndex` and the new
page store over identical inputs and compare the resulting decision digest,
outcome histogram, duplicate count, conflicts, matched source IDs, and stable
insertion order. The existing Batch 14 streamed-store equivalence tests remain
green. The new deterministic tests cover:

- same, horizontal-adjacent, vertical-adjacent, diagonal, exact-boundary, and
  corner cells;
- records just inside and outside the matcher’s 5 km eligibility radius;
- geographically distant exact identifiers and duplicate identifiers;
- repeated near-identical names, same-source and cross-source governance,
  conflict review, stable ordering, chunk transitions, page eviction, and
  deterministic reruns;
- persisted national-order references and preservation of the established
  ~100k prefix.

The pre-extension 99,990-record prefix was rebuilt separately and checked before
the 200k extension. Its digest is recorded in
`ingestion/scale/national/legacy-prefix-digest.json`:

```text
prefix records: 99990
prefix SHA-256: 8097257c5ad063e1003327d5effeedfdeddd5ddcf23b563242a97e7909838b26
first: layer 0 / ListEntry 1021941
last:  layer 7 / ListEntry 1000726
```

The final 199,980-record cache has the same prefix digest and a complete
persisted order. The capture is metadata-only from the approved Historic
England NHLE source; descriptions were not retrieved and the generated cache
is not committed.

### Batch 15 fresh-process scale ladder

The 25k, 50k, ~100k, and ~200k checkpoints were run in separate Node
processes with explicit GC available. The ~200k stage is the complete available
199,980-record capture. Integrity means every source row was either valid or
rejected and therefore accounted for.

| Stage | Records | Valid / rejected | Conflicts |   rec/s | match ms/record | comparisons/record | heap / RSS MB | page reads | Integrity                                 | Classification                                |
| ----- | ------: | ---------------: | --------: | ------: | --------------: | -----------------: | ------------: | ---------: | ----------------------------------------- | --------------------------------------------- |
| 25k   |  25,000 |      24,982 / 18 |         0 | 1,524.2 |           0.097 |              113.1 |     106 / 280 |        161 | PASS; 25,000/25,000 accounted             | **PASS**                                      |
| 50k   |  50,000 |      49,976 / 24 |         0 | 1,434.6 |           0.129 |              133.7 |     113 / 304 |        253 | PASS; 50,000/50,000 accounted             | **PASS**                                      |
| ~100k | 100,000 |      99,956 / 44 |        37 |   688.8 |           0.679 |              204.6 |     291 / 505 |      3,242 | PASS integrity; 100,000/100,000 accounted | **FAIL_PERFORMANCE**                          |
| ~200k | 199,980 |     199,914 / 66 |       134 |   385.8 |           1.309 |              358.5 |     334 / 842 |     29,195 | PASS integrity; 199,980/199,980 accounted | **PASS adjacent-only; not proven nationally** |

The authoritative 50k → 100k normalized growth is:

```text
(0.679 / 0.129) / (100000 / 50000) = 2.63
```

which exceeds the unchanged `perRecordGrowthVsSizeMax = 1.0` gate. The
100k → ~200k adjacent ratio is below that ceiling, but it cannot erase the
failed lower transition. Therefore the largest continuous proven safe stage is
50k, not 100k or 200k.

### Database lane and remaining limitations

The repository’s existing CI lane was audited. It reuses Supabase CLI,
PostgreSQL/PostGIS, pgTAP, `supabase/scale/plans.sql`, and
`supabase/scale/benchmark.sql`, but it requires the local Supabase stack and
Docker. Docker is not installed in this environment. No hosted Supabase
credentials, production data, remote schema change, or paid infrastructure was
used. The result is explicitly **`EPHEMERAL_DATABASE_LANE_DEFERRED`**; no
national query-latency claim is made for `coverage_for_viewport`, map clusters,
map places, search, category, period, or count queries.

The full approximately 401,539-record national source was **NOT RUN**. No
publication, canonical import, production coverage change, description
retrieval, or hosted database write occurred.

### Recommendation for Batch 16

Keep the locality-page design as the candidate-access foundation, but do not
authorize national publication. Batch 16 should isolate the remaining
50k→100k matcher-work growth with a separate bounded matcher-work benchmark,
then address that bottleneck without changing matching semantics or weakening
the growth gate. It should also run the already-defined ephemeral PostGIS
query lane in CI/Docker and record the same representative national viewport,
search, category, period, and count metrics before any owner-authorized
publication decision.

## Batch 16 — working-set threshold diagnosis and matcher hot-path remediation

Batch 16 is stacked directly on Batch 15 at `51c09ee2bc8975d3efe7529ac0e28dc6a01ec911`. The national capture and its established ordering were unchanged. The extended ladder prefix was used for the fixed ~100k experiment; the legacy 99,990-record prefix remains separately identified by SHA-256 `8097257c5ad063e1003327d5effeedfdeddd5ddcf23b563242a97e7909838b26`.

### Starting state and hypothesis

**MEASURED:** Batch 15 passed 25k and 50k, failed the 50k → ~100k normalized growth gate at `2.63`, and measured 65,536 canonical payload records as the default bounded working set. The Batch 16 hypothesis was that crossing that limit caused a page-cache/residency cliff.

**MEASURED:** Five fresh Node processes ran the identical `buildNationalTier(100000)` prefix with identical page size, matcher, explicit GC, sampled hot-path timing, and cache limits. The matrix was diagnostic only; no production default was selected from it.

| Canonical cache limit | rec/s | match ms/record | comparisons/record | µs/comparison | page misses / reloads |    bytes read | records decoded | heap / RSS MB (sampled peak heap) |
| --------------------: | ----: | --------------: | -----------------: | ------------: | --------------------: | ------------: | --------------: | --------------------------------: |
|                32,768 | 908.6 |           0.522 |              204.6 |         2.551 |       10,958 / 10,958 | 1,045,252,272 |       2,281,830 |                   382 / 819 (560) |
|                50,000 | 940.1 |           0.542 |              204.6 |         2.649 |         5,688 / 5,688 |   534,032,235 |       1,166,527 |                   261 / 833 (553) |
|                65,536 | 969.2 |           0.539 |              204.6 |         2.634 |         3,242 / 3,242 |   289,208,479 |         632,150 |                   549 / 862 (666) |
|                96,000 | 992.3 |           0.541 |              204.6 |         2.644 |         1,093 / 1,093 |    69,102,082 |         151,124 |                   573 / 800 (592) |
|               131,072 | 992.2 |           0.541 |              204.6 |         2.644 |             439 / 439 |       228,295 |             500 |                   586 / 809 (644) |

**WORKING_SET_THRESHOLD_CLASSIFICATION = WORKING_SET_THRESHOLD_PARTIAL**

**INFERRED:** The working-set limit is a material contributor to candidate page resolution: page reloads fell 25× and payload-resolution time fell from about 19.96 s at 32,768 to 5.20 s at 131,072. It does not explain a matcher-only discontinuity: shortlist percentiles and comparisons/record were identical at every limit, and matcher-only time stayed within `0.522–0.542 ms/record`. The 65,536 crossing is therefore a real I/O/residency transition, but not the cause of the whole 50k → 100k growth failure.

**NOT MATERIAL:** Raising the cache without limit was not selected. The 131,072 run retained 99,621 decoded canonical payloads and did not materially reduce matcher-only time. Batch 15's bounded page design remains in place.

### Matcher work attribution

The 65,536 fixed-100k run compared 20,454,728 candidates. Timing was sampled once per 100 comparisons for deep per-comparison components; record-level components were timed directly. The table is intentionally **inclusive and non-additive**: scored-result allocation contains the scoring work, and the component timers are not a wall-clock partition.

| Component | Measured time / estimate | Share of 53.871 s matcher time | Evidence |
| --- | ---: | ---: |
| shortlist generation, including page access | 16.922 s | 31.4% of matcher-adjacent work | **MEASURED**, candidate-generation timer |
| payload/page resolution within that path | 9.213 s | 17.1% | **MEASURED**, page-store timer |
| shared identifier phase | 5.302 s | 9.8% | **MEASURED**, record-level timer |
| same-register veto | ~8.902 s sampled estimate | 16.5% | **MEASURED**, 1% comparison timing; 1,223,460 comparisons survived it |
| distance calculation | ~0.367 s sampled estimate | 0.7% | **MEASURED**, 416,083 comparisons survived distance |
| distinct-name veto | ~1.045 s sampled estimate | 1.9% | **MEASURED**, 416,110 comparisons reached name comparison |
| name similarity | ~6.224 s sampled estimate | 11.5% | **MEASURED**, 415,548 comparisons reached full scoring |
| type/postcode/town scoring and conflicts | ~1.282 s sampled estimate | 2.4% | **MEASURED** |
| scored-result allocation/map | 45.860 s inclusive | 85.1% | **MEASURED**, includes nested score work |
| filtering | 0.109 s | 0.2% | **MEASURED** |
| sorting / best-candidate selection | 0.092 s | 0.2% | **MEASURED**, full sort retained |
| outcome construction | 0.102 s | 0.2% | **MEASURED** |

The shortlist distribution was stable across the cache matrix: p50 `136`, p90 `394`, p95 `544`, p99 `1,651`, maximum `2,944`; 342 rows had no candidate, 326 had one, and 99,288 had two or more. This identifies both shortlist density and matcher CPU as contributors, with page residency affecting the surrounding candidate-resolution path.

**MEASURED geography comparison:** using deterministic latitude/longitude envelopes for the named OS-cell regimes, TQ/London had 7,246 rows, `702.47` mean shortlist, and `1.4831 ms/record`; ST/Bristol-Bath had 4,608 rows, `278.69` and `0.6525 ms/record`; the sparser outside-dense-envelopes group had 28,425 rows, `157.87` and `0.4855 ms/record`. This is a density effect, not a cache-limit effect.

### Remediation

**MEASURED:** immutable canonical name preparation was a material repeated cost. Before preparation, the 65,536 run recorded sampled name-distinctness and name-similarity times of approximately `55.4 ms` and `139.3 ms`; after preparation they were `10.5 ms` and `62.2 ms` over the same sampled workload. The exact normalization, tokenisation, containment, generic-name rules, distinct-name rules, and similarity algorithm are unchanged.

**IMPLEMENTED:**

- canonical names are prepared once per canonical object and retained in a bounded 8,192-entry LRU derived representation;
- candidate names are prepared once per source row;
- the derived cache uses weak canonical keys plus explicit LRU eviction, so it cannot retain the national payload indefinitely;
- the matcher now carries an internal register/distance/name veto reason to the existing benchmark counters instead of recomputing the same-register veto after `scoreAgainst` already performed it;
- optional matcher profiling records lightweight counters on normal runs and sampled deep timings only in the diagnostic harness.

**NOT MATERIAL:** Full sorting was measured before changing it. The full sort timer was about `97 ms` before the experiment and `92 ms` after the name-preparation run; no top-two replacement was retained. Stable insertion-order sorting therefore remains the semantic reference.

**NOT IMPLEMENTED:** The global exact-identifier index remains global and unchanged. No exact identifier was made geographically local, and no combined-pass shortcut was introduced: the existing store already supplies identifier candidates, while the matcher’s visible two-pass contract protects exact-ID precedence and distant matches. Same-register safeguards and name-disagreement review remain unchanged.

### Equivalence evidence

**MEASURED:** The focused matcher suite passed 21/21 tests. The machine-checked exhaustive-versus-bounded 5,000-record equivalence run produced identical digest `b91e746c25ba2545...`, zero decision differences, identical outcome summary (`NEW_CANONICAL 4,971`, `MATCH_REVIEW 18`, `MATCH_CONFIDENT 4`, `CONFLICT_REVIEW 4`), and 97.45% candidate pruning. The exact decision digest is written by `scale-equivalence-5000.json`; only its prefix is shown here for readability.

**INFERRED:** Because the derived representation is only a memoized form of the existing name functions and the veto reason only replaces a duplicate counter check, matching semantics are unchanged. The focused tests and exhaustive oracle provide the machine gate; national outcomes remained stable at 100k (`99,956 valid`, `44 rejected`, `37 conflicts`) and 199,980 (`199,914 valid`, `66 rejected`, `134 conflicts`).

### Final fresh-process national ladder

Each stage below was run in its own Node process with `--expose-gc`; 199,980 is the complete available ~200k capture. The `classification` column is the authoritative adjacent-stage result, not the isolated `--only` process's local result.

| Stage | Records |   rec/s | match ms/record | comparisons/record | µs/comparison | shortlist p50/p95/p99/max | heap / RSS MB (peak heap) | physical reads |    bytes read |   decoded | integrity       | classification                                        |
| ----: | ------: | ------: | --------------: | -----------------: | ------------: | ------------------------- | ------------------------: | -------------: | ------------: | --------: | --------------- | ----------------------------------------------------- |
|   25k |  25,000 | 1,944.3 |           0.170 |              113.1 |         1.503 | 75 / 339 / 515 / 913      |           181 / 486 (572) |            161 |        88,987 |       196 | 25,000/25,000   | PASS                                                  |
|   50k |  50,000 | 1,733.3 |           0.225 |              133.7 |         1.684 | 100 / 375 / 553 / 935     |           197 / 451 (575) |            253 |       132,702 |       291 | 50,000/50,000   | PASS                                                  |
| ~100k | 100,000 | 1,036.2 |           0.506 |              204.6 |         2.473 | 136 / 544 / 1,651 / 2,944 |           445 / 838 (624) |          3,242 |   289,208,479 |   632,150 | 100,000/100,000 | FAIL_PERFORMANCE adjacent gate                        |
| ~200k | 199,980 |   578.4 |           0.971 |              358.5 |         2.708 | 231 / 873 / 3,934 / 6,090 |     1,097 / 1,320 (1,097) |         29,195 | 3,073,918,335 | 6,710,017 | 199,980/199,980 | PASS adjacent-only; NOT PROVEN past failed transition |

The unchanged normalized-growth calculations are:

```text
(0.225 / 0.170) / (50000 / 25000) = 0.662  PASS
(0.506 / 0.225) / (100000 / 50000) = 1.124  FAIL (> 1.0)
(0.971 / 0.506) / (199980 / 100000) = 0.960  PASS adjacent-only
```

The low absolute times and the passing 100k/200k isolated gates do not erase the failed 50k → 100k transition.

**MAXIMUM_PROVEN_SAFE_SCALE = PROVEN_SAFE_TO_50K**

**NATIONAL_EXPANSION_CLASSIFICATION = REMEDIATION_INSUFFICIENT**

**EPHEMERAL_DATABASE_LANE = DEFERRED** — the repository's existing local Supabase/pgTAP lane still requires Docker, which is unavailable in this environment. No hosted database, production credential, or hosted Supabase write was used.

**NATIONAL_PUBLICATION_PERFORMED = NO**

### Known limitations and Batch 17 recommendation

**NOT RUN:** full ~401,539-record capture; hosted publication; Historic England descriptions; production deployment; hosted Supabase writes.

**MEASURED validation note:** direct ingestion and web TypeScript checks passed; ingestion, web, and package-scoped Vitest suites passed. The repository workflow validator's first invocation could not resolve its existing undeclared `js-yaml` runtime dependency, so the same validator logic was rerun against the already-installed package path and all four workflows parsed successfully. The pnpm 11 wrapper's known missing `@types/node` workspace link recurred; `pnpm-lock.yaml` was restored and direct compiler checks were used.

**NOT PROVEN:** continuous safe scale past 50k. The 200k result is useful diagnostic evidence only because the 100k transition failed the unchanged growth gate.

**INFERRED:** The strongest remaining measured bottleneck is dense-region shortlist/matcher work after page resolution: TQ/London's shortlist is 4.45× the sparse-group mean and the 50k → 100k normalized matcher growth remains above 1.0 despite name preparation and duplicate-veto removal.

Batch 17 should run one narrowly scoped density-aware matcher remediation experiment: reduce repeated candidate comparisons inside dense geographic cells while proving exact insertion-order, global-identifier, veto, conflict, and decision-digest equivalence. It should not increase the cache without a bounded-memory model, weaken the growth gate, or authorize national publication.

## Batch 17 — exact-radius candidate pruning and national scale re-measurement

Batch 17 is stacked directly on Batch 16 at `8a25a0fbd18b567b0a4177280c39e730061d37f7`. The national capture, source ordering, page size, cache limit, matcher thresholds, scoring, name logic, and governance were unchanged.

### Hypothesis and implementation

**MEASURED:** Batch 16 identified coarse 0.05-degree spatial cells as a safe superset: records in the selected cells could still be more than 5 km away, after which the matcher discarded them. The fixed-100k cell-superset mean shortlist was `204.68`, with TQ/London at `702.47`.

**INFERRED:** A non-identifier candidate that is beyond `THRESHOLDS.maxPlausibleDistanceMeters` cannot affect identity, scoring, runner-up ambiguity, conflicts, or insertion-order behavior because the matcher already returns `null` for it. The same radius therefore can be applied before payload hydration.

**IMPLEMENTED:** The coarse cell lookup remains unchanged. Its integer pointer results now receive the same `distanceMeters()` calculation used by the matcher before canonical payload hydration. Only surviving spatial pointers are hydrated. Global external-identifier and designation-reference lookup remains geographically unbounded, is unioned afterward, deduplicated, and sorted by original insertion sequence.

The disk-backed pointer adds only compact `lat` and `lng` numeric metadata: approximately 16 bytes of numeric payload per pointer before ordinary JavaScript object overhead. No duplicate full location object is stored and no cache limit changed.

### Exact-radius equivalence

**MEASURED:** The 5,000-record harness now runs three strategies: exhaustive oracle, pre-Batch-17 cell superset, and exact-radius bounded. All three produced digest prefix `b91e746c25ba2545`, zero decision differences, and the same outcome summary:

```text
NEW_CANONICAL: 4,971
MATCH_REVIEW: 18
MATCH_CONFIDENT: 4
CONFLICT_REVIEW: 4
```

Candidate pairs were reduced from `12,463,987` exhaustive pairs to `145,331` exact-radius pairs, with `98.83%` pruning. The existing global identifier tests and new focused cases cover near-boundary candidates, the exact-boundary decision, ordinary distant pruning, distant external identifiers, distant designation references, duplicate discovery, insertion ordering, and chunked pre-hydration rejection.

### Fixed-100k pruning evidence

Both runs used a fresh process, a 65,536-record cache limit, and the same fixed-100k capture. The non-profiled before/after results were:

| Region            | Mean shortlist before → after | p50 before → after | p95 before → after | p99 before → after | max before → after | comparisons/record before → after | exact-radius pruning |
| ----------------- | ----------------------------: | -----------------: | -----------------: | -----------------: | -----------------: | --------------------------------: | -------------------: |
| Overall           |                204.68 → 77.45 |           136 → 44 |          544 → 227 |        1,651 → 773 |      2,944 → 1,813 |                      204.6 → 77.4 |              62.159% |
| TQ / London       |               702.47 → 296.38 |          331 → 101 |      2,325 → 1,279 |      2,770 → 1,572 |      2,944 → 1,813 |                                 — |              57.808% |
| ST / Bristol-Bath |                278.69 → 94.34 |           233 → 69 |          663 → 291 |          910 → 398 |        1,044 → 447 |                                 — |              66.149% |
| Sparse comparison |                157.87 → 56.72 |           136 → 43 |          383 → 162 |          524 → 245 |          728 → 420 |                                 — |              64.072% |

**MEASURED:** Overall, `12,716,854` of `20,458,498` cell-superset candidates were rejected by the exact radius. TQ/London retained `2,147,593` of `5,090,085` candidates, answering the primary density question: approximately `296.38` of its prior `702.47` mean candidates were actually within 5 km.

**MEASURED:** At fixed 100k, page misses fell from `3,242` to `2,486`, bytes read from `289,208,479` to `212,596,194`, records decoded from `632,150` to `464,742`, and payload lookups from `20,458,498` to `7,741,644`. `IDENTIFIER_RESCUED_BEYOND_RADIUS = 0` in this national sample because its identifier candidates were not distant; focused tests prove the global rescue path independently.

### Authoritative fresh-process ladder

| Stage | Records |   rec/s | ms/record | comparisons/record | µs/comparison | cell superset / exact / rejected per record | heap / RSS MB |  reads |    bytes read |   decoded | integrity       | classification              |
| ----: | ------: | ------: | --------: | -----------------: | ------------: | ------------------------------------------: | ------------: | -----: | ------------: | --------: | --------------- | --------------------------- |
|   25k |  25,000 | 2,348.7 |     0.096 |               46.6 |         2.060 |                         113.1 / 46.6 / 66.5 |     135 / 428 |    158 |        93,535 |       206 | 25,000/25,000   | PASS                        |
|   50k |  50,000 | 2,175.7 |     0.114 |               54.1 |         2.107 |                         133.7 / 54.1 / 79.6 |     175 / 449 |    252 |       143,001 |       314 | 50,000/50,000   | PASS                        |
| ~100k | 100,000 | 1,488.4 |     0.268 |               77.4 |         3.463 |                        204.7 / 77.5 / 127.2 |     458 / 808 |  2,486 |   212,596,194 |   464,742 | 100,000/100,000 | FAIL_PERFORMANCE transition |
| ~200k | 199,980 |   821.3 |     0.538 |              137.8 |         3.904 |                       358.6 / 137.8 / 220.8 |   426 / 1,302 | 23,878 | 2,494,735,931 | 5,444,491 | 199,980/199,980 | adjacent-only diagnostic    |

The unchanged normalized-growth calculations, using the recorded ladder values, are:

```text
(0.114 / 0.096) / (50000 / 25000) = 0.593750  PASS
(0.268 / 0.114) / (100000 / 50000) = 1.175439  FAIL (> 1.0)
(0.538 / 0.268) / (199980 / 100000) = 1.003831  FAIL using recorded values; NOT PROVEN
```

**INFERRED:** Exact-radius pruning removes the dominant coarse-cell false-positive work and materially improves absolute throughput, but it does not clear the required 50k → 100k architectural transition. No second optimization was added.

**MAXIMUM_PROVEN_SAFE_SCALE = PROVEN_SAFE_TO_50K**

**NATIONAL_EXPANSION_CLASSIFICATION = REMEDIATION_INSUFFICIENT**

**EPHEMERAL_DATABASE_LANE = DEFERRED** — Docker remains unavailable; no local database lane was run.

**NATIONAL_PUBLICATION_PERFORMED = NO**

### Limitations and Batch 18 recommendation

**NOT RUN:** full ~401,539-record capture, database lane, hosted Supabase, national publication, Historic England description retrieval, and production deployment.

**NOT PROVEN:** continuous safe scale beyond 50k. The ~200k result is diagnostic only because the 50k → 100k transition failed the unchanged gate.

Batch 18 should investigate exactly one bounded remaining dense-region work source, selected from per-region candidate/matcher measurements, with exhaustive decision-digest equivalence and no cache-limit increase. It must not move additional matcher vetoes into candidate generation until that experiment is separately justified.

## Batch 19A — national checkpoint composition and workload phase audit

Batch 19A is diagnostic-only and is stacked directly on Batch 18 at
`1048d3ccc5120999a62f24b9f12dff042ffd73ac`. It does not change matcher
semantics, candidate vetoes, cache limits, scale gates, canonical data, hosted
Supabase, or publication. It reads the existing 199,980-record persisted
national order; it does not recapture the source or rerun the authoritative
performance ladder.

### Checkpoint composition

**MEASURED:** The actual ordered prefixes, rather than the manifest's final
composition, have the following layer/designation mix:

| Checkpoint | Listed building | Scheduled monument | Park/garden | Battlefield | World Heritage | Protected wreck |
| ---------: | --------------: | -----------------: | ----------: | ----------: | -------------: | ---------------: |
| 25,000     | 24,989 (99.956%) | 0 (0%)            | 0 (0%)     | 0 (0%)     | 0 (0%)        | 11 (0.044%)    |
| 50,000     | 49,972 (99.944%) | 17 (0.034%)       | 0 (0%)     | 0 (0%)     | 0 (0%)        | 11 (0.022%)    |
| 100,000    | 94,537 (94.537%) | 4,994 (4.994%)    | 435 (0.435%)| 10 (0.01%)| 5 (0.005%)    | 19 (0.019%)    |
| 199,980    | 189,067 (94.543%)| 9,989 (4.995%)    | 865 (0.4325%)| 21 (0.0105%)| 12 (0.006%) | 26 (0.013%) |

The 100km-cell distribution is also measured from the same ordered prefix.
The largest cells at 25k / 50k / 100k / 199,980 are respectively:

| Checkpoint | TQ | SP | SU | TL | ST |
| ---------: | -: | -: | -: | -: | -: |
| 25,000     | 3,125 (12.50%) | 2,225 (8.90%) | 2,225 (8.90%) | 2,225 (8.90%) | 2,225 (8.90%) |
| 50,000     | 6,250 (12.50%) | 4,450 (8.90%) | 4,450 (8.90%) | 4,450 (8.90%) | 4,450 (8.90%) |
| 100,000    | 12,499 (12.499%) | 8,927 (8.927%) | 8,926 (8.926%) | 8,906 (8.906%) | 8,868 (8.868%) |
| 199,980    | 24,994 (12.4987%) | 17,857 (8.9294%) | 17,850 (8.9259%) | 17,814 (8.9079%) | 17,736 (8.8699%) |

**MEASURED:** Every prefix is one source (`historic-england-nhle`). The
25k and 50k prefixes have no repeated source record IDs across layers; the
199,980 prefix has 199,930 unique source record IDs and 49 IDs represented in
more than one layer. The complete per-cell maps, percentages, source identity
counts, and raw aggregate output are in
`ingestion/national-workload-audit.json`.

### First appearance and transition

**MEASURED:** First ordered appearances are:

| Layer / designation | First ordered index | First checkpoint present | 25k | 50k | 100k | 199,980 |
| ------------------- | ------------------: | ----------------------- | --: | ---: | ----: | ------: |
| Listed Building points / `listed_building` | 1 | 25k | 24,989 | 49,972 | 94,537 | 189,067 |
| Protected Wreck Sites / `protected_wreck` | 1,003 | 25k | 11 | 11 | 19 | 26 |
| Scheduled Monuments / `scheduled_monument` | 33,075 | 50k | 0 | 17 | 4,994 | 9,989 |
| Battlefields / `registered_battlefield` | 85,134 | 100k | 0 | 0 | 10 | 21 |
| Parks and Gardens / `registered_park_garden` | 97,082 | 100k | 0 | 0 | 435 | 865 |
| World Heritage Sites / `world_heritage_site` | 98,899 | 100k | 0 | 0 | 5 | 12 |

The records immediately around index 50,000 are still listed buildings plus
the already-present wreck layer. The first scheduled monuments begin at
index 33,075 but remain only 17 records by 50k. The park, battlefield, and WHS
layers first enter the persisted order at 97,082, 85,134, and 98,899. Thus the
100k prefix is the first checkpoint containing substantial mixed-register
interaction, not merely a larger copy of the 50k workload.

### Surviving candidate pair matrix

**MEASURED:** The matrix below counts final post-register-pruning candidate
pairs as `candidate designation → existing canonical designation`. A 50k
prefix has 345 pairs in total, or `0.0069` per source record, which rounds to
the authoritative ladder's reported `0.0` candidates/record. The only 50k
class is scheduled monument → listed building.

| Candidate → existing | 50k | 100k | 199,980 |
| -------------------- | ---: | ----: | ------: |
| scheduled monument → listed building | 345 | 360,105 | 917,736 |
| scheduled monument → scheduled monument | 0 | 19 | 29 |
| scheduled monument → park/garden | 0 | 3 | 806 |
| scheduled monument → battlefield | 0 | 0 | 16 |
| scheduled monument → WHS | 0 | 0 | 23 |
| listed building → scheduled monument | 0 | 311 | 349,728 |
| listed building → park/garden | 0 | 0 | 44,768 |
| listed building → battlefield | 0 | 0 | 426 |
| listed building → WHS | 0 | 0 | 439 |
| park/garden → listed building | 0 | 52,675 | 180,722 |
| park/garden → scheduled monument | 0 | 1,443 | 4,205 |
| park/garden → park/garden | 0 | 8 | 15 |
| park/garden → battlefield | 0 | 0 | 2 |
| battlefield → listed building | 0 | 746 | 2,521 |
| battlefield → scheduled monument | 0 | 35 | 97 |
| battlefield → park/garden | 0 | 2 | 5 |
| battlefield → battlefield | 0 | 0 | 1 |
| battlefield → WHS | 0 | 0 | 1 |
| WHS → listed building | 0 | 1,767 | 7,137 |
| WHS → scheduled monument | 0 | 59 | 154 |
| WHS → park/garden | 0 | 6 | 22 |
| WHS → WHS | 0 | 0 | 2 |
| **Total final pairs** | **345** | **417,179** | **1,508,855** |

**INFERRED:** The 100k workload is dominated by mixed-designation pairs,
especially scheduled monument → listed building, park/garden → listed
building, and WHS → listed building. These pairs survive the existing
same-register veto because they are different NHLE designation classes; they
are therefore a new class of matcher work, not evidence that the old listed-
building-only workload became proportionally slower.

### Workload onset curve

**MEASURED:** The diagnostic path used the same register-pruned candidate
generation and canonical insertion behavior, but recorded only accounting
metrics. It did not assign performance classifications.

| Prefix | Final candidates | Candidates/record | Exact-radius candidates | Register-pruned candidates | Conflicts |
| -----: | ---------------: | ----------------: | ----------------------: | -------------------------: | --------: |
| 25k | 0 | 0.0000 | 1,163,464 | 1,163,464 | 0 |
| 40k | 142 | 0.0036 | 1,980,077 | 1,979,935 | 0 |
| 50k | 345 | 0.0069 | 2,705,460 | 2,705,115 | 0 |
| 60k | 976 | 0.0163 | 3,744,361 | 3,743,385 | 0 |
| 70k | 1,818 | 0.0260 | 4,933,297 | 4,931,479 | 0 |
| 80k | 2,395 | 0.0299 | 5,654,572 | 5,652,177 | 0 |
| 90k | 12,033 | 0.1337 | 6,603,614 | 6,591,581 | 0 |
| 100k | 417,179 | 4.1718 | 7,741,644 | 7,324,465 | 37 |
| 125k | 527,730 | 4.2218 | 10,307,575 | 9,779,845 | 50 |
| 150k | 617,744 | 4.1183 | 13,608,393 | 12,990,649 | 62 |
| 175k | 720,774 | 4.1187 | 19,044,942 | 18,324,168 | 67 |
| 199,980 | 1,508,855 | 7.5450 | 27,552,345 | 26,043,490 | 134 |

The answer to the discontinuity is therefore measured composition, not a
new scale classification: 50k is effectively all listed-building work, with
only 345 surviving pairs across 50,000 rows; 100k contains 417,179 surviving
mixed-designation pairs, or 4.1718 per row. The 90k→100k onset is abrupt in
the preserved ordering and coincides with the first substantial presence of
the non-dominant statutory layers.

**WORKLOAD_COMPOSITION_CLASSIFICATION = WORKLOAD_COMPOSITION_PHASE_CHANGE_CONFIRMED**

This confirms B — the appearance of new classes of work at larger prefixes.
It does not prove A — scalability of equivalent work — because no
composition-controlled performance ladder was run. The official gate and
scale result are intentionally unchanged:

**COMPOSITION_CONTROLLED_LADDER = DESIGNED** — a deterministic secondary
sampler was implemented and tested. It stratifies by OS 100km cell × NHLE
layer, allocates largest-remainder quotas from the full persisted capture,
retains within-stratum persisted order, and never overwrites the authoritative
order. It was **NOT RUN** because it would require another multi-stage
matcher run; no controlled scalability claim is made.

**NOT PROVEN:** equivalent-work scalability beyond 50k, continuous national
safety beyond 50k, or any inference to the ~401,539-record source.

**NOT RUN:** hosted Supabase, Docker/local database lane, national
publication, full source capture, Historic England description retrieval, and
the composition-controlled performance ladder.

**MAXIMUM_PROVEN_SAFE_SCALE = PROVEN_SAFE_TO_50K**

**NATIONAL_EXPANSION_CLASSIFICATION = REMEDIATION_INSUFFICIENT**

**NATIONAL_PUBLICATION_PERFORMED = NO**

### Batch 19A recommendation

The next action should be one owner-reviewed governance batch to **run the
composition-controlled benchmark** using the deterministic sampler. It must
keep the existing 50k/100k/200k gate unchanged and report separately whether
equivalent mixed-designation work scales, without treating a passing
composition-controlled lane as publication authorization.

## Batch 18 — same-register pre-hydration pruning and national re-measurement

Batch 18 is stacked directly on Batch 17 at
`b50e4465fac0257cb8958b17b37010b20e36e587`. The national capture, source
ordering, 65,536-record cache bound, page size, radius threshold, scoring,
name logic, governance and publication state were unchanged.

### Register-veto diagnosis

**MEASURED:** The fixed 100k exact-radius path was first run without register
pruning. The existing same-register matcher veto accounted for the following
shortlist work:

| Region            | Exact-radius candidates | Same-register veto candidates | Veto ratio | Same-source same-record | Same-source different designation | Cross-source | Missing source identity | Surviving register |
| ----------------- | ----------------------: | ----------------------------: | ---------: | ----------------------: | --------------------------------: | -----------: | ----------------------: | -----------------: |
| Overall           |               7,741,644 |                     7,324,465 |    94.611% |                      27 |                           417,152 |            0 |                       0 |            417,179 |
| TQ / London       |               2,147,593 |                     2,048,121 |    95.368% |                       1 |                            99,471 |            0 |                       0 |             99,472 |
| ST / Bristol-Bath |                 434,710 |                       419,033 |    96.394% |                       2 |                            15,675 |            0 |                       0 |             15,677 |
| Sparse comparison |               1,612,287 |                     1,492,880 |    92.594% |                      10 |                           119,397 |            0 |                       0 |            119,407 |

`REGISTER_VETO_RATIO_OF_EXACT_RADIUS = 0.946112`

`REGISTER_VETO_RATIO_OF_MATCHER_COMPARISONS = 0.946112`

**REGISTER_PREPRUNING_CLASSIFICATION = REGISTER_PREPRUNING_MATERIAL**

The same-register population is therefore not a marginal optimization target:
it is the dominant remaining exact-radius comparison class. **INFERRED:**
because the matcher already rejects these pairs unconditionally before scoring,
removing them from candidate generation cannot affect best match, runner-up,
ambiguity, conflicts, or insertion-order results.

### Implementation

**IMPLEMENTED:** The existing predicate is now defined once in
`ingestion/matching/source-relation.ts` as `sameRegisterDifferentEntries`, with
`classifyRegisterCandidate` providing the diagnostic classification. Both the
matcher's identifier and scored passes call the shared predicate. Both
`CandidateIndex` and `ChunkedCandidateIndex` use the same predicate.

The disk-backed path evaluates the predicate from compact pointer metadata
(`sourceId`, `sourceRecordId`, designation identities, and existing page/index
metadata) after exact-radius and identifier union but before
`this.load(sequence).canonical`. Same-register rows are therefore rejected
before page hydration, JSON decode, name preparation, score allocation, and
matcher invocation. The in-memory path applies the same membership filter,
although its payload is already resident.

Global identifiers do not rescue same-register-different-entry rows: this is
the existing matcher behavior for both exact external identifiers and
designation references. Same-source same-record multipart geometry remains;
same-source rows with disjoint designations remain; cross-source rows remain;
missing source identity remains unpruned. The final sequence is still sorted
by canonical insertion sequence.

The old Batch 17 exact-radius mode remains available as `bounded` for causal
comparison. Production and national ladder paths use `register-pruned`.
No cache limit or compact metadata storage model was enlarged.

### Four-way equivalence

**MEASURED:** The 5,000-record gate compared exhaustive, cell-superset,
exact-radius, and exact-radius-plus-register-pruning modes. All produced digest
prefix `b91e746c25ba2545`, with zero decision differences. The outcome summary
remained:

```text
NEW_CANONICAL: 4,971
MATCH_REVIEW: 18
MATCH_CONFIDENT: 4
CONFLICT_REVIEW: 4
REQUIRES_REVIEW: 22
```

The gate covered boundary-radius candidates, same-register external-ID and
designation-reference candidates, distant cross-source identifiers,
same-record multipart rows, disjoint designations, duplicate discovery,
insertion ordering, and surviving conflict outcomes.

### Fixed-100k pruning effect

Both runs below are fresh processes over the same fixed 100k capture with the
same 65,536-record cache limit. The before path is Batch 17 exact-radius
generation; the after path is register-pruned generation.

| Region            | Mean shortlist before → after |     p50 |     p90 |       p95 |         p99 |           max |         Comparisons/record | Matcher ms/record | µs/comparison |
| ----------------- | ----------------------------: | ------: | ------: | --------: | ----------: | ------------: | -------------------------: | ----------------: | ------------: |
| Overall           |                  77.45 → 4.17 |  44 → 0 | 150 → 0 |   227 → 2 |   773 → 108 | 1,813 → 1,810 |                 77.4 → 4.2 |     0.275 → 0.146 |  3.55 → 34.76 |
| TQ / London       |                296.38 → 13.73 | 101 → 0 | 986 → 0 | 1,279 → 0 | 1,572 → 283 | 1,813 → 1,810 | **MEASURED via shortlist** |   0.8391 → 0.3842 |   **NOT RUN** |
| ST / Bristol-Bath |                  94.34 → 3.40 |  69 → 0 | 213 → 0 |   291 → 0 |   398 → 136 |     447 → 378 | **MEASURED via shortlist** |   0.2879 → 0.1343 |   **NOT RUN** |
| Sparse comparison |                  56.72 → 4.20 |  43 → 0 | 121 → 0 |  162 → 18 |   245 → 116 |     420 → 417 | **MEASURED via shortlist** |   0.2430 → 0.1481 |   **NOT RUN** |

The per-region comparison/record column is marked **NOT RUN** because the
existing geographic diagnostic records shortlist/candidate counts rather than
separate matcher comparison totals; the overall count is exact and equals the
final candidate-pair count.

**MEASURED:** Overall register pruning removed `7,324,465` of the
`7,741,644` exact-radius candidate pairs. The final 100k path made `417,179`
payload lookups, versus `7,741,644` before pruning.

`REGISTER_VETO_CANDIDATES = 7,324,465`

`REGISTER_PREPRUNING_RATIO = 0.946112`

`TQ_REGISTER_PREPRUNING_RATIO = 0.953682`

`REGISTER_PRUNING_PAYLOAD_LOOKUPS_AVOIDED = 7,324,465`

`REGISTER_PRUNING_BYTES_AVOIDED = 69,828,249`

Physical page reads fell from `2,486` to `1,342`; physical bytes read fell
from `212,596,194` to `142,767,945`; decoded records fell from `464,742` to
`311,744`. The bounded working set remained below the full 99,621-record
canonical payload corpus: peak cached payload was `62,052` records against the
unchanged `65,536` limit.

**NOT MATERIAL:** No name, containment, type, postcode, scoring, conflict,
ambiguity, identifier-pass, or cache-capacity optimization was added. The
national sample had zero identifier-only candidates and zero identifier rescues
beyond radius; the cross-source rescue behavior remains covered by focused
fixtures rather than inferred from the single-source national corpus.

### Final fresh-process national ladder

Each stage was run in a fresh Node process against the established capture;
`199,980` is the exact available ~200k stage. The isolated `--only` command
reports a local PASS when it has no preceding stage; the table below applies
the unchanged adjacent growth gate across the separately captured stages.

| Stage | Records |   rec/s | ms/record | Comparisons/record | µs/comparison | Radius candidates/record | Register-pruned/record | Final matcher candidates/record | Heap/RSS MB | Reads | Integrity       | Classification                 |
| ----: | ------: | ------: | --------: | -----------------: | ------------: | -----------------------: | ---------------------: | ------------------------------: | ----------: | ----: | --------------- | ------------------------------ |
|   25k |  25,000 | 2,423.4 |     0.033 |                0.0 |       **N/A** |                     46.6 |                   46.6 |                             0.0 |   472 / 646 |     0 | 25,000/25,000   | PASS                           |
|   50k |  50,000 | 2,754.7 |     0.030 |                0.0 |       **N/A** |                     54.1 |                   54.1 |                             0.0 |   537 / 684 |     1 | 50,000/50,000   | PASS                           |
| ~100k | 100,000 | 1,996.3 |     0.148 |                4.2 |         35.24 |                     77.5 |                   73.3 |                             4.2 |   353 / 620 | 1,342 | 100,000/100,000 | PASS isolated; FAIL adjacent   |
| ~200k | 199,980 | 1,442.6 |     0.244 |                7.5 |         32.53 |                    137.8 |                  130.3 |                             7.5 | 562 / 1,256 | 4,368 | 199,980/199,980 | PASS adjacent-only; NOT PROVEN |

The unchanged normalized-growth calculations are:

```text
(0.030 / 0.033) / (50000 / 25000) = 0.454545  PASS
(0.148 / 0.030) / (100000 / 50000) = 2.466667  FAIL (> 1.0)
(0.244 / 0.148) / (199980 / 100000) = 0.824407  PASS adjacent-only
```

The 100k stage now passes its isolated absolute/resource checks and the
100k→~200k transition is sub-linear, but the failed 50k→100k transition still
prevents continuous proof beyond 50k. The zero-comparison 25k/50k stages are a
measured consequence of the single-source NHLE corpus: all exact-radius
different-record candidates at those checkpoints are rejected by the existing
register rule.

**MAXIMUM_PROVEN_SAFE_SCALE = PROVEN_SAFE_TO_50K**

**NATIONAL_EXPANSION_CLASSIFICATION = REMEDIATION_INSUFFICIENT**

**EPHEMERAL_DATABASE_LANE = DEFERRED** — Docker was unavailable and was not
installed. The local Supabase/PostGIS/pgTAP lane was not run.

**NATIONAL_PUBLICATION_PERFORMED = NO**

### Limitations and Batch 19 recommendation

**NOT RUN:** full ~401,539-record capture, local database lane, hosted
Supabase, hosted writes, national publication, Historic England description
retrieval, and production deployment.

**NOT PROVEN:** continuous safe scale beyond 50k. The ~200k result cannot erase
the failed 50k→100k transition.

**INFERRED:** Same-register pruning removes the dominant measured comparison
class and substantially reduces payload work, but the remaining national gate
failure is now driven by the discontinuous transition from effectively zero
matcher comparisons at 50k to `4.2` final candidates/record at 100k, together
with fixed per-record matcher overhead. A Batch 19 experiment should isolate
that one remaining transition with bounded candidate-density accounting; it
must not add a second veto optimization, increase the cache, weaken the gate,
or authorize national publication.

## Batch 19B — composition-controlled national scale benchmark

Batch 19B is a secondary evidence lane stacked directly on Batch 19A at
`0f38567de1e1c34d9a4d9a75ce214d9bf2739d35`. It does not replace the
authoritative prefix ladder and does not alter matcher semantics, candidate
pruning, cache limits, thresholds, gates, canonical data, hosted Supabase, or
publication state.

### Controlled sampling

**CONTROLLED / MEASURED:** The existing 199,980-record capture was partitioned
by OS 100km cell × NHLE layer. Each controlled size received a
largest-remainder quota proportional to the full capture. Records within each
stratum retained their persisted order; strata were concatenated by stable key.
The authoritative order was never overwritten.

| Stage | Listed buildings | Scheduled monuments | Parks/gardens | Battlefields | WHS | Protected wrecks | Sample digest |
| ----: | ----------------: | ------------------: | ------------: | -----------: | ---: | ---------------: | ------------- |
| 25k | 23,638 — 94.552% | 1,251 — 5.004% | 107 — 0.428% | 1 — 0.004% | 0 — 0% | 3 — 0.012% | `7bef48b0753acbcd41bccba9b54ae28e3d4248b3ad11a1b8869a154a45a593b8` |
| 50k | 47,270 — 94.540% | 2,499 — 4.998% | 220 — 0.440% | 3 — 0.006% | 1 — 0.002% | 7 — 0.014% | `a850f335d94230baa7b55d6301452e133c18a75c78bd92fce605a8367ffc2759` |
| 100k | 94,547 — 94.547% | 5,002 — 5.002% | 428 — 0.428% | 6 — 0.006% | 4 — 0.004% | 13 — 0.013% | `73cbe02f6f60afc8ee54a38acae394fda09c488fcb21838c7bc724af3c9df95a` |
| 199,980 | 189,067 — 94.543% | 9,989 — 4.995% | 865 — 0.4325% | 21 — 0.0105% | 12 — 0.006% | 26 — 0.013% | `631100d50055eedeecae8c6bd8f40b894f067bde2c80f683902324ff6608e28c` |

The controlled layer proportions differ from the complete-capture target by
less than `0.01` percentage points at the small tiers. The OS-cell map is
included in `ingestion/controlled-national-scale.json`; TQ is 12.496%,
12.500%, 12.498%, and 12.4982% at the four stages respectively. Rare layers
are represented where largest-remainder rounding permits: WHS is absent at
25k but present at 50k and above.

**MEASURED:** Duplicate source-record accounting was preserved rather than
deduplicated by the sampler:

| Stage | Records | Unique source record IDs | IDs represented more than once |
| ----: | ------: | -----------------------: | -----------------------------: |
| 25k | 25,000 | 24,996 | 4 |
| 50k | 50,000 | 49,991 | 9 |
| 100k | 100,000 | 99,976 | 24 |
| 199,980 | 199,980 | 199,930 | 49 |

First and last stable references, plus the full cell percentages and digests,
are recorded in the aggregate evidence artifact.

### Controlled workload comparability

**CONTROLLED / MEASURED:** All four controlled tiers contain the mixed
designation classes that appear only at the larger authoritative prefixes.
Final candidate work rises with sample size rather than appearing as a
near-zero-to-large discontinuity:

| Stage | Exact-radius candidates/record | Register-pruned candidates/record | Final candidates/record | Conflicts |
| ----: | ----------------------------: | --------------------------------: | ----------------------: | --------: |
| 25k | 45.0092 | 44.4313 | 0.5779 | 4 |
| 50k | 52.5601 | 50.9527 | 1.6074 | 11 |
| 100k | 77.4349 | 73.2811 | 4.1538 | 38 |
| 199,980 | 138.1487 | 130.4179 | 7.7308 | 126 |

The complete candidate-designation × canonical-designation matrices are in
`ingestion/controlled-national-scale.json`. The dominant classes are
scheduled monument → listed building, park/garden → listed building, and
listed building → scheduled monument. For example, scheduled monument →
listed building contributes 11,990 pairs at 25k, 69,069 at 50k, 354,928 at
100k, and 1,275,642 at 199,980.

**CONTROLLED_WORKLOAD_COMPARABILITY = PASS**

The very rare battlefield and WHS classes have small integer counts at the
lower tiers, but the dominant mixed-designation workload is present from 25k.
This is sufficient for the controlled comparison; it is not a claim that each
rare class has statistically stable estimates at every size.

### Controlled performance ladder

Each stage ran in a fresh Node process through the ordinary ingestion,
exact-radius, register-pruned, disk-backed candidate, and matcher paths. The
canonical cache limit remained 65,536 records.

| Stage | Records | Valid/rejected | Conflicts | rec/s | Total ms/record | Matcher ms/record | Final candidates/record | Comparisons/record | Heap after GC / peak / RSS MB | Reads | Bytes read | Integrity |
| ----: | ------: | -------------: | --------: | ----: | --------------: | ----------------: | ----------------------: | -----------------: | ---------------------------: | ----: | ----------: | ---------: |
| 25k | 25,000 | 24,990 / 10 | 4 | 1,839.0 | 0.5438 | 0.065 | 0.5779 | 0.5767 | 67 / 291 / 344 | 126 | 8,664,123 | 25,000/25,000 |
| 50k | 50,000 | 49,980 / 20 | 11 | 1,656.1 | 0.6038 | 0.113 | 1.6074 | 1.6055 | 108 / 338 / 356 | 238 | 18,945,330 | 50,000/50,000 |
| 100k | 100,000 | 99,962 / 38 | 38 | 1,279.8 | 0.7814 | 0.223 | 4.1538 | 4.1481 | 189 / 432 / 416 | 428 | 39,721,877 | 100,000/100,000 |
| 199,980 | 199,980 | 199,914 / 66 | 126 | 1,148.4 | 0.8708 | 0.289 | 7.7308 | 7.7080 | 272 / 617 / 654 | 867 | 89,379,075 | 199,980/199,980 |

**MEASURED:** The controlled lane has no abrupt matcher-time threshold at
100k. Matcher time increases from `0.065` to `0.113` to `0.223` to `0.289`
ms/record while the mixed workload is present throughout.

### Normalized growth

The existing formula and threshold were used without modification:

```text
normalized_growth =
  (later matcher ms/record / earlier matcher ms/record)
  / (later records / earlier records)

perRecordGrowthVsSizeMax = 1.0
```

```text
(0.113 / 0.065) / (50000 / 25000) = 0.869231  PASS
(0.223 / 0.113) / (100000 / 50000) = 0.986726  PASS
(0.289 / 0.223) / (199980 / 100000) = 0.648047  PASS
```

**CONTROLLED_SCALE_CLASSIFICATION = EQUIVALENT_WORK_SCALES_TO_200K**

### Authoritative versus controlled

| Stage | Authoritative composition | Authoritative final candidates/record | Authoritative matcher ms/record | Controlled composition | Controlled final candidates/record | Controlled matcher ms/record |
| ----: | ------------------------- | ------------------------------------: | ------------------------------: | ---------------------- | ---------------------------------: | -----------------------------: |
| 25k | 99.956% listed; no scheduled/parks | 0.0 | 0.033 | 94.552% listed; 5.004% scheduled; 0.428% parks | 0.5779 | 0.065 |
| 50k | 99.944% listed; 0.034% scheduled | 0.0 | 0.030 | 94.540% listed; 4.998% scheduled; 0.440% parks | 1.6074 | 0.113 |
| 100k | 94.537% listed; 4.994% scheduled; 0.435% parks | 4.2 | 0.148 | 94.547% listed; 5.002% scheduled; 0.428% parks | 4.1538 | 0.223 |
| 199,980 | 94.543% listed; 4.995% scheduled; 0.4325% parks | 7.5 | 0.244 | 94.543% listed; 4.995% scheduled; 0.4325% parks | 7.7308 | 0.289 |

**INFERRED:** The authoritative 50k → 100k failure is absent when the
designation and geographic workload is controlled. The controlled lane passes
the same growth gate through 200k, while the historical prefix lane fails at
50k → 100k because its 50k stage has effectively no surviving mixed-register
matcher work.

This is evidence that the ingestion architecture scales under comparable
mixed-designation workload. It does not retroactively erase the authoritative
prefix gate, does not prove safety at the ~401,539-record national source, and
does not authorize publication.

**AUTHORITATIVE:**

```text
MAXIMUM_PROVEN_SAFE_SCALE = PROVEN_SAFE_TO_50K
NATIONAL_EXPANSION_CLASSIFICATION = REMEDIATION_INSUFFICIENT
```

**NOT RUN:** full ~401,539-record NHLE run, hosted Supabase, local database
lane, Docker installation, publication, and authoritative-ladder replacement.

**EPHEMERAL_DATABASE_LANE = DEFERRED** — Docker is unavailable.

**NATIONAL_PUBLICATION_PERFORMED = NO**

### Batch 20 recommendation

Batch 20 should conduct an owner-reviewed benchmark-contract and governance
review: decide whether the authoritative scale gate must remain a fixed-prefix
test, or whether a controlled-composition lane should be a formally recognized
secondary gate. No publication or gate change should occur implicitly from this
evidence.
