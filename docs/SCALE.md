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
