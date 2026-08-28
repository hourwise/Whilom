import type { HeritageClient } from '@whilom/database';
import {
  createSupabaseDiscoverySource,
  type DiscoveryState,
  type MapBounds,
} from '@whilom/discovery';

/**
 * Web keeps this compatibility module so existing components do not need a
 * visual refactor. The discovery vocabulary and pure helpers now live in
 * @whilom/discovery; these small functions are only the Web server/client
 * adapter calls retained for the current component API.
 */
export {
  DEFAULT_STATE,
  DISCOVERY_MODES,
  DISPLAY_CATEGORIES,
  MODE_TYPES,
  PERIODS,
  PLACE_ZOOM_THRESHOLD,
  TIME_MODE_LABELS,
  TIME_MODES,
  buildMapClustersArgs,
  buildMapPlacesArgs,
  buildPeriodCountsArgs,
  cellDegreesForZoom,
  coverageMessage,
  displayCategory,
  effectiveTypes,
  emptyStateMessage,
  formatPeriodSpan,
  formatYear,
  hasActiveFilters,
  paramsFromState,
  periodById,
  personPlacesAsMapPlaces,
  relationshipLabel,
  stateFromParams,
  viewportForPlaces,
} from '@whilom/discovery';
export type {
  Coverage,
  DiscoveryMode,
  DiscoveryState,
  DisplayCategory,
  MapBounds,
  MapCluster,
  MapPlace,
  Period,
  PeriodCount,
  PersonPlace,
  RelatedPerson,
  ResolvedPerson,
  SearchResult,
  TimeMode,
} from '@whilom/discovery';

function source(client: HeritageClient) {
  return createSupabaseDiscoverySource(client);
}

export async function fetchClusters(
  supabase: HeritageClient,
  bounds: MapBounds,
  state: DiscoveryState,
  personId?: string | null,
) {
  return source(supabase).getMapClusters({ bounds, state, personId });
}

export async function fetchPlaces(
  supabase: HeritageClient,
  bounds: MapBounds,
  state: DiscoveryState,
  personId?: string | null,
) {
  return source(supabase).getMapPlaces({ bounds, state, personId });
}

export async function fetchCoverage(supabase: HeritageClient, bounds: MapBounds) {
  try {
    return await source(supabase).getCoverage(bounds);
  } catch {
    return null;
  }
}

export async function fetchPeriodCounts(supabase: HeritageClient, bounds: MapBounds, state: DiscoveryState) {
  try {
    return await source(supabase).getPeriodCounts(bounds, state);
  } catch {
    return [];
  }
}

export async function searchDiscovery(supabase: HeritageClient, q: string, maxRows = 12) {
  return source(supabase).searchDiscovery(q, maxRows);
}

export async function fetchPersonPlaces(supabase: HeritageClient, personId: string, maxRows = 200) {
  return source(supabase).getPersonPlaces(personId, maxRows);
}

export async function fetchPersonBySlug(supabase: HeritageClient, slug: string) {
  try {
    return await source(supabase).resolvePerson(slug);
  } catch {
    return null;
  }
}

export async function fetchRelatedPeople(supabase: HeritageClient, personId: string, maxRows = 12) {
  try {
    return await source(supabase).getRelatedPeople(personId, maxRows);
  } catch {
    return [];
  }
}
