# Yorkshire DATA-R3 Residual Review

Derived from governed DATA-R2 checkpoint 8cc140e993d760d0412298f54b32ed643ff4e7f6. This is offline review evidence only; it does not replace sealed activation inputs and does not authorize activation.

## Evidence and scope

- DATA-R2 Markdown SHA-256: `B1A41E08B2945B18C456241871C4D8C4A964B859ADF9A2CA478BBBE608CDA1D8`
- DATA-R2 JSON SHA-256: `2EDA6C46502CDA74350E999C4574777A507FB214237D1CEE2FC266CA04DA97FE`
- External evidence used: no.
- Production ingestion code changed: no.
- Hosted activation performed: no.

## Source 1000099 trace

The first duplicated logical identity is the sealed NHLE cache/capture boundary. The cache contains 2 World Heritage geometry rows for ListEntry `1000099`, both named Saltaire, with distinct OBJECTIDs 15 (Buffer Zone) and 16 (Core Area). The capture manifest preserves two occurrences.

| Stage                | Rows | Evidence                                                                                           |
| -------------------- | ---: | -------------------------------------------------------------------------------------------------- |
| Sealed NHLE cache    |    2 | OBJECTIDs 15/16; same ListEntry, name, layer and URL; feature notes distinguish Buffer/Core.       |
| Capture manifest     |    2 | ListEntry `1000099` at zero-based indexes 23313 and 23314.                                         |
| File adapter         |    2 | One raw record per source feature; sourceRecordId remains `1000099`.                               |
| Normalisation        |    2 | Both valid; feature-specific area/notes are preserved; same normalized Saltaire identity/location. |
| Candidate generation |    2 | Stable IDs `afd0cd1d-...0099` and `afd0cd1e-...0099`; ordinal prevents collision.                  |
| Matcher/classifier   |    2 | Both `MATCH_REVIEW` / `REVIEW_REQUIRED`; no approved rows.                                         |
| DATA-R2 review       |    2 | Independently retained and deferred.                                                               |

**Root cause:** Historic England exposes the World Heritage Site as two geometry rows for the same ListEntry. Capture records both features, the adapter emits both raw records, normalisation preserves both feature-specific area/notes values, and deterministic activation IDs use sourceRecordId plus activation ordinal. Duplication is therefore present before candidate generation and is expected for this multi-geometry source representation.

**Pipeline disposition:** `EXPECTED_MULTI_CANDIDATE`. The rows are retained, not silently deduplicated. DATA-R2's repeated OBJECTID 15 projection was a derived lookup limitation; the sealed cache itself contains OBJECTIDs 15 and 16.

No generic remediation is justified. Deduplicating by ListEntry would collapse meaningful Buffer/Core geometry evidence. Existing source-relation handling and the repeated-NHLE-geometry regression coverage remain applicable.

## Residual 13-row method

The two 1000099 rows were excluded from this identity pass. The remaining 13 rows were reviewed against sealed candidate JSON, DATA-R2 rationale/conflicts, coordinates, inferred types, designations, alternate names, source warnings and temporal evidence. No threshold was lowered, no heuristic approval was introduced, and no external enrichment was used. Every case remains deferred because the captured evidence does not safely establish identity, rejection, or an independently publishable canonical record.

| Ordinal | Taxonomy                        | Source                                                                                                                                   | Proposed canonical                                                      | Distance | Decision                    |
| ------: | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------: | --------------------------- |
|   21068 | NEAR_TIE                        | Tanfield Bridge                                                                                                                          | Tanfield Bridge                                                         |    10.3m | DEFER_INSUFFICIENT_EVIDENCE |
|   21076 | NAME_SIMILARITY_BELOW_THRESHOLD | St Peter's Church                                                                                                                        | Church of St Peter                                                      |     9.2m | DEFER_INSUFFICIENT_EVIDENCE |
|   21166 | NAME_SIMILARITY_BELOW_THRESHOLD | The Abbot's Staithes                                                                                                                     | Abbots Staith Buildings                                                 |     3.6m | DEFER_INSUFFICIENT_EVIDENCE |
|   21198 | NON_DISTINCTIVE_NAME            | New Bridge                                                                                                                               | New Bridge                                                              |     2.2m | DEFER_INSUFFICIENT_EVIDENCE |
|   21618 | NAME_SIMILARITY_BELOW_THRESHOLD | Fairburn Ings (Newton Abbey) moat                                                                                                        | Remains of Newton Abbey at Se 444 277                                   |    16.6m | DEFER_INSUFFICIENT_EVIDENCE |
|   21823 | NAME_SIMILARITY_BELOW_THRESHOLD | Lord Dacre's Cross or Towton Cross on the west side of the B1217, 1km south west of Towton                                               | Cross, Sometimes Known As Lord Dacres Cross                             |    34.1m | DEFER_INSUFFICIENT_EVIDENCE |
|   21997 | NAME_SIMILARITY_BELOW_THRESHOLD | Cross base in All Saints' churchyard                                                                                                     | Church of All Saints                                                    |    16.1m | DEFER_INSUFFICIENT_EVIDENCE |
|   22066 | NON_DISTINCTIVE_NAME            | Village cross                                                                                                                            | Village Cross                                                           |     6.3m | DEFER_INSUFFICIENT_EVIDENCE |
|   22585 | NAME_SIMILARITY_BELOW_THRESHOLD | St Leonard's Church and cross base adjacent to St Mary's Church                                                                          | Church of St Leonard's                                                  |     2.2m | DEFER_INSUFFICIENT_EVIDENCE |
|   22714 | NAME_SIMILARITY_BELOW_THRESHOLD | Icehouse 75m north west of Sutton Hall                                                                                                   | Ice House at Sutton Park Approximately 75 Metres to North West of House |       8m | DEFER_INSUFFICIENT_EVIDENCE |
|   22751 | OUTSIDE_AGREEMENT_RADIUS        | Ellerton Priory: a Cistercian nunnery including fishponds, water management system, mill, field systems and Ellerton medieval settlement | Ellerton Priory                                                         |   229.8m | DEFER_INSUFFICIENT_EVIDENCE |
|   22939 | NAME_SIMILARITY_BELOW_THRESHOLD | Haltemprice Augustinian priory                                                                                                           | Haltemprice Priory Farm                                                 |   122.3m | DEFER_INSUFFICIENT_EVIDENCE |
|   23171 | NAME_SIMILARITY_BELOW_THRESHOLD | St Margaret's Church and churchyard                                                                                                      | Church of St Margaret (old Church) and Boundary Wall                    |     5.4m | DEFER_INSUFFICIENT_EVIDENCE |

### Residual decisions

#### Ordinal 21068 — Tanfield Bridge

- Candidate: `22c646c3-0000-4000-8000-000001003681`; source record: `1003681`; DATA-R1 taxonomy: `NEAR_TIE`.
- Proposed canonical: Tanfield Bridge (source record `1150786`).
- Evidence comparison: Tanfield Bridge (structure, scheduled_monument) versus Tanfield Bridge (structure, listed_building), 10.3m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The proposed and source names are identical and the points are 10.3m apart, but the sealed rationale records a near-tie with another candidate. The source is a scheduled monument while the proposed record is a listed building, and the captured artefacts do not preserve enough competing-candidate identity/context to prove which physical bridge is intended.
- Additional evidence needed: An authoritative identity/designation link distinguishing the two Tanfield Bridge candidates.

#### Ordinal 21076 — St Peter's Church

- Candidate: `8a982cea-0000-4000-8000-000001003689`; source record: `1003689`; DATA-R1 taxonomy: `NAME_SIMILARITY_BELOW_THRESHOLD`.
- Proposed canonical: Church of St Peter (source record `1083103`).
- Evidence comparison: St Peter's Church (church, scheduled_monument) versus Church of St Peter (church, listed_building), 9.2m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The points are 9.2m apart and both labels describe St Peter's Church, but the source is a scheduled monument and the proposed record is a listed building. No source-specific alternate name or contextual description is captured that proves these are the same designation rather than overlapping records for different church elements.
- Additional evidence needed: A source-level designation or description tying the scheduled monument to the proposed listed building.

#### Ordinal 21166 — The Abbot's Staithes

- Candidate: `e062a71e-0000-4000-8000-000001004181`; source record: `1004181`; DATA-R1 taxonomy: `NAME_SIMILARITY_BELOW_THRESHOLD`.
- Proposed canonical: Abbots Staith Buildings (source record `1167663`).
- Evidence comparison: The Abbot's Staithes (archaeological_site, scheduled_monument) versus Abbots Staith Buildings (structure, listed_building), 3.6m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The points are 3.6m apart, but the names differ between The Abbot's Staithes and Abbots Staith Buildings and the inferred types conflict (archaeological_site versus structure). The captured evidence does not establish whether the entries denote the same remains or adjacent built elements.
- Additional evidence needed: An authoritative identity or site-description link resolving the name/type difference.

#### Ordinal 21198 — New Bridge

- Candidate: `63dd7973-0000-4000-8000-000001004899`; source record: `1004899`; DATA-R1 taxonomy: `NON_DISTINCTIVE_NAME`.
- Proposed canonical: New Bridge (source record `1150597`).
- Evidence comparison: New Bridge (structure, scheduled_monument) versus New Bridge (structure, listed_building), 2.2m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The names are the non-distinctive New Bridge and the points are 2.2m apart. The source is a scheduled monument and the proposed record is a listed building; proximity alone cannot establish identity for a generic bridge name.
- Additional evidence needed: A distinctive locality, designation description or authoritative identity link for this New Bridge.

#### Ordinal 21618 — Fairburn Ings (Newton Abbey) moat

- Candidate: `8fd34bec-0000-4000-8000-000001009926`; source record: `1009926`; DATA-R1 taxonomy: `NAME_SIMILARITY_BELOW_THRESHOLD`.
- Proposed canonical: Remains of Newton Abbey at Se 444 277 (source record `1237551`).
- Evidence comparison: Fairburn Ings (Newton Abbey) moat (abbey, scheduled_monument) versus Remains of Newton Abbey at Se 444 277 (abbey, listed_building), 16.6m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The source names a moat at Fairburn Ings/Newton Abbey and the proposed record names the remains of Newton Abbey; the points are 16.6m apart and both infer abbey. The captured evidence does not establish whether the source is the same abbey remains or a separate moat feature within the wider site.
- Additional evidence needed: A designation description or authoritative site plan connecting the moat and the proposed abbey remains.

#### Ordinal 21823 — Lord Dacre's Cross or Towton Cross on the west side of the B1217, 1km south west of Towton

- Candidate: `f2dd1108-0000-4000-8000-000001011967`; source record: `1011967`; DATA-R1 taxonomy: `NAME_SIMILARITY_BELOW_THRESHOLD`.
- Proposed canonical: Cross, Sometimes Known As Lord Dacres Cross (source record `1148443`).
- Evidence comparison: Lord Dacre's Cross or Towton Cross on the west side of the B1217, 1km south west of Towton (monument, scheduled_monument) versus Cross, Sometimes Known As Lord Dacres Cross (monument, listed_building), 34.1m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The source explicitly names Lord Dacre’s/Towton Cross and the proposed record contains Lord Dacres Cross; the points are 34.1m apart and both infer monument. The sealed evidence does not preserve enough contextual detail to distinguish a confirmed identity from a nearby cross reference.
- Additional evidence needed: A source-level description or authoritative location identity for Lord Dacre’s Cross.

#### Ordinal 21997 — Cross base in All Saints' churchyard

- Candidate: `9ba4ebe3-0000-4000-8000-000001013300`; source record: `1013300`; DATA-R1 taxonomy: `NAME_SIMILARITY_BELOW_THRESHOLD`.
- Proposed canonical: Church of All Saints (source record `1174051`).
- Evidence comparison: Cross base in All Saints' churchyard (monument, scheduled_monument) versus Church of All Saints (church, listed_building), 16.1m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The source is a cross base in All Saints' churchyard, while the proposed record is Church of All Saints; the points are 16.1m apart and the inferred types differ (monument versus church). The captured evidence supports proximity but not identity of the cross and church records.
- Additional evidence needed: A designation description proving whether the cross base is included in the proposed church record or is a separate monument.

#### Ordinal 22066 — Village cross

- Candidate: `6b92c7de-0000-4000-8000-000001013622`; source record: `1013622`; DATA-R1 taxonomy: `NON_DISTINCTIVE_NAME`.
- Proposed canonical: Village Cross (source record `1249371`).
- Evidence comparison: Village cross (monument, scheduled_monument) versus Village Cross (monument, listed_building), 6.3m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The names are the generic Village cross/Village Cross and the points are 6.3m apart, with matching monument inference but different source designations. A shared generic label and proximity are insufficient to merge the records safely.
- Additional evidence needed: A distinctive locality or authoritative designation identity for the village cross.

#### Ordinal 22585 — St Leonard's Church and cross base adjacent to St Mary's Church

- Candidate: `4ce95f4f-0000-4000-8000-000001017557`; source record: `1017557`; DATA-R1 taxonomy: `NAME_SIMILARITY_BELOW_THRESHOLD`.
- Proposed canonical: Church of St Leonard's (source record `1149621`).
- Evidence comparison: St Leonard's Church and cross base adjacent to St Mary's Church (church, scheduled_monument) versus Church of St Leonard's (church, listed_building), 2.2m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The source describes St Leonard's Church plus a cross base adjacent to St Mary's Church, while the proposed record is Church of St Leonard's; the points are 2.2m apart and both infer church. The captured evidence does not determine whether the designation is a wider complex or a separate cross/ church relationship.
- Additional evidence needed: A designation description or plan clarifying the boundary and included components.

#### Ordinal 22714 — Icehouse 75m north west of Sutton Hall

- Candidate: `c77a94ca-0000-4000-8000-000001018854`; source record: `1018854`; DATA-R1 taxonomy: `NAME_SIMILARITY_BELOW_THRESHOLD`.
- Proposed canonical: Ice House at Sutton Park Approximately 75 Metres to North West of House (source record `1241815`).
- Evidence comparison: Icehouse 75m north west of Sutton Hall (country_house, scheduled_monument) versus Ice House at Sutton Park Approximately 75 Metres to North West of House (historic_landscape, listed_building), 8m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The source names an icehouse 75m north west of Sutton Hall and the proposed record names an ice house at Sutton Park approximately 75m north west of the house; the points are 8.0m apart. However, the inferred types differ (country_house versus historic_landscape), and the captured data does not resolve the source designation identity.
- Additional evidence needed: A designation description confirming that both records refer to the same icehouse within Sutton Park.

#### Ordinal 22751 — Ellerton Priory: a Cistercian nunnery including fishponds, water management system, mill, field systems and Ellerton medieval settlement

- Candidate: `9c1e0f65-0000-4000-8000-000001019154`; source record: `1019154`; DATA-R1 taxonomy: `OUTSIDE_AGREEMENT_RADIUS`.
- Proposed canonical: Ellerton Priory (source record `1318619`).
- Evidence comparison: Ellerton Priory: a Cistercian nunnery including fishponds, water management system, mill, field systems and Ellerton medieval settlement (priory, scheduled_monument) versus Ellerton Priory (priory, listed_building), 229.8m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The names and inferred priory type agree, but the source is a 15.78ha scheduled area with an estimated 224.1m feature radius and the proposed point is 229.8m away, outside the 150m agreement radius. The area/centroid explanation is plausible but not captured strongly enough to prove identity without widening the global rule.
- Additional evidence needed: A reliable boundary/centroid or designation identity showing that the two points represent the same Ellerton Priory area.

#### Ordinal 22939 — Haltemprice Augustinian priory

- Candidate: `53b9ecd2-0000-4000-8000-000001019825`; source record: `1019825`; DATA-R1 taxonomy: `NAME_SIMILARITY_BELOW_THRESHOLD`.
- Proposed canonical: Haltemprice Priory Farm (source record `1103364`).
- Evidence comparison: Haltemprice Augustinian priory (priory, scheduled_monument) versus Haltemprice Priory Farm (monument, listed_building), 122.3m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The source is Haltemprice Augustinian priory and the proposed record is Haltemprice Priory Farm, 122.3m away. The inferred types conflict (priory versus monument), the name is not sufficiently distinctive, and the captured evidence does not establish whether the farm record is the priory remains or a separate property.
- Additional evidence needed: An authoritative designation description distinguishing the priory remains from the farm record.

#### Ordinal 23171 — St Margaret's Church and churchyard

- Candidate: `aedf315e-0000-4000-8000-000001021265`; source record: `1021265`; DATA-R1 taxonomy: `NAME_SIMILARITY_BELOW_THRESHOLD`.
- Proposed canonical: Church of St Margaret (old Church) and Boundary Wall (source record `1148207`).
- Evidence comparison: St Margaret's Church and churchyard (church, scheduled_monument) versus Church of St Margaret (old Church) and Boundary Wall (church, listed_building), 5.4m apart.
- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — The source is St Margaret's Church and churchyard and the proposed record is Church of St Margaret (old Church) and Boundary Wall, 5.4m away; both infer church. The source/proposed designations differ and the captured evidence does not prove whether the churchyard and boundary wall are the same published entity.
- Additional evidence needed: A designation description or identity link confirming the scope of the old church and churchyard records.

## Decision totals

| Residual disposition        | Count |
| --------------------------- | ----: |
| APPROVE_MATCH               |     0 |
| REJECT_MATCH                |     0 |
| KEEP_SEPARATE_CANONICAL     |     0 |
| DEFER_INSUFFICIENT_EVIDENCE |    13 |

| Residual taxonomy               | Count |
| ------------------------------- | ----: |
| NAME_SIMILARITY_BELOW_THRESHOLD |     9 |
| NEAR_TIE                        |     1 |
| NON_DISTINCTIVE_NAME            |     2 |
| OUTSIDE_AGREEMENT_RADIUS        |     1 |

## Revised dry projection

- Existing AUTO_SAFE: **23171**.
- DATA-R2 KEEP_SEPARATE_CANONICAL: **110**.
- DATA-R3 approvals: **0**.
- DATA-R2 rejected rows: **18**.
- DATA-R3 residual deferred rows: **13**.
- Expected multi-candidate 1000099 rows retained: **2**; removed: **0**.
- Projected publishable candidate rows: **23281**.
- Projected blocked rows: **33**.

This remains a projection only. The sealed activation plan, candidate artefacts, SQL and hosted database were not changed. The recommended next step is a separately governed activation-policy decision for the 18 rejected rows, 13 residual deferred rows and the two retained 1000099 geometry rows; no activation should proceed from this artefact alone.
