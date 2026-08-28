import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, HeritageClient } from '@whilom/database';
import { EntityType, type PlaceType, type RelationshipPredicate } from '@whilom/domain';

type PublicFunctions = Database['public']['Functions'];
type FunctionArgs<Name extends keyof PublicFunctions> = PublicFunctions[Name]['Args'];
type FunctionRows<Name extends keyof PublicFunctions> = PublicFunctions[Name]['Returns'];
type GeneratedMapPlace = FunctionRows<'map_places'>[number];
type GeneratedPersonPlace = FunctionRows<'person_places'>[number];

/**
 * RPC output contracts are generated from the database, with nullable
 * presentation fields retained here where a projection legitimately has no
 * value (for example, a person-place marker has no thumbnail or period).
 */
export type MapPlace = Omit<GeneratedMapPlace, 'period_summary' | 'primary_designation' | 'thumbnail_url'> & {
  period_summary: string | null;
  primary_designation: string | null;
  thumbnail_url: string | null;
};
export type MapCluster = FunctionRows<'map_clusters'>[number];
export type Coverage = FunctionRows<'coverage_for_viewport'>[number];
export type PeriodCount = FunctionRows<'period_counts_for_viewport'>[number];
export type SearchDiscoveryRow = FunctionRows<'search_discovery'>[number];
export type PersonPlace = Omit<GeneratedPersonPlace, 'relationship_note'> & { relationship_note: string | null };
export type RelatedPerson = FunctionRows<'related_people'>[number];
export type ResolvedPersonRow = FunctionRows<'person_by_slug'>[number];

export type DisplayCategoryId = Database['public']['Enums']['map_display_category'];
export type DiscoveryPlaceType = PlaceType;
export type DiscoveryRelationship = RelationshipPredicate;

/** The navigation vocabulary shared by both clients. */
export interface Period {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  note?: string;
  parentId?: string;
}

/**
 * This is the application navigation vocabulary, not a second database
 * registry. Boundaries are the same portable constants previously owned by
 * Web's discovery module and are used by Mobile for its ruler before queries
 * begin. The database remains authoritative for persisted period rows.
 */
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
  return id ? PERIODS.find((period) => period.id === id) : undefined;
}

export function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year).toLocaleString('en-GB')} BC`;
  return year <= 1000 ? `AD ${year}` : String(year);
}

export function formatPeriodSpan(period: Period): string {
  return `${formatYear(period.startYear)} – ${formatYear(period.endYear)}`;
}

export const DISCOVERY_MODES = {
  Everything: 'everything',
  Buildings: 'buildings',
  Archaeology: 'archaeology',
  Monuments: 'monuments',
} as const;
export type DiscoveryMode = (typeof DISCOVERY_MODES)[keyof typeof DISCOVERY_MODES];

export const MODE_TYPES: Record<DiscoveryMode, string[] | null> = {
  everything: null,
  buildings: ['building', 'country_house', 'church', 'cathedral', 'abbey', 'priory', 'castle', 'industrial_site', 'railway_site', 'canal_structure', 'museum'],
  archaeology: ['archaeological_site', 'roman_villa', 'hillfort', 'fort', 'battlefield', 'lost_structure', 'ruin'],
  monuments: ['monument', 'garden', 'historic_landscape'],
};

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
  from: { label: 'From this time', hint: 'Records still running at or after it' },
};

export interface DiscoveryState {
  lng: number;
  lat: number;
  zoom: number;
  q: string;
  periodId: string | null;
  fromYear: number | null;
  toYear: number | null;
  timeMode: TimeMode;
  selectedYear: number | null;
  mode: DiscoveryMode;
  types: string[];
  categories: string[];
  requireImage: boolean;
  selected: string | null;
  personSlug: string | null;
}

export const DEFAULT_STATE: DiscoveryState = {
  lng: -2.9,
  lat: 54.4,
  zoom: 5.1,
  q: '',
  periodId: null,
  fromYear: null,
  toYear: null,
  timeMode: TIME_MODES.All,
  selectedYear: null,
  mode: DISCOVERY_MODES.Everything,
  types: [],
  categories: [],
  requireImage: false,
  selected: null,
  personSlug: null,
};

function parseNumber(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseYear(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed !== 0 ? parsed : null;
}

export function stateFromParams(params: URLSearchParams): DiscoveryState {
  const mode = Object.values(DISCOVERY_MODES).includes(params.get('mode') as DiscoveryMode)
    ? (params.get('mode') as DiscoveryMode)
    : DEFAULT_STATE.mode;
  const timeMode = Object.values(TIME_MODES).includes(params.get('timeMode') as TimeMode)
    ? (params.get('timeMode') as TimeMode)
    : DEFAULT_STATE.timeMode;
  return {
    ...DEFAULT_STATE,
    lng: parseNumber(params.get('lng'), DEFAULT_STATE.lng),
    lat: parseNumber(params.get('lat'), DEFAULT_STATE.lat),
    zoom: parseNumber(params.get('z'), DEFAULT_STATE.zoom),
    q: params.get('q') ?? '',
    periodId: periodById(params.get('period')) ? params.get('period') : null,
    fromYear: parseYear(params.get('from')),
    toYear: parseYear(params.get('to')),
    timeMode,
    selectedYear: parseYear(params.get('year')),
    mode,
    types: (params.get('types') ?? '').split(',').filter(Boolean),
    categories: (params.get('cat') ?? '').split(',').filter(Boolean),
    requireImage: params.get('image') === '1',
    selected: params.get('place'),
    personSlug: params.get('person'),
  };
}

export function paramsFromState(state: DiscoveryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('lng', state.lng.toFixed(4));
  params.set('lat', state.lat.toFixed(4));
  params.set('z', state.zoom.toFixed(1));
  if (state.q) params.set('q', state.q);
  if (state.periodId) params.set('period', state.periodId);
  if (state.fromYear !== null) params.set('from', String(state.fromYear));
  if (state.toYear !== null) params.set('to', String(state.toYear));
  if (state.timeMode !== TIME_MODES.All) params.set('timeMode', state.timeMode);
  if (state.selectedYear !== null) params.set('year', String(state.selectedYear));
  if (state.mode !== DEFAULT_STATE.mode) params.set('mode', state.mode);
  if (state.types.length) params.set('types', state.types.join(','));
  if (state.categories.length) params.set('cat', state.categories.join(','));
  if (state.requireImage) params.set('image', '1');
  if (state.selected) params.set('place', state.selected);
  if (state.personSlug) params.set('person', state.personSlug);
  return params;
}

export function effectiveTypes(state: DiscoveryState): string[] | null {
  return state.types.length ? state.types : MODE_TYPES[state.mode];
}

export interface MapBounds {
  swLng: number;
  swLat: number;
  neLng: number;
  neLat: number;
}

export interface MapQuery {
  bounds: MapBounds;
  state: DiscoveryState;
  personId?: string | null;
}

function temporalArgs(state: DiscoveryState): Pick<FunctionArgs<'map_places'>, 'period_id' | 'from_year' | 'to_year' | 'time_mode' | 'selected_year'> {
  return {
    ...(state.periodId ? { period_id: state.periodId } : {}),
    ...(state.fromYear !== null ? { from_year: state.fromYear } : {}),
    ...(state.toYear !== null ? { to_year: state.toYear } : {}),
    time_mode: state.timeMode,
    ...(state.timeMode !== TIME_MODES.All && state.selectedYear !== null ? { selected_year: state.selectedYear } : {}),
  };
}

export function buildMapPlacesArgs(query: MapQuery): FunctionArgs<'map_places'> {
  const { bounds, state, personId } = query;
  return {
    bbox_sw_lng: bounds.swLng,
    bbox_sw_lat: bounds.swLat,
    bbox_ne_lng: bounds.neLng,
    bbox_ne_lat: bounds.neLat,
    ...(effectiveTypes(state) ? { place_types: effectiveTypes(state)! } : {}),
    ...(state.categories.length ? { categories: state.categories } : {}),
    ...(state.q.trim() ? { q: state.q.trim() } : {}),
    require_image: state.requireImage,
    max_rows: 250,
    ...(personId ? { person_id: personId } : {}),
    ...temporalArgs(state),
  };
}

export function buildMapClustersArgs(query: MapQuery): FunctionArgs<'map_clusters'> {
  const { state, bounds, personId } = query;
  return {
    bbox_sw_lng: bounds.swLng,
    bbox_sw_lat: bounds.swLat,
    bbox_ne_lng: bounds.neLng,
    bbox_ne_lat: bounds.neLat,
    ...(effectiveTypes(state) ? { place_types: effectiveTypes(state)! } : {}),
    ...(state.categories.length ? { categories: state.categories } : {}),
    ...(state.q.trim() ? { q: state.q.trim() } : {}),
    require_image: state.requireImage,
    ...(personId ? { person_id: personId } : {}),
    ...temporalArgs(state),
    cell_degrees: cellDegreesForZoom(state.zoom),
    max_cells: 400,
  };
}

export function buildPeriodCountsArgs(bounds: MapBounds, state: DiscoveryState): FunctionArgs<'period_counts_for_viewport'> {
  return {
    bbox_sw_lng: bounds.swLng,
    bbox_sw_lat: bounds.swLat,
    bbox_ne_lng: bounds.neLng,
    bbox_ne_lat: bounds.neLat,
    ...(effectiveTypes(state) ? { place_types: effectiveTypes(state)! } : {}),
    ...(state.q.trim() ? { q: state.q.trim() } : {}),
  };
}

export function cellDegreesForZoom(zoom: number): number {
  const table: [number, number][] = [[6, 0.25], [7, 0.15], [8, 0.1], [9, 0.06], [10, 0.035], [11, 0.02]];
  for (const [threshold, cell] of table) if (zoom <= threshold) return cell;
  return 0.012;
}

/** At broader views the backend should return bounded clusters, not an unbounded marker set. */
export const PLACE_ZOOM_THRESHOLD = 12;

export function hasActiveFilters(state: DiscoveryState): boolean {
  return Boolean(state.q || state.periodId || state.fromYear !== null || state.toYear !== null || (state.timeMode !== TIME_MODES.All && state.selectedYear !== null) || state.types.length || state.categories.length || state.requireImage || state.personSlug);
}

export function emptyStateMessage(state: DiscoveryState): { title: string; detail: string } {
  const period = periodById(state.periodId);
  if (period) return { title: `No ${period.name} records here yet`, detail: 'Whilom holds a dated record for only a small share of this region, so a period filter hides a great deal that is genuinely there. Try “All time”, widen the map, or clear the filters.' };
  if (state.fromYear !== null || state.toYear !== null) return { title: 'No records in that date range here', detail: 'Very few records carry a date Whilom can rely on. This means we have nothing dated to that span in view — not that nothing stood here.' };
  if (state.q) return { title: `Nothing matching “${state.q}” here`, detail: 'Try a different search, or widen the map.' };
  if (state.requireImage) return { title: 'No records with a usable image here', detail: 'Whilom only shows images it can properly credit, and most places have none yet.' };
  return { title: 'Nothing in Whilom here yet', detail: 'Whilom currently covers Yorkshire and the surrounding area. Move the map, zoom out, or clear the filters.' };
}

export interface DisplayCategory {
  id: DisplayCategoryId;
  label: string;
  colour: string;
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

const categoryById = new Map(DISPLAY_CATEGORIES.map((category) => [category.id, category]));
export function displayCategory(id: string | null | undefined): DisplayCategory {
  return categoryById.get(id as DisplayCategoryId) ?? categoryById.get('other')!;
}

export interface CoverageMessage {
  level: 'none' | 'partial' | 'full';
  text: string;
}

export function coverageMessage(coverage: Coverage | null): CoverageMessage | null {
  if (!coverage || coverage.covered_fraction >= 0.98) return null;
  if (coverage.covered_fraction <= 0.02) return { level: 'none', text: 'Whilom has not activated detailed coverage here yet — this area has plenty of history, we just have not mapped it.' };
  return { level: 'partial', text: `Part of this view is outside Whilom's detailed coverage${coverage.region_names.length ? ` (currently ${coverage.region_names.join(', ')})` : ''}. Heritage beyond it has not been mapped yet.` };
}

export type SearchResult = Omit<SearchDiscoveryRow, 'kind' | 'lat' | 'lng' | 'detail' | 'context'> & {
  kind: 'place' | 'person';
  detail: string | null;
  context: string | null;
  lat: number | null;
  lng: number | null;
};
export type ResolvedPerson = Pick<SearchResult, 'id' | 'slug' | 'display_name' | 'detail' | 'context'> & { kind: 'person' };

function normaliseSearchRows(rows: SearchDiscoveryRow[]): SearchResult[] {
  return rows.filter((row): row is SearchDiscoveryRow & { kind: 'place' | 'person' } => row.kind === 'place' || row.kind === 'person') as SearchResult[];
}

export interface DiscoveryPlace {
  id: string;
  slug: string;
  name: string;
  placeType: DiscoveryPlaceType;
  category: DisplayCategoryId;
  location: { label: string; latitude: number; longitude: number };
  periodIds: string[];
  periodSummary: string;
  designation?: string;
  description: string;
  source: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
  imageLabel?: string;
  distanceMiles?: number;
  saved: boolean;
  visited: boolean;
  coverage: 'full' | 'partial' | 'none';
  people: string[];
  relatedPlaces: string[];
}

export interface DiscoveryPersonPlaceLink {
  placeId: string;
  predicate: DiscoveryRelationship;
  note: string;
}

export interface DiscoveryPerson {
  id: string;
  slug: string;
  name: string;
  lifeDates: string;
  role: string;
  description: string;
  placeLinks: DiscoveryPersonPlaceLink[];
  relatedPeople: string[];
}

export interface DiscoveryDataSource {
  readonly mode: 'fixture' | 'live';
  readonly configuration: 'available' | 'unavailable';
  getMapPlaces(query: MapQuery): Promise<MapPlace[]>;
  getMapClusters(query: MapQuery): Promise<MapCluster[]>;
  getCoverage(bounds: MapBounds): Promise<Coverage | null>;
  getPeriodCounts(bounds: MapBounds, state: DiscoveryState): Promise<PeriodCount[]>;
  searchDiscovery(query: string, maxRows?: number): Promise<SearchResult[]>;
  getPersonPlaces(personId: string, maxRows?: number): Promise<PersonPlace[]>;
  resolvePerson(slug: string): Promise<ResolvedPerson | null>;
  getRelatedPeople(personId: string, maxRows?: number): Promise<RelatedPerson[]>;
  getPlace(id: string): Promise<DiscoveryPlace | null>;
  getPerson(id: string): Promise<DiscoveryPerson | null>;
  getSavedPlaces(): Promise<DiscoveryPlace[]>;
  getVisitedPlaces(): Promise<DiscoveryPlace[]>;
}

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

export function personPlacesAsMapPlaces(rows: PersonPlace[]): MapPlace[] {
  return rows.map((row) => ({
    id: row.place_id,
    slug: row.slug,
    name: row.name,
    place_type: row.place_type,
    display_category: row.display_category as DisplayCategoryId,
    lng: row.lng,
    lat: row.lat,
    location_accuracy_m: 0,
    primary_designation: null,
    thumbnail_url: null,
    survival_status: '',
    period_summary: null,
  }));
}

export function viewportForPlaces(rows: { lng: number; lat: number }[]): { lng: number; lat: number; zoom: number } | null {
  if (!rows.length) return null;
  const lngs = rows.map((row) => row.lng);
  const lats = rows.map((row) => row.lat);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const span = Math.max((east - west) * Math.cos(((north + south) / 2) * Math.PI / 180), north - south);
  const zoom = span <= 0.005 ? 15 : Math.max(5, Math.min(15, Math.log2(180 / span) - 1.2));
  return { lng: (west + east) / 2, lat: (south + north) / 2, zoom };
}

export function createSupabaseDiscoverySource(client: HeritageClient | SupabaseClient<Database>): DiscoveryDataSource {
  const source: DiscoveryDataSource = {
    mode: 'live',
    configuration: 'available',
    async getMapPlaces(query) {
      const { data, error } = await client.rpc('map_places', buildMapPlacesArgs(query));
      if (error) throw error;
      return data ?? [];
    },
    async getMapClusters(query) {
      const { data, error } = await client.rpc('map_clusters', buildMapClustersArgs(query));
      if (error) throw error;
      return data ?? [];
    },
    async getCoverage(bounds) {
      const { data, error } = await client.rpc('coverage_for_viewport', {
        bbox_sw_lng: bounds.swLng,
        bbox_sw_lat: bounds.swLat,
        bbox_ne_lng: bounds.neLng,
        bbox_ne_lat: bounds.neLat,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async getPeriodCounts(bounds, state) {
      const { data, error } = await client.rpc('period_counts_for_viewport', buildPeriodCountsArgs(bounds, state));
      if (error) throw error;
      return data ?? [];
    },
    async searchDiscovery(query, maxRows = 12) {
      if (!query.trim()) return [];
      const { data, error } = await client.rpc('search_discovery', { q: query.trim(), max_rows: Math.min(Math.max(maxRows, 1), 50) });
      if (error) throw error;
      return normaliseSearchRows(data ?? []);
    },
    async getPersonPlaces(personId, maxRows = 200) {
      const { data, error } = await client.rpc('person_places', { p_person_id: personId, max_rows: Math.min(Math.max(maxRows, 1), 200) });
      if (error) throw error;
      return data ?? [];
    },
    async resolvePerson(slug) {
      const { data, error } = await client.rpc('person_by_slug', { p_slug: slug });
      if (error) throw error;
      const row = data?.[0];
      return row && row.kind === 'person' ? { ...row, kind: 'person' } : null;
    },
    async getRelatedPeople(personId, maxRows = 12) {
      const { data, error } = await client.rpc('related_people', { p_person_id: personId, max_rows: Math.min(Math.max(maxRows, 1), 12) });
      if (error) throw error;
      return data ?? [];
    },
    async getPlace(id) {
      const { data, error } = await client.from('places').select('id,slug,name,place_type,county,town,description,summary,primary_period,location_accuracy_m,status,survival_status').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: geo, error: geoError } = await client.from('places_geo').select('lat,lng').eq('id', id).maybeSingle();
      if (geoError) throw geoError;
      const { data: designations, error: designationError } = await client.from('place_designations').select('designation,grade,reference,url').eq('place_id', id).limit(1);
      if (designationError) throw designationError;
      const placeType = data.place_type as DiscoveryPlaceType;
      const categoryResult = await client.rpc('place_display_category', { p_place_type: placeType });
      if (categoryResult.error) throw categoryResult.error;
      const people = await client.rpc('place_people', { p_place_id: id, max_rows: 50 });
      if (people.error) throw people.error;
      return {
        id: data.id,
        slug: data.slug,
        name: data.name,
        placeType,
        category: (categoryResult.data ?? 'other') as DisplayCategoryId,
        location: { label: [data.town, data.county].filter(Boolean).join(', ') || 'United Kingdom', latitude: geo?.lat ?? 0, longitude: geo?.lng ?? 0 },
        periodIds: data.primary_period ? [data.primary_period] : [],
        periodSummary: data.primary_period ? periodById(data.primary_period)?.name ?? data.primary_period : 'No dated period recorded',
        ...(designations?.[0]?.designation ? { designation: designations[0].designation } : {}),
        description: data.description ?? data.summary ?? 'This published place record does not yet have an editorial description.',
        source: 'Whilom published heritage graph',
        saved: false,
        visited: false,
        coverage: 'full',
        people: (people.data ?? []).map((person) => person.person_id),
        relatedPlaces: [],
      };
    },
    async getPerson(id) {
      const { data, error } = await client.from('people').select('id,slug,name,birth_year,death_year,biography,titles').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [links, related] = await Promise.all([
        source.getPersonPlaces(id, 200),
        source.getRelatedPeople(id, 12),
      ]);
      return {
        id: data.id,
        slug: data.slug,
        name: data.name,
        lifeDates: [data.birth_year ? String(data.birth_year) : null, data.death_year ? String(data.death_year) : null].filter(Boolean).join('–') || 'Dates not recorded',
        role: data.titles?.join(' · ') || 'Historical person',
        description: data.biography ?? 'This published person record does not yet have an editorial biography.',
        placeLinks: links.map((link) => ({ placeId: link.place_id, predicate: link.predicate as DiscoveryRelationship, note: link.relationship_note ?? 'Relationship recorded in Whilom.' })),
        relatedPeople: related.map((person) => person.person_id),
      };
    },
    async getSavedPlaces() {
      // Account-owned wishlist reads are intentionally kept out of this public
      // discovery contract until the mobile auth/persistence seam is wired.
      return [];
    },
    async getVisitedPlaces() {
      return [];
    },
  };
  return source;
}

export { EntityType };
