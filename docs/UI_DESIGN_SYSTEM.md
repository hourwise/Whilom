# Whilom UI Design System

## Heritage Archival System / Modern Editorial / Digital Museum

**Status:** shared Whilom visual source of truth.

This document records the accepted visual direction for Whilom Web and Mobile.
Future UI work should start here rather than inventing a client-specific visual
language. Luna's detailed UI work may refine these rules and translate them to
individual screens; Codex and other frontend implementation work follows them.

Whilom is one heritage platform with two client expressions: Web provides depth
for research, while Mobile supports discovery while travelling. The clients may
use platform-appropriate components, but their semantics, hierarchy, tokens and
component states should remain recognisably one product.

## Brand character

Whilom should feel:

- authoritative yet curious;
- like a well-curated museum archive or national library;
- historical without being antiquated;
- modern, practical and usable outdoors;
- calm, structured and content-led;
- map-led during discovery, with provenance kept close.

Avoid:

- fake parchment, faux-medieval decoration or historical kitsch;
- generic SaaS dashboard styling;
- excessive gradients or glass-card-heavy interfaces;
- heavy shadows and floating tile overload;
- oversized pill-shaped controls;
- ornamental detail that competes with the evidence.

## Core palette

Use the palette as semantic roles rather than scattering raw values through
components.

| Role | Value | Use |
| --- | --- | --- |
| Archival background | `#fbf9f4` | primary page/canvas background |
| Primary text | `#1b1c19` | headings, readable body copy |
| Heritage Green | `#173124` | primary actions, active navigation, brand |
| Primary container | `#2d4739` | selected/strong green surfaces |
| Restrained Burgundy | `#914948` | secondary emphasis and editorial accent |
| Neutral surface 1 | `#f5f3ee` | cards, controls and quiet panels |
| Neutral surface 2 | `#f0eee9` | layered content surfaces |
| Neutral surface 3 | `#eae8e3` | muted controls, badges and separators |
| Neutral surface 4 | `#e4e2dd` | deeper neutral layering where needed |
| Stone/slate | `#5d625e` / `#788079` | metadata, secondary copy and outlines |
| Ochre/Bronze | restrained ochre/bronze | time ruler accents and tertiary emphasis |

Light/dark adaptations may adjust contrast while retaining these semantic
relationships. Map-category colours can remain distinct because they carry
meaning, but they should harmonise with the archival palette.

Colour is never the only signal for a category, status or selection. Pair it
with a symbol, shape, label or text state.

## Typography

The intended type roles are:

- **EB Garamond** for editorial headings, place and person titles, and
  historically descriptive narrative;
- **Public Sans** for navigation, search, buttons, filters, metadata, map
  information and other functional UI.

The current managed Expo mobile implementation uses an explicit temporary
fallback (`Georgia` for editorial text and the platform system font for UI)
until real font packaging and device validation are authorised. This is a
known implementation state, not a change to the type direction. Mobile display
type should scale down for narrow phones rather than becoming a large
multi-line billboard.

Dates, coordinates, provenance and photo credits use disciplined small-label
styling with sufficient contrast and line height.

## Layout and spacing

- Use an 8px base spacing system (`4px` is reserved for fine adjustments).
- Mobile content margins are approximately 16px.
- Tablet content margins are approximately 32px.
- Desktop content margins are approximately 48px within the editorial/grid
  layout.
- Mobile discovery is fluid and map-centric, with a single-column reading path
  where appropriate.
- Desktop discovery is the editorial/grid counterpart, not a separate product
  vocabulary.
- Interactive controls should provide at least a comfortable 44px touch target
  even when the visible glyph or border is smaller.

## Surfaces, borders and shape

Use tonal layering, thin low-contrast outlines and restrained elevation only
where it improves hierarchy.

- controls and buttons: approximately 4px radius;
- cards and large containers: approximately 8px radius;
- pills are reserved for compact semantic choices, not used as the default
  shape for every control;
- borders and surface contrast should do most of the separation work;
- heavy shadows are not part of the Whilom language.

## Signature components

### Time Ruler

The Time Ruler is a signature Whilom component, not a generic date picker. It
remains visually connected to the map and carries the existing four modes:

- All time;
- At this time;
- Up to this time;
- From this time.

The ruler uses historical ticks or period bands, an active Bronze/heritage-toned
position, and a mode-dependent fill. Mobile may use a horizontally scrollable
or compact treatment, but must preserve BCE/CE-safe formatting, no year zero,
the shared period vocabulary and the meaning of the fill.

The application navigation vocabulary contains 20 selectable period bands.
The database registry contains 21 rows because `prehistory` is a parent/grouping
row and is not itself a selectable band.

### Map and category key

Discovery is map-led. Markers and the ten-group display key use a restrained
category colour together with a geometric symbol/shape and a text label. At
broad zoom the data contract supports clusters; at close zoom it supports
individual places. A lightweight presentation map may stand in for a native
map until that work is authorised, but the surrounding data and interaction
contracts should not depend on mock-map assumptions.

### Search, cards and detail

Unified WHERE/WHO search remains central and clearly distinguishes places from
people. Cards support finding and selecting; place and person pages provide
depth, provenance and relationships. A compact preview should not be overloaded
with full detail-page content.

## Component-state conventions

Reusable components should have calm, explicit states for:

- initial loading and refresh;
- empty results;
- partial or outside activated coverage;
- network failure and retry;
- unavailable live configuration;
- selected, visited and saved states.

Copy must remain truthful: no Whilom record in an area does not mean the area
has no history. Important actions need meaningful screen-reader labels, roles
and selected/disabled state announcements. Category, status and map-marker
meaning must remain understandable without colour vision.

## Platform and governance

`docs/UI_DESIGN_SYSTEM.md` is the visual source of truth. Luna's UI/design work
refines it; Codex and frontend implementation work against it. Detailed screen
plans may refine layout, copy and component composition, but they do not
silently replace this shared system.

Web and React Native should share tokens, semantics, vocabulary and state
conventions where that improves consistency. Their rendering components may
remain platform-specific: Web CSS and React Native styles have different
layout, font-loading and accessibility APIs, and forcing one component layer
would make both clients worse. The current repository therefore keeps the
mobile token implementation in `apps/mobile/src/theme.ts` and the Web styling
in its CSS layer, while this document is the shared design contract.

Native maps, GPS, camera, notifications, offline storage and device-specific
font packaging are separate implementation stages. Until authorised, use
typed seams and calm development presentations without adding native-heavy
dependencies or generated native projects.
