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
