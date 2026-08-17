import type { Database } from '@whilom/database';
import type { PlaceSearchInput } from '@whilom/validation';

/**
 * @whilom/search
 *
 * Translates validated search input (spec §37) into the arguments for the
 * `search_places` Postgres RPC. Keeping this here means web and mobile issue
 * identical queries, and the SQL contract has one owner.
 *
 * Later phases can add a second strategy (semantic / natural-language) behind
 * the same `SearchStrategy` interface without touching callers.
 */

/**
 * Taken straight from the generated schema rather than restated here, so the
 * SQL function signature has exactly one owner. If a migration changes
 * `search_places`, CI regenerates the types and this stops compiling — which is
 * the whole point of the drift gate.
 *
 * Note the arguments are optional, not nullable: every parameter of the RPC has
 * a SQL default, so an absent filter is omitted rather than sent as NULL.
 */
export type SearchPlacesRpcArgs = Database['public']['Functions']['search_places']['Args'];

/** One row of the `search_places` result, as the database actually returns it. */
export type SearchPlacesRow = Database['public']['Functions']['search_places']['Returns'][number];

export interface SearchStrategy {
  buildArgs(input: PlaceSearchInput): SearchPlacesRpcArgs;
}

/** Default strategy: PostGIS + full-text, matching the `search_places` RPC. */
export const postgisTextStrategy: SearchStrategy = {
  buildArgs(input) {
    return {
      q: input.text,
      center_lng: input.center?.lng,
      center_lat: input.center?.lat,
      radius_m: input.radiusMeters,
      bbox_sw_lng: input.bbox?.sw.lng,
      bbox_sw_lat: input.bbox?.sw.lat,
      bbox_ne_lng: input.bbox?.ne.lng,
      bbox_ne_lat: input.bbox?.ne.lat,
      place_types: input.types,
      periods: input.periods,
      cost: input.cost,
      visitable_only: input.visitableOnly ?? false,
      max_rows: input.limit,
      row_offset: input.offset,
    };
  },
};

export const buildSearchArgs = (input: PlaceSearchInput): SearchPlacesRpcArgs =>
  postgisTextStrategy.buildArgs(input);
