/**
 * Basemap configuration, kept behind a seam.
 *
 * Whilom's data model must not become coupled to one tile vendor. The map
 * renderer is MapLibre GL, which speaks the open style specification, so a style
 * is just a URL and swapping provider is a configuration change rather than a
 * rewrite.
 *
 * No API key is committed. When `NEXT_PUBLIC_MAP_STYLE_URL` is unset the map
 * falls back to a raster style built from OpenStreetMap's own tiles, which is
 * adequate for development and review and is NOT appropriate for production
 * traffic — the OSM Foundation asks that its tile servers not be used as a
 * general-purpose basemap for other people's products, and honouring that is
 * both correct and cheap.
 *
 * Attribution is not optional and is not a footer decoration. It is part of the
 * licence under which the data is available, so it is attached to the style
 * itself rather than left for a page layout to remember.
 */

// Type-only: erased at compile time, so this module stays importable from
// server components and tests without pulling MapLibre into the bundle.
import type { StyleSpecification } from 'maplibre-gl';

export const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

export const HERITAGE_ATTRIBUTION =
  'Heritage data © Historic England, under the Open Government Licence v3.0';

/**
 * A minimal raster style. Deliberately plain: the basemap is context for the
 * heritage, and a busy one competes with the thing the map is about.
 */
export function fallbackStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: `${OSM_ATTRIBUTION} · ${HERITAGE_ATTRIBUTION}`,
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  } as unknown as StyleSpecification;
}

/**
 * The style the map should load.
 *
 * A string is passed straight to MapLibre so a vendor style URL (with its own
 * key in the environment, never in the repository) works unchanged.
 */
export function resolveMapStyle(): string | StyleSpecification {
  const configured = process.env['NEXT_PUBLIC_MAP_STYLE_URL'];
  if (configured && configured.trim() !== '') return configured;
  return fallbackStyle();
}

/** True when running on the development fallback rather than a chosen provider. */
export function usingFallbackBasemap(): boolean {
  const configured = process.env['NEXT_PUBLIC_MAP_STYLE_URL'];
  return !configured || configured.trim() === '';
}
