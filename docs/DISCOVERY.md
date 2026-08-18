# Discovery

How Whilom turns a published canonical dataset into something a person can
explore — and what it deliberately refuses to claim.

## The two surfaces

| Route | What it is | Needs JavaScript |
| --- | --- | --- |
| `/explore` | Map-centred discovery: viewport, period, filters, preview | Map does; filters and results do not |
| `/discover` | Server-rendered list with the same filters | No |

`/discover` is not a fallback that was left behind. It is the accessible path,
it renders without a single byte of map code, and `/explore` links to it.

## Reading published data only

The map calls two functions and nothing else:

- `map_clusters(...)` — density aggregation for broad viewports
- `map_places(...)` — individual markers for close ones

Both are `SECURITY INVOKER`. RLS on `places` already decides what the public may
see, and routing the map around it with `SECURITY DEFINER` would mean
maintaining a second, weaker copy of that judgement. Neither function can reach
`import_candidates`, `import_conflicts`, review notes or moderator identity, and
pgTAP asserts that an anonymous visitor is refused those tables outright.

## Density

The region holds 23,171 published places. Sending them to a browser so it can
cluster them there would be a multi-megabyte payload for a view in which no
individual marker is legible, so aggregation happens in the database.

```
zoom < 12   map_clusters   grid cells, count + centroid + one sample name
zoom >= 12  map_places     individual places, capped at 250
```

Cell size tracks zoom (`cellDegreesForZoom`), roughly one cell per 40 screen
pixels, so clusters stay separable rather than collapsing into one blob.

Three limits are enforced by the functions rather than trusted to the caller:
geography is mandatory (there is no unbounded form), `map_places` caps the
viewport at 2.5 × 1.5 degrees, and both cap rows server-side. A client asking
for 100,000 gets the cap.

**Filters apply before aggregation.** A cluster count that ignored the active
filter would be worse than no count: it would say forty churches are here when
there are none.

## The map result contract

Small on purpose. A map that loads complete place records to draw markers will
not stay interactive.

```
id, slug, name, place_type, lng, lat, location_accuracy_m,
primary_designation, thumbnail_url, survival_status, period_summary
```

No provenance blob travels with a marker. `thumbnail_url` comes from
`map_thumbnail_for`, which returns a URL only when stored rights data can
support attribution for that exact file — no image is better than one Whilom
cannot credit.

## Time

### Years

Signed integers, historical convention: `-1` is 1 BCE, `1` is 1 CE, **there is
no year zero**, and a check constraint enforces it. Astronomical numbering is
more convenient arithmetically and wrong in every source a historian will quote.

Deliberately not a `date`. No date type can express "Bronze Age", "probably 12th
century" or "before 1500", and forcing one to would manufacture precision the
evidence does not support. `temporal_precision` records which of those a claim
actually is.

### The period registry

`historical_periods` is a **navigation vocabulary**, not source truth. The Iron
Age did not end everywhere in Britain on a Tuesday in AD 43. The boundaries are
how a person finds their way to records; source-backed dates remain the
authoritative claim, and the UI says so.

### Temporal associations

`temporal_associations` carries the same attribution machinery as `facts` rather
than a parallel one: source, source record, the source's own words, and a stated
derivation so a claim can be audited or withdrawn.

Association types separate two questions the product will eventually ask
independently — `built`/`existed` answer *what was here then*, while
`event`/`used_as` answer *what happened then*. Only the first is populated
today; the second is a seam, not a feature.

### The rule that governs all of it

**A designation date is not a historic date.**

The National Heritage List carries six date fields — `ListDate`, `SchedDate`,
`RegDate`, `InscrDate`, `DesigDate`, `AmendDate` — and not one is historic.
Every one records when the state conferred or amended protection. A church
listed in 1967 was not built in 1967, and using that field would fill the map
with Victorian abbeys and post-war castles.

So for all 23,315 records in the region, the register supplies **no construction
date whatever**. The only evidence used is period language in the source's own
description: "Roman villa", "medieval moated site", "C17 barn". That is Historic
England's claim about the period, not an inference of ours.

`FORBIDDEN_DATE_FIELDS` names the rejected fields in code so the rule is
testable rather than merely documented, and a CI gate fails the build if any
temporal claim was derived from one.

### Coverage, stated plainly

**About 1% of published regional places carry a temporal claim.**

That is the finding, not a failure to hide. Precision cost coverage repeatedly
and deliberately: measured against the real region, an earlier extractor made
confident false claims from "19 AND 21, ROMAN ROAD" (an address), "STATUE OF
JAMES STUART" (a man) and "TUDOR COTTAGE" (usually a Victorian house). A bare
period word now needs a monument noun beside it, or a record type whose names
are formal archaeological descriptions rather than postal addresses. Centuries
are accepted anywhere, because "C18" is a date wherever it appears.

The consequence for the UI is not cosmetic. Choosing a period will very often
empty the map, so the empty state has to distinguish

> No Bronze Age records here yet — Whilom holds a dated record for only a small
> share of this region

from the thing it must never say, which is that nothing existed here.

## Lost places

`places.survival_status` exists and is `NULL` for every current record, because
the sources do not state it and a guessed "surviving" would be an invented claim
about the real world. NULL means not known, which is true. The map contract
carries the field so a future Whilom can show a hollow marker for what used to
be here without a schema change.

## Search and geocoding

Text search over canonical place names and towns works today, scoped to the
viewport.

Arbitrary town and postcode resolution does **not**. Whilom has no geocoding
provider, and wiring one in without reviewing its terms of use would be the kind
of decision that is easy to make and awkward to undo. The seam is the `q`
parameter on both RPCs; the honest position is that searching for a place Whilom
holds works, and searching for an arbitrary postcode does not yet.

## Directions

Whilom calculates no routes. A place preview hands coordinates to an external
provider and stops there.

Discovery and navigation are separate concerns, and a browser cannot reliably
tell which navigation apps are installed, so guessing would produce a worse
experience than offering a link. Internal routing may later be appropriate for
Whilom's own walks and trails; ordinary road navigation is not Whilom's job.

## Basemap

MapLibre GL, which speaks the open style specification, so a basemap is a URL and
changing provider is configuration rather than a rewrite. `NEXT_PUBLIC_MAP_STYLE_URL`
selects one; unset, the map falls back to OSM raster tiles for development only,
and says so on the page.

No API key is committed. Attribution is attached to the style itself rather than
left for a page layout to remember, because it is a licence condition and not a
footer decoration.

## Accessibility

- Every place on the map is also a button in the results list; the list is first
  in the DOM, so tab order reaches the data before the canvas.
- Cluster counts are text as well as size — density conveyed only by area is
  invisible to a screen reader.
- The period control is a radio group with arrow-key navigation, announced
  horizontally so its orientation matches its meaning.
- Filters are real fieldsets with legends; the filter panel is `aria-expanded`.
- Result counts are announced through a `role="status"` region.

## What this is not

Whilom holds a strong regional baseline, not complete historical knowledge. The
product does not claim every historical place, complete opening information,
complete event history, complete temporal coverage or national coverage — and
the copy is written to keep it that way.
