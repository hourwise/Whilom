import { placeCandidateSchema } from '@whilom/validation';
import type { EnrichmentSource } from '../enrichment/enrichment-source';
import { ENRICHMENT_COORDINATE_TOLERANCE_METERS } from '../enrichment/enrichment-source';
import { applyEnrichment } from '../enrichment/wikidata';
import { matchCandidate } from '../matching/matcher';
import type { SourceAdapter } from '../sources/source-adapter';
import { normaliseNhleRecord } from '../transforms/normalise-nhle';
import { distanceMeters } from '../transforms/osgb';
import { GENERIC_FALLBACK_RULE } from '../transforms/place-type';
import type {
  CanonicalPlaceRef,
  MatchDecision,
  PlaceCandidate,
  RejectedRecord,
} from './candidate';
import { MatchOutcome } from './candidate';

/**
 * The bounded pipeline runner (spec §35).
 *
 * SOURCE → RAW → NORMALISE → VALIDATE → MATCH/DEDUPE → ENRICH
 *        → CONFLICT DETECTION → REVIEW → PUBLISH
 *
 * One deliberate refinement of that order, found while building the Yorkshire
 * POC and recorded in docs/INGESTION.md: identifier resolution runs *before*
 * matching, while content enrichment stays after it. A shared Wikidata QID is
 * the single strongest matching signal available — NHLE 1014395 and 1149811 are
 * provably the same abbey because both carry P1216 links to Q540237 — and it is
 * worthless if it only arrives once the match has already been decided.
 * Enrichment that adds *content* (imagery, periods, people) remains post-match.
 *
 * PUBLISH is not implemented here. Turning candidates into canonical rows needs
 * a database, and this batch is under a local-storage gate; the runner instead
 * reports exactly what it would have published and what it would have queued.
 */

export interface RunOptions {
  importRunId: string;
  adapter: SourceAdapter;
  /** Canonical places already in the database. Empty for a first run. */
  existingPlaces?: readonly CanonicalPlaceRef[];
  /** Identifier/structured enrichment, applied before matching. */
  enrichmentSource?: EnrichmentSource;
  /** Cap on source rows processed, so a run stays bounded. */
  maxRecords?: number;
}

export interface DecidedCandidate {
  candidate: PlaceCandidate;
  decision: MatchDecision;
  /** True when the match was against a candidate created earlier in this run. */
  withinRun: boolean;
}

export interface RunReport {
  importRunId: string;
  sourceId: string;
  startedAt: string;
  finishedAt: string;
  runtimeMs: number;
  /** Rows the adapter emitted. */
  sourceRows: number;
  /** Rows that normalised and passed schema validation. */
  valid: number;
  /** Rows rejected during normalise or validate. */
  rejected: number;
  /** Candidates that received enrichment. */
  enriched: number;
  outcomes: Record<MatchOutcome, number>;
  /** Matches (confident or review) against another record in the same run. */
  duplicatesWithinRun: number;
  /** Total field-level disagreements raised. */
  conflicts: number;
  /**
   * Candidates that got the generic `structure` classification because their
   * name yielded no specific type. A real classification, not a placeholder,
   * but still the honest measure of how much NHLE we cannot type precisely.
   */
  genericallyTyped: number;
  rejections: RejectedRecord[];
  decided: DecidedCandidate[];
}

function emptyOutcomes(): Record<MatchOutcome, number> {
  return {
    [MatchOutcome.NewCanonical]: 0,
    [MatchOutcome.MatchConfident]: 0,
    [MatchOutcome.MatchReview]: 0,
    [MatchOutcome.ConflictReview]: 0,
    [MatchOutcome.RejectInvalid]: 0,
  };
}

/** Project an accepted candidate into the shape the matcher compares against. */
export function candidateAsCanonical(candidate: PlaceCandidate, id: string): CanonicalPlaceRef {
  return {
    id,
    name: candidate.name,
    altNames: candidate.altNames,
    placeType: candidate.placeType,
    location: candidate.location,
    locationAccuracyMeters: candidate.locationAccuracyMeters,
    externalIds: candidate.externalIds,
    designationReferences: candidate.designations
      .map((d) => d.reference)
      .filter((r): r is string => typeof r === 'string'),
    ...(candidate.postcode ? { postcode: candidate.postcode } : {}),
    ...(candidate.town ? { town: candidate.town } : {}),
    ...(candidate.county ? { county: candidate.county } : {}),
  };
}

export async function runIngestion(options: RunOptions): Promise<RunReport> {
  const { importRunId, adapter, enrichmentSource, maxRecords } = options;
  const startedAt = new Date();

  const report: RunReport = {
    importRunId,
    sourceId: adapter.id,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    runtimeMs: 0,
    sourceRows: 0,
    valid: 0,
    rejected: 0,
    enriched: 0,
    outcomes: emptyOutcomes(),
    duplicatesWithinRun: 0,
    conflicts: 0,
    genericallyTyped: 0,
    rejections: [],
    decided: [],
  };

  // Places the matcher compares against: what is already canonical, plus what
  // this run has decided to create. Without the second half, two source rows
  // describing one abbey would both be filed as new.
  const existing: CanonicalPlaceRef[] = [...(options.existingPlaces ?? [])];
  const preexistingIds = new Set(existing.map((p) => p.id));
  let createdInRun = 0;

  for await (const raw of adapter.fetch()) {
    if (maxRecords !== undefined && report.sourceRows >= maxRecords) break;
    report.sourceRows += 1;

    // --- NORMALISE ----------------------------------------------------------
    const normalised = normaliseNhleRecord(raw, importRunId);
    if (!normalised.ok) {
      report.rejected += 1;
      report.rejections.push(normalised.rejected);
      report.outcomes[MatchOutcome.RejectInvalid] += 1;
      continue;
    }

    // --- VALIDATE -----------------------------------------------------------
    const parsed = placeCandidateSchema.safeParse(normalised.candidate);
    if (!parsed.success) {
      report.rejected += 1;
      report.rejections.push({
        provenance: normalised.candidate.provenance,
        name: normalised.candidate.name,
        reasons: parsed.error.issues.map((i) => `${i.path.join('.') || 'record'}: ${i.message}`),
      });
      report.outcomes[MatchOutcome.RejectInvalid] += 1;
      continue;
    }

    report.valid += 1;
    let candidate = normalised.candidate;
    if (candidate.placeTypeRule === GENERIC_FALLBACK_RULE) report.genericallyTyped += 1;

    // --- IDENTIFIER RESOLUTION (see note above) -----------------------------
    if (enrichmentSource) {
      const enrichment = await enrichmentSource.enrich(candidate);
      if (enrichment) {
        report.enriched += 1;
        candidate = applyEnrichment(
          candidate,
          enrichment,
          ENRICHMENT_COORDINATE_TOLERANCE_METERS,
          distanceMeters,
        );
      }
    }

    // --- MATCH / DEDUPE -----------------------------------------------------
    const decision = matchCandidate(candidate, existing);
    const withinRun =
      decision.matchedPlaceId !== undefined && !preexistingIds.has(decision.matchedPlaceId);

    report.outcomes[decision.outcome] += 1;
    report.conflicts += decision.conflicts.length;
    if (
      withinRun &&
      (decision.outcome === MatchOutcome.MatchConfident ||
        decision.outcome === MatchOutcome.MatchReview ||
        decision.outcome === MatchOutcome.ConflictReview)
    ) {
      report.duplicatesWithinRun += 1;
    }

    // Only a new canonical record joins the comparison set. A record awaiting
    // review must not become something later records can match against —
    // that would let one uncertain decision propagate through the whole run.
    if (decision.outcome === MatchOutcome.NewCanonical) {
      createdInRun += 1;
      existing.push(candidateAsCanonical(candidate, `run:${importRunId}:${createdInRun}`));
    }

    report.decided.push({ candidate, decision, withinRun });
  }

  const finishedAt = new Date();
  report.finishedAt = finishedAt.toISOString();
  report.runtimeMs = finishedAt.getTime() - startedAt.getTime();
  return report;
}
