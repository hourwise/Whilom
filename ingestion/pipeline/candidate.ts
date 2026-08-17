import type {
  DesignationGrade,
  DesignationType,
  LngLat,
  LocationMethod,
  PlaceType,
} from '@whilom/domain';
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

/**
 * The coordinate exactly as the source published it, plus how it was converted.
 *
 * Retained so a conversion can be re-run or audited without re-fetching, and so
 * a later, better transformation (OSTN15) is distinguishable from this one.
 * Persisted onto `source_records`, not onto `places` — the canonical row holds
 * Whilom's current best estimate; this holds what one source claimed.
 */
export interface SourcePosition {
  /** e.g. 'EPSG:27700'. */
  crs: string;
  /** Original values in the source CRS, e.g. { easting, northing }. */
  coordinates: Record<string, number>;
  /** Transformation identifier and version, e.g. 'osgb36-to-wgs84/helmert-7param@0.1.0'. */
  conversion: string;
  /** Precision the source itself asserted, if any. Not Whilom's estimate. */
  sourcePrecisionMeters?: number;
  /** Why the accuracy figure is what it is, in words. */
  accuracyBasis: string;
}

/**
 * One publishable claim. `predicate` must exist in the `fact_predicates`
 * registry or publication refuses it.
 */
export interface CandidateFact {
  predicate: string;
  value: string | number | boolean;
  /** The value exactly as the source expressed it, before typing. */
  sourceValue?: string;
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
  /** Which mapping rule fired, so a classification decision stays auditable. */
  placeTypeRule: string;
  /** The source's own vocabulary term, retained so mapping stays auditable. */
  rawType?: string;
  /** Non-fatal normalisation problems, carried forward for review triage. */
  warnings: string[];
  location: LngLat;
  /** How this coordinate was arrived at. */
  locationMethod: LocationMethod;
  /**
   * Radius in metres within which the real feature is expected to lie.
   *
   * Derived from what the coordinate *is* — a published point, or the centroid
   * of an area — never from how precisely it was converted. The matcher depends
   * on the difference: a centroid of a 33-hectare precinct and a 1:1250 survey
   * point are not the same kind of claim.
   */
  locationAccuracyMeters: number;
  /** What the source published, before Whilom touched it. */
  sourcePosition?: SourcePosition;
  designations: CandidateDesignation[];
  externalIds: ExternalId[];
  town?: string;
  county?: string;
  postcode?: string;
  /** Area in hectares where the source publishes one (polygon layers). */
  areaHectares?: number;
  /**
   * Year the place came into being, where a source states one.
   *
   * Deliberately a single named predicate. It is compared only against another
   * inception year — a source stating a *completion* date is answering a
   * different question, and conflating the two would manufacture conflicts.
   */
  inceptionYear?: number;
  /** Official website, where a source states one. */
  officialWebsite?: string;
  /** Wikimedia Commons category. Recorded as a pointer; no image is ingested. */
  commonsCategory?: string;
  /**
   * People a source associates with the place.
   *
   * `externalId` is the source's own identifier for the person where it has
   * one. Publication resolves a person through it rather than by name, so two
   * different people who happen to share a name stay two people.
   */
  relatedPeople?: { label: string; role: string; externalId?: string }[];
  /**
   * Facts to publish, as predicate/value pairs.
   *
   * Deliberately a list rather than named columns: publication iterates it
   * against the `fact_predicates` registry, so a new fact is a mapping here
   * plus a registry row — never a change to the publish procedure.
   */
  facts?: CandidateFact[];
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
  /** Known positional uncertainty of the canonical row, when recorded. */
  locationAccuracyMeters?: number;
  externalIds: ExternalId[];
  designationReferences: string[];
  postcode?: string;
  town?: string;
  county?: string;
}
