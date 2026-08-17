# Historic England — National Heritage List for England (NHLE)

The first production-shaped source connector.

## The dataset

The NHLE is the statutory register of nationally protected historic sites in
England: listed buildings, scheduled monuments, registered parks and gardens,
registered battlefields, protected wreck sites and World Heritage Sites.

## Access mechanism

Historic England publishes the NHLE as open data through its
[open data hub](https://opendata-historicengland.hub.arcgis.com/), backed by an
ArcGIS **FeatureServer**:

```
https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/ArcGIS/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer
```

This is the mechanism the adapter uses. **No credentials, API key, registration
or agreement is required** — it is an anonymous HTTPS GET. Records are queried
per layer:

```
GET {service}/{layerId}/query
  ?where=1=1
  &geometry={"xmin":380000,"ymin":380000,"xmax":545000,"ymax":525000}
  &geometryType=esriGeometryEnvelope&inSR=27700&spatialRel=esriSpatialRelIntersects
  &outFields=*&returnGeometry=false
  &resultOffset=0&resultRecordCount=1000
  &orderByFields=ListEntry ASC&f=json
```

Historic England's normal HTML list-entry pages are **not** scraped and must not
be — they are the human interface, not the data interface. The `hyperlink`
attribute on each record points at the corresponding page and is stored as
`originalUrl` so a user can be sent to the authoritative record.

### Layers

| id | Layer | Designation |
| --- | --- | --- |
| 0 | Listed Building points | `listed_building` |
| 6 | Scheduled Monuments | `scheduled_monument` |
| 7 | Parks and Gardens | `registered_park_garden` |
| 8 | Battlefields | `registered_battlefield` |
| 9 | Protected Wreck Sites | `protected_wreck` |
| 10 | World Heritage Sites | `world_heritage_site` |

Layers 1 and 2 (Building Preservation Notices, Certificates of Immunity) are
deliberately not imported: neither is a heritage designation, and a Certificate
of Immunity is in fact a guarantee that a building will *not* be listed —
importing it as a designation would assert the opposite of the truth. Layers
3–5 are polygon duplicates of 0–2 and would double-count every record. See
`DELIBERATELY_UNSUPPORTED_LAYERS` in `nhle-layers.ts`.

## Licence and attribution

Released under the **Open Government Licence v3.0** (`OGL-UK-3.0`). The
service's own `copyrightText` reads:

> © Crown Copyright 2026. Contains Ordnance Survey data © Crown copyright and
> database right 2026. Released under OGL.

Every imported record carries this attribution, stored on the candidate's
provenance and surfaced in the UI:

> Contains Historic England information © Historic England. Contains Ordnance
> Survey data © Crown copyright and database right. Licensed under the Open
> Government Licence v3.0.

OGL v3.0 permits copying, publishing, adapting and commercial use, and requires
attribution. It does **not** cover Historic England's list-entry *descriptions*
(the long official texts on the list-entry pages), which are not part of these
datasets and are not ingested.

## Technical limitations

- **Coordinates are British National Grid (EPSG:27700)**, not WGS84. Every
  record must be reprojected during NORMALISE — see `transforms/osgb.ts`. The
  projection is exact (pinned to the Ordnance Survey worked example to
  sub-millimetre); the OSGB36→WGS84 datum shift uses a 7-parameter Helmert
  approximation of OSTN15, accurate to roughly 5 m rather than 0.1 m.
- **There is no type vocabulary.** A record is a name, a designation, a grade
  and a grid reference. What a site *is* has to be inferred from its name, which
  fails for ordinary listed buildings. See `transforms/place-type.ts`.
- **There is no address, town, county or postcode** on these layers, so a place
  imported from NHLE alone cannot be filtered by location text.
- **Dates are epoch milliseconds and frequently negative** — scheduling dates
  run back to the 1910s.
- The date field is named differently per layer (`ListDate`, `SchedDate`,
  `RegDate`, `InscrDate`); the layer registry owns that mapping.
- `maxRecordCount` is 22,000; the adapter pages with `resultOffset`.
- `NGR` may contain several grid references for one record (multi-part
  geometry), while `Easting`/`Northing` give a single representative point.
- Records are updated daily, so `AmendDate` should drive incremental runs.

## Fixture

`fixtures/yorkshire-poc.json` holds **30 real, unmodified NHLE records** for the
bounded Yorkshire POC, captured from the query API above. Attribute values are
exactly as the service returned them; the only additions are the `_source`
provenance block and a `_note` on each record explaining why it was selected.

The selection is deliberately adversarial rather than representative — it
includes two different places both named "Middleham Castle" 48 km apart, one
abbey represented four times across three layers, a weir inside an abbey estate,
two identically named Grade I churches, and a registered park published at
byte-identical coordinates to the abbey it contains.

To refresh or extend it, query the service as above and keep the attributes
untouched.
