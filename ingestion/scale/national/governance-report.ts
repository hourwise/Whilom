/**
 * Build the deterministic Batch 20 governance report from committed Batch
 * 19A/19B aggregate evidence. It intentionally does not run ingestion.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HISTORICAL_PREFIX_SIZES,
  NATIONAL_SCALE_BENCHMARK_CONTRACT,
  PER_RECORD_GROWTH_VS_SIZE_MAX,
  validateNationalScaleBenchmarkContract,
} from './benchmark-contract';
import {
  compareComposition,
  type CompositionSnapshot,
  type CompositionDriftResult,
} from './composition-drift';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const INGESTION_ROOT = resolve(REPO_ROOT, 'ingestion');
export const GOVERNANCE_REPORT_PATH = resolve(INGESTION_ROOT, 'national-scale-governance.json');
const HISTORICAL_EVIDENCE_PATH = resolve(INGESTION_ROOT, 'national-workload-audit.json');
const CONTROLLED_EVIDENCE_PATH = resolve(INGESTION_ROOT, 'controlled-national-scale.json');

const TOLERANCE = {
  layerTolerancePercentagePoints:
    NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.COMPOSITION_CONTROLLED_SCALE.comparability
      .layerTolerancePercentagePoints,
  geographyTolerancePercentagePoints:
    NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.COMPOSITION_CONTROLLED_SCALE.comparability
      .geographyTolerancePercentagePoints,
};

interface HistoricalEvidence {
  authoritativeCheckpoints: Record<string, CompositionSnapshot>;
  prefixes: Array<{ size: number; finalMatcherCandidates: number }>;
}

interface ControlledStage {
  stage: number;
  sample: CompositionSnapshot & { sampleDigest: string };
  ingestion: { matcherMsPerRecord: number };
  candidates: {
    exactRadiusCandidatesPerRecord: number;
    registerPrunedCandidatesPerRecord: number;
    finalMatcherCandidatesPerRecord: number;
  };
}

interface ControlledEvidence {
  stages: ControlledStage[];
  normalizedGrowth: Array<{ from: number; to: number; normalizedGrowth: number; pass: boolean }>;
  equivalentWorkScale: string;
  controlledWorkloadComparability: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function snapshotFor(value: CompositionSnapshot): CompositionSnapshot {
  return {
    designationPercentages: value.designationPercentages ?? {},
    cellPercentages: value.cellPercentages ?? {},
  };
}

function transition(
  from: number,
  to: number,
  earlier: CompositionSnapshot,
  later: CompositionSnapshot,
  normalizedGrowth: number,
): CompositionDriftResult & { from: number; to: number; normalizedGrowth: number; pass: boolean } {
  return {
    from,
    to,
    ...compareComposition(earlier, later, TOLERANCE),
    normalizedGrowth,
    pass: normalizedGrowth <= PER_RECORD_GROWTH_VS_SIZE_MAX,
  };
}

function historicalTransitions(evidence: HistoricalEvidence): Array<
  CompositionDriftResult & {
    from: number;
    to: number;
    normalizedGrowth: number;
    pass: boolean;
  }
> {
  const matcherMsPerRecord: Record<string, number> =
    NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.AUTHORITATIVE_PREFIX_REGRESSION.evidence
      .recordedMatcherMsPerRecord;
  return HISTORICAL_PREFIX_SIZES.slice(1).map((size, index) => {
    const earlierSize = HISTORICAL_PREFIX_SIZES[index]!;
    const normalizedGrowth =
      matcherMsPerRecord[String(size)]! /
      matcherMsPerRecord[String(earlierSize)]! /
      (size / earlierSize);
    return transition(
      earlierSize,
      size,
      snapshotFor(evidence.authoritativeCheckpoints[String(earlierSize)]!),
      snapshotFor(evidence.authoritativeCheckpoints[String(size)]!),
      normalizedGrowth,
    );
  });
}

function controlledTransitions(evidence: ControlledEvidence): Array<
  CompositionDriftResult & {
    from: number;
    to: number;
    normalizedGrowth: number;
    pass: boolean;
  }
> {
  return evidence.stages.slice(1).map((stage, index) => {
    const earlier = evidence.stages[index]!;
    const recorded = evidence.normalizedGrowth[index]!;
    return transition(
      earlier.stage,
      stage.stage,
      snapshotFor(earlier.sample),
      snapshotFor(stage.sample),
      recorded.normalizedGrowth,
    );
  });
}

export interface NationalScaleGovernanceReport {
  contractId: string;
  contractVersion: number;
  lanes: {
    historicalPrefixRegression: {
      role: 'HISTORICAL';
      compositionDrift: ReturnType<typeof historicalTransitions>;
      historicalPrefixStatus: string;
      maximumProvenSafeScale: string;
      nationalExpansionClassification: string;
    };
    compositionControlledScale: {
      role: 'CONTROLLED';
      sampleDigests: Record<string, string>;
      compositionDrift: ReturnType<typeof controlledTransitions>;
      controlledEquivalentWorkScale: string;
      controlledWorkloadComparability: string;
    };
  };
  overallEvidence: {
    architectureScaleEvidence: string;
    fullNational401kScale: string;
    databaseScale: string;
    nationalPublication: string;
    perRecordGrowthVsSizeMax: number;
  };
}

export function buildGovernanceReport(): NationalScaleGovernanceReport {
  const validation = validateNationalScaleBenchmarkContract();
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  const historical = readJson<HistoricalEvidence>(HISTORICAL_EVIDENCE_PATH);
  const controlled = readJson<ControlledEvidence>(CONTROLLED_EVIDENCE_PATH);
  const expectedDigests: Record<string, string> =
    NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.COMPOSITION_CONTROLLED_SCALE.sampleEvidence
      .sampleDigests;
  for (const stage of controlled.stages) {
    if (expectedDigests[String(stage.stage)] !== stage.sample.sampleDigest) {
      throw new Error(`controlled sample digest mismatch at ${stage.stage}`);
    }
  }
  if (
    controlled.equivalentWorkScale !==
    NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.COMPOSITION_CONTROLLED_SCALE.evidence
      .controlledEquivalentWorkScale
  ) {
    throw new Error('controlled scale classification does not match the contract');
  }
  const historicalDrift = historicalTransitions(historical);
  const controlledDrift = controlledTransitions(controlled);
  const sampleDigests = Object.fromEntries(
    controlled.stages.map((stage) => [String(stage.stage), stage.sample.sampleDigest]),
  );

  return {
    contractId: NATIONAL_SCALE_BENCHMARK_CONTRACT.contractId,
    contractVersion: NATIONAL_SCALE_BENCHMARK_CONTRACT.version,
    lanes: {
      historicalPrefixRegression: {
        role: 'HISTORICAL',
        compositionDrift: historicalDrift,
        historicalPrefixStatus:
          NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.AUTHORITATIVE_PREFIX_REGRESSION.evidence
            .historicalPrefixStatus,
        maximumProvenSafeScale:
          NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.AUTHORITATIVE_PREFIX_REGRESSION.evidence
            .maximumProvenSafeScale,
        nationalExpansionClassification:
          NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.AUTHORITATIVE_PREFIX_REGRESSION.evidence
            .nationalExpansionClassification,
      },
      compositionControlledScale: {
        role: 'CONTROLLED',
        sampleDigests,
        compositionDrift: controlledDrift,
        controlledEquivalentWorkScale:
          NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.COMPOSITION_CONTROLLED_SCALE.evidence
            .controlledEquivalentWorkScale,
        controlledWorkloadComparability: controlled.controlledWorkloadComparability,
      },
    },
    overallEvidence: {
      architectureScaleEvidence:
        NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.COMPOSITION_CONTROLLED_SCALE.evidence
          .architectureScaleEvidence,
      fullNational401kScale: NATIONAL_SCALE_BENCHMARK_CONTRACT.evidenceState.fullNational401kScale,
      databaseScale: NATIONAL_SCALE_BENCHMARK_CONTRACT.evidenceState.databaseScale,
      nationalPublication: NATIONAL_SCALE_BENCHMARK_CONTRACT.evidenceState.nationalPublication,
      perRecordGrowthVsSizeMax: PER_RECORD_GROWTH_VS_SIZE_MAX,
    },
  };
}

function main(): void {
  const report = buildGovernanceReport();
  const serialised = `${JSON.stringify(report, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (!existsSync(GOVERNANCE_REPORT_PATH)) throw new Error(`missing ${GOVERNANCE_REPORT_PATH}`);
    const existing = readFileSync(GOVERNANCE_REPORT_PATH, 'utf8');
    if (existing !== serialised) throw new Error('national-scale-governance.json is stale');
    console.log(`ok   ${GOVERNANCE_REPORT_PATH}`);
    return;
  }
  writeFileSync(GOVERNANCE_REPORT_PATH, serialised);
  console.log(serialised);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
