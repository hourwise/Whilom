import type { PlaceSearchInput } from '@heritage/validation';

/**
 * @heritage/search
 *
 * Translates validated search input (spec §37) into the arguments for the
 * `search_places` Postgres RPC. Keeping this here means web and mobile issue
 * identical queries, and the SQL contract has one owner.
 *
 * Later phases can add a second strategy (semantic / natural-language) behind
 * the same `SearchStrategy` interface without touching callers.
 */

export interface SearchPlacesRpcArgs {
  q: string | null;
  center_lng: number | null;
  center_lat: number | null;
  radius_m: number | null;
  bbox_sw_lng: number | null;
  bbox_sw_lat: number | null;
  bbox_ne_lng: number | null;
  bbox_ne_lat: number | null;
  place_types: string[] | null;
  periods: string[] | null;
  cost: string | null;
  visitable_only: boolean;
  max_rows: number;
  row_offset: number;
}

export interface SearchStrategy {
  buildArgs(input: PlaceSearchInput): SearchPlacesRpcArgs;
}

/** Default strategy: PostGIS + full-text, matching the `search_places` RPC. */
export const postgisTextStrategy: SearchStrategy = {
  buildArgs(input) {
    return {
      q: input.text ?? null,
      center_lng: input.center?.lng ?? null,
      center_lat: input.center?.lat ?? null,
      radius_m: input.radiusMeters ?? null,
      bbox_sw_lng: input.bbox?.sw.lng ?? null,
      bbox_sw_lat: input.bbox?.sw.lat ?? null,
      bbox_ne_lng: input.bbox?.ne.lng ?? null,
      bbox_ne_lat: input.bbox?.ne.lat ?? null,
      place_types: input.types ?? null,
      periods: input.periods ?? null,
      cost: input.cost ?? null,
      visitable_only: input.visitableOnly ?? false,
      max_rows: input.limit,
      row_offset: input.offset,
    };
  },
};

export const buildSearchArgs = (input: PlaceSearchInput): SearchPlacesRpcArgs =>
  postgisTextStrategy.buildArgs(input);
