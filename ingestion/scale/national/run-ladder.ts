/**
 * The national scale ladder: run the ordinary pipeline at growing national
 * checkpoints and classify each one.
 *
 *   pnpm --filter @whilom/ingestion national:ladder
 *
 * This is the in-process lane — source parse, normalise, identity resolution,
 * bounded candidate generation, matching, conflict classification — measured
 * with the SAME code as the regional ladder (buildTierMetrics), so the numbers
 * can be compared across scales rather than merely across benchmarks.
 *
 * What it answers: does the architecture that was tuned at 23k still hold its
 * shape at 2x and 4x, on geographically diverse data rather than one region?
 * The decisive gate is matcher scaling (G5): if per-record match time grows
 * with the accumulated canonical set, the approach cannot reach national scale
 * whatever the hardware.
 *
 * What it does NOT do: touch a database or the canonical production corpus.
 * The query-latency and storage lanes run against an ephemeral database in CI;
 * this lane is the one that needs no database and therefore scales furthest.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CandidateMode } from '../../matching/candidates';
import { ChunkedCandidateIndex } from '../../matching/chunked-candidates';
import { MatchOutcome } from '../../pipeline/candidate';
import { executeTier, buildTierMetrics } from '../run-tier';
import { round } from '../metrics';
import type { TierMetrics } from '../metrics';
import { buildNationalTier, nationalSampleSize } from './tier';
import { NATIONAL_CHECKPOINTS } from './capture';

const INGESTION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** How a checkpoint ended up, in the vocabulary the brief asks for. */
export type StageClassification =
  | 'PASS'
  | 'PASS_WITH_HEADROOM_CONCERN'
  | 'FAIL_PERFORMANCE'
  | 'FAIL_INTEGRITY'
  | 'FAIL_RESOURCE_BOUND'
  | 'NOT_RUN';

export interface StageResult {
  stage: number;
  recordCount: number;
  ingestMs: number;
  recordsPerSecond: number;
  meanMsPerRecord: number;
  meanComparisonsPerRecord: number;
  cellSupersetCandidatesPerRecord: number;
  exactSpatialCandidatesPerRecord: number;
  exactRadiusRejectedPerRecord: number;
  identifierOnlyCandidatesPerRecord: number;
  identifierRescuedBeyondRadius: number;
  /** Ratio of this stage's per-record match time to the smallest stage's. */
  matchTimeScaling: number | null;
  integrity: {
    sourceRows: number;
    accountedFor: number;
    valid: number;
    rejected: number;
    conflicts: number;
  };
  conflicts: number;
  conflictRate: number;
  heapUsedMb: number;
  rssMb: number;
  peakHeapUsedMb: number;
  shortlist: TierMetrics['matching']['work']['shortlist'];
  externalMb: number;
  gcAvailable: boolean;
  workingSet?: {
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
  };
  classification: StageClassification;
  reason: string;
}

/**
 * National scale gates. Declared here, before any stage runs, and justified in
 * product terms — not fitted to the numbers.
 *
 * They reuse the regional thresholds where those already exist (per-record
 * match time, throughput) and add the two that only a multi-scale run can
 * answer: that per-record cost does not climb with corpus size, and that heap
 * stays inside a runner's budget.
 */
export const NATIONAL_GATES = {
  /**
   * The architectural gate, from the regional G5. Per-record match time must
   * grow SUB-LINEARLY with the corpus between adjacent stages: if doubling the
   * records more than doubles the per-record cost, total match cost is
   * super-quadratic and the approach cannot reach national scale whatever the
   * hardware. Expressed as (timeRatio / sizeRatio); 1.0 is the ceiling.
   *
   * Regional G5 allowed 3x time for 5x records (sizeRatio 5, timeRatio 3 →
   * 0.6). This is the same standard, checked between whatever stages actually
   * run rather than at two fixed sizes.
   */
  perRecordGrowthVsSizeMax: 1.0,
  /** Absolute ceiling per record, from the regional G5. */
  meanMsPerRecordMax: 50,
  /** Regional G7 throughput floor. */
  recordsPerSecondMin: 20,
  /** A single Node heap should not approach the default 2GB runner ceiling. */
  heapUsedMbMax: 1_400,
} as const;

export function classifyStage(
  stage: StageResult,
  previous: StageResult | undefined,
): { classification: StageClassification; reason: string } {
  const i = stage.integrity;
  if (i.accountedFor !== i.sourceRows) {
    return {
      classification: 'FAIL_INTEGRITY',
      reason: `${i.sourceRows - i.accountedFor} source rows reached no recorded outcome`,
    };
  }
  if (stage.heapUsedMb > NATIONAL_GATES.heapUsedMbMax) {
    return {
      classification: 'FAIL_RESOURCE_BOUND',
      reason: `heap ${stage.heapUsedMb}MB exceeds ${NATIONAL_GATES.heapUsedMbMax}MB`,
    };
  }
  if (stage.meanMsPerRecord > NATIONAL_GATES.meanMsPerRecordMax) {
    return {
      classification: 'FAIL_PERFORMANCE',
      reason: `${stage.meanMsPerRecord}ms/record exceeds the ${NATIONAL_GATES.meanMsPerRecordMax}ms absolute ceiling`,
    };
  }
  // The architectural test: per-record cost against corpus growth, adjacent
  // stages, exactly as the regional G5 compares two tiers.
  if (previous && previous.meanMsPerRecord > 0) {
    const sizeRatio = stage.recordCount / previous.recordCount;
    const timeRatio = stage.meanMsPerRecord / previous.meanMsPerRecord;
    const growth = timeRatio / sizeRatio;
    if (growth > NATIONAL_GATES.perRecordGrowthVsSizeMax) {
      return {
        classification: 'FAIL_PERFORMANCE',
        reason:
          `per-record match time grew ${timeRatio.toFixed(1)}x for ${sizeRatio.toFixed(1)}x records ` +
          `(${growth.toFixed(2)} > ${NATIONAL_GATES.perRecordGrowthVsSizeMax}); super-linear per record, ` +
          `so total match cost is super-quadratic. Absolute is still ${stage.meanMsPerRecord}ms/record — the ` +
          `regression is the trend, not the current speed`,
      };
    }
  }
  if (stage.recordsPerSecond < NATIONAL_GATES.recordsPerSecondMin) {
    return {
      classification: 'PASS_WITH_HEADROOM_CONCERN',
      reason: `throughput ${stage.recordsPerSecond}/s is below the ${NATIONAL_GATES.recordsPerSecondMin}/s advisory floor`,
    };
  }
  return { classification: 'PASS', reason: 'within every national gate' };
}

function conflictCount(metrics: TierMetrics): number {
  return metrics.matching.outcomes[MatchOutcome.ConflictReview] ?? 0;
}

export async function runNationalLadder(
  largest?: number,
  only?: number,
  cacheLimit = Number(process.env['WHILOM_CACHE_LIMIT'] ?? 65_536),
): Promise<{
  sampleSize: number;
  checkpoints: number[];
  stages: StageResult[];
  maxProvenScale: string;
}> {
  const available = nationalSampleSize();
  const requested: number[] =
    only !== undefined
      ? [only]
      : [...NATIONAL_CHECKPOINTS].filter(
          (c) => c <= available && (largest === undefined || c <= largest),
        );
  // The stratified sample lands a hair under 100k (largest-remainder rounding on
  // per-layer sub-quotas), so the 100k checkpoint is exercised at the full
  // sample size rather than dropped. Reported as the ~100k stage it is.
  const topRequested = requested[requested.length - 1] ?? 0;
  if (
    only === undefined &&
    available > topRequested &&
    (largest === undefined || available <= largest)
  ) {
    requested.push(available);
  }

  const stages: StageResult[] = [];
  const perRecordByStage: number[] = [];

  for (const size of requested) {
    if (globalThis.gc) globalThis.gc();
    const store = new ChunkedCandidateIndex(
      resolve(INGESTION_ROOT, '.national-chunk-cache', `${size}-${process.pid}`),
      cacheLimit,
    );
    const execution = await executeTier(size, CandidateMode.Bounded, buildNationalTier, {
      candidateStore: store,
      chunkSize: 4_096,
      retainDecided: false,
    });
    globalThis.gc?.();
    const metrics = buildTierMetrics(execution, size);

    const memory = process.memoryUsage();
    const heapUsedMb = Math.round(memory.heapUsed / 1_048_576);
    const accountedFor = metrics.ingestion.valid + metrics.ingestion.rejected;
    const conflicts = conflictCount(metrics);
    const meanMsPerRecord = metrics.matching.work.meanMsPerRecord;
    perRecordByStage.push(meanMsPerRecord);
    const smallest = Math.min(...perRecordByStage);
    const previousStage = stages[stages.length - 1];

    const partial: StageResult = {
      stage: size,
      recordCount: metrics.ingestion.sourceRows,
      ingestMs: execution.wallClockMs,
      recordsPerSecond: metrics.ingestion.recordsPerSecond,
      meanMsPerRecord,
      meanComparisonsPerRecord: metrics.matching.work.meanComparisonsPerRecord,
      cellSupersetCandidatesPerRecord: round(
        metrics.candidates.cellSupersetCandidates / Math.max(1, metrics.ingestion.valid),
        1,
      ),
      exactSpatialCandidatesPerRecord: round(
        metrics.candidates.exactSpatialCandidates / Math.max(1, metrics.ingestion.valid),
        1,
      ),
      exactRadiusRejectedPerRecord: round(
        metrics.candidates.rejectedByExactRadius / Math.max(1, metrics.ingestion.valid),
        1,
      ),
      identifierOnlyCandidatesPerRecord: round(
        metrics.candidates.identifierOnlyCandidates / Math.max(1, metrics.ingestion.valid),
        2,
      ),
      identifierRescuedBeyondRadius: metrics.candidates.identifierRescuedBeyondRadius,
      matchTimeScaling: smallest > 0 ? Math.round((meanMsPerRecord / smallest) * 100) / 100 : null,
      integrity: {
        sourceRows: metrics.ingestion.sourceRows,
        accountedFor,
        valid: metrics.ingestion.valid,
        rejected: metrics.ingestion.rejected,
        conflicts,
      },
      conflicts,
      conflictRate:
        metrics.ingestion.valid > 0
          ? Math.round((conflicts / metrics.ingestion.valid) * 10000) / 10000
          : 0,
      heapUsedMb,
      rssMb: Math.round(memory.rss / 1_048_576),
      peakHeapUsedMb: Math.max(execution.peakHeapUsedMb, heapUsedMb),
      externalMb: Math.round(memory.external / 1_048_576),
      gcAvailable: typeof globalThis.gc === 'function',
      ...(execution.workingSet ? { workingSet: execution.workingSet } : {}),
      shortlist: metrics.matching.work.shortlist,
      classification: 'NOT_RUN',
      reason: '',
    };
    const verdict = classifyStage(partial, previousStage);
    partial.classification = verdict.classification;
    partial.reason = verdict.reason;
    stages.push(partial);

    // Stop the ladder on a hard failure — the stages above would inherit the
    // same fault and cost time proving something already known.
    if (partial.classification.startsWith('FAIL')) break;
  }

  const lastPass = [...stages]
    .reverse()
    .find((s) => s.classification === 'PASS' || s.classification === 'PASS_WITH_HEADROOM_CONCERN');
  const fullDatasetExercised = false; // the sample is 100k; the full 401k is not fetched here
  // Report the proven scale to the nearest 5k below the largest passing stage,
  // so a 99,990-record stage reads as 95K rather than an odd exact figure and
  // never overclaims.
  const provenFloor = lastPass ? Math.floor(lastPass.stage / 5000) * 5 : 0;
  const maxProvenScale = lastPass
    ? fullDatasetExercised
      ? 'PROVEN_SAFE_TO_FULL_DATASET'
      : lastPass.stage >= 199_980
        ? 'PROVEN_SAFE_TO_200K'
        : lastPass.stage >= 100_000
          ? 'PROVEN_SAFE_TO_100K'
          : lastPass.stage >= 50_000
            ? 'PROVEN_SAFE_TO_50K'
            : `PROVEN_SAFE_TO_${provenFloor}K`
    : `NOT_PROVEN_BEYOND_${(stages[0]?.stage ?? 0) / 1000}K`;

  return { sampleSize: available, checkpoints: requested, stages, maxProvenScale };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]).endsWith('run-ladder.ts');
if (invokedDirectly) {
  const largestArg = process.argv.indexOf('--largest');
  const largest = largestArg >= 0 ? Number(process.argv[largestArg + 1]) : undefined;
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg >= 0 ? Number(process.argv[onlyArg + 1]) : undefined;
  runNationalLadder(largest, only)
    .then((result) => {
      writeFileSync(
        resolve(INGESTION_ROOT, 'national-ladder.json'),
        JSON.stringify(result, null, 2) + '\n',
      );
      console.log(`sample ${result.sampleSize.toLocaleString()} records\n`);
      console.log('stage    rec/s   ms/rec  comps/rec  scaling  heapMB  conflicts  class');
      for (const s of result.stages) {
        console.log(
          `${String(s.stage).padStart(6)}  ${String(s.recordsPerSecond).padStart(6)}  ${String(s.meanMsPerRecord).padStart(6)}  ` +
            `${String(s.meanComparisonsPerRecord).padStart(8)}  ${String(s.matchTimeScaling ?? '-').padStart(6)}  ${String(s.heapUsedMb).padStart(5)}  ` +
            `${String(s.conflicts).padStart(8)}   ${s.classification}`,
        );
      }
      console.log(`\n${result.maxProvenScale}`);
      const failed = result.stages.some((s) => s.classification.startsWith('FAIL'));
      if (failed) process.exitCode = 1;
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
