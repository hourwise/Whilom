import {
  createSupabaseDiscoverySource,
  type Coverage,
  type DiscoveryDataSource,
  type DiscoveryPerson,
  type DiscoveryPlace,
  type DiscoveryPlaceType,
  type DiscoveryState,
  type DisplayCategoryId,
  type MapBounds,
  type MapCluster,
  type MapPlace,
  type PeriodCount,
  type PersonPlace,
  type RelatedPerson,
  type ResolvedPerson,
  type SearchResult,
  type MapQuery,
} from '@whilom/discovery';
import { developmentDataSource, placesForCoverage, type DemoPerson, type DemoPlace } from './fixtures';
import { getMobileSupabaseClient } from './supabase';

export type MobileDataMode = 'fixture' | 'live';

export interface MobileDiscoveryRuntime {
  mode: MobileDataMode;
  configuration: 'available' | 'unavailable';
  source: DiscoveryDataSource;
}

function toMapPlace(place: DemoPlace): MapPlace {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    place_type: place.placeType,
    lng: place.location.longitude,
    lat: place.location.latitude,
    location_accuracy_m: 25,
    primary_designation: place.designation ?? '',
    thumbnail_url: '',
    survival_status: place.placeType === 'ruin' ? 'ruined' : 'surviving',
    period_summary: place.periodSummary,
    display_category: place.category,
  };
}

/** Map RPC rows are deliberately small; this is the honest card-sized view model. */
export function discoveryPlaceFromMapPlace(place: MapPlace): DiscoveryPlace {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    placeType: place.place_type as DiscoveryPlaceType,
    category: place.display_category as DisplayCategoryId,
    location: { label: 'Mapped location', latitude: place.lat, longitude: place.lng },
    periodIds: [],
    periodSummary: place.period_summary || 'Period not recorded',
    ...(place.primary_designation ? { designation: place.primary_designation } : {}),
    description: 'Open the place record for the fuller Whilom story and source trail.',
    source: 'Whilom map discovery record',
    ...(place.thumbnail_url ? { thumbnailUrl: place.thumbnail_url } : {}),
    saved: false,
    visited: false,
    coverage: 'full',
    people: [],
    relatedPlaces: [],
  };
}

function toMapCluster(place: DemoPlace, index: number): MapCluster {
  return {
    cell_key: `fixture-${index}`,
    place_count: 1,
    lng: place.location.longitude,
    lat: place.location.latitude,
    sample_place_id: place.id,
    sample_name: place.name,
    dominant_category: place.category,
    category_count: 1,
  };
}

function toPersonPlace(link: DemoPerson['placeLinks'][number], place: DemoPlace): PersonPlace {
  return {
    place_id: place.id,
    slug: place.slug,
    name: place.name,
    place_type: place.placeType,
    display_category: place.category,
    lng: place.location.longitude,
    lat: place.location.latitude,
    predicate: link.predicate,
    relationship_note: link.note,
    in_coverage: place.coverage !== 'none',
  };
}

function toSearchResult(result: ReturnType<typeof developmentDataSource.search>[number]): SearchResult {
  if (result.kind === 'place') {
    return {
      kind: 'place',
      id: result.item.id,
      slug: result.item.slug,
      display_name: result.item.name,
      detail: result.item.placeType,
      context: result.item.location.label,
      lng: result.item.location.longitude,
      lat: result.item.location.latitude,
      rank: 1,
    };
  }
  return {
    kind: 'person',
    id: result.item.id,
    slug: result.item.slug,
    display_name: result.item.name,
    detail: `${result.item.lifeDates} · ${result.item.role}`,
    context: `${result.item.placeLinks.length} recorded place link${result.item.placeLinks.length === 1 ? '' : 's'}`,
    lng: null,
    lat: null,
    rank: 1,
  };
}

const fixtureSource: DiscoveryDataSource = {
  mode: 'fixture',
  configuration: 'available',
  async getMapPlaces({ bounds, state }: MapQuery) {
    const coverageMode = bounds.swLng > 0 ? 'outside' : bounds.swLng < -2.5 ? 'uk' : 'nearby';
    return placesForCoverage(coverageMode)
      .filter((place) => !state.categories.length || state.categories.includes(place.category))
      .filter((place) => !state.periodId || place.periodIds.includes(state.periodId))
      .filter((place) => !state.q || place.name.toLocaleLowerCase().includes(state.q.toLocaleLowerCase()))
      .map(toMapPlace);
  },
  async getMapClusters({ bounds, state }: MapQuery) {
    const places = await fixtureSource.getMapPlaces({ bounds, state });
    return places.map((place, index) => toMapCluster(developmentDataSource.placeById(place.id)!, index));
  },
  async getCoverage(bounds: MapBounds): Promise<Coverage | null> {
    if (bounds.swLng > 0) return { covered_fraction: 0, region_ids: [], region_names: [] };
    const full = bounds.swLng > -2.5 && bounds.neLng < 0.1 && bounds.swLat > 53 && bounds.neLat < 55;
    return { covered_fraction: full ? 1 : 0.42, region_ids: ['fixture-yorkshire'], region_names: ['Yorkshire'] };
  },
  async getPeriodCounts(_bounds: MapBounds, state: DiscoveryState): Promise<PeriodCount[]> {
    return placesForCoverage('nearby').flatMap((place) => place.periodIds).filter((periodId) => !state.periodId || periodId === state.periodId).map((periodId, index) => ({ period_id: periodId, display_name: periodId.replace(/_/g, ' '), display_order: index, place_count: 1 }));
  },
  async searchDiscovery(query: string): Promise<SearchResult[]> {
    return developmentDataSource.search(query).map(toSearchResult);
  },
  async getPersonPlaces(personId: string, maxRows = 200): Promise<PersonPlace[]> {
    const person = developmentDataSource.personById(personId);
    if (!person) return [];
    return person.placeLinks.slice(0, maxRows).flatMap((link) => {
      const place = developmentDataSource.placeById(link.placeId);
      return place ? [toPersonPlace(link, place)] : [];
    });
  },
  async resolvePerson(slug: string): Promise<ResolvedPerson | null> {
    const person = developmentDataSource.people.find((item) => item.slug === slug);
    if (!person) return null;
    const result = toSearchResult({ kind: 'person', item: person });
    return { ...result, kind: 'person' };
  },
  async getRelatedPeople(): Promise<RelatedPerson[]> {
    return [];
  },
  async getPlace(id: string): Promise<DiscoveryPlace | null> {
    return developmentDataSource.placeById(id) ?? null;
  },
  async getPerson(id: string): Promise<DiscoveryPerson | null> {
    return developmentDataSource.personById(id) ?? null;
  },
  async getSavedPlaces() {
    return developmentDataSource.places.filter((place) => place.saved);
  },
  async getVisitedPlaces() {
    return developmentDataSource.places.filter((place) => place.visited);
  },
};

const unavailableSource: DiscoveryDataSource = {
  ...fixtureSource,
  mode: 'live',
  configuration: 'unavailable',
  async getMapPlaces() { throw new Error('Live discovery is selected but public Supabase configuration is unavailable.'); },
  async getMapClusters() { throw new Error('Live discovery is selected but public Supabase configuration is unavailable.'); },
  async getCoverage() { throw new Error('Live discovery is selected but public Supabase configuration is unavailable.'); },
  async getPeriodCounts() { throw new Error('Live discovery is selected but public Supabase configuration is unavailable.'); },
  async searchDiscovery() { throw new Error('Live discovery is selected but public Supabase configuration is unavailable.'); },
  async getPersonPlaces() { throw new Error('Live discovery is selected but public Supabase configuration is unavailable.'); },
  async resolvePerson() { throw new Error('Live discovery is selected but public Supabase configuration is unavailable.'); },
  async getRelatedPeople() { throw new Error('Live discovery is selected but public Supabase configuration is unavailable.'); },
  async getPlace() { throw new Error('Live discovery is selected but public Supabase configuration is unavailable.'); },
  async getPerson() { throw new Error('Live discovery is selected but public Supabase configuration is unavailable.'); },
  async getSavedPlaces() { throw new Error('Live discovery is selected but public Supabase configuration is unavailable.'); },
  async getVisitedPlaces() { throw new Error('Live discovery is selected but public Supabase configuration is unavailable.'); },
};

export function getMobileDiscoveryRuntime(): MobileDiscoveryRuntime {
  const requestedMode = process.env.EXPO_PUBLIC_WHILOM_DATA_MODE?.trim().toLowerCase();
  if (requestedMode !== 'live') return { mode: 'fixture', configuration: 'available', source: fixtureSource };
  const client = getMobileSupabaseClient();
  if (!client) return { mode: 'live', configuration: 'unavailable', source: unavailableSource };
  return { mode: 'live', configuration: 'available', source: createSupabaseDiscoverySource(client) };
}

export { fixtureSource };
