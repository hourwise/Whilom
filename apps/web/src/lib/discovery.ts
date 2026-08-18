/**
 * The shape of a discovery session, and how it survives a shared link.
 *
 * Everything a person has chosen — where they are looking, when, and what they
 * are looking for — lives in the URL. "Medieval York" should be a link you can
 * send someone, not a state of mind you have to describe to them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The navigation vocabulary, mirroring `historical_periods` in migration 0029.
 *
 * Held here as well as in the database because the scrubber has to render
 * before any query runs, and a control that cannot draw itself until the
 * network answers is a control that flickers. A pgTAP test holds the two in
 * step.
 *
 * These boundaries are conventions for finding things, not historical
 * assertions. The Iron Age did not end everywhere in Britain on a Tuesday.
 */
export interface Period {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  /** Shown in the UI so the convention is visible rather than implied. */
  note?: string;
  /** Grouped under a broader heading in the scrubber. */
  parentId?: string;
}

export const PERIODS: readonly Period[] = [
  { id: 'palaeolithic', name: 'Palaeolithic', startYear: -900_000, endYear: -10_001, parentId: 'prehistory', note: 'Old Stone Age.' },
  { id: 'mesolithic', name: 'Mesolithic', startYear: -10_000, endYear: -4_001, parentId: 'prehistory', note: 'Middle Stone Age.' },
  { id: 'neolithic', name: 'Neolithic', startYear: -4_000, endYear: -2_201, parentId: 'prehistory', note: 'New Stone Age; first farming.' },
  { id: 'bronze_age', name: 'Bronze Age', startYear: -2_200, endYear: -801, parentId: 'prehistory' },
  { id: 'iron_age', name: 'Iron Age', startYear: -800, endYear: -43, parentId: 'prehistory', note: 'Ends conventionally at the Roman invasion.' },
  { id: 'roman', name: 'Roman Britain', startYear: 43, endYear: 409 },
  { id: 'early_medieval', name: 'Anglo-Saxon & Viking', startYear: 410, endYear: 1065, note: 'Also called the Early Medieval period.' },
  { id: 'norman', name: 'Norman', startYear: 1066, endYear: 1153, note: 'From the Conquest.' },
  { id: 'medieval', name: 'Medieval', startYear: 1154, endYear: 1484 },
  { id: 'tudor', name: 'Tudor', startYear: 1485, endYear: 1602 },
  { id: 'stuart', name: 'Stuart', startYear: 1603, endYear: 1713, note: 'Includes the Civil War.' },
  { id: 'georgian', name: 'Georgian', startYear: 1714, endYear: 1836, note: 'Includes the Regency.' },
  { id: 'victorian', name: 'Victorian', startYear: 1837, endYear: 1900 },
  { id: 'edwardian', name: 'Edwardian', startYear: 1901, endYear: 1913 },
  { id: 'wwi', name: 'First World War', startYear: 1914, endYear: 1918 },
  { id: 'interwar', name: 'Interwar', startYear: 1919, endYear: 1938 },
  { id: 'wwii', name: 'Second World War', startYear: 1939, endYear: 1945 },
  { id: 'postwar', name: 'Post-war', startYear: 1946, endYear: 1979 },
  { id: 'late_20th', name: 'Late 20th century', startYear: 1980, endYear: 1999 },
  { id: 'contemporary', name: 'Today', startYear: 2000, endYear: 2100 },
];

export function periodById(id: string | null | undefined): Period | undefined {
  if (!id) return undefined;
  return PERIODS.find((p) => p.id === id);
}

/** "800 BC" rather than "-800", which is a database detail. */
export function formatYear(year: number): string {
  if (year < 0) {
    const magnitude = Math.abs(year);
    return magnitude >= 10_000
      ? `${Math.round(magnitude / 1000).toLocaleString('en-GB')},000 BC`
      : `${magnitude.toLocaleString('en-GB')} BC`;
  }
  return year <= 1000 ? `AD ${year}` : String(year);
}

export function formatPeriodSpan(period: Period): string {
  return `${formatYear(period.startYear)} – ${formatYear(period.endYear)}`;
}

/**
 * Discovery modes.
 *
 * "Everything historic" is the default and is a product position, not a
 * fallback: ordinary listed houses, bridges, walls and farm buildings are the
 * overwhelming majority of what is protected, and hiding them because they are
 * not visitor attractions would make Whilom a guidebook rather than a record of
 * what is actually there.
 */
export const DISCOVERY_MODES = {
  Everything: 'everything',
  Buildings: 'buildings',
  Archaeology: 'archaeology',
  Monuments: 'monuments',
} as const;
export type DiscoveryMode = (typeof DISCOVERY_MODES)[keyof typeof DISCOVERY_MODES];

/**
 * Place types behind each mode.
 *
 * There is deliberately no "Places to visit" mode. Whilom holds no reliable
 * visitability data for the regional corpus — a listed building is not a
 * visitor attraction, and inferring one from the other would put a family in
 * front of somebody's house. The API supports a visitability filter the day
 * real data exists for it; until then offering the mode would be a lie with a
 * nice icon.
 */
export const MODE_TYPES: Record<DiscoveryMode, string[] | null> = {
  everything: null,
  buildings: [
    'building', 'country_house', 'church', 'cathedral', 'abbey', 'priory',
    'castle', 'industrial_site', 'railway_site', 'canal_structure', 'museum',
  ],
  archaeology: [
    'archaeological_site', 'roman_villa', 'hillfort', 'fort', 'battlefield',
    'lost_structure', 'ruin',
  ],
  monuments: ['monument', 'garden', 'historic_landscape'],
};

export interface DiscoveryState {
  /** Map centre and zoom. */
  lng: number;
  lat: number;
  zoom: number;
  q: string;
  periodId: string | null;
  fromYear: number | null;
  toYear: number | null;
  mode: DiscoveryMode;
  types: string[];
  requireImage: boolean;
  /** Slug of the place whose preview is open. */
  selected: string | null;
}

/**
 * Where a first-time visitor lands.
 *
 * Central Yorkshire at a zoom that shows the region as clusters, because the
 * honest first impression of Whilom is density — thousands of protected things
 * most people walk past — rather than a handful of famous pins.
 */
export const DEFAULT_STATE: DiscoveryState = {
  lng: -1.55,
  lat: 53.96,
  zoom: 8,
  q: '',
  periodId: null,
  fromYear: null,
  toYear: null,
  mode: DISCOVERY_MODES.Everything,
  types: [],
  requireImage: false,
  selected: null,
};

/** Below this the map asks for clusters; at or above it, individual places. */
export const PLACE_ZOOM_THRESHOLD = 12;

function parseNumber(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseOptionalYear(value: string | null): number | null {
  if (value === null || value === '') return null;
  const n = Number(value);
  // Year zero does not exist in the historical convention, so it can only be a
  // typo or a machine's idea of "empty".
  if (!Number.isInteger(n) || n === 0) return null;
  return n;
}

export function stateFromParams(params: URLSearchParams): DiscoveryState {
  const modeRaw = params.get('mode');
  const mode = (Object.values(DISCOVERY_MODES) as string[]).includes(modeRaw ?? '')
    ? (modeRaw as DiscoveryMode)
    : DEFAULT_STATE.mode;

  return {
    lng: parseNumber(params.get('lng'), DEFAULT_STATE.lng),
    lat: parseNumber(params.get('lat'), DEFAULT_STATE.lat),
    zoom: parseNumber(params.get('z'), DEFAULT_STATE.zoom),
    q: params.get('q') ?? '',
    periodId: periodById(params.get('period')) ? params.get('period') : null,
    fromYear: parseOptionalYear(params.get('from')),
    toYear: parseOptionalYear(params.get('to')),
    mode,
    types: (params.get('types') ?? '').split(',').filter(Boolean),
    requireImage: params.get('image') === '1',
    selected: params.get('place'),
  };
}

/**
 * Only what differs from the default is written, so a shared link reads as the
 * thing it describes rather than as a dump of every knob.
 */
export function paramsFromState(state: DiscoveryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('lng', state.lng.toFixed(4));
  params.set('lat', state.lat.toFixed(4));
  params.set('z', state.zoom.toFixed(1));
  if (state.q) params.set('q', state.q);
  if (state.periodId) params.set('period', state.periodId);
  if (state.fromYear !== null) params.set('from', String(state.fromYear));
  if (state.toYear !== null) params.set('to', String(state.toYear));
  if (state.mode !== DEFAULT_STATE.mode) params.set('mode', state.mode);
  if (state.types.length) params.set('types', state.types.join(','));
  if (state.requireImage) params.set('image', '1');
  if (state.selected) params.set('place', state.selected);
  return params;
}

/** The types a query should filter on, combining mode and explicit choices. */
export function effectiveTypes(state: DiscoveryState): string[] | null {
  if (state.types.length) return state.types;
  return MODE_TYPES[state.mode];
}

// ---------------------------------------------------------------------------
// Query shapes
// ---------------------------------------------------------------------------

export interface MapBounds {
  swLng: number;
  swLat: number;
  neLng: number;
  neLat: number;
}

/** One marker. Deliberately small — see migration 0030. */
export interface MapPlace {
  id: string;
  slug: string;
  name: string;
  place_type: string;
  lng: number;
  lat: number;
  location_accuracy_m: number | null;
  primary_designation: string | null;
  thumbnail_url: string | null;
  survival_status: string | null;
  period_summary: string | null;
}

export interface MapCluster {
  cell_key: string;
  place_count: number;
  lng: number;
  lat: number;
  sample_place_id: string;
  sample_name: string;
}

function temporalArgs(state: DiscoveryState) {
  return {
    period_id: state.periodId,
    from_year: state.fromYear,
    to_year: state.toYear,
  };
}

/**
 * Cell size for a zoom level.
 *
 * Roughly one cell per 40 screen pixels, so clusters stay separable as the user
 * zooms rather than collapsing into one blob or exploding into confetti.
 */
export function cellDegreesForZoom(zoom: number): number {
  const table: [number, number][] = [
    [6, 0.25], [7, 0.15], [8, 0.1], [9, 0.06], [10, 0.035], [11, 0.02],
  ];
  for (const [z, cell] of table) if (zoom <= z) return cell;
  return 0.012;
}

export async function fetchClusters(
  supabase: SupabaseClient,
  bounds: MapBounds,
  state: DiscoveryState,
): Promise<MapCluster[]> {
  const { data, error } = await supabase.rpc('map_clusters', {
    bbox_sw_lng: bounds.swLng,
    bbox_sw_lat: bounds.swLat,
    bbox_ne_lng: bounds.neLng,
    bbox_ne_lat: bounds.neLat,
    cell_degrees: cellDegreesForZoom(state.zoom),
    place_types: effectiveTypes(state),
    q: state.q || null,
    require_image: state.requireImage,
    max_cells: 400,
    ...temporalArgs(state),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MapCluster[];
}

export async function fetchPlaces(
  supabase: SupabaseClient,
  bounds: MapBounds,
  state: DiscoveryState,
): Promise<MapPlace[]> {
  const { data, error } = await supabase.rpc('map_places', {
    bbox_sw_lng: bounds.swLng,
    bbox_sw_lat: bounds.swLat,
    bbox_ne_lng: bounds.neLng,
    bbox_ne_lat: bounds.neLat,
    place_types: effectiveTypes(state),
    max_rows: 250,
    q: state.q || null,
    require_image: state.requireImage,
    ...temporalArgs(state),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MapPlace[];
}

/**
 * Why a result set might be empty.
 *
 * The distinction Whilom has to keep making: an empty map means Whilom holds no
 * matching records, which is not the same as nothing having existed here. With
 * temporal coverage at around 1% of the regional corpus, picking a period will
 * very often empty the map, and implying that Yorkshire was uninhabited in the
 * Bronze Age would be both wrong and insulting.
 */
export function emptyStateMessage(state: DiscoveryState): { title: string; detail: string } {
  const period = periodById(state.periodId);
  if (period) {
    return {
      title: `No ${period.name} records here yet`,
      detail:
        `Whilom holds a dated record for only a small share of this region, so a period filter ` +
        `hides a great deal that is genuinely there. Try "Any time", widen the map, or clear the filters.`,
    };
  }
  if (state.fromYear !== null || state.toYear !== null) {
    return {
      title: 'No records in that date range here',
      detail:
        'Very few records carry a date Whilom can rely on. This means we have nothing dated to ' +
        'that span in view — not that nothing stood here.',
    };
  }
  if (state.q) {
    return { title: `Nothing matching “${state.q}” here`, detail: 'Try a different search, or widen the map.' };
  }
  if (state.requireImage) {
    return {
      title: 'No records with a usable image here',
      detail: 'Whilom only shows images it can properly credit, and most places have none yet.',
    };
  }
  return {
    title: 'Nothing in Whilom here yet',
    detail:
      'Whilom currently covers Yorkshire and the surrounding area. Move the map, zoom out, ' +
      'or clear the filters.',
  };
}
