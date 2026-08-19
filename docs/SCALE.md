# National scale — evidence and product implications

Batch 13 measured how far Whilom's architecture reaches beyond its 23k regional corpus, using the existing already-licensed Historic England source. This records the evidence and what it means for the next product batch. It does not build UI.

---

## The national source

Measured from the FeatureServer's own aggregate endpoints (`national:audit` → `national-source-audit.json`):

| | |
|---|---|
| National total | **401,539** records across 11 layers |
| Listed Building points | 379,685 (94.6%) |
| Scheduled Monuments | 20,001 |
| Parks, Battlefields, Wrecks, WHS | 1,853 |
| ListEntry range | 1021466 – 1497496 |
| Null geometry (dominant layer) | **0** |
| Occupied OS 100km cells | 27 |
| Densest cell | **TQ (London), 12.9%** |
| Next four | TL 9.1%, SP 9.1%, ST 9.0%, SU 8.8% |
| Currently ingested | ~23,315 (21,039 listed-building points in the regional envelope) |
| Candidate new records | **378,224 (17.2×)** |

The distribution matters more than the total: heritage is heavily concentrated, and the densest five cells hold ~49% of listed buildings. A national map is a density problem before it is a row-count problem.

---

## The scale ladder

`national:capture` builds a deterministic, geographically stratified 100k sample — per-cell quota proportional to national share, ListEntry-ascending within a cell, interleaved so every prefix carries the national mix. `national:ladder` runs the ordinary pipeline through the same `buildTierMetrics` as the regional ladder.

Measured in fresh processes:

| Stage | rec/s | ms/rec | comparisons/rec | heap MB | classification |
|---|---|---|---|---|---|
| 25,000 | 6,197 | 0.044 | 113 | 225 | **PASS** |
| 50,000 | 5,737 | 0.054 | 134 | 276 | **PASS** |
| ~100,000 | 2,198 | 0.316 | 205 | 483 | **FAIL_PERFORMANCE** |

**Maximum proven scale: `PROVEN_SAFE_TO_50K`.**

### What failed, and why it is not an architectural dead end

Between 50k and 100k, per-record match time grew **5.8× for 2× records**. That fails the architectural half of the regional G5 gate: per-record cost must grow sub-linearly with the corpus, or total match cost is super-quadratic. The gate was not moved — it is the regional standard applied between the stages that ran.

But the shape of the failure is diagnostic:

- Comparisons per record grew only **1.8×** (113 → 205), which is sub-quadratic and expected as density rises.
- Per-*comparison* time grew ~4×, and heap doubled (213 → 483 MB).

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

- Temporal filtering scales with claims, and Batch 11's period-count query is already O(claims), not O(corpus) — it held at 8 ms. National temporal coverage stays a small share, so the timeline's honesty ("most places are undated") becomes *more* important, not less.
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
