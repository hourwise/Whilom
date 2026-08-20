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

---

# WHERE — WHEN — WHO

Whilom's discovery model is three questions and a filter:

| | Question | Control |
| --- | --- | --- |
| **WHERE** | Where are you looking? | Map viewport, search, coverage layer |
| **WHEN** | When are you interested in? | Century ruler, epoch bands, four time modes |
| **WHO** | Who do you want to follow? | Unified search, person map mode, related graph |
| *WHAT* | What kind of thing? | Legend categories and discovery modes |

## The map is the homepage

The map takes the first viewport. The identity — name, tagline, definition — is
a masthead beside it rather than a page above it. `/` and `/explore` are the
same component in two modes; two map implementations would have drifted apart
within a fortnight.

### The default view is the United Kingdom

Not Yorkshire, even though Yorkshire is what is currently activated. Opening on
the one region that holds data would quietly redefine the product as a Yorkshire
app.

What keeps that honest is `coverage_regions` and `coverage_for_viewport`, which
returns the **fraction** of a viewport inside activated coverage rather than a
boolean — a view straddling the boundary is exactly where yes/no misleads.

| Viewport | Behaviour |
| --- | --- |
| Inside activated coverage | Normal discovery, no coverage message |
| Straddling the boundary | Results shown, plus "part of this view is outside Whilom's detailed coverage" |
| Outside coverage | No results, plus "Whilom has not activated detailed coverage here yet — this area has plenty of history, we just have not mapped it" |

An empty map means Whilom has not got there. It never means the place has no
history, and the copy is written so it cannot be read that way.

## The century ruler

### The axis is deliberately not linear

Real time is unusable as a straight line here. The Palaeolithic is 890,000 years
and the First World War is four; on a true scale everything since the Romans
occupies a hairline nobody can click.

So each period gets screen width in proportion to how much it is likely to be
*used*. Everything since the Norman conquest is about 4% of real time and gets
over a quarter of the ruler. A ruler that is technically to scale but impossible
to operate is literal, not honest.

Century ticks are drawn where they fit and thinned where they do not — every
century in the last two millennia, then millennia, then hundred-thousand-year
steps in deep prehistory. Labels are thinned separately from ticks, because a
tick can be narrower than its own label.

### BCE and CE

The public never sees a negative year or a year zero. `800 BC`, `AD 43`, `1837`.
Internally years stay signed integers on the historical convention, and
`fractionToYear` can never return 0 — asserted across a thousand positions on
the axis rather than spot-checked.

### Four modes, and the fill means something

| Mode | Returns | Fill |
| --- | --- | --- |
| All time | Everything, dated or not | none |
| At this time | Records spanning the selected year | narrow band at the handle |
| Up to this time | Records that had begun by then | left edge → handle |
| From this time | Records still standing after then | handle → right edge |

The between-two-years filter survives in advanced filters; the modes did not
replace it.

**A record with no dates matches none of the three restrictive modes.** An
undated thing must not acquire relevance to a year somebody happened to pick.
It reappears under All time, where it belongs.

### Epoch bands

Twenty-one clickable bands across the ruler, alternately tinted so neighbours
separate without needing twenty-one distinct colours. Clicking selects the
period by stable id — `?period=victorian`, never a display string. Counts come
from `period_counts_for_viewport`, one grouped query for all twenty-one epochs,
because twenty-one round trips to label a timeline would cost more than
everything else the map does.

A count means *records Whilom currently associates with this period in this
view*. It does not mean *places that existed then*, and with dated coverage
around 1% of the corpus the difference is enormous.

## The key

Ten display groups derived from the canonical taxonomy by
`map_display_category`. Canonical typing is never coarsened to suit a map key —
the grouping is presentation only, and `structure`/`unknown` map to `other`
rather than being forced into something more interesting.

Every entry carries **colour, symbol and text**. Roughly one man in twelve has
some colour-vision deficiency, and a map whose meaning is carried by hue alone
is one they cannot read. Legend entries double as filters, but the same choices
exist as ordinary controls in the filter panel: a legend is a poor place to hide
the only way to do something.

Clusters report a category only when the cell genuinely holds one category. A
mixed cluster naming its most common member would imply the rest match it.

## People

### Search

One box, `search_discovery`, returning places and people tagged by kind and
capped per kind. Grouping happens after the fact, in the results — a person
should not have to know which tab Whilom files them under before they can be
found. Every query hits Whilom's own indexed data; no third-party lookup fires
on a keystroke.

### Identity, not names

Slugs carry the canonical identifier (`jane-smith-q1234`), so two people sharing
a name stay two people. Result rows show life dates and titles, which is what
actually disambiguates them.

### Dates

`person_life_dates` renders `1564–1616`, `b. 1564`, `d. 1616` or nothing at all.
Unknown stays unknown. Precision and the source's own raw value are preserved on
the record, so a year shown as `1827` can still be traced to a full date.

### Following someone

Selecting a person switches the map to `person_places`, which reads both edge
directions and reports the predicate **as stated** — "designed", "owned" —
rather than flattening everything to "associated with".

Places outside activated coverage are shown and labelled, not hidden. A real
canonical relationship is worth showing even where detailed discovery has not
reached; hiding it would be a different kind of dishonesty from overstating
coverage.

`related_people` offers only real graph paths: an explicit person-to-person edge,
or a shared published place, kept apart because "his wife" and "also worked on
this building" are not the same claim. There is no similarity scoring — a
relationship Whilom cannot point at is not one it should assert.

### Where the people came from

A bounded enrichment through the already-approved Wikidata source: people
already attached to a place Whilom had published, capped, with structured claims
only and no article prose. Nobody was imported for being famous, which is why
the cast is country-house architects rather than monarchs.

## What this still is not

Whilom holds a strong regional baseline, not complete historical knowledge.
There is no arbitrary postcode geocoder, no visitor-attraction inference, no
national coverage, and no first-party routing. The product says so rather than
implying otherwise.
