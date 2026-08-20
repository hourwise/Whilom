import { describe, expect, it } from 'vitest';
import { buildGovernanceReport } from '../scale/national/governance-report';

describe('national scale governance report', () => {
  it('is deterministic from committed Batch 19 evidence', () => {
    expect(buildGovernanceReport()).toEqual(buildGovernanceReport());
  });

  it('reports independent historical, controlled, architecture, database and publication states', () => {
    const report = buildGovernanceReport();
    expect(report.lanes.historicalPrefixRegression.historicalPrefixStatus).toBe(
      'WORKLOAD_PHASE_CHANGE_AT_50K_TO_100K',
    );
    expect(report.lanes.historicalPrefixRegression.maximumProvenSafeScale).toBe(
      'PROVEN_SAFE_TO_50K',
    );
    expect(report.lanes.compositionControlledScale.controlledEquivalentWorkScale).toBe(
      'PASS_TO_200K',
    );
    expect(report.overallEvidence.architectureScaleEvidence).toBe('EQUIVALENT_WORK_PROVEN_TO_200K');
    expect(report.overallEvidence.fullNational401kScale).toBe('NOT_PROVEN');
    expect(report.overallEvidence.databaseScale).toBe('NOT_RUN');
    expect(report.overallEvidence.nationalPublication).toBe('NOT_AUTHORIZED');
    expect(report.overallEvidence.perRecordGrowthVsSizeMax).toBe(1.0);
  });

  it('does not infer full-national proof or publication from controlled 200k evidence', () => {
    const report = buildGovernanceReport();
    expect(JSON.stringify(report)).not.toContain('NATIONAL_401K_PROVEN');
    expect(JSON.stringify(report)).not.toContain('PUBLICATION_READY');
    expect(
      report.lanes.compositionControlledScale.compositionDrift.every((item) => item.pass),
    ).toBe(true);
  });
});
