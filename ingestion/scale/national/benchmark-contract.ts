/**
 * Machine-readable contract for the two national scale evidence lanes.
 *
 * This is deliberately JSON-serialisable.  The contract describes what each
 * lane proves; it does not promote a controlled result into a publication or
 * full-national authorization decision.
 */

export const PER_RECORD_GROWTH_VS_SIZE_MAX = 1.0;
export const NATIONAL_CACHE_LIMIT_RECORDS = 65_536;
export const NATIONAL_MAX_RECORDS_PER_PAGE = 256;

export const HISTORICAL_PREFIX_SIZES = [25_000, 50_000, 100_000, 199_980] as const;
export const CONTROLLED_SCALE_SIZES = [25_000, 50_000, 100_000, 199_980] as const;

export const NATIONAL_SCALE_BENCHMARK_CONTRACT = {
  contractId: 'whilom-national-scale-v1',
  version: 1,
  lanes: {
    AUTHORITATIVE_PREFIX_REGRESSION: {
      role: 'HISTORICAL',
      purpose:
        'Preserve the exact historical national prefix order and detect regression against prior batches.',
      sample: {
        source: 'existing persisted national capture',
        records: 199_980,
        order: 'persisted authoritative order',
        cacheSha256: '643c2a5a217a86f7e16f2dd59d41b2a3581db159190727e0f18451df31e53c0d',
        legacyPrefix: {
          records: 99_990,
          sha256: '8097257c5ad063e1003327d5effeedfdeddd5ddcf23b563242a97e7909838b26',
        },
      },
      requirements: {
        integrity: 'sourceRows === accountedFor',
        deterministicDigest: true,
        sourceAccounting: true,
        workloadCompositionReporting: true,
      },
      gate: {
        normalizedGrowthFormula:
          '(later matcher ms/record / earlier matcher ms/record) / (later records / earlier records)',
        perRecordGrowthVsSizeMax: PER_RECORD_GROWTH_VS_SIZE_MAX,
        continuousStagesRequired: true,
        reporting: 'retain historical result; expose composition drift separately',
      },
      evidence: {
        recordedMatcherMsPerRecord: {
          '25000': 0.033,
          '50000': 0.03,
          '100000': 0.148,
          '199980': 0.244,
        },
        historicalPrefixStatus: 'WORKLOAD_PHASE_CHANGE_AT_50K_TO_100K',
        maximumProvenSafeScale: 'PROVEN_SAFE_TO_50K',
        nationalExpansionClassification: 'REMEDIATION_INSUFFICIENT',
      },
    },
    COMPOSITION_CONTROLLED_SCALE: {
      role: 'CONTROLLED',
      purpose: 'Measure growth while keeping geography and designation workload comparable.',
      sampling: {
        algorithmId: 'composition-controlled-v1',
        strata: ['OS_100KM_CELL', 'NHLE_LAYER'],
        quotaAllocation: 'largest-remainder proportional to the complete persisted capture',
        withinStratumOrder: 'persisted order',
        stratumOrder: 'stable lexicographic key',
        authoritativeOrderUntouched: true,
      },
      sampleEvidence: {
        sourceRecords: 199_980,
        sizes: CONTROLLED_SCALE_SIZES,
        sampleDigests: {
          '25000': '7bef48b0753acbcd41bccba9b54ae28e3d4248b3ad11a1b8869a154a45a593b8',
          '50000': 'a850f335d94230baa7b55d6301452e133c18a75c78bd92fce605a8367ffc2759',
          '100000': '73cbe02f6f60afc8ee54a38acae394fda09c488fcb21838c7bc724af3c9df95a',
          '199980': '631100d50055eedeecae8c6bd8f40b894f067bde2c80f683902324ff6608e28c',
        },
      },
      comparability: {
        classificationComparable: 'COMPARABLE_WORKLOAD',
        classificationPhaseChange: 'WORKLOAD_PHASE_CHANGE',
        layerTolerancePercentagePoints: 0.05,
        geographyTolerancePercentagePoints: 0.05,
        comparison: 'maximum absolute percentage-point drift across the union of observed keys',
      },
      requirements: {
        integrity: 'sourceRows === accountedFor',
        deterministicDigest: true,
        sourceAccounting: true,
        workloadCompositionReporting: true,
      },
      gate: {
        normalizedGrowthFormula:
          '(later matcher ms/record / earlier matcher ms/record) / (later records / earlier records)',
        perRecordGrowthVsSizeMax: PER_RECORD_GROWTH_VS_SIZE_MAX,
        continuousStagesRequired: true,
      },
      resourceLimits: {
        canonicalPayloadCacheRecords: NATIONAL_CACHE_LIMIT_RECORDS,
        maximumRecordsPerPage: NATIONAL_MAX_RECORDS_PER_PAGE,
        fullCorpusPayloadRetention: false,
      },
      evidence: {
        controlledEquivalentWorkScale: 'PASS_TO_200K',
        architectureScaleEvidence: 'EQUIVALENT_WORK_PROVEN_TO_200K',
      },
    },
  },
  evidenceState: {
    fullNational401kScale: 'NOT_PROVEN',
    databaseScale: 'NOT_RUN',
    nationalPublication: 'NOT_AUTHORIZED',
  },
} as const;

export type NationalScaleBenchmarkContract = typeof NATIONAL_SCALE_BENCHMARK_CONTRACT;

export interface ContractValidation {
  valid: boolean;
  errors: string[];
}

export function validateNationalScaleBenchmarkContract(
  contract: NationalScaleBenchmarkContract = NATIONAL_SCALE_BENCHMARK_CONTRACT,
): ContractValidation {
  const errors: string[] = [];
  const historical = contract.lanes.AUTHORITATIVE_PREFIX_REGRESSION;
  const controlled = contract.lanes.COMPOSITION_CONTROLLED_SCALE;

  if (contract.version !== 1) errors.push('unsupported benchmark contract version');
  if (historical.gate.perRecordGrowthVsSizeMax !== 1.0) {
    errors.push('the national normalized-growth gate must remain 1.0');
  }
  if (controlled.gate.perRecordGrowthVsSizeMax !== 1.0) {
    errors.push('the controlled normalized-growth gate must remain 1.0');
  }
  if (
    !historical.requirements.deterministicDigest ||
    !controlled.requirements.deterministicDigest
  ) {
    errors.push('both lanes require deterministic sample evidence');
  }
  if (!controlled.sampling.authoritativeOrderUntouched) {
    errors.push('controlled sampling must not overwrite authoritative order');
  }
  if (controlled.resourceLimits.fullCorpusPayloadRetention) {
    errors.push('controlled evidence must not retain the full corpus payload');
  }
  if (contract.evidenceState.fullNational401kScale !== 'NOT_PROVEN') {
    errors.push('401k evidence must remain NOT_PROVEN');
  }
  if (contract.evidenceState.nationalPublication !== 'NOT_AUTHORIZED') {
    errors.push('publication must remain NOT_AUTHORIZED');
  }

  return { valid: errors.length === 0, errors };
}
