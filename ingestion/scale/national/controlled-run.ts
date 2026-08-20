/** Run one fresh-process composition-controlled national stage. */

import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CandidateMode } from '../../matching/candidates';
import { ChunkedCandidateIndex } from '../../matching/chunked-candidates';
import type { CanonicalPlaceRef, PlaceCandidate } from '../../pipeline/candidate';
import { buildTierMetrics, executeTier } from '../run-tier';
import { CONTROLLED_CACHE_DIR, CONTROLLED_SIZES, buildControlledNationalTier } from './controlled';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const INGESTION_ROOT = resolve(REPO_ROOT, 'ingestion');
const RESULT_DIR = CONTROLLED_CACHE_DIR;

interface PairMatrix {
  [candidateDesignation: string]: Record<string, number>;
}

function requestedSize(): number {
  const index = process.argv.indexOf('--only');
  const size = index >= 0 ? Number(process.argv[index + 1]) : NaN;
  if (!CONTROLLED_SIZES.includes(size as (typeof CONTROLLED_SIZES)[number])) {
    throw new Error(`--only must be one of ${CONTROLLED_SIZES.join(', ')}`);
  }
  return size;
}

function designationNames(candidate: PlaceCandidate): string[] {
  return candidate.designations.length > 0
    ? candidate.designations.map((item) => item.designation)
    : ['none'];
}

function canonicalDesignationNames(existing: CanonicalPlaceRef): string[] {
  return existing.sourceIdentity?.designations.length
    ? [...existing.sourceIdentity.designations]
    : ['none'];
}

function addPair(matrix: PairMatrix, candidate: string, existing: string): void {
  const row = matrix[candidate] ?? {};
  row[existing] = (row[existing] ?? 0) + 1;
  matrix[candidate] = row;
}

async function main(): Promise<void> {
  const size = requestedSize();
  globalThis.gc?.();
  const fixture = buildControlledNationalTier(size);
  const pairMatrix: PairMatrix = {};
  const storeDirectory = resolve(INGESTION_ROOT, '.national-chunk-cache', `controlled-${size}-${process.pid}`);
  const store = new ChunkedCandidateIndex(storeDirectory, 65_536, CandidateMode.RegisterPruned);
  const execution = await executeTier(size, CandidateMode.RegisterPruned, () => fixture, {
    candidateStore: store,
    chunkSize: 4_096,
    retainDecided: false,
    onCandidateSet: (candidate, shortlist) => {
      for (const existing of shortlist) {
        for (const candidateDesignation of designationNames(candidate)) {
          for (const existingDesignation of canonicalDesignationNames(existing)) {
            addPair(pairMatrix, candidateDesignation, existingDesignation);
          }
        }
      }
    },
  });
  globalThis.gc?.();
  const metrics = buildTierMetrics(execution, size);
  const memory = process.memoryUsage();
  const valid = execution.report.valid;
  const workingSet = execution.workingSet;
  const result = {
    stage: size,
    sample: fixture.report,
    ingestion: {
      records: execution.report.sourceRows,
      valid,
      rejected: execution.report.rejected,
      conflicts: execution.report.outcomes['CONFLICT_REVIEW'] ?? 0,
      integrity: {
        sourceRows: execution.report.sourceRows,
        accountedFor: execution.report.valid + execution.report.rejected,
        valid,
        rejected: execution.report.rejected,
      },
      recordsPerSecond: metrics.ingestion.recordsPerSecond,
      totalMsPerRecord: execution.wallClockMs / Math.max(1, execution.report.sourceRows),
      matcherMsPerRecord: metrics.matching.work.meanMsPerRecord,
      comparisonsPerRecord: execution.matchStats.comparisons / Math.max(1, valid),
    },
    candidates: {
      exactRadiusCandidates: execution.candidateStats.exactSpatialCandidates,
      registerPrunedCandidates: execution.candidateStats.registerVetoCandidates,
      finalMatcherCandidates: execution.candidateStats.finalCandidatePairs,
      exactRadiusCandidatesPerRecord:
        execution.candidateStats.exactSpatialCandidates / Math.max(1, valid),
      registerPrunedCandidatesPerRecord:
        execution.candidateStats.registerVetoCandidates / Math.max(1, valid),
      finalMatcherCandidatesPerRecord:
        execution.candidateStats.finalCandidatePairs / Math.max(1, valid),
      pairMatrix,
    },
    memory: {
      heapAfterGcMb: Math.round(memory.heapUsed / 1_048_576),
      peakHeapMb: execution.peakHeapUsedMb,
      rssMb: Math.round(memory.rss / 1_048_576),
    },
    io: workingSet
      ? {
          pageReads: workingSet.physicalReadCalls,
          bytesRead: workingSet.bytesReadFromSpill,
          recordsDecoded: workingSet.recordsDecoded,
          payloadLookups: workingSet.payloadLookups,
          cacheLimit: workingSet.maxCachedPayloadRecords,
        }
      : null,
  };
  writeFileSync(resolve(RESULT_DIR, `controlled-scale-result-${size}.json`), `${JSON.stringify(result, null, 2)}\n`);
  rmSync(storeDirectory, { recursive: true, force: true });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
