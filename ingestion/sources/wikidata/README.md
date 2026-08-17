# Wikidata

Whilom's second independent heritage source.

## Why it is a source, not enrichment

Wikidata was previously used only to attach identifiers to records Historic
England had already supplied. A source that can only ever *add* fields can never
disagree with anything, so that arrangement could not demonstrate cross-source
behaviour — the remaining Phase 0B proof.

It now implements the ordinary `SourceAdapter` contract and travels the same
NORMALISE → VALIDATE → MATCH → CONFLICT path as every other source. There is no
Wikidata special case anywhere in the pipeline.

The two sources are genuinely complementary rather than one being a subset:

| | Historic England / NHLE | Wikidata |
| --- | --- | --- |
| Statutory designation | authoritative | patchy |
| Position | surveyed / digitised, with capture scale | placed by contributors |
| Place type | **none published at all** | explicit `instance of` |
| Inception date | none | often present |
| Official website | none | often present |
| Associated people | none | architects, founders |

## Access mechanism

SPARQL against the public Wikidata Query Service:

```
https://query.wikidata.org/sparql
```

No credentials, no registration. The adapter takes the query as a parameter
rather than building one internally, so scope stays explicit and bounded — it
cannot decide on its own to walk the whole UK heritage graph.

Properties used: `P1216` (NHLE number), `P625` (coordinate, via the full
statement path so `wikibase:geoPrecision` comes with it), `P571` (inception),
`P856` (official website), `P373` (Commons category), `P31` (instance of),
`P84` (architect), `P1435` (heritage designation), `schema:dateModified`.

## Licence and attribution

Wikidata's **structured data is released under CC0 1.0** (public domain
dedication). No attribution is legally required; Whilom records it anyway
because provenance is the entire point of the trust model:

> Wikidata contributors, CC0 1.0 Universal (public domain dedication)

**Wikipedia article prose is a different thing under a different licence**
(CC BY-SA) and is **not** used. Nothing in this adapter reads an article body,
and no descriptive text is imported. Commons categories are recorded as
pointers only — no image is ingested, and imagery stays closed until
licence/creator/attribution storage is proven end to end.

## Coordinates are not GPS fixes

Wikidata publishes a `geoPrecision` in **degrees**, and it is the precision the
*number was stored to* — not a measurement error. Items in this sample claim
`0.000001°`, about 11 cm, which no contributor dropping a pin on a monastic
precinct can possibly mean.

Believing that figure would let the matcher merge things it should not, so a
Wikidata coordinate is never trusted below a **25 m floor**
(`WIKIDATA_ACCURACY_FLOOR_M`), and anything coarser than 250 m is recorded with
`location_method = approximate` rather than `source_coordinate`. The stated
precision is still retained on the source record as
`source_precision_m` — what the source claimed and what Whilom believes are
different questions and are stored separately.

## Fixture

`fixtures/yorkshire-wikidata.json` holds **38 real items** captured from the
query service: 30 that carry an NHLE identifier (deliberate overlap with the
Historic England sample) and 8 Yorkshire heritage items with no NHLE link, so a
run has genuine new records as well as matches.

Real cases the sample contains:

- **Q540237 Fountains Abbey** links to *two* NHLE entries (1014395 scheduled
  monument, 1149811 listed building) — one site, two designations.
- **Q17649015 and Q15244323 both claim NHLE 1004051** (Malton Castle). Two
  Wikidata items, one list entry: a live duplicate-identifier ambiguity that
  nobody had to invent.
- **Q17647376 "Biship Middleham Castle"** — Wikidata types it an episcopal
  palace where the NHLE name says castle: a genuine live type conflict.
- **Q203225 Battle of Stamford Bridge** — the two sources place the battle
  about a kilometre apart, which is honest for a battlefield.
