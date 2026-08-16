import type { RawPlaceRecord } from '../sources/source-adapter';

/**
 * The governed pipeline stages (spec §35):
 *
 *   SOURCE → RAW → NORMALISE → VALIDATE → MATCH/DEDUPE → ENRICH
 *          → CONFLICT DETECTION → REVIEW (when required) → PUBLISH
 *
 * Each stage is a pure-ish function so runs are testable and auditable. These
 * are typed contracts; concrete implementations land in Phase 2 (spec §44).
 */

export interface NormalisedPlace {
  name: string;
  placeType: string;
  lng: number;
  lat: number;
  designation?: string;
  altNames: string[];
  provenance: RawPlaceRecord['provenance'];
}

export interface MatchResult {
  /** Existing canonical place id if a confident match was found. */
  canonicalPlaceId?: string;
  confidence: number;
  /** True when the match is ambiguous and must go to human review (spec §36). */
  needsReview: boolean;
}

export type Normalise = (raw: RawPlaceRecord) => NormalisedPlace | null;
export type Validate = (place: NormalisedPlace) => { ok: boolean; errors: string[] };
export type Match = (place: NormalisedPlace) => Promise<MatchResult>;

export interface Pipeline {
  normalise: Normalise;
  validate: Validate;
  match: Match;
}
