import { describe, expect, it } from 'vitest';
import {
  CONTROLLED_SCALE_SIZES,
  HISTORICAL_PREFIX_SIZES,
  NATIONAL_CACHE_LIMIT_RECORDS,
  NATIONAL_MAX_RECORDS_PER_PAGE,
  NATIONAL_SCALE_BENCHMARK_CONTRACT,
  PER_RECORD_GROWTH_VS_SIZE_MAX,
  validateNationalScaleBenchmarkContract,
} from '../scale/national/benchmark-contract';

describe('national scale benchmark contract', () => {
  it('is internally valid and keeps the existing resource/growth gates', () => {
    expect(validateNationalScaleBenchmarkContract()).toEqual({ valid: true, errors: [] });
    expect(PER_RECORD_GROWTH_VS_SIZE_MAX).toBe(1.0);
    expect(NATIONAL_CACHE_LIMIT_RECORDS).toBe(65_536);
    expect(NATIONAL_MAX_RECORDS_PER_PAGE).toBe(256);
    expect(HISTORICAL_PREFIX_SIZES).toEqual([25_000, 50_000, 100_000, 199_980]);
    expect(CONTROLLED_SCALE_SIZES).toEqual([25_000, 50_000, 100_000, 199_980]);
  });

  it('keeps the two lanes independent and publication-safe', () => {
    expect(NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.AUTHORITATIVE_PREFIX_REGRESSION.role).toBe(
      'HISTORICAL',
    );
    expect(NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.COMPOSITION_CONTROLLED_SCALE.role).toBe(
      'CONTROLLED',
    );
    expect(NATIONAL_SCALE_BENCHMARK_CONTRACT.evidenceState.fullNational401kScale).toBe(
      'NOT_PROVEN',
    );
    expect(NATIONAL_SCALE_BENCHMARK_CONTRACT.evidenceState.databaseScale).toBe('NOT_RUN');
    expect(NATIONAL_SCALE_BENCHMARK_CONTRACT.evidenceState.nationalPublication).toBe(
      'NOT_AUTHORIZED',
    );
    expect(
      NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.AUTHORITATIVE_PREFIX_REGRESSION.evidence
        .maximumProvenSafeScale,
    ).toBe('PROVEN_SAFE_TO_50K');
    expect(
      NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.COMPOSITION_CONTROLLED_SCALE.evidence
        .controlledEquivalentWorkScale,
    ).toBe('PASS_TO_200K');
  });

  it('pins the controlled sample identities without changing the historical order', () => {
    expect(
      NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.COMPOSITION_CONTROLLED_SCALE.sampleEvidence
        .sampleDigests,
    ).toEqual({
      '25000': '7bef48b0753acbcd41bccba9b54ae28e3d4248b3ad11a1b8869a154a45a593b8',
      '50000': 'a850f335d94230baa7b55d6301452e133c18a75c78bd92fce605a8367ffc2759',
      '100000': '73cbe02f6f60afc8ee54a38acae394fda09c488fcb21838c7bc724af3c9df95a',
      '199980': '631100d50055eedeecae8c6bd8f40b894f067bde2c80f683902324ff6608e28c',
    });
    expect(
      NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.AUTHORITATIVE_PREFIX_REGRESSION.sample.legacyPrefix
        .sha256,
    ).toBe('8097257c5ad063e1003327d5effeedfdeddd5ddcf23b563242a97e7909838b26');
    expect(
      NATIONAL_SCALE_BENCHMARK_CONTRACT.lanes.AUTHORITATIVE_PREFIX_REGRESSION.evidence
        .recordedMatcherMsPerRecord,
    ).toEqual({ '25000': 0.033, '50000': 0.03, '100000': 0.148, '199980': 0.244 });
  });
});
