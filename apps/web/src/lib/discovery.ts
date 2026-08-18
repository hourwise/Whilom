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
  { id: 'iron_age', name: 'Iron Age', startYear: -800, endYear: 42, parentId: 'prehistory', note: 'Ends conventionally at the Roman invasion of AD 43.' },
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

/**
 * How a selected year is applied.
 *
 *   all    no temporal restriction
 *   at     records overlapping the selected year
 *   until  records that had begun by then
 *   from   records still running at or after it
 *
 * The names are the semantics. A record with no dates matches none of the
 * three restrictive modes, because an undated thing must not acquire relevance
 * to a year somebody happened to choose.
 */
export const TIME_MODES = {
  All: 'all',
  At: 'at',
  Until: 'until',
  From: 'from',
} as const;
export type TimeMode = (typeof TIME_MODES)[keyof typeof TIME_MODES];

export const TIME_MODE_LABELS: Record<TimeMode, { label: string; hint: string }> = {
  all: { label: 'All time', hint: 'No date restriction' },
  at: { label: 'At this time', hint: 'Records spanning the selected year' },
  until: { label: 'Up to this time', hint: 'Records that had begun by then' },
  from: { label: 'From this time', hint: 'Records still standing after then' },
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
  timeMode: TimeMode;
  /** Signed year. Historical convention: no year zero. */
  selectedYear: number | null;
  mode: DiscoveryMode;
  types: string[];
  /** Display categories from the legend. */
  categories: string[];
  requireImage: boolean;
  /** Slug of the place whose preview is open. */
  selected: string | null;
  /** Slug of the person being followed. */
  personSlug: string | null;
}

/**
 * Where a first-time visitor lands: the United Kingdom.
 *
 * Not Yorkshire, even though Yorkshire is what is currently activated. The
 * product's scope is the UK, and opening on the one region that happens to hold
 * data would quietly redefine the product as a Yorkshire app. The coverage
 * layer is what keeps that honest — the map says "here is the UK, and here is
 * how far Whilom has got" rather than pretending the two are the same.
 */
export const DEFAULT_STATE: DiscoveryState = {
  lng: -2.9,
  lat: 54.4,
  zoom: 5.1,
  q: '',
  periodId: null,
  fromYear: null,
  toYear: null,
  timeMode: 'all',
  selectedYear: null,
  mode: DISCOVERY_MODES.Everything,
  types: [],
  categories: [],
  requireImage: false,
  selected: null,
  personSlug: null,
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
    timeMode: (['all', 'at', 'until', 'from'] as string[]).includes(params.get('timeMode') ?? '')
      ? (params.get('timeMode') as TimeMode)
      : 'all',
    selectedYear: parseOptionalYear(params.get('year')),
    mode,
    types: (params.get('types') ?? '').split(',').filter(Boolean),
    categories: (params.get('cat') ?? '').split(',').filter(Boolean),
    requireImage: params.get('image') === '1',
    selected: params.get('place'),
    personSlug: params.get('person'),
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
  if (state.timeMode !== 'all') params.set('timeMode', state.timeMode);
  if (state.selectedYear !== null) params.set('year', String(state.selectedYear));
  if (state.mode !== DEFAULT_STATE.mode) params.set('mode', state.mode);
  if (state.types.length) params.set('types', state.types.join(','));
  if (state.categories.length) params.set('cat', state.categories.join(','));
  if (state.requireImage) params.set('image', '1');
  if (state.selected) params.set('place', state.selected);
  if (state.personSlug) params.set('person', state.personSlug);
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
  display_category: string;
}

export interface MapCluster {
  cell_key: string;
  place_count: number;
  lng: number;
  lat: number;
  sample_place_id: string;
  sample_name: string;
  dominant_category: string | null;
  category_count: number;
}

function temporalArgs(state: DiscoveryState) {
  return {
    period_id: state.periodId,
    from_year: state.fromYear,
    to_year: state.toYear,
    time_mode: state.timeMode,
    // Only sent when the mode actually uses it, so "All time" cannot be
    // narrowed by a year left behind from an earlier selection.
    selected_year: state.timeMode === 'all' ? null : state.selectedYear,
  };
}

/** True when anything is narrowing the results beyond the viewport. */
export function hasActiveFilters(state: DiscoveryState): boolean {
  return Boolean(
    state.q ||
      state.periodId ||
      state.fromYear !== null ||
      state.toYear !== null ||
      (state.timeMode !== 'all' && state.selectedYear !== null) ||
      state.types.length ||
      state.categories.length ||
      state.requireImage ||
      state.personSlug,
  );
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
  personId?: string | null,
): Promise<MapCluster[]> {
  const { data, error } = await supabase.rpc('map_clusters', {
    bbox_sw_lng: bounds.swLng,
    bbox_sw_lat: bounds.swLat,
    bbox_ne_lng: bounds.neLng,
    bbox_ne_lat: bounds.neLat,
    cell_degrees: cellDegreesForZoom(state.zoom),
    place_types: effectiveTypes(state),
    categories: state.categories.length ? state.categories : null,
    q: state.q || null,
    require_image: state.requireImage,
    max_cells: 400,
    person_id: personId ?? null,
    ...temporalArgs(state),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MapCluster[];
}

export async function fetchPlaces(
  supabase: SupabaseClient,
  bounds: MapBounds,
  state: DiscoveryState,
  personId?: string | null,
): Promise<MapPlace[]> {
  const { data, error } = await supabase.rpc('map_places', {
    bbox_sw_lng: bounds.swLng,
    bbox_sw_lat: bounds.swLat,
    bbox_ne_lng: bounds.neLng,
    bbox_ne_lat: bounds.neLat,
    place_types: effectiveTypes(state),
    categories: state.categories.length ? state.categories : null,
    max_rows: 250,
    q: state.q || null,
    require_image: state.requireImage,
    person_id: personId ?? null,
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

// ---------------------------------------------------------------------------
// Display categories and the map key
// ---------------------------------------------------------------------------

/**
 * The ten groups the legend shows, mirroring `map_display_category` in 0031.
 *
 * Colour is never the only signal. Each group also carries a distinct symbol,
 * because roughly one in twelve men has some degree of colour-vision deficiency
 * and a map whose meaning is carried entirely by hue is a map they cannot read.
 * The palette leans on lightness differences as well as hue for the same reason.
 *
 * The direction asked for — reddish buildings, gold monuments, green ruins — is
 * kept; the exact values are darkened where needed so white text on them stays
 * legible.
 */
export interface DisplayCategory {
  id: string;
  label: string;
  /** Marker fill. Chosen for contrast against a pale basemap. */
  colour: string;
  /** Carried in the marker and the legend, so shape survives without colour. */
  symbol: string;
  hint: string;
}

export const DISPLAY_CATEGORIES: readonly DisplayCategory[] = [
  { id: 'building', label: 'Buildings', colour: '#b3402f', symbol: '■', hint: 'Houses, halls, mills, stations' },
  { id: 'religious', label: 'Religious', colour: '#6b4c9a', symbol: '✚', hint: 'Churches, chapels, abbeys, priories' },
  { id: 'fortification', label: 'Castles & forts', colour: '#3f5d8c', symbol: '⬟', hint: 'Castles, forts, hillforts' },
  { id: 'monument', label: 'Monuments', colour: '#c08a1e', symbol: '▲', hint: 'Crosses, memorials, statues' },
  { id: 'ruin', label: 'Ruins & lost', colour: '#3f7a4a', symbol: '◗', hint: 'Ruined and lost structures' },
  { id: 'archaeology', label: 'Archaeology', colour: '#8a6a3d', symbol: '◈', hint: 'Sites, barrows, villas, battlefields' },
  { id: 'industrial', label: 'Industrial', colour: '#5c6970', symbol: '⚙', hint: 'Works, canals, railways' },
  { id: 'military', label: 'Military', colour: '#4a5a35', symbol: '⬢', hint: 'Pillboxes, bunkers, airfields' },
  { id: 'landscape', label: 'Landscape', colour: '#2f7d6f', symbol: '❦', hint: 'Parks, gardens, designed landscapes' },
  { id: 'other', label: 'Other & unknown', colour: '#6f6f6f', symbol: '●', hint: 'Structures Whilom cannot yet classify' },
];

const CATEGORY_BY_ID = new Map(DISPLAY_CATEGORIES.map((c) => [c.id, c]));

export function displayCategory(id: string | null | undefined): DisplayCategory {
  return (id && CATEGORY_BY_ID.get(id)) || CATEGORY_BY_ID.get('other')!;
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export interface Coverage {
  coveredFraction: number;
  regionNames: string[];
}

/**
 * What to say about coverage in this viewport.
 *
 * The distinction being protected: an empty map outside the activated region
 * means Whilom has not got there yet. It does not mean the place has no
 * history, and saying so — even by implication — would be false about somewhere
 * people live.
 */
export function coverageMessage(coverage: Coverage | null): { level: 'none' | 'partial' | 'full'; text: string } | null {
  if (!coverage) return null;
  const f = coverage.coveredFraction;
  if (f >= 0.98) return null; // Fully covered: say nothing, the map speaks.
  if (f <= 0.02) {
    return {
      level: 'none',
      text: 'Whilom has not activated detailed coverage here yet — this area has plenty of history, we just have not mapped it.',
    };
  }
  return {
    level: 'partial',
    text: `Part of this view is outside Whilom's detailed coverage${
      coverage.regionNames.length ? ` (currently ${coverage.regionNames.join(', ')})` : ''
    }. Heritage beyond it has not been mapped yet.`,
  };
}

export async function fetchCoverage(
  supabase: SupabaseClient,
  bounds: MapBounds,
): Promise<Coverage | null> {
  const { data, error } = await supabase.rpc('coverage_for_viewport', {
    bbox_sw_lng: bounds.swLng,
    bbox_sw_lat: bounds.swLat,
    bbox_ne_lng: bounds.neLng,
    bbox_ne_lat: bounds.neLat,
  });
  if (error) return null;
  const row = (data as { covered_fraction: number; region_names: string[] }[] | null)?.[0];
  if (!row) return null;
  return { coveredFraction: row.covered_fraction ?? 0, regionNames: row.region_names ?? [] };
}

// ---------------------------------------------------------------------------
// Period counts
// ---------------------------------------------------------------------------

export interface PeriodCount {
  period_id: string;
  display_name: string;
  display_order: number;
  place_count: number;
}

/**
 * How many records Whilom associates with each period in this view.
 *
 * Emphatically NOT how many places existed then. With dated coverage around 1%
 * of the corpus the two numbers differ by orders of magnitude, and the UI has
 * to keep saying so.
 */
export async function fetchPeriodCounts(
  supabase: SupabaseClient,
  bounds: MapBounds,
  state: DiscoveryState,
): Promise<PeriodCount[]> {
  const { data, error } = await supabase.rpc('period_counts_for_viewport', {
    bbox_sw_lng: bounds.swLng,
    bbox_sw_lat: bounds.swLat,
    bbox_ne_lng: bounds.neLng,
    bbox_ne_lat: bounds.neLat,
    place_types: effectiveTypes(state),
    q: state.q || null,
  });
  if (error) return [];
  return (data ?? []) as PeriodCount[];
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  kind: 'place' | 'person';
  id: string;
  slug: string;
  display_name: string;
  detail: string | null;
  context: string | null;
  lng: number | null;
  lat: number | null;
  rank: number;
}

export async function searchDiscovery(
  supabase: SupabaseClient,
  q: string,
  maxRows = 12,
): Promise<SearchResult[]> {
  if (!q.trim()) return [];
  const { data, error } = await supabase.rpc('search_discovery', { q, max_rows: maxRows });
  if (error) throw new Error(error.message);
  return (data ?? []) as SearchResult[];
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface PersonPlace {
  place_id: string;
  slug: string;
  name: string;
  place_type: string;
  display_category: string;
  lng: number;
  lat: number;
  predicate: string;
  relationship_note: string | null;
  in_coverage: boolean;
}

export interface RelatedPerson {
  person_id: string;
  slug: string;
  name: string;
  life_dates: string | null;
  relation_kind: 'direct' | 'place';
  relation_detail: string;
  shared_places: number;
}

/** Predicate to the phrase a reader would use. */
export function relationshipLabel(predicate: string): string {
  const labels: Record<string, string> = {
    built_by: 'designed or built',
    owned_by: 'owned',
    owned: 'owned',
    lived_at: 'lived at',
    born_at: 'born at',
    died_at: 'died at',
    buried_at: 'buried at',
    participated_in: 'took part at',
    associated_with: 'associated with',
  };
  return labels[predicate] ?? predicate.replace(/_/g, ' ');
}

export async function fetchPersonPlaces(
  supabase: SupabaseClient,
  personId: string,
): Promise<PersonPlace[]> {
  const { data, error } = await supabase.rpc('person_places', { p_person_id: personId, max_rows: 200 });
  if (error) throw new Error(error.message);
  return (data ?? []) as PersonPlace[];
}

export async function fetchRelatedPeople(
  supabase: SupabaseClient,
  personId: string,
): Promise<RelatedPerson[]> {
  const { data, error } = await supabase.rpc('related_people', { p_person_id: personId, max_rows: 12 });
  if (error) return [];
  return (data ?? []) as RelatedPerson[];
}
