import type { DesignationGrade, DesignationType, LngLat, PlaceType } from '@whilom/domain';
import type { RawProvenance } from '../sources/source-adapter';

/**
 * The normalised import model (spec §34, §35).
 *
 * A `PlaceCandidate` is deliberately NOT a `places` row. Nothing in this file
 * may be written straight into the canonical tables: a candidate carries its
 * source identity and review state with it, and only the PUBLISH stage — after
 * matching and, where required, human review — turns one into canonical data
 * plus a `source_records` row. That separation is what keeps an imported claim
 * distinguishable from an editorial or community fact.
 */

/** Provenance as it exists once a record is inside a run (spec §34). */
export interface CandidateProvenance extends RawProvenance {
  /** Identity of the `import_runs` row this record belongs to. */
  importRunId: string;
}

/** An identifier this record carries in some external system. */
export interface ExternalId {
  /** Scheme name, e.g. 'nhle' (Historic England list entry) or 'wikidata'. */
  scheme: string;
  value: string;
}

export interface CandidateDesignation {
  designation: DesignationType;
  grade?: DesignationGrade;
  /** The source's own reference, e.g. the NHLE list entry number. */
  reference?: string;
  firstDesignated?: string;
  url?: string;
}

export interface PlaceCandidate {
  provenance: CandidateProvenance;
  name: string;
  altNames: string[];
  placeType: PlaceType;
  /**
   * How far the type mapping can be trusted, 0..1. NHLE publishes no type
   * vocabulary at all — the type is inferred from the record's name — so this
   * is frequently low, and the matcher must not treat a guessed type as
   * evidence that two records are different places.
   */
  placeTypeConfidence: number;
  /** The source's own vocabulary term, retained so mapping stays auditable. */
  rawType?: string;
  /** Non-fatal normalisation problems, carried forward for review triage. */
  warnings: string[];
  location: LngLat;
  /**
   * Positional uncertainty in metres. Derived from the source's capture scale
   * plus reprojection residual — the matcher must not treat a 1:10000 record as
   * if it located a building to the metre.
   */
  locationUncertaintyMeters: number;
  designations: CandidateDesignation[];
  externalIds: ExternalId[];
  town?: string;
  county?: string;
  postcode?: string;
  /** Area in hectares where the source publishes one (polygon layers). */
  areaHectares?: number;
  /** Free-form source notes, e.g. NHLE "Buffer Zone". */
  sourceNotes?: string;
}

/** Why a record was rejected before it ever reached matching. */
export interface RejectedRecord {
  provenance: CandidateProvenance;
  name?: string;
  reasons: string[];
}

// --- Matching ---------------------------------------------------------------

/**
 * The decision the matcher reached (spec §36). These are the only outcomes; a
 * record is never silently merged, and anything short of confident lands in a
 * review queue rather than in canonical data.
 */
export const MatchOutcome = {
  /** No plausible existing place — create a new canonical record. */
  NewCanonical: 'NEW_CANONICAL',
  /** Same real-world place as an existing record, safe to attach. */
  MatchConfident: 'MATCH_CONFIDENT',
  /** Plausibly the same place; a human decides. */
  MatchReview: 'MATCH_REVIEW',
  /** Matched, but the sources disagree on a field that matters. */
  ConflictReview: 'CONFLICT_REVIEW',
  /** Structurally unusable — never reaches a queue as a place. */
  RejectInvalid: 'REJECT_INVALID',
} as const;
export type MatchOutcome = (typeof MatchOutcome)[keyof typeof MatchOutcome];

/** A single named signal that contributed to a match score. */
export interface MatchSignal {
  name: string;
  /** Contribution to the score, positive or negative. */
  weight: number;
  detail: string;
}

/** A field two sources disagree about, surfaced for review rather than merged. */
export interface FieldConflict {
  field: string;
  existingValue: string;
  candidateValue: string;
}

export interface MatchDecision {
  outcome: MatchOutcome;
  /** 0..1. Not a probability — a calibrated ordering for triage. */
  confidence: number;
  /** The canonical place this was matched to, when there is one. */
  matchedPlaceId?: string;
  signals: MatchSignal[];
  conflicts: FieldConflict[];
  /** Human-readable justification, stored with the review item. */
  rationale: string;
}

/**
 * An existing canonical place, as far as the matcher needs to know about one.
 * Kept minimal and storage-agnostic so the matcher is testable without a
 * database — the local-DB dry run supplies the same shape from a query.
 */
export interface CanonicalPlaceRef {
  id: string;
  name: string;
  altNames: string[];
  placeType: PlaceType;
  location: LngLat;
  externalIds: ExternalId[];
  designationReferences: string[];
  postcode?: string;
  town?: string;
  county?: string;
}
