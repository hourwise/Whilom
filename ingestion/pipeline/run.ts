import { placeCandidateSchema } from '@whilom/validation';
import type { EnrichmentSource } from '../enrichment/enrichment-source';
import { ENRICHMENT_COORDINATE_TOLERANCE_METERS } from '../enrichment/enrichment-source';
import { applyEnrichment } from '../enrichment/wikidata';
import { matchCandidate } from '../matching/matcher';
import type { MatchStats } from '../matching/matcher';
import { CandidateIndex, CandidateMode } from '../matching/candidates';
import type { CandidateStore } from '../matching/candidates';
import type { CandidateGenerationStats } from '../matching/candidates';
import type { CandidateGenerationDelta } from '../matching/candidates';
import {
  SameSourceOverlap,
  classifySameSourceOverlap,
  shouldCompareAcrossSources,
} from '../matching/source-relation';
import { ComparisonOutcome, compareSources } from '../matching/compare';
import type { SourceComparison } from '../matching/compare';
import type { RawPlaceRecord, SourceAdapter } from '../sources/source-adapter';
import type { NormaliseResult } from '../transforms/normalise-nhle';
import { distanceMeters } from '../transforms/osgb';
import { isFallbackClassification } from '../transforms/place-type';
import { buildCandidateFacts } from './facts';
import type { CanonicalPlaceRef, MatchDecision, PlaceCandidate, RejectedRecord } from './candidate';
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

/**
 * One source in a run. The normaliser travels with the adapter, so adding a
 * source is a matter of supplying a pair — there is no per-source branching
 * anywhere in the runner.
 */
export interface SourceSpec {
  adapter: SourceAdapter;
  normalise: (raw: RawPlaceRecord, importRunId: string) => NormaliseResult;
}

/**
 * Optional measurement taps.
 *
 * Added for the staged scale experiment, but deliberately general: knowing
 * where time goes and how many comparisons a record provokes is what you want
 * from any real import, not just a benchmark. When absent the runner behaves
 * exactly as before.
 */
export interface RunObserver {
  /** Accumulates matcher work across the whole run. */
  matchStats?: MatchStats;
  /** Accumulates candidate-generation work across the whole run. */
  candidateStats?: CandidateGenerationStats;
  /** Called once per record that reached the matcher. */
  onRecord?(timings: {
    normaliseMs: number;
    validateMs: number;
    matchMs: number;
    candidate: PlaceCandidate;
    shortlistSize: number;
    candidateGeneration?: CandidateGenerationDelta;
  }): void;
  /** Called once for every matcher decision, including streamed runs. */
  onDecision?(decided: DecidedCandidate): void;
}

export interface RunOptions {
  importRunId: string;
  /** Sources are processed in order, so the first to describe a place wins it. */
  sources: readonly SourceSpec[];
  /** Canonical places already in the database. Empty for a first run. */
  existingPlaces?: readonly CanonicalPlaceRef[];
  /** Identifier/structured enrichment, applied before matching. */
  enrichmentSource?: EnrichmentSource;
  /** Cap on source rows processed, so a run stays bounded. */
  maxRecords?: number;
  /** Measurement taps; see `RunObserver`. */
  observer?: RunObserver;
  /**
   * How the matcher's input set is discovered. Bounded is the production path;
   * exhaustive exists so bounded can be proved equivalent to it.
   */
  candidateMode?: CandidateMode;
  /** A disk-backed store can keep payload memory bounded for national streams. */
  candidateStore?: CandidateStore;
  /** Clear a bounded store after this many source rows. */
  chunkSize?: number;
  /** Do not retain every decision in the report when a caller has a decision tap. */
  retainDecided?: boolean;
}

export interface DecidedCandidate {
  candidate: PlaceCandidate;
  decision: MatchDecision;
  /** True when the match was against a candidate created earlier in this run. */
  withinRun: boolean;
  /**
   * The source record id behind `decision.matchedPlaceId`, when it names a
   * record created in this run.
   *
   * `matchedPlaceId` is a synthetic within-run handle, so it cannot be compared
   * between two runs. The source record id can, which is what lets the
   * equivalence harness assert that two candidate strategies reached the same
   * decision about the same pair of real records.
   */
  matchedSourceRecordId?: string;
  /**
   * Field-level comparison against the record this matched, when it matched.
   * Absent for a new canonical record — there is nothing to compare against.
   */
  comparison?: SourceComparison;
}

export interface RunReport {
  importRunId: string;
  /** Every source that contributed, in the order they ran. */
  sourceIds: string[];
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
  /**
   * Matches where both records came from the same source. These are one
   * source's overlapping records — a duplicate, or two designations over the
   * same ground — not a disagreement between sources, so they are counted
   * here and deliberately kept out of `comparisons` and `conflicts`.
   */
  withinSourceMatches: number;
  /**
   * Why those same-source matches overlap. Descriptive, not adjudicative: it
   * says what kind of overlap one register contains, never that an entry is
   * wrong. See `matching/source-relation.ts`.
   */
  sameSourceOverlaps: Record<SameSourceOverlap, number>;
  /** Total field-level disagreements raised. */
  conflicts: number;
  /**
   * Candidates typed by a fallback rather than by evidence in the name —
   * either what the designation implies, or `unknown` where it implies
   * nothing. The honest measure of how much of a source we cannot type.
   */
  genericallyTyped: number;
  /** Cross-source comparison outcomes, for matched records only. */
  comparisons: Record<ComparisonOutcome, number>;
  rejections: RejectedRecord[];
  decided: DecidedCandidate[];
}

function emptyComparisons(): Record<ComparisonOutcome, number> {
  return {
    [ComparisonOutcome.Agreement]: 0,
    [ComparisonOutcome.Complementary]: 0,
    [ComparisonOutcome.Conflict]: 0,
    [ComparisonOutcome.Ambiguous]: 0,
    [ComparisonOutcome.NoMatch]: 0,
    [ComparisonOutcome.Invalid]: 0,
  };
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
    placeTypeConfidence: candidate.placeTypeConfidence,
    location: candidate.location,
    locationAccuracyMeters: candidate.locationAccuracyMeters,
    externalIds: candidate.externalIds,
    designationReferences: candidate.designations
      .map((d) => d.reference)
      .filter((r): r is string => typeof r === 'string'),
    sourceIdentity: {
      sourceId: candidate.provenance.sourceId,
      sourceRecordId: candidate.provenance.sourceRecordId,
      designations: candidate.designations.map((d) => d.designation).sort(),
    },
    ...(candidate.postcode ? { postcode: candidate.postcode } : {}),
    ...(candidate.town ? { town: candidate.town } : {}),
    ...(candidate.county ? { county: candidate.county } : {}),
  };
}

export async function runIngestion(options: RunOptions): Promise<RunReport> {
  const { importRunId, sources, enrichmentSource, maxRecords, observer } = options;
  const candidateMode = options.candidateMode ?? CandidateMode.Bounded;
  const startedAt = new Date();

  const report: RunReport = {
    importRunId,
    sourceIds: sources.map((s) => s.adapter.id),
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    runtimeMs: 0,
    sourceRows: 0,
    valid: 0,
    rejected: 0,
    enriched: 0,
    outcomes: emptyOutcomes(),
    duplicatesWithinRun: 0,
    withinSourceMatches: 0,
    sameSourceOverlaps: {
      [SameSourceOverlap.RepeatedEntry]: 0,
      [SameSourceOverlap.MultiDesignation]: 0,
      [SameSourceOverlap.DistinctEntries]: 0,
    },
    conflicts: 0,
    genericallyTyped: 0,
    comparisons: emptyComparisons(),
    rejections: [],
    decided: [],
  };

  // Places the matcher compares against: what is already canonical, plus what
  // this run has decided to create. Without the second half, two source rows
  // describing one abbey would both be filed as new.
  const existing: CandidateStore = options.candidateStore ?? new CandidateIndex(candidateMode);
  for (const place of options.existingPlaces ?? []) await existing.add(place);
  const preexistingIds = new Set((options.existingPlaces ?? []).map((p) => p.id));
  let createdInRun = 0;
  const chunkSize = options.chunkSize ?? Number.POSITIVE_INFINITY;
  await existing.beginChunk?.();

  for (const source of sources) {
    for await (const raw of source.adapter.fetch()) {
      if (maxRecords !== undefined && report.sourceRows >= maxRecords) break;
      report.sourceRows += 1;
      if (report.sourceRows > 1 && (report.sourceRows - 1) % chunkSize === 0) {
        await existing.beginChunk?.();
        // CI scale jobs may opt into --expose-gc. When available, collecting at
        // the explicit chunk boundary makes the working-set measurement about
        // retained payloads rather than garbage awaiting the next V8 cycle.
        globalThis.gc?.();
      }

      // --- NORMALISE ----------------------------------------------------------
      const normaliseStart = performance.now();
      const normalised = source.normalise(raw, importRunId);
      const normaliseMs = performance.now() - normaliseStart;
      if (!normalised.ok) {
        report.rejected += 1;
        report.rejections.push(normalised.rejected);
        report.outcomes[MatchOutcome.RejectInvalid] += 1;
        continue;
      }

      // --- VALIDATE -----------------------------------------------------------
      const validateStart = performance.now();
      const parsed = placeCandidateSchema.safeParse(normalised.candidate);
      const validateMs = performance.now() - validateStart;
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
      // Derive the publishable facts once, centrally, so the publish engine
      // never has to know which source a candidate came from.
      let candidate: PlaceCandidate = {
        ...normalised.candidate,
        facts: buildCandidateFacts(normalised.candidate),
      };
      if (isFallbackClassification(candidate.placeTypeRule)) report.genericallyTyped += 1;

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
      // --- CANDIDATE GENERATION ----------------------------------------------
      // Which records the matcher is asked about. Not which records match.
      const candidateStatsBefore = observer?.candidateStats
        ? {
            candidatePairs: observer.candidateStats.candidatePairs,
            cellSupersetCandidates: observer.candidateStats.cellSupersetCandidates,
            rejectedByExactRadius: observer.candidateStats.rejectedByExactRadius,
            exactSpatialCandidates: observer.candidateStats.exactSpatialCandidates,
            identifierCandidates: observer.candidateStats.identifierCandidates,
            identifierOnlyCandidates: observer.candidateStats.identifierOnlyCandidates,
            identifierRescuedBeyondRadius: observer.candidateStats.identifierRescuedBeyondRadius,
            finalCandidatePairs: observer.candidateStats.finalCandidatePairs,
            registerVetoCandidates: observer.candidateStats.registerVetoCandidates,
            sameSourceSameRecordCandidates:
              observer.candidateStats.sameSourceSameRecordCandidates,
            sameSourceDifferentDesignationCandidates:
              observer.candidateStats.sameSourceDifferentDesignationCandidates,
            crossSourceCandidates: observer.candidateStats.crossSourceCandidates,
            missingSourceIdentityCandidates:
              observer.candidateStats.missingSourceIdentityCandidates,
            survivingRegisterCandidates: observer.candidateStats.survivingRegisterCandidates,
          }
        : undefined;
      const shortlist = await existing.candidatesFor(candidate, observer?.candidateStats);
      const candidateGeneration =
        observer?.candidateStats && candidateStatsBefore
          ? {
              candidatePairs:
                observer.candidateStats.candidatePairs - candidateStatsBefore.candidatePairs,
              cellSupersetCandidates:
                observer.candidateStats.cellSupersetCandidates -
                candidateStatsBefore.cellSupersetCandidates,
              rejectedByExactRadius:
                observer.candidateStats.rejectedByExactRadius -
                candidateStatsBefore.rejectedByExactRadius,
              exactSpatialCandidates:
                observer.candidateStats.exactSpatialCandidates -
                candidateStatsBefore.exactSpatialCandidates,
              identifierCandidates:
                observer.candidateStats.identifierCandidates -
                candidateStatsBefore.identifierCandidates,
              identifierOnlyCandidates:
                observer.candidateStats.identifierOnlyCandidates -
                candidateStatsBefore.identifierOnlyCandidates,
              identifierRescuedBeyondRadius:
                observer.candidateStats.identifierRescuedBeyondRadius -
                candidateStatsBefore.identifierRescuedBeyondRadius,
              finalCandidatePairs:
                observer.candidateStats.finalCandidatePairs -
                candidateStatsBefore.finalCandidatePairs,
              registerVetoCandidates:
                observer.candidateStats.registerVetoCandidates -
                candidateStatsBefore.registerVetoCandidates,
              sameSourceSameRecordCandidates:
                observer.candidateStats.sameSourceSameRecordCandidates -
                candidateStatsBefore.sameSourceSameRecordCandidates,
              sameSourceDifferentDesignationCandidates:
                observer.candidateStats.sameSourceDifferentDesignationCandidates -
                candidateStatsBefore.sameSourceDifferentDesignationCandidates,
              crossSourceCandidates:
                observer.candidateStats.crossSourceCandidates -
                candidateStatsBefore.crossSourceCandidates,
              missingSourceIdentityCandidates:
                observer.candidateStats.missingSourceIdentityCandidates -
                candidateStatsBefore.missingSourceIdentityCandidates,
              survivingRegisterCandidates:
                observer.candidateStats.survivingRegisterCandidates -
                candidateStatsBefore.survivingRegisterCandidates,
            }
          : undefined;

      const matchStart = performance.now();
      const decision = matchCandidate(candidate, shortlist, observer?.matchStats);
      const matchMs = performance.now() - matchStart;
      observer?.onRecord?.({
        normaliseMs,
        validateMs,
        matchMs,
        candidate,
        shortlistSize: shortlist.length,
        candidateGeneration,
      });
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
        const id = `run:${importRunId}:${createdInRun}`;
        await existing.add(candidateAsCanonical(candidate, id), candidate);
        report.comparisons[ComparisonOutcome.NoMatch] += 1;
      }

      // --- CROSS-SOURCE COMPARISON -------------------------------------------
      // Only meaningful once we believe two records describe one place. Identity
      // and agreement are separate questions: deciding they are the same site
      // says nothing about whether the sources agree about it.
      //
      // And it is only meaningful when there really are two sources. Running the
      // comparator over two records from the SAME source asks a question that
      // cannot be answered — Historic England does not disagree with itself, it
      // holds several designations over overlapping ground, so a listed building
      // and the scheduled monument around it differ in type and position by
      // design. The 1,000-record scale tier surfaced this: every one of its 142
      // "cross-source conflicts" was NHLE compared against NHLE, inflating the
      // conflict rate to 23.9% and, worse, would have told a reviewer that two
      // sources disagreed when only one source was ever involved.
      let comparison: SourceComparison | undefined;
      const matchedIdentity = decision.matchedPlaceId
        ? await existing.getSourceIdentity?.(decision.matchedPlaceId)
        : undefined;
      if (decision.matchedPlaceId && matchedIdentity) {
        if (shouldCompareAcrossSources(matchedIdentity, candidate)) {
          const counterpart = await existing.getCandidate?.(decision.matchedPlaceId);
          if (counterpart) {
            comparison = compareSources(counterpart, candidate);
            report.comparisons[comparison.outcome] += 1;
            report.conflicts += comparison.conflicts.length;
          }
        } else {
          // Same source: recorded as an overlap, never as a disagreement. The
          // compact source identity avoids reloading a full national payload.
          report.withinSourceMatches += 1;
          const overlap = classifySameSourceOverlap(matchedIdentity, {
            provenance: {
              sourceId: candidate.provenance.sourceId,
              sourceRecordId: candidate.provenance.sourceRecordId,
            },
            designations: candidate.designations,
          });
          report.sameSourceOverlaps[overlap] += 1;
        }
      }
      // A review outcome is ambiguity about IDENTITY, and it belongs in the
      // comparison histogram only when two sources were actually involved.
      // Counting it for a same-source pair was the last residue of the Batch 6
      // defect: a single-source run still reported cross-source comparison
      // outcomes, for pairs where no comparison was ever performed.
      if (decision.outcome === MatchOutcome.MatchReview && !comparison) {
        if (matchedIdentity && shouldCompareAcrossSources(matchedIdentity, candidate)) {
          report.comparisons[ComparisonOutcome.Ambiguous] += 1;
        }
      }

      const decided: DecidedCandidate = {
        candidate,
        decision,
        withinRun,
        ...(matchedIdentity
          ? { matchedSourceRecordId: matchedIdentity.provenance.sourceRecordId }
          : {}),
        ...(comparison ? { comparison } : {}),
      };
      if (options.retainDecided !== false) report.decided.push(decided);
      observer?.onDecision?.(decided);
    }
  }

  const finishedAt = new Date();
  report.finishedAt = finishedAt.toISOString();
  report.runtimeMs = finishedAt.getTime() - startedAt.getTime();
  return report;
}
