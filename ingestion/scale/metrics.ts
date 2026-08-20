/**
 * What the scale experiment measures, and the shape it is reported in.
 *
 * Everything here is derived from a real run over real Historic England
 * records. Nothing is modelled or extrapolated: where a figure could not be
 * measured at a tier it is reported absent rather than estimated.
 */

import type { ComparisonOutcome } from '../matching/compare';
import type { MatchOutcome } from '../pipeline/candidate';
import type { GateResult } from './gates';

export interface TimingStats {
  totalMs: number;
  meanMsPerRecord: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export interface MatchWorkStats extends TimingStats {
  /**
   * Mean number of canonical records each candidate was compared against.
   * This is the quantity that decides whether the approach scales: if it
   * tracks the corpus size, matching is quadratic.
   */
  meanComparisonsPerRecord: number;
  totalComparisons: number;
  /** Comparisons the 5km distance veto discarded before scoring. */
  vetoedByDistance: number;
  /** Comparisons discarded because the names denote different things. */
  vetoedByName: number;
  /** Comparisons discarded because one source's register lists them separately. */
  vetoedByRegister: number;
  /** Comparisons beyond the plausible-distance limit: the spatial pre-filter prize. */
  beyondMaxDistance: number;
  shortlist: {
    mean: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    max: number;
    zero: number;
    one: number;
    twoOrMore: number;
  };
  profile?: MatchProfile;
}

export interface MatchProfile {
  enabled: boolean;
  timingSampleEvery: number;
  timedComparisons: number;
  timingsMs: {
    identifierPhase: number;
    registerVeto: number;
    distance: number;
    nameDistinctness: number;
    nameSimilarity: number;
    scoringAndConflicts: number;
    scoredResultAllocation: number;
    filtering: number;
    sortingOrTopTwo: number;
    outcomeConstruction: number;
  };
  counts: {
    comparisons: number;
    survivingRegister: number;
    survivingDistance: number;
    reachingNameComparison: number;
    reachingFullScoring: number;
    scoredCandidates: number;
    zeroViable: number;
    oneViable: number;
    twoOrMoreViable: number;
  };
}

export interface ReviewPressure {
  matchReview: number;
  conflictReview: number;
  totalForReview: number;
  /** Share of valid records that need a human before they can be published. */
  shareOfValid: number;
  /** Estimated clearance effort at two minutes per decision. */
  estimatedReviewHours: number;
  /** Why records are queued, most common first. */
  causes: { cause: string; count: number; share: number; example: string }[];
}

export interface QualitySample {
  category: 'auto_match' | 'new_canonical' | 'review_match' | 'conflict';
  sampled: number;
  records: {
    name: string;
    sourceRecordId: string;
    placeType: string;
    rationale: string;
    matchedTo?: string;
    distanceMeters?: number;
    nameSimilarity?: number;
    conflicts?: string[];
  }[];
}

export interface QueryTiming {
  id: string;
  description: string;
  sql: string;
  runs: number;
  p50Ms: number;
  p95Ms: number;
  rows: number;
  plan?: string;
}

export interface StorageStats {
  totalBytes: number;
  bytesPerRecord: number;
  tables: { table: string; rows: number; totalBytes: number; indexBytes: number }[];
}

export interface WorkingSetStats {
  mode: string;
  canonicalRecords: number;
  spatialIndexEntries: number;
  identifierIndexEntries: number;
  cachedPayloadRecords: number;
  peakCachedPayloadRecords: number;
  cacheHits: number;
  cacheMisses: number;
  chunks: number;
  spillBytes: number;
  maxCachedPayloadRecords: number;
  payloadLookups: number;
  pageHits: number;
  pageMisses: number;
  physicalReadCalls: number;
  bytesReadFromSpill: number;
  payloadBytesRequested: number;
  missPayloadBytesRequested: number;
  recordsDecoded: number;
  cacheHitRatio: number;
  readAmplification: number;
  physicalReadsPerPayloadLookup: number;
  pageCacheRecords: number;
  maxPageCachePages: number;
  payloadResolutionMs?: number;
}

/** What candidate generation cost, and what it saved. */
export interface CandidateMetrics {
  mode: string;
  /** Pairs an exhaustive scan would have produced. */
  possiblePairs: number;
  /** Pairs actually handed to the matcher. */
  candidatePairs: number;
  pairsPruned: number;
  pruningRate: number;
  candidatePairsPerRecord: number;
  fromSpatial: number;
  fromIdentifierOnly: number;
  cellSupersetCandidates: number;
  rejectedByExactRadius: number;
  exactSpatialCandidates: number;
  identifierCandidates: number;
  identifierOnlyCandidates: number;
  identifierRescuedBeyondRadius: number;
  finalCandidatePairs: number;
  exactRadiusPruningRatio: number;
  cellsInspected: number;
  generationMs: number;
  shortlist: {
    mean: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    max: number;
  };
}

export interface TierMetrics {
  tier: number;
  startedAt: string;
  finishedAt: string;
  environment: { node: string; platform: string; cpus: number; ci: boolean };
  peakHeapUsedMb?: number;

  composition: Record<string, number>;

  ingestion: {
    sourceRows: number;
    valid: number;
    rejected: number;
    rejectionRate: number;
    genericallyTyped: number;
    genericTypingRate: number;
    recordsPerSecond: number;
    normaliseMs: number;
    validateMs: number;
    totalMs: number;
    /** Top rejection reasons, so a failure is diagnosable without a rerun. */
    rejectionReasons: { reason: string; count: number }[];
  };

  matching: {
    outcomes: Record<MatchOutcome, number>;
    comparisons: Record<ComparisonOutcome, number>;
    duplicatesWithinRun: number;
    /** Matches where both records came from the same source. */
    withinSourceMatches: number;
    conflicts: number;
    conflictRate: number;
    autoMatchRate: number;
    work: MatchWorkStats;
    /** Field-level conflict counts, so "conflicts" is not one opaque number. */
    conflictFields: { field: string; count: number }[];
    profile?: MatchProfile;
  };

  candidates: CandidateMetrics;

  review: ReviewPressure;

  quality: QualitySample[];
  geography?: Record<
    string,
    {
      records: number;
      meanMsPerRecord: number;
      meanShortlist: number;
      shortlist: { mean: number; p50: number; p95: number; p99: number; max: number };
      candidate: {
        candidatePairs: number;
        cellSupersetCandidates: number;
        rejectedByExactRadius: number;
        exactSpatialCandidates: number;
        identifierCandidates: number;
        identifierOnlyCandidates: number;
        identifierRescuedBeyondRadius: number;
        finalCandidatePairs: number;
        exactRadiusPruningRatio: number;
      };
    }
  >;

  /** Present only when the tier ran against a database. */
  queries?: QueryTiming[];
  storage?: StorageStats;
  workingSet?: WorkingSetStats;

  gates: GateResult[];
  proceeded: boolean;
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

export function timingStats(samples: readonly number[]): TimingStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    totalMs: round(total),
    meanMsPerRecord: round(samples.length ? total / samples.length : 0),
    p50Ms: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    p99Ms: round(percentile(sorted, 99)),
    maxMs: round(sorted.at(-1) ?? 0),
  };
}

export function round(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Deterministic sampling, so a reported sample can be re-derived exactly. */
export function evenSample<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(items[Math.floor(i * step)]!);
  return out;
}
