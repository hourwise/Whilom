/**
 * Prove that bounding candidate discovery changed nothing.
 *
 *   pnpm --filter @whilom/ingestion scale:equivalence -- --tier 5000
 *
 * Runs one tier twice — once with exhaustive all-pairs discovery, once with the
 * locality-bounded generator — and compares the two decision oracles record by
 * record. Exits non-zero on any difference.
 *
 * The bar is exact. Batch 6 established by hand audit that all 11 automatic
 * merges at 5,000 records are correct, and an optimisation that quietly moves
 * one of them has not made the pipeline faster, it has made it different. A
 * near-match is a correctness finding, not an acceptable trade.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CandidateMode } from '../matching/candidates';
import { executeTier } from './run-tier';
import { buildOracle, compareOracles } from './oracle';
import type { DecisionDifference, Oracle } from './oracle';
import { ORACLE_TIER_SIZES, isOracleTierSize } from './tier';
import { round } from './metrics';

const INGESTION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export interface EquivalenceResult {
  tier: number;
  ranAt: string;
  /** Zero is the only passing value. */
  decisionDifferences: number;
  differences: DecisionDifference[];
  digestsMatch: boolean;
  exhaustive: {
    digest: string;
    summary: Record<string, number>;
    possiblePairs: number;
    candidatePairs: number;
    matchMs: number;
    generationMs: number;
    wallClockMs: number;
  };
  bounded: {
    digest: string;
    summary: Record<string, number>;
    possiblePairs: number;
    candidatePairs: number;
    matchMs: number;
    generationMs: number;
    wallClockMs: number;
  };
  pruning: {
    pairsRemoved: number;
    pruningRate: number;
    candidatePairsPerRecord: number;
    fromIdentifierOnly: number;
    cellsInspected: number;
  };
  speedup: {
    matchOnly: number;
    endToEnd: number;
  };
  passed: boolean;
}

export interface EquivalenceRun {
  result: EquivalenceResult;
  exhaustiveOracle: Oracle;
  boundedOracle: Oracle;
}

export async function checkEquivalence(tier: number): Promise<EquivalenceRun> {
  // Exhaustive first: it is the reference, and running it first means a crash
  // in the new code cannot be mistaken for the oracle being unavailable.
  const exhaustive = await executeTier(tier, CandidateMode.Exhaustive);
  const bounded = await executeTier(tier, CandidateMode.Bounded);

  const exhaustiveOracle = buildOracle(tier, CandidateMode.Exhaustive, exhaustive.report);
  const boundedOracle = buildOracle(tier, CandidateMode.Bounded, bounded.report);
  const differences = compareOracles(exhaustiveOracle, boundedOracle);

  const exhaustiveMatchMs = exhaustive.matchSamples.reduce((a, b) => a + b, 0);
  const boundedMatchMs = bounded.matchSamples.reduce((a, b) => a + b, 0);
  const boundedTotalMs = boundedMatchMs + bounded.candidateStats.generationMs;

  const result: EquivalenceResult = {
    tier,
    ranAt: new Date().toISOString(),
    decisionDifferences: differences.length,
    // Capped: a systematic bug produces thousands of these and the first
    // handful identify it just as well as all of them.
    differences: differences.slice(0, 50),
    digestsMatch: exhaustiveOracle.digest === boundedOracle.digest,
    exhaustive: {
      digest: exhaustiveOracle.digest,
      summary: exhaustiveOracle.summary,
      possiblePairs: exhaustive.candidateStats.possiblePairs,
      candidatePairs: exhaustive.candidateStats.candidatePairs,
      matchMs: round(exhaustiveMatchMs),
      generationMs: round(exhaustive.candidateStats.generationMs),
      wallClockMs: exhaustive.wallClockMs,
    },
    bounded: {
      digest: boundedOracle.digest,
      summary: boundedOracle.summary,
      possiblePairs: bounded.candidateStats.possiblePairs,
      candidatePairs: bounded.candidateStats.candidatePairs,
      matchMs: round(boundedMatchMs),
      generationMs: round(bounded.candidateStats.generationMs),
      wallClockMs: bounded.wallClockMs,
    },
    pruning: {
      pairsRemoved: bounded.candidateStats.possiblePairs - bounded.candidateStats.candidatePairs,
      pruningRate:
        bounded.candidateStats.possiblePairs > 0
          ? round(
              1 - bounded.candidateStats.candidatePairs / bounded.candidateStats.possiblePairs,
              5,
            )
          : 0,
      candidatePairsPerRecord: round(
        bounded.candidateStats.candidatePairs / Math.max(1, bounded.matchSamples.length),
        2,
      ),
      fromIdentifierOnly: bounded.candidateStats.fromIdentifierOnly,
      cellsInspected: bounded.candidateStats.cellsInspected,
    },
    speedup: {
      matchOnly: boundedMatchMs > 0 ? round(exhaustiveMatchMs / boundedMatchMs, 2) : 0,
      // Candidate generation is not free, so the honest figure charges its cost
      // against the matcher time it saves.
      endToEnd: boundedTotalMs > 0 ? round(exhaustiveMatchMs / boundedTotalMs, 2) : 0,
    },
    passed: differences.length === 0 && exhaustiveOracle.digest === boundedOracle.digest,
  };

  return { result, exhaustiveOracle, boundedOracle };
}

function parseTier(argv: readonly string[]): number {
  const index = argv.indexOf('--tier');
  const raw = index >= 0 ? argv[index + 1] : undefined;
  const tier = Number(raw);
  if (!Number.isFinite(tier) || !isOracleTierSize(tier)) {
    throw new Error(
      `--tier must be an oracle tier (${ORACLE_TIER_SIZES.join(', ')}) — got ${String(raw)}. ` +
        'Larger tiers run the bounded path only; see ORACLE_TIER_SIZES.',
    );
  }
  return tier;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tier = parseTier(process.argv.slice(2));
  const writeOracles = process.argv.includes('--write-oracles');

  checkEquivalence(tier)
    .then(({ result, exhaustiveOracle, boundedOracle }) => {
      const out = resolve(INGESTION_ROOT, `scale-equivalence-${tier}.json`);
      writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
      if (writeOracles) {
        writeFileSync(
          resolve(INGESTION_ROOT, `scale-oracle-${tier}.json`),
          JSON.stringify(exhaustiveOracle, null, 2) + '\n',
        );
        writeFileSync(
          resolve(INGESTION_ROOT, `scale-oracle-bounded-${tier}.json`),
          JSON.stringify(boundedOracle, null, 2) + '\n',
        );
      }

      console.log(`\n=== equivalence, tier ${tier} ===`);
      console.log(`exhaustive digest  ${result.exhaustive.digest.slice(0, 16)}`);
      console.log(`bounded digest     ${result.bounded.digest.slice(0, 16)}`);
      console.log(`decision diffs     ${result.decisionDifferences}`);
      console.log(`summary            ${JSON.stringify(result.bounded.summary)}`);
      console.log(
        `pairs              ${result.exhaustive.possiblePairs.toLocaleString()} -> ${result.bounded.candidatePairs.toLocaleString()} (${(result.pruning.pruningRate * 100).toFixed(2)}% pruned)`,
      );
      console.log(`candidates/record  ${result.pruning.candidatePairsPerRecord}`);
      console.log(`identifier-only    ${result.pruning.fromIdentifierOnly}`);
      console.log(
        `match time         ${result.exhaustive.matchMs}ms -> ${result.bounded.matchMs}ms (+${result.bounded.generationMs}ms generating)`,
      );
      console.log(
        `speedup            ${result.speedup.matchOnly}x match-only, ${result.speedup.endToEnd}x end-to-end`,
      );

      if (!result.passed) {
        console.error(`\nFAIL: ${result.decisionDifferences} decision difference(s).`);
        for (const difference of result.differences.slice(0, 15)) {
          console.error(
            `  ${difference.sourceRecordId} "${difference.name}" ${difference.field}: exhaustive=${difference.exhaustive} bounded=${difference.bounded}`,
          );
        }
        process.exitCode = 1;
      } else {
        console.log(`\nPASS: bounded candidate generation reproduced every decision exactly.`);
      }
      console.log(`wrote ${out}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
