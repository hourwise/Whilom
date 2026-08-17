import type { LngLat } from '@whilom/domain';
import type { ExternalId, PlaceCandidate } from '../pipeline/candidate';
import type { RawProvenance } from '../sources/source-adapter';

/**
 * The ENRICH seam (spec §35).
 *
 * Enrichment attaches *additional* structured facts to a candidate from a
 * second source. Two rules make it safe:
 *
 *   1. It never mutates the primary candidate. An `Enrichment` is returned
 *      alongside, carrying its own provenance, so a Wikidata coordinate stays
 *      attributable to Wikidata and never becomes an NHLE fact.
 *   2. It is structured data only — identifiers, dates, coordinates, links.
 *      Prose is not enrichment; copying descriptive text out of another source
 *      is a licensing and provenance problem, not a feature.
 */

export interface Enrichment {
  /** Provenance of the enriching source, distinct from the candidate's own. */
  provenance: RawProvenance;
  externalIds: ExternalId[];
  altNames: string[];
  /** The enriching source's own coordinate, for cross-checking, never merging. */
  coordinates?: LngLat;
  /** Year of construction/founding where the source states one. */
  inceptionYear?: number;
  officialWebsite?: string;
  /** Wikimedia Commons category. Recorded only; images are NOT ingested yet. */
  commonsCategory?: string;
  /** People the source links to this place, as identifiers plus a label. */
  relatedPeople: { label: string; externalId: ExternalId; role?: string }[];
}

export interface EnrichmentSource {
  readonly id: string;
  readonly displayName: string;
  readonly licence?: string;
  /** Returns null when the source has nothing for this candidate. */
  enrich(candidate: PlaceCandidate): Promise<Enrichment | null>;
}

/**
 * Distance beyond which an enriching source's coordinate disagrees with the
 * primary source enough to be worth a human look rather than silent acceptance.
 */
export const ENRICHMENT_COORDINATE_TOLERANCE_METERS = 500;
