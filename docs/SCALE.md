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

**Full-text search is not index-backed at this size.** The query plans show
`places_search_gin` unused: at a few thousand rows the planner correctly prefers
a sequential scan. The timings agree — text search grows linearly with the
corpus, 0.29 → 0.77 → 1.51 ms, which is the sequential-scan signature. It is
fast today because the table is small. `supabase/scale/plans.sql` now re-runs
the same queries with sequential scans disabled, so that the index is proven
usable and correct before a corpus arrives that needs it.

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
2. Confirmation that full-text search uses `places_search_gin` once the corpus
   is large enough to warrant it.
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
