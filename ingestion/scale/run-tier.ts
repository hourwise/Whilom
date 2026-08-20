/**
 * Run one tier of the staged scale experiment and evaluate the declared gates.
 *
 *   pnpm --filter @whilom/ingestion scale:run -- --tier 1000
 *
 * Writes `scale-results-<tier>.json`. Exits non-zero if a BLOCKING gate failed,
 * so the workflow stops the ladder rather than spending the next tier on a
 * pipeline already known to be unsound.
 *
 * This runs the ordinary pipeline. The adapter, normaliser, matcher and
 * comparator are the ones the Yorkshire POC uses; the only additions are the
 * measurement taps on `runIngestion`. A benchmark that exercises a private
 * fast path measures the benchmark.
 */

import { cpus } from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HistoricEnglandNhleAdapter } from '../sources/historic-england/nhle-adapter';
import { normaliseNhleRecord } from '../transforms/normalise-nhle';
import { runIngestion } from '../pipeline/run';
import type { DecidedCandidate } from '../pipeline/run';
import { MatchOutcome } from '../pipeline/candidate';
import type { MatchStats } from '../matching/matcher';
import type { CandidateStore } from '../matching/candidates';
import { CandidateMode, emptyCandidateStats } from '../matching/candidates';
import type { CandidateGenerationStats } from '../matching/candidates';
import type { CandidateGenerationDelta } from '../matching/candidates';
import { GATES, mayProceed } from './gates';
import type { GateResult } from './gates';
import { TIER_SIZES, buildTierFixture, isTierSize } from './tier';
import { evenSample, percentile, round, timingStats } from './metrics';
import type {
  MatchProfile,
  QualitySample,
  ReviewPressure,
  TierMetrics,
  WorkingSetStats,
} from './metrics';

const SAMPLE_SIZE = 20;

function parseTier(argv: readonly string[]): number {
  const index = argv.indexOf('--tier');
  const raw = index >= 0 ? argv[index + 1] : undefined;
  const tier = Number(raw);
  if (!Number.isFinite(tier) || !isTierSize(tier)) {
    throw new Error(`--tier must be one of ${TIER_SIZES.join(', ')} (got ${String(raw)})`);
  }
  return tier;
}

/**
 * Why a record is in the review queue.
 *
 * The matcher already writes a plain-English rationale; grouping on the reason
 * rather than the sentence turns "1,200 records need review" into a list of
 * fixable causes.
 */
function reviewCause(decided: DecidedCandidate): string {
  const { decision } = decided;
  if (decision.outcome === MatchOutcome.ConflictReview) {
    const fields = decision.conflicts
      .map((c) => c.field)
      .sort()
      .join(' + ');
    return `sources disagree on ${fields || 'an unnamed field'}`;
  }
  const why = decision.rationale.split('needs review: ')[1] ?? decision.rationale;
  if (why.includes('association rather than identity')) return 'one name contains the other';
  if (why.includes('protects a landscape'))
    return 'landscape designation versus a structure inside it';
  if (why.includes('the name is not distinctive')) return 'name is not distinctive';
  if (why.includes('scores almost as well')) return 'two candidates score alike';
  if (why.includes('outside the')) return 'position outside the agreement radius';
  if (why.includes('names are not close enough')) return 'names not close enough';
  return 'score below the confident threshold';
}

function buildReviewPressure(decided: readonly DecidedCandidate[], valid: number): ReviewPressure {
  const queued = decided.filter(
    (d) =>
      d.decision.outcome === MatchOutcome.MatchReview ||
      d.decision.outcome === MatchOutcome.ConflictReview,
  );
  const grouped = new Map<string, DecidedCandidate[]>();
  for (const item of queued) {
    const cause = reviewCause(item);
    const bucket = grouped.get(cause);
    if (bucket) bucket.push(item);
    else grouped.set(cause, [item]);
  }

  const matchReview = queued.filter((d) => d.decision.outcome === MatchOutcome.MatchReview).length;
  const conflictReview = queued.length - matchReview;

  return {
    matchReview,
    conflictReview,
    totalForReview: queued.length,
    shareOfValid: valid > 0 ? round(queued.length / valid, 5) : 0,
    // Two minutes is optimistic for a genuine identity decision; it is used
    // consistently so tiers are comparable, not as a claim about real speed.
    estimatedReviewHours: round((queued.length * 2) / 60, 2),
    causes: [...grouped.entries()]
      .map(([cause, items]) => ({
        cause,
        count: items.length,
        share: round(items.length / Math.max(1, queued.length), 4),
        example: `${items[0]!.candidate.name} — ${items[0]!.decision.rationale}`,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

interface DecisionAggregates {
  samples: Record<QualitySample['category'], DecidedCandidate[]>;
  matchReview: number;
  conflictReview: number;
  causes: Map<string, { count: number; example: string }>;
  conflictFields: Map<string, number>;
}

function emptyDecisionAggregates(): DecisionAggregates {
  return {
    samples: { auto_match: [], new_canonical: [], review_match: [], conflict: [] },
    matchReview: 0,
    conflictReview: 0,
    causes: new Map(),
    conflictFields: new Map(),
  };
}

function decisionCategory(decided: DecidedCandidate): QualitySample['category'] {
  switch (decided.decision.outcome) {
    case MatchOutcome.MatchConfident:
      return 'auto_match';
    case MatchOutcome.NewCanonical:
      return 'new_canonical';
    case MatchOutcome.MatchReview:
      return 'review_match';
    case MatchOutcome.ConflictReview:
      return 'conflict';
    default:
      return 'new_canonical';
  }
}

function observeDecision(aggregates: DecisionAggregates, decided: DecidedCandidate): void {
  const category = decisionCategory(decided);
  if (aggregates.samples[category].length < SAMPLE_SIZE) aggregates.samples[category].push(decided);
  if (decided.decision.outcome === MatchOutcome.MatchReview) aggregates.matchReview += 1;
  if (decided.decision.outcome === MatchOutcome.ConflictReview) aggregates.conflictReview += 1;
  if (
    decided.decision.outcome === MatchOutcome.MatchReview ||
    decided.decision.outcome === MatchOutcome.ConflictReview
  ) {
    const cause = reviewCause(decided);
    const existing = aggregates.causes.get(cause);
    if (existing) existing.count += 1;
    else
      aggregates.causes.set(cause, {
        count: 1,
        example: `${decided.candidate.name} — ${decided.decision.rationale}`,
      });
  }
  for (const conflict of decided.decision.conflicts) {
    aggregates.conflictFields.set(
      conflict.field,
      (aggregates.conflictFields.get(conflict.field) ?? 0) + 1,
    );
  }
}

function buildStreamingReviewPressure(
  aggregates: DecisionAggregates,
  valid: number,
): ReviewPressure {
  const totalForReview = aggregates.matchReview + aggregates.conflictReview;
  return {
    matchReview: aggregates.matchReview,
    conflictReview: aggregates.conflictReview,
    totalForReview,
    shareOfValid: valid > 0 ? round(totalForReview / valid, 5) : 0,
    estimatedReviewHours: round((totalForReview * 2) / 60, 2),
    causes: [...aggregates.causes.entries()]
      .map(([cause, value]) => ({
        cause,
        count: value.count,
        share: round(value.count / Math.max(1, totalForReview), 4),
        example: value.example,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

function sampleFor(
  category: QualitySample['category'],
  decided: readonly DecidedCandidate[],
): QualitySample {
  const chosen = evenSample(decided, SAMPLE_SIZE);
  return {
    category,
    sampled: chosen.length,
    records: chosen.map((d) => {
      const distance = d.decision.signals.find((s) => s.name === 'distance');
      const name = d.decision.signals.find((s) => s.name === 'name');
      const meters = distance?.detail.match(/^(\d+)m/)?.[1];
      const similarity = name?.detail.match(/\((\d\.\d+)\)/)?.[1];
      return {
        name: d.candidate.name,
        sourceRecordId: d.candidate.provenance.sourceRecordId,
        placeType: d.candidate.placeType,
        rationale: d.decision.rationale,
        ...(d.decision.matchedPlaceId ? { matchedTo: d.decision.matchedPlaceId } : {}),
        ...(meters ? { distanceMeters: Number(meters) } : {}),
        ...(similarity ? { nameSimilarity: Number(similarity) } : {}),
        ...(d.decision.conflicts.length
          ? {
              conflicts: d.decision.conflicts.map(
                (c) => `${c.field}: ${String(c.existingValue)} vs ${String(c.candidateValue)}`,
              ),
            }
          : {}),
      };
    }),
  };
}

/**
 * Load the tier immediately below this one, if it has already been run.
 *
 * G5 asks how matching cost GROWS, which no single tier can answer. Rather
 * than re-running the smaller tier, the ladder reads the result it already
 * wrote — and if that file is absent the gate reports itself unevaluated
 * rather than quietly passing.
 */
function loadPreviousTier(tier: number): TierMetrics | undefined {
  const index = TIER_SIZES.indexOf(tier as (typeof TIER_SIZES)[number]);
  const previousTier = index > 0 ? TIER_SIZES[index - 1] : undefined;
  if (previousTier === undefined) return undefined;
  const path = resolve(process.cwd(), `scale-results-${previousTier}.json`);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as TierMetrics;
}

/** One tier executed under one candidate strategy, with everything measured. */
export interface TierExecution {
  fixture: ReturnType<typeof buildTierFixture>;
  candidateMode: CandidateMode;
  report: Awaited<ReturnType<typeof runIngestion>>;
  matchStats: MatchStats;
  candidateStats: CandidateGenerationStats;
  normaliseSamples: number[];
  validateSamples: number[];
  matchSamples: number[];
  startedAt: Date;
  finishedAt: Date;
  wallClockMs: number;
  decisionAggregates: DecisionAggregates;
  retainedDecided: boolean;
  workingSet?: WorkingSetStats;
  profile?: MatchProfile;
  geography: Record<
    string,
    {
      records: number;
      matchMs: number;
      shortlist: number;
      shortlistSizes: number[];
      candidate: CandidateGenerationDelta;
    }
  >;
  peakHeapUsedMb: number;
}

export interface TierExecutionOptions {
  candidateStore?: CandidateStore;
  retainDecided?: boolean;
  chunkSize?: number;
  /** Enable detailed matcher timing; omitted for ordinary scale runs. */
  profile?: boolean;
  profileSampleEvery?: number;
}

function emptyMatchProfile(enabled: boolean, timingSampleEvery: number): MatchProfile {
  return {
    enabled,
    timingSampleEvery,
    timedComparisons: 0,
    timingsMs: {
      identifierPhase: 0,
      registerVeto: 0,
      distance: 0,
      nameDistinctness: 0,
      nameSimilarity: 0,
      scoringAndConflicts: 0,
      scoredResultAllocation: 0,
      filtering: 0,
      sortingOrTopTwo: 0,
      outcomeConstruction: 0,
    },
    counts: {
      comparisons: 0,
      survivingRegister: 0,
      survivingDistance: 0,
      reachingNameComparison: 0,
      reachingFullScoring: 0,
      scoredCandidates: 0,
      zeroViable: 0,
      oneViable: 0,
      twoOrMoreViable: 0,
    },
  };
}

function geographyBucket(lat: number, lng: number): string {
  if (lat >= 51.25 && lat <= 51.75 && lng >= -0.6 && lng <= 0.8) return 'TQ/London-envelope';
  if (lat >= 51.1 && lat <= 51.7 && lng >= -3.0 && lng <= -2.0) return 'ST/Bristol-Bath-envelope';
  if (lat < 51 || lng < -3.0 || lng > 0.8) return 'sparser-outside-dense-envelopes';
  return 'other';
}

function maxOrZero(values: readonly number[]): number {
  let max = 0;
  for (const value of values) max = Math.max(max, value);
  return max;
}

/**
 * Run one tier through the ordinary pipeline.
 *
 * Shared by the tier runner and the equivalence harness so that the two modes
 * cannot diverge in setup. A benchmark whose "exhaustive" and "bounded" paths
 * differ in anything but the candidate strategy is not comparing what it claims.
 */
export async function executeTier(
  tier: number,
  candidateMode: CandidateMode = CandidateMode.Bounded,
  buildFixture: (size: number) => ReturnType<typeof buildTierFixture> = buildTierFixture,
  options: TierExecutionOptions = {},
): Promise<TierExecution> {
  const fixture = buildFixture(tier);
  const startedAt = new Date();

  const matchStats: MatchStats = {
    comparisons: 0,
    vetoedByDistance: 0,
    vetoedByName: 0,
    vetoedByRegister: 0,
    beyondMaxDistance: 0,
    profile: options.profile ? emptyMatchProfile(true, options.profileSampleEvery ?? 0) : undefined,
  };
  const candidateStats = emptyCandidateStats();
  const normaliseSamples: number[] = [];
  const validateSamples: number[] = [];
  const matchSamples: number[] = [];
  const decisionAggregates = emptyDecisionAggregates();
  const geography: Record<
    string,
    {
      records: number;
      matchMs: number;
      shortlist: number;
      shortlistSizes: number[];
      candidate: CandidateGenerationDelta;
    }
  > = {};
  let peakHeapUsedBytes = process.memoryUsage().heapUsed;

  const report = await runIngestion({
    importRunId: `scale-${tier}`,
    candidateMode,
    sources: [
      {
        adapter: new HistoricEnglandNhleAdapter({
          kind: fixture.mode ?? 'file',
          path: fixture.path,
        }),
        normalise: normaliseNhleRecord,
      },
    ],
    observer: {
      matchStats,
      candidateStats,
      onRecord: ({
        normaliseMs,
        validateMs,
        matchMs,
        candidate,
        shortlistSize,
        candidateGeneration,
      }) => {
        normaliseSamples.push(normaliseMs);
        validateSamples.push(validateMs);
        matchSamples.push(matchMs);
        const bucket = geographyBucket(candidate.location.lat, candidate.location.lng);
        const current = geography[bucket] ?? {
          records: 0,
          matchMs: 0,
          shortlist: 0,
          shortlistSizes: [],
            candidate: {
              candidatePairs: 0,
              cellSupersetCandidates: 0,
              rejectedByExactRadius: 0,
              exactSpatialCandidates: 0,
              identifierCandidates: 0,
              identifierOnlyCandidates: 0,
              identifierRescuedBeyondRadius: 0,
              finalCandidatePairs: 0,
              registerVetoCandidates: 0,
              sameSourceSameRecordCandidates: 0,
              sameSourceDifferentDesignationCandidates: 0,
              crossSourceCandidates: 0,
              missingSourceIdentityCandidates: 0,
              survivingRegisterCandidates: 0,
            },
        };
        current.records += 1;
        current.matchMs += matchMs;
        current.shortlist += shortlistSize;
        current.shortlistSizes.push(shortlistSize);
        if (candidateGeneration) {
          for (const key of Object.keys(current.candidate) as (keyof CandidateGenerationDelta)[]) {
            current.candidate[key] += candidateGeneration[key];
          }
        }
        geography[bucket] = current;
        if (matchSamples.length % 4_096 === 0) {
          peakHeapUsedBytes = Math.max(peakHeapUsedBytes, process.memoryUsage().heapUsed);
        }
      },
      onDecision: (decided) => observeDecision(decisionAggregates, decided),
    },
    candidateStore: options.candidateStore,
    chunkSize: options.chunkSize,
    retainDecided: options.retainDecided,
  });

  const finishedAt = new Date();
  peakHeapUsedBytes = Math.max(peakHeapUsedBytes, process.memoryUsage().heapUsed);
  const workingSet = options.candidateStore?.workingSetStats?.() as WorkingSetStats | undefined;
  await options.candidateStore?.close?.();
  return {
    fixture,
    candidateMode,
    report,
    matchStats,
    candidateStats,
    normaliseSamples,
    validateSamples,
    matchSamples,
    startedAt,
    finishedAt,
    wallClockMs: finishedAt.getTime() - startedAt.getTime(),
    decisionAggregates,
    retainedDecided: options.retainDecided !== false,
    workingSet,
    profile: matchStats.profile,
    geography,
    peakHeapUsedMb: Math.round(peakHeapUsedBytes / 1_048_576),
  };
}

export async function runTier(
  tier: number,
  candidateMode: CandidateMode = CandidateMode.Bounded,
  buildFixture: (size: number) => ReturnType<typeof buildTierFixture> = buildTierFixture,
  options: TierExecutionOptions = {},
): Promise<TierMetrics> {
  const execution = await executeTier(tier, candidateMode, buildFixture, options);
  const metrics = buildTierMetrics(execution, tier);
  metrics.gates = evaluateGates(metrics, loadPreviousTier(tier));
  metrics.proceeded = mayProceed(metrics.gates);
  return metrics;
}

/**
 * Assemble a tier's metrics from an execution.
 *
 * Extracted so the national ladder measures with exactly the same code as the
 * regional ladder — the numbers can only be compared across scales if they are
 * produced identically.
 */
export function buildTierMetrics(execution: TierExecution, tier: number): TierMetrics {
  const {
    fixture,
    candidateMode,
    report,
    matchStats,
    candidateStats,
    normaliseSamples,
    validateSamples,
    matchSamples,
    startedAt,
    finishedAt,
  } = execution;

  const rejectionReasons = new Map<string, number>();
  for (const rejection of report.rejections) {
    for (const reason of rejection.reasons) {
      // Collapse the variable part so reasons group.
      const key = reason.replace(/\d+(\.\d+)?/g, 'N');
      rejectionReasons.set(key, (rejectionReasons.get(key) ?? 0) + 1);
    }
  }

  const conflictFields = new Map<string, number>();
  for (const [field, count] of execution.decisionAggregates.conflictFields)
    conflictFields.set(field, count);

  const matchTiming = timingStats(matchSamples);
  const valid = report.valid;
  const outcomes = report.outcomes;
  const autoMatched = outcomes[MatchOutcome.MatchConfident];

  const review = !execution.retainedDecided
    ? buildStreamingReviewPressure(execution.decisionAggregates, valid)
    : buildReviewPressure(report.decided, valid);

  const metrics: TierMetrics = {
    tier,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      cpus: cpus().length,
      ci: process.env['CI'] === 'true',
    },
    composition: fixture.mix,
    peakHeapUsedMb: execution.peakHeapUsedMb,
    ingestion: {
      sourceRows: report.sourceRows,
      valid,
      rejected: report.rejected,
      rejectionRate: report.sourceRows > 0 ? round(report.rejected / report.sourceRows, 5) : 0,
      genericallyTyped: report.genericallyTyped,
      genericTypingRate: valid > 0 ? round(report.genericallyTyped / valid, 5) : 0,
      recordsPerSecond:
        report.runtimeMs > 0 ? round((report.sourceRows / report.runtimeMs) * 1000, 1) : 0,
      normaliseMs: round(normaliseSamples.reduce((a, b) => a + b, 0)),
      validateMs: round(validateSamples.reduce((a, b) => a + b, 0)),
      totalMs: report.runtimeMs,
      rejectionReasons: [...rejectionReasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    },
    matching: {
      outcomes,
      comparisons: report.comparisons,
      duplicatesWithinRun: report.duplicatesWithinRun,
      withinSourceMatches: report.withinSourceMatches,
      conflicts: report.conflicts,
      conflictRate: valid > 0 ? round(report.conflicts / valid, 5) : 0,
      autoMatchRate: valid > 0 ? round(autoMatched / valid, 5) : 0,
      work: {
        ...matchTiming,
        meanComparisonsPerRecord: round(
          matchStats.comparisons / Math.max(1, matchSamples.length),
          1,
        ),
        totalComparisons: matchStats.comparisons,
        vetoedByDistance: matchStats.vetoedByDistance,
        vetoedByName: matchStats.vetoedByName,
        vetoedByRegister: matchStats.vetoedByRegister,
        beyondMaxDistance: matchStats.beyondMaxDistance,
        shortlist: {
          mean: round(
            candidateStats.shortlistSizes.reduce((sum, value) => sum + value, 0) /
              Math.max(1, candidateStats.shortlistSizes.length),
            2,
          ),
          p50: percentile(
            [...candidateStats.shortlistSizes].sort((a, b) => a - b),
            50,
          ),
          p90: percentile(
            [...candidateStats.shortlistSizes].sort((a, b) => a - b),
            90,
          ),
          p95: percentile(
            [...candidateStats.shortlistSizes].sort((a, b) => a - b),
            95,
          ),
          p99: percentile(
            [...candidateStats.shortlistSizes].sort((a, b) => a - b),
            99,
          ),
          max: maxOrZero(candidateStats.shortlistSizes),
          zero: candidateStats.shortlistSizes.filter((n) => n === 0).length,
          one: candidateStats.shortlistSizes.filter((n) => n === 1).length,
          twoOrMore: candidateStats.shortlistSizes.filter((n) => n >= 2).length,
        },
      },
      conflictFields: [...conflictFields.entries()]
        .map(([field, count]) => ({ field, count }))
        .sort((a, b) => b.count - a.count),
      ...(execution.profile ? { profile: execution.profile } : {}),
    },
    candidates: {
      mode: candidateMode,
      possiblePairs: candidateStats.possiblePairs,
      candidatePairs: candidateStats.candidatePairs,
      pairsPruned: candidateStats.possiblePairs - candidateStats.candidatePairs,
      pruningRate:
        candidateStats.possiblePairs > 0
          ? round(1 - candidateStats.candidatePairs / candidateStats.possiblePairs, 5)
          : 0,
      candidatePairsPerRecord: round(
        candidateStats.candidatePairs / Math.max(1, matchSamples.length),
        2,
      ),
      fromSpatial: candidateStats.fromSpatial,
      fromIdentifierOnly: candidateStats.fromIdentifierOnly,
      cellSupersetCandidates: candidateStats.cellSupersetCandidates,
      rejectedByExactRadius: candidateStats.rejectedByExactRadius,
      exactSpatialCandidates: candidateStats.exactSpatialCandidates,
      identifierCandidates: candidateStats.identifierCandidates,
      identifierOnlyCandidates: candidateStats.identifierOnlyCandidates,
      identifierRescuedBeyondRadius: candidateStats.identifierRescuedBeyondRadius,
      finalCandidatePairs: candidateStats.finalCandidatePairs,
      registerVetoCandidates: candidateStats.registerVetoCandidates,
      sameSourceSameRecordCandidates: candidateStats.sameSourceSameRecordCandidates,
      sameSourceDifferentDesignationCandidates:
        candidateStats.sameSourceDifferentDesignationCandidates,
      crossSourceCandidates: candidateStats.crossSourceCandidates,
      missingSourceIdentityCandidates: candidateStats.missingSourceIdentityCandidates,
      survivingRegisterCandidates: candidateStats.survivingRegisterCandidates,
      exactRadiusPruningRatio:
        candidateStats.cellSupersetCandidates > 0
          ? round(candidateStats.rejectedByExactRadius / candidateStats.cellSupersetCandidates, 5)
          : 0,
      cellsInspected: candidateStats.cellsInspected,
      generationMs: round(candidateStats.generationMs),
      shortlist: {
        mean: round(
          candidateStats.shortlistSizes.reduce((sum, value) => sum + value, 0) /
            Math.max(1, candidateStats.shortlistSizes.length),
          2,
        ),
        p50: percentile(
          [...candidateStats.shortlistSizes].sort((a, b) => a - b),
          50,
        ),
        p90: percentile(
          [...candidateStats.shortlistSizes].sort((a, b) => a - b),
          90,
        ),
        p95: percentile(
          [...candidateStats.shortlistSizes].sort((a, b) => a - b),
          95,
        ),
        p99: percentile(
          [...candidateStats.shortlistSizes].sort((a, b) => a - b),
          99,
        ),
        max: maxOrZero(candidateStats.shortlistSizes),
      },
    },

    review,
    quality: [
      sampleFor(
        'auto_match',
        !execution.retainedDecided
          ? execution.decisionAggregates.samples.auto_match
          : report.decided.filter((d) => d.decision.outcome === MatchOutcome.MatchConfident),
      ),
      sampleFor(
        'new_canonical',
        !execution.retainedDecided
          ? execution.decisionAggregates.samples.new_canonical
          : report.decided.filter((d) => d.decision.outcome === MatchOutcome.NewCanonical),
      ),
      sampleFor(
        'review_match',
        !execution.retainedDecided
          ? execution.decisionAggregates.samples.review_match
          : report.decided.filter((d) => d.decision.outcome === MatchOutcome.MatchReview),
      ),
      sampleFor(
        'conflict',
        !execution.retainedDecided
          ? execution.decisionAggregates.samples.conflict
          : report.decided.filter((d) => d.decision.outcome === MatchOutcome.ConflictReview),
      ),
    ],
    ...(execution.workingSet ? { workingSet: execution.workingSet } : {}),
    ...(Object.keys(execution.geography).length > 0
      ? {
          geography: Object.fromEntries(
            Object.entries(execution.geography).map(([key, value]) => [
              key,
              {
                records: value.records,
                meanMsPerRecord: round(value.matchMs / Math.max(1, value.records), 4),
                meanShortlist: round(value.shortlist / Math.max(1, value.records), 2),
                shortlist: {
                  mean: round(value.shortlist / Math.max(1, value.records), 2),
                  p50: percentile(
                    [...value.shortlistSizes].sort((a, b) => a - b),
                    50,
                  ),
                  p95: percentile(
                    [...value.shortlistSizes].sort((a, b) => a - b),
                    95,
                  ),
                  p99: percentile(
                    [...value.shortlistSizes].sort((a, b) => a - b),
                    99,
                  ),
                  max: maxOrZero(value.shortlistSizes),
                },
                candidate: {
                  ...value.candidate,
                  exactRadiusPruningRatio:
                    value.candidate.cellSupersetCandidates > 0
                      ? round(
                          value.candidate.rejectedByExactRadius /
                            value.candidate.cellSupersetCandidates,
                          5,
                        )
                      : 0,
                },
              },
            ]),
          ),
        }
      : {}),
    gates: [],
    proceeded: false,
  };

  return metrics;
}

/**
 * Evaluate the gates this tier can answer.
 *
 * Gates needing evidence a single in-process tier cannot supply — a database
 * (G6, G10), a cross-tier comparison (G5) or a human audit (G4) — are marked
 * not-evaluated here and settled by the lane that has that evidence. They are
 * never silently passed.
 */
export function evaluateGates(metrics: TierMetrics, previous?: TierMetrics): GateResult[] {
  const results: GateResult[] = [];
  const g = (id: string): (typeof GATES)[number] => GATES.find((x) => x.id === id)!;
  const { ingestion, matching, review } = metrics;

  const accountedFor = Object.values(matching.outcomes).reduce((a, b) => a + b, 0);
  results.push({
    ...g('G1-completes'),
    passed: accountedFor === ingestion.sourceRows && ingestion.sourceRows === metrics.tier,
    observed: `${ingestion.sourceRows} source rows, ${accountedFor} recorded outcomes, tier size ${metrics.tier}`,
  });

  results.push({
    ...g('G2-rejection-rate'),
    passed: ingestion.rejectionRate <= 0.05,
    observed: `${(ingestion.rejectionRate * 100).toFixed(2)}% rejected (${ingestion.rejected}/${ingestion.sourceRows})`,
  });

  results.push({
    ...g('G3-review-pressure'),
    passed: review.shareOfValid <= 0.2,
    observed: `${(review.shareOfValid * 100).toFixed(2)}% of valid records queued (${review.totalForReview}), ~${review.estimatedReviewHours}h to clear`,
  });

  results.push({
    ...g('G4-no-false-merges'),
    passed: true,
    observed: `${matching.outcomes[MatchOutcome.MatchConfident]} automatic matches; ${
      metrics.quality.find((q) => q.category === 'auto_match')?.sampled ?? 0
    } sampled for audit`,
    notEvaluated:
      'Requires reading the sampled matches; settled in the scale report, not by the runner.',
  });

  if (previous) {
    const growth =
      previous.matching.work.meanMsPerRecord > 0
        ? matching.work.meanMsPerRecord / previous.matching.work.meanMsPerRecord
        : Infinity;
    results.push({
      ...g('G5-matcher-scaling'),
      passed: growth <= 3 && matching.work.meanMsPerRecord <= 50,
      observed: `${matching.work.meanMsPerRecord}ms/record vs ${previous.matching.work.meanMsPerRecord}ms at tier ${previous.tier} (${growth.toFixed(2)}x); ${matching.work.meanComparisonsPerRecord} comparisons/record`,
    });
  } else {
    results.push({
      ...g('G5-matcher-scaling'),
      passed: matching.work.meanMsPerRecord <= 50,
      observed: `${matching.work.meanMsPerRecord}ms/record, ${matching.work.meanComparisonsPerRecord} comparisons/record (baseline tier)`,
      notEvaluated: 'Growth ratio needs a smaller tier to compare against; absolute limit checked.',
    });
  }

  results.push({
    ...g('G6-query-latency'),
    passed: true,
    observed: metrics.queries
      ? `${metrics.queries.length} queries measured`
      : 'not measured in this lane',
    ...(metrics.queries
      ? {}
      : { notEvaluated: 'Needs a database; measured by the query lane of the scale workflow.' }),
  });

  results.push({
    ...g('G7-throughput'),
    passed: ingestion.recordsPerSecond >= 20,
    observed: `${ingestion.recordsPerSecond} records/second`,
  });

  results.push({
    ...g('G8-generic-typing'),
    passed: ingestion.genericTypingRate <= 0.35,
    observed: `${(ingestion.genericTypingRate * 100).toFixed(2)}% typed by fallback (${ingestion.genericallyTyped}/${ingestion.valid})`,
  });

  results.push({
    ...g('G9-conflict-detection-live'),
    passed: matching.conflicts > 0 && matching.conflictRate <= 0.15,
    observed: `${matching.conflicts} conflicts (${(matching.conflictRate * 100).toFixed(2)}% of valid records)`,
  });

  results.push({
    ...g('G10-storage-linearity'),
    passed: true,
    observed: metrics.storage
      ? `${metrics.storage.bytesPerRecord} bytes/record`
      : 'not measured in this lane',
    ...(metrics.storage
      ? {}
      : { notEvaluated: 'Needs a database; measured by the storage lane of the scale workflow.' }),
  });

  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tier = parseTier(process.argv.slice(2));
  runTier(tier)
    .then((metrics) => {
      const out = resolve(process.cwd(), `scale-results-${tier}.json`);
      writeFileSync(out, JSON.stringify(metrics, null, 2) + '\n');

      console.log(`\n=== tier ${tier} ===`);
      console.log(`composition        ${JSON.stringify(metrics.composition)}`);
      console.log(`valid / rejected   ${metrics.ingestion.valid} / ${metrics.ingestion.rejected}`);
      console.log(`throughput         ${metrics.ingestion.recordsPerSecond} rec/s`);
      console.log(`outcomes           ${JSON.stringify(metrics.matching.outcomes)}`);
      console.log(
        `match work         ${metrics.matching.work.meanMsPerRecord}ms/rec, ${metrics.matching.work.meanComparisonsPerRecord} comparisons/rec`,
      );
      console.log(
        `review queue       ${metrics.review.totalForReview} (${(metrics.review.shareOfValid * 100).toFixed(1)}% of valid)`,
      );
      console.log('\ngates:');
      for (const gate of metrics.gates) {
        const mark = gate.notEvaluated ? '-' : gate.passed ? 'PASS' : 'FAIL';
        console.log(`  ${mark.padEnd(4)} ${gate.id.padEnd(26)} ${gate.observed}`);
        if (gate.notEvaluated) console.log(`       (${gate.notEvaluated})`);
      }
      console.log(`\nwrote ${out}`);

      const blocking = metrics.gates.filter((x) => x.severity === 'blocking' && !x.passed);
      if (blocking.length > 0) {
        console.error(
          `\nBLOCKING gate failure: ${blocking.map((x) => x.id).join(', ')} — the ladder stops here.`,
        );
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
