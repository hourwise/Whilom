# The temporal evidence model

How Whilom decides when something is from, what it will say about it, and what it refuses to say.

The short version: **Whilom would rather say "medieval" than "1250", and rather say "date unknown" than either.** More history is only worth having when Whilom can explain why it believes it.

---

## 1. Two questions, deliberately kept apart

Every temporal claim has to answer two different things, and almost every dating bug comes from letting them merge:

| Question | Answered by | Example |
|---|---|---|
| What years should this **match**? | `start_year`, `end_year` | 1301–1400 |
| What may Whilom **say**? | `precision`, `display_label` | "14th century" |

A source that said "14th century" needs bounds so a time filter can find it. Those bounds are a filtering device. They are not a claim, and the moment they are rendered as "1350" Whilom has invented a fact.

This is not hypothetical. Wikidata stores "14th century" as the time value `+1350-01-01` with `timePrecision` 7. Of the 1,208 usable statements in the Yorkshire region, **584 — 48% — are century-precision**. An importer that reads the value and ignores the precision is quietly wrong about half of everything it imports.

A check constraint enforces it rather than a convention:

```sql
check (
  display_label is null
  or precision not in ('century', 'period', 'decade')
  or display_label !~ '\y[12][0-9]{3}\y'
)
```

A century, decade or period claim may not display a four-digit year. The database refuses.

---

## 2. Precision

`temporal_precision` (migration 0029) records how well a date is known:

| Value | Means | Class |
|---|---|---|
| `exact_year` | "built 1732" | strong |
| `range` | an explicit span the source gives | strong |
| `circa` | "c. 1732" | strong |
| `decade` | "the 1730s" | strong |
| `century` | "18th century", "C18" | strong |
| `before` / `after` | terminus ante/post quem | bounded |
| `period` | "medieval", "Iron Age" and nothing finer | period |
| `unknown` | — | unknown |

`temporal_precision_class()` groups these for reporting. **`period` is its own class and is never counted as a date.** Collapsing period-level evidence into a "dated" figure is precisely how a coverage number becomes untrustworthy, so `temporal_coverage()` reports four mutually exclusive buckets that sum to the corpus:

- **strong** — at least one claim precise to a century or better
- **period_only** — claims exist, none narrower than a named period
- **bounded_only** — only before/after evidence
- **unknown** — no temporal evidence

---

## 3. What kind of claim

`temporal_association_type` keeps the *meaning* of a date, because a medieval church rebuilt in 1870 is not simply "1870":

`built` · `existed` · `altered` · `used_as` · `event` · `lost` · `associated`

A place may carry several. They are never overwritten by a newer one, and a place with a 14th-century foundation and an 1872 rebuilding is findable in **both** — that is asserted by a test, not assumed.

Source properties map onto what they actually assert:

| Source | Property | Type | Why |
|---|---|---|---|
| Wikidata | `P571` inception | `built` | the date it came into being |
| Wikidata | `P1619` official opening | `event` | an opening is an event; calling it construction is an inference Wikidata never made |
| Wikidata | `P576` dissolved/demolished | `lost` | when it ceased |
| NHLE | Name, period word | `built` | the source saying what the thing *is* |
| NHLE | Name, battlefield year | `event` | "Battle of Marston Moor 1644" dates the fighting, not the field |

---

## 4. Conventions, stated as conventions

These are **choices**, not historical facts. They live in one module (`ingestion/transforms/temporal-normaliser.ts`), are versioned, and are tested:

- **A century runs 01 to 00.** C17 is 1601–1700. The 1st century BCE is 100 BCE to 1 BCE.
- **Early / mid / late split a century into thirds.** No source defines these precisely; thirds are even-handed. The middle third absorbs the remainder. **Precision stays `century`** — a qualifier narrows what matches, never what Whilom claims.
- **"c." widens a year by ±10 years.** Nothing licenses that specific number. The span exists so filtering behaves sensibly; the claim stays "c. 1720".

Assumptions are documented as assumptions. Whilom does not present its parsing conventions as history.

---

## 5. BCE, CE, and the year that does not exist

Signed integers, historical convention: **−1 is 1 BCE, 1 is 1 CE, and there is no year zero.** Astronomical numbering is easier arithmetic and wrong in every source a historian will quote, so the awkward convention is the correct one.

Enforced in three places, because one is not enough:

1. The normaliser checks every span before returning it, so the failure appears next to the rule that caused it.
2. Check constraints on `temporal_associations` and `historical_periods`.
3. `format_historical_year()` never renders a negative or a zero.

Wikidata's `+0000` — which no historical convention accepts — is read as 1 BCE.

---

## 6. Named periods

Period words resolve against the **effective** registry (`historical_periods`), never against a second hard-coded copy. Parent periods are skipped when assigning: "Prehistory" spans 900,000 years and would win every overlap contest while telling a visitor nothing.

This matters more than it sounds. Batch 10 found that `iron_age` had been declared as ending in 43 BCE while its own comment said the Roman invasion (AD 43), leaving 42 BCE–AD 42 belonging to no period at all. The test that should have caught it read the *insert statement* rather than asking the database. Registry parity is now checked against the effective schema.

Labels Whilom does not govern are **not guessed**. They go to quarantine and are ranked.

---

## 7. Provenance

Every claim carries enough to answer *why does Whilom believe this* without reading ingestion code:

| Column | Holds |
|---|---|
| `source_id`, `source_record_id` | which source, which record |
| `source_field` | which field of it |
| `raw_value` | the value **exactly as the source wrote it** |
| `raw_precision` | the source's own precision statement (e.g. Wikidata `timePrecision` 7) |
| `derivation` | how the span was reached, in words |
| `normaliser_version` | which rules produced it |
| `confidence` | 0.850 structured, 0.700 read from a name |

`raw_value` is what allows a later, better normaliser to be re-run and **checked**. Without it a claim can only be trusted.

---

## 8. Source priority

Recover evidence in this order, and stop as soon as the evidence runs out:

1. Structured source fields with a stated precision (Wikidata `P571`/`P1619`/`P576`)
2. Explicit structured ranges
3. Explicit century fields
4. Controlled period vocabularies
5. Deterministic parsing of clearly formatted source text
6. Anything more speculative — **only** if it stays explicitly qualified

No LLM is involved. Date parsing is deterministic, and everything above is a regular expression with a test.

### What the National Heritage List actually holds

The audit (`ingestion/regional/temporal-audit.ts`) settled a question that had been assumed for three batches. The FeatureServer is queried with `outFields: '*'`, so what it returns is everything it has: sixteen attributes, of which **five are dates and all five record an act of the state** — `ListDate`, `SchedDate`, `RegDate`, `InscrDate`, `AmendDate`.

**No historic date is being discarded during ingestion, because none is supplied.** A church listed in 1967 was not built in 1967.

The names are nearly as thin. Across 23,314 Yorkshire records:

| Pattern | Records |
|---|---|
| a named period | 284 |
| a four-digit number | 39 |
| …of which the record states it **is** a date | 10 |
| an explicit grid reference | 132 |
| a century, any spelling | 26 |
| "circa" qualifying a **distance**, not a date | 3 |

So a bare four-digit number is not read. `Boundary Stone at 2010 2955` is a grid reference, `1189-1195, THORNTON ROAD` is a house-number range, and `York Cemetery Plot Number 1977` is a plot number. A year counts only where the record says it is one — "Dated 1783", "Died 1706" — and every trap above is a test.

---

## 9. Rejection and quarantine

Ambiguous language fails safely. These never become years:

`old` · `ancient` · `historic` · `probably early` · `various dates` · `medieval or later`

They are **kept**, not dropped, in `temporal_quarantine` with the reason they were declined. `temporal_quarantine_ranking()` orders them by frequency, because a hundred distinct one-off strings are not worth a parser and one string appearing four hundred times is.

Rejection reasons: `no_temporal_content` · `vague_language` · `precision_too_coarse` · `unparseable_structure` · `out_of_range` · `contradictory_range`

A millennium-precision Wikidata value is rejected as `precision_too_coarse` rather than promoted to a century.

---

## 10. Measured coverage

Yorkshire regional dataset, 23,151 published places.

| | Before (batch 10) | After (batch 11) |
|---|---|---|
| Places with any temporal evidence | 239 (1.03%) | see the batch report |
| Strong (century or better) | not distinguished | reported separately |
| Period-only | not distinguished | reported separately |
| Quarantined values | not kept | kept and ranked |

Coverage is reported by `temporal_coverage()` and broken down by source, display category, period and association type by `temporal_coverage_breakdown()`.

Numbers are never improved by weakening evidence rules. A substantial increase with clean provenance beats a large one built on invented dates.
