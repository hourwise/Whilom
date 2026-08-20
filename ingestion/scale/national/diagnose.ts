/**
 * Fresh-process Batch 16 diagnosis for the established ~100k national prefix.
 *
 * This is intentionally separate from the authoritative ladder. It enables a
 * bounded cache-limit experiment and detailed matcher counters without making
 * either diagnostic setting a production default.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CandidateMode } from '../../matching/candidates';
import { ChunkedCandidateIndex } from '../../matching/chunked-candidates';
import { executeTier, buildTierMetrics } from '../run-tier';
import { buildNationalTier } from './tier';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const INGESTION_ROOT = resolve(REPO_ROOT, 'ingestion');

function argument(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

async function main(): Promise<void> {
  const cacheLimit = argument('--cache-limit', 65_536);
  const size = argument('--records', 100_000);
  globalThis.gc?.();
  const store = new ChunkedCandidateIndex(
    resolve(
      INGESTION_ROOT,
      '.national-chunk-cache',
      `diagnostic-${size}-${cacheLimit}-${process.pid}`,
    ),
    cacheLimit,
  );
  const execution = await executeTier(size, CandidateMode.Bounded, buildNationalTier, {
    candidateStore: store,
    chunkSize: 4_096,
    retainDecided: false,
    profile: true,
    profileSampleEvery: 100,
  });
  globalThis.gc?.();
  const metrics = buildTierMetrics(execution, size);
  const memory = process.memoryUsage();
  const result = {
    cacheLimit,
    records: size,
    corpus: 'extended national ladder prefix; buildNationalTier(100000)',
    metrics,
    memory: {
      heapUsedMb: Math.round(memory.heapUsed / 1_048_576),
      rssMb: Math.round(memory.rss / 1_048_576),
      peakHeapUsedMb: execution.peakHeapUsedMb,
    },
  };
  const output = resolve(INGESTION_ROOT, `national-diagnostic-${cacheLimit}.json`);
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        cacheLimit,
        records: metrics.tier,
        recordsPerSecond: metrics.ingestion.recordsPerSecond,
        meanMsPerRecord: metrics.matching.work.meanMsPerRecord,
        meanComparisonsPerRecord: metrics.matching.work.meanComparisonsPerRecord,
        shortlist: metrics.matching.work.shortlist,
        workingSet: metrics.workingSet,
        memory: result.memory,
        geography: metrics.geography,
        profile: metrics.matching.profile,
        output,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
