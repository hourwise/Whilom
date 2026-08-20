/** Summarise the four previously recorded controlled fresh-process stages. */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTROLLED_CACHE_DIR, CONTROLLED_SIZES } from './controlled';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const INGESTION_ROOT = resolve(REPO_ROOT, 'ingestion');
const OUTPUT = resolve(INGESTION_ROOT, 'controlled-national-scale.json');
const GATE = 1.0;

interface Stage {
  stage: number;
  ingestion: {
    records: number;
    valid: number;
    rejected: number;
    conflicts: number;
    integrity: { sourceRows: number; accountedFor: number; valid: number; rejected: number };
    recordsPerSecond: number;
    totalMsPerRecord: number;
    matcherMsPerRecord: number;
    comparisonsPerRecord: number;
  };
  candidates: {
    exactRadiusCandidatesPerRecord: number;
    registerPrunedCandidatesPerRecord: number;
    finalMatcherCandidatesPerRecord: number;
    pairMatrix: Record<string, Record<string, number>>;
  };
  memory: { heapAfterGcMb: number; peakHeapMb: number; rssMb: number };
  io: { pageReads: number; bytesRead: number; recordsDecoded: number; cacheLimit: number } | null;
  sample: unknown;
}

function readStages(): Stage[] {
  return CONTROLLED_SIZES.map((size) => {
    const path = resolve(CONTROLLED_CACHE_DIR, `controlled-scale-result-${size}.json`);
    if (!existsSync(path)) throw new Error(`missing controlled stage result: ${path}`);
    return JSON.parse(readFileSync(path, 'utf8')) as Stage;
  });
}

function growth(later: Stage, earlier: Stage): number {
  return (
    (later.ingestion.matcherMsPerRecord / earlier.ingestion.matcherMsPerRecord) /
    (later.stage / earlier.stage)
  );
}

function transition(later: Stage, earlier: Stage): { normalizedGrowth: number; pass: boolean } {
  const normalizedGrowth = growth(later, earlier);
  return { normalizedGrowth, pass: normalizedGrowth <= GATE };
}

function classify(stages: readonly Stage[], transitions: readonly { pass: boolean }[]): string {
  if (transitions.every((item) => item.pass)) return 'PASS_TO_200K';
  if (transitions[0]?.pass && transitions[1]?.pass) return 'PASS_TO_100K';
  if (transitions[0]?.pass) return 'PASS_TO_50K';
  return 'FAIL';
}

function comparable(stages: readonly Stage[]): 'PASS' | 'PARTIAL' | 'FAIL' {
  const full = stages[stages.length - 1]!.sample as { designationPercentages?: Record<string, number> };
  const target = full.designationPercentages ?? {};
  const deviations = stages.flatMap((stage) => {
    const percentages = (stage.sample as { designationPercentages?: Record<string, number> }).designationPercentages ?? {};
    return Object.entries(target).map(([key, value]) => Math.abs((percentages[key] ?? 0) - value));
  });
  const maxDeviation = Math.max(...deviations, 0);
  return maxDeviation <= 0.05 ? 'PASS' : maxDeviation <= 0.5 ? 'PARTIAL' : 'FAIL';
}

function main(): void {
  const stages = readStages();
  const transitions = stages.slice(1).map((stage, index) => ({
    from: stages[index]!.stage,
    to: stage.stage,
    ...transition(stage, stages[index]!),
  }));
  const output = {
    gate: { perRecordGrowthVsSizeMax: GATE },
    stages,
    normalizedGrowth: transitions,
    equivalentWorkScale: classify(stages, transitions),
    controlledWorkloadComparability: comparable(stages),
    officialScaleClassification: {
      maximumProvenSafeScale: 'PROVEN_SAFE_TO_50K',
      nationalExpansionClassification: 'REMEDIATION_INSUFFICIENT',
    },
  };
  writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
}

main();
