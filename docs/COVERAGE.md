# Coverage sources

Which sources Whilom trusts, what each one buys, what it costs — and why several available sources are refused.

The governing rule: **expand Whilom through evidence it can defend, not through plausible inference.** A smaller corpus of defensible history beats a larger corpus of inferred history.

Machine-readable form: `ingestion/regional/coverage-opportunity.ts` → `regional-coverage-opportunity.json`, produced on every regional workflow run.

---

## 1. Decisions

| Source family | Decision | Why |
|---|---|---|
| **Historic England list-entry descriptions** | `ACCESS_OR_LICENSING_REVIEW_REQUIRED` | Not in the open data at all; access terms could not be established |
| **Controlled archaeological vocabulary** | `PARTIAL_GOVERNED_MAPPING` | Real but small; five period items governed, one broader than any registry period |
| **Additional Wikidata properties** | `SAFE_DIRECT_PROPERTIES_IDENTIFIED` | Dated events and controlled periods imported; two ambiguous properties deferred; two refused |

---

## 2. What the National Heritage List actually publishes

Measured from the service's own metadata endpoint, not sampled:

- **11 layers**, **23 distinct fields** across all of them
- **0 historic date fields**
- **6 administrative date fields** — `ListDate`, `SchedDate`, `RegDate`, `InscrDate`, `DesigDate`, `AmendDate`, plus BPN/COI start and expiry

All 247 feature services published by Historic England were enumerated. None carries list-entry description text.

**No historic date is being discarded during ingestion, because none is supplied.** A church listed in 1967 was not built in 1967.

### The descriptions

The prose Historic England writes for each entry — "Farmhouse. C17, altered C19..." — is the largest temporal opportunity available anywhere, and it is **not in the open data**. It exists only on individual list-entry web pages, reachable one document at a time via the `hyperlink` field.

Establishing whether it may be retrieved in bulk was not possible from outside:

- `historicengland.org.uk` returned **HTTP 403 to a non-browser request, including for `robots.txt`**, so even the crawl policy could not be read.
- Retrieving ~400,000 pages from a public website is a bulk-use decision with terms, rate and politeness consequences.
- The spatial data's OGL v3.0 licence covers the spatial data. It cannot be assumed to extend to website prose.

**This is blocked on access, not on engineering.** The parser already reads that grammar. Whilom does not invent a licensing interpretation where terms are unclear, and does not scrape a site that refuses automated requests. Marked for owner review.

### The national extent

The same already-licensed service holds **401,539 records nationally** against 23,315 ingested — **17×** — under the same licence, the same identifiers and the same adapter.

Classified `PILOT` rather than `IMPORT_NOW`: the scale ladder is proven to 25,000 records, every map gate was tuned against 23,151 places, and the coverage-truthfulness model assumes a single activated region. That is a batch of its own, not a flag.

---

## 3. Wikidata

Joined on `wdt:P1216`, the NHLE list-entry number Whilom already stores on every regional place. **No fuzzy name matching is used for automatic evidence import** — a temporal claim is never attached to a place because the names look similar.

### Imported

| Property | Meaning | Association | Regional yield |
|---|---|---|---|
| `P571` | inception | `built` | 1,069 claims |
| `P1619` | date of official opening | `event` | 87 |
| `P576` | dissolved / demolished | `lost` | 52 |
| `P793` + `P585` | dated significant event | governed per event type | 35 |
| `P2348` | time period | `associated` | 47 |

### Deferred

`P580` (start time, 21 places) and `P585` (point in time, 7 places). The semantics are ambiguous on this class of item: start time may mean the structure began, the organisation occupying it began, or a designation began. Batch 11 established that a property is imported for what it *means*, not for the fact it holds a date, and 28 places is not enough evidence to settle which without reading them.

### Refused

| Property | Regional records | Reason |
|---|---|---|
| `P149` architectural style | **517** | `STYLE_NOT_DATE` |
| `P1435` heritage designation | 55,133 | `DESIGNATION_NOT_HISTORIC` |

Architectural style is the largest body of *apparently* temporal Wikidata evidence available, and it is not temporal evidence. A style correlates with a period without asserting one, and **revival styles invert the correlation outright**: a Norman-revival church dated from its style lands in the twelfth century instead of the nineteenth.

---

## 4. Governed vocabulary

`ingestion/transforms/source-vocabulary.ts`. Every term was measured before it was written; nothing is listed because it seemed likely.

### Period terms (P2348)

| Item | Label | Classification | Maps to |
|---|---|---|---|
| Q12554 | Middle Ages | `BROADER_THAN_REGISTRY` | span 410–1484, **no single period** |
| Q131987978 | Romano-British period | `CONTROLLED_ALIAS` | `roman` |
| Q277399 | British Iron Age | `CONTROLLED_ALIAS` | `iron_age` |
| Q44155 | Mesolithic | `DIRECT_REGISTRY_MATCH` | `mesolithic` |
| Q11764 | Iron Age | `DIRECT_REGISTRY_MATCH` | `iron_age` |

"Middle Ages" spans `early_medieval`, `norman` and `medieval`. Pinning it to whichever overlaps most would silently narrow a claim the source never narrowed, so the span is kept instead and matching works from the span. **The label displayed is the source's own word** — a claim that said "Middle Ages" never comes back reading "Medieval".

Classifications: `DIRECT_REGISTRY_MATCH` · `CONTROLLED_ALIAS` · `BROADER_THAN_REGISTRY` · `NARROWER_THAN_REGISTRY` · `AMBIGUOUS` · `UNMAPPED` · `REJECTED`.

### Event terms (P793)

33 distinct dated event types measured regionally. 26 governed as evidence, **7 refused by name**:

| Refused | Why |
|---|---|
| geophysical survey | dates the survey, not the site |
| archaeological excavation | dates the excavation, not the site |
| archaeological field survey | dates the survey, not the site |
| topographical survey | dates the survey, not the site |
| UNESCO record modification | an administrative act, the same family as designation dates |
| automatization | a lighthouse being automated is operational, not structural |
| childbirth | dates a person, not the building they were born in |

A 2015 geophysical survey of a Bronze Age barrow says nothing about the barrow. Importing these blindly would date it to the twenty-first century — a defect that looks exactly like data until somebody reads it.

Semantics are **not collapsed**: demolition → `lost`, conflagration → `event`, architectural reconstruction → `altered`, end of construction → `built`.

---

## 5. Statement rank

Wikidata ranks each statement `preferred`, `normal` or `deprecated`.

**Deprecated statements are never imported** — the source's own editors consider them wrong or superseded, and importing one gives known-bad evidence the same standing as good evidence. The importer refuses them, *and* a check constraint refuses them, so the rule is structural rather than a property of one importer.

The rank of what was imported is stored, so a reviewer can see that a claim arrived as `preferred` rather than assume it.

---

## 6. Conflicts

Whilom does not resolve conflicts by letting the last importer win. It **classifies** them and keeps every provenance-backed claim.

| Relation | Meaning |
|---|---|
| `different_event` | founded 1180 / rebuilt 1872 — **two facts, not a conflict** |
| `compatible_refinement` | "1350" refines "14th century" |
| `duplicate_equivalent` | two sources agreeing |
| `range_overlap` | overlapping spans |
| `exact_conflict` | both exact years, different |
| `century_conflict` / `period_conflict` | different century / period named |
| `range_disagreement` | spans that never meet |
| `indeterminate` | one claim has no years |

`different_event` is tested first deliberately. A demolition in 1940 does not contradict a construction in 1780, and treating it as a conflict would bury real disagreements under noise.

**There is no global source precedence rule.** "Historic England beats Wikidata" would be wrong: the claims usually describe different events. Both remain, with provenance. Where a single canonical value is ever needed for presentation, that rule will be documented at the point it is introduced.

---

## 7. Provenance

Every claim answers *why does Whilom believe this* without reading ingestion code:

`source_id` · `source_record_id` · `source_field` · `source_property` · `source_rank` · `raw_value` · `raw_precision` · `derivation` · `normaliser_version` · `confidence`

---

## 8. Refresh strategy

| Source | Classification | Note |
|---|---|---|
| NHLE spatial (regional) | **periodic full refresh** | updated daily upstream; the manifest pins the boundary and every list entry |
| Wikidata temporal | **periodic full refresh** | cheap, bounded, idempotent; cached between runs unless `--refresh` |
| Wikidata people | **periodic full refresh** | as above |
| NHLE descriptions | **not implemented** | blocked on access review |

No unattended cron is added for these. The regional workflow runs weekly and on relevant pull requests.

---

## 9. Attribution

| Source | Licence | Required attribution |
|---|---|---|
| NHLE | OGL v3.0 | Contains Historic England information © Historic England. Contains Ordnance Survey data © Crown copyright and database right. |
| Wikidata | CC0-1.0 | Wikidata contributors, CC0 1.0 |

Whilom stores derived structured assertions with provenance rather than copying source prose. No narrative description is reproduced from any source.
