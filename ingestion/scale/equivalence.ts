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
  cellSuperset: {
    digest: string;
    summary: Record<string, number>;
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
  registerPruned: {
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
  registerPrunedOracle: Oracle;
}

export async function checkEquivalence(tier: number): Promise<EquivalenceRun> {
  // Exhaustive first: it is the reference, and running it first means a crash
  // in the new code cannot be mistaken for the oracle being unavailable.
  const exhaustive = await executeTier(tier, CandidateMode.Exhaustive);
  const cellSuperset = await executeTier(tier, CandidateMode.CellSuperset);
  const bounded = await executeTier(tier, CandidateMode.Bounded);
  const registerPruned = await executeTier(tier, CandidateMode.RegisterPruned);

  const exhaustiveOracle = buildOracle(tier, CandidateMode.Exhaustive, exhaustive.report);
  const cellSupersetOracle = buildOracle(tier, CandidateMode.CellSuperset, cellSuperset.report);
  const boundedOracle = buildOracle(tier, CandidateMode.Bounded, bounded.report);
  const registerPrunedOracle = buildOracle(
    tier,
    CandidateMode.RegisterPruned,
    registerPruned.report,
  );
  const cellSupersetDifferences = compareOracles(exhaustiveOracle, cellSupersetOracle);
  const boundedDifferences = compareOracles(exhaustiveOracle, boundedOracle);
  const registerPrunedDifferences = compareOracles(exhaustiveOracle, registerPrunedOracle);
  const differences = [
    ...cellSupersetDifferences,
    ...boundedDifferences,
    ...registerPrunedDifferences,
  ];

  const exhaustiveMatchMs = exhaustive.matchSamples.reduce((a, b) => a + b, 0);
  const cellSupersetMatchMs = cellSuperset.matchSamples.reduce((a, b) => a + b, 0);
  const boundedMatchMs = bounded.matchSamples.reduce((a, b) => a + b, 0);
  const registerPrunedMatchMs = registerPruned.matchSamples.reduce((a, b) => a + b, 0);
  const registerPrunedTotalMs = registerPrunedMatchMs + registerPruned.candidateStats.generationMs;

  const result: EquivalenceResult = {
    tier,
    ranAt: new Date().toISOString(),
    decisionDifferences: differences.length,
    // Capped: a systematic bug produces thousands of these and the first
    // handful identify it just as well as all of them.
    differences: differences.slice(0, 50),
    digestsMatch:
      exhaustiveOracle.digest === cellSupersetOracle.digest &&
      exhaustiveOracle.digest === boundedOracle.digest &&
      exhaustiveOracle.digest === registerPrunedOracle.digest,
    exhaustive: {
      digest: exhaustiveOracle.digest,
      summary: exhaustiveOracle.summary,
      possiblePairs: exhaustive.candidateStats.possiblePairs,
      candidatePairs: exhaustive.candidateStats.candidatePairs,
      matchMs: round(exhaustiveMatchMs),
      generationMs: round(exhaustive.candidateStats.generationMs),
      wallClockMs: exhaustive.wallClockMs,
    },
    cellSuperset: {
      digest: cellSupersetOracle.digest,
      summary: cellSupersetOracle.summary,
      candidatePairs: cellSuperset.candidateStats.candidatePairs,
      matchMs: round(cellSupersetMatchMs),
      generationMs: round(cellSuperset.candidateStats.generationMs),
      wallClockMs: cellSuperset.wallClockMs,
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
    registerPruned: {
      digest: registerPrunedOracle.digest,
      summary: registerPrunedOracle.summary,
      possiblePairs: registerPruned.candidateStats.possiblePairs,
      candidatePairs: registerPruned.candidateStats.candidatePairs,
      matchMs: round(registerPrunedMatchMs),
      generationMs: round(registerPruned.candidateStats.generationMs),
      wallClockMs: registerPruned.wallClockMs,
    },
    pruning: {
      pairsRemoved:
        registerPruned.candidateStats.possiblePairs - registerPruned.candidateStats.candidatePairs,
      pruningRate:
        registerPruned.candidateStats.possiblePairs > 0
          ? round(
              1 -
                registerPruned.candidateStats.candidatePairs /
                  registerPruned.candidateStats.possiblePairs,
              5,
            )
          : 0,
      candidatePairsPerRecord: round(
        registerPruned.candidateStats.candidatePairs /
          Math.max(1, registerPruned.matchSamples.length),
        2,
      ),
      fromIdentifierOnly: registerPruned.candidateStats.fromIdentifierOnly,
      cellsInspected: registerPruned.candidateStats.cellsInspected,
    },
    speedup: {
      matchOnly:
        registerPrunedMatchMs > 0 ? round(exhaustiveMatchMs / registerPrunedMatchMs, 2) : 0,
      // Candidate generation is not free, so the honest figure charges its cost
      // against the matcher time it saves.
      endToEnd: registerPrunedTotalMs > 0 ? round(exhaustiveMatchMs / registerPrunedTotalMs, 2) : 0,
    },
    passed:
      cellSupersetDifferences.length === 0 &&
      boundedDifferences.length === 0 &&
      registerPrunedDifferences.length === 0 &&
      exhaustiveOracle.digest === cellSupersetOracle.digest &&
      exhaustiveOracle.digest === boundedOracle.digest &&
      exhaustiveOracle.digest === registerPrunedOracle.digest,
  };

  return { result, exhaustiveOracle, boundedOracle, registerPrunedOracle };
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
    .then(({ result, exhaustiveOracle, boundedOracle, registerPrunedOracle }) => {
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
        writeFileSync(
          resolve(INGESTION_ROOT, `scale-oracle-register-pruned-${tier}.json`),
          JSON.stringify(registerPrunedOracle, null, 2) + '\n',
        );
      }

      console.log(`\n=== equivalence, tier ${tier} ===`);
      console.log(`exhaustive digest  ${result.exhaustive.digest.slice(0, 16)}`);
      console.log(`cell-superset      ${result.cellSuperset.digest.slice(0, 16)}`);
      console.log(`bounded digest     ${result.bounded.digest.slice(0, 16)}`);
      console.log(`register-pruned    ${result.registerPruned.digest.slice(0, 16)}`);
      console.log(`decision diffs     ${result.decisionDifferences}`);
      console.log(`summary            ${JSON.stringify(result.bounded.summary)}`);
      console.log(
        `pairs              ${result.exhaustive.possiblePairs.toLocaleString()} -> ${result.registerPruned.candidatePairs.toLocaleString()} (${(result.pruning.pruningRate * 100).toFixed(2)}% pruned)`,
      );
      console.log(`candidates/record  ${result.pruning.candidatePairsPerRecord}`);
      console.log(`identifier-only    ${result.pruning.fromIdentifierOnly}`);
      console.log(
        `match time         ${result.exhaustive.matchMs}ms -> ${result.registerPruned.matchMs}ms (+${result.registerPruned.generationMs}ms generating)`,
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
        console.log(`\nPASS: all bounded candidate modes reproduced every decision exactly.`);
      }
      console.log(`wrote ${out}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
