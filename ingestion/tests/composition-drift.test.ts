import { describe, expect, it } from 'vitest';
import { compareComposition } from '../scale/national/composition-drift';
import { buildGovernanceReport } from '../scale/national/governance-report';

const tolerance = {
  layerTolerancePercentagePoints: 0.05,
  geographyTolerancePercentagePoints: 0.05,
};

describe('national workload composition drift', () => {
  it('classifies the known historical 50k to 100k phase change', () => {
    const report = buildGovernanceReport();
    const transition = report.lanes.historicalPrefixRegression.compositionDrift.find(
      (item) => item.from === 50_000 && item.to === 100_000,
    );
    expect(transition?.classification).toBe('WORKLOAD_PHASE_CHANGE');
    expect(transition?.designationViolations).toContain('scheduled_monument');
    expect(transition?.maxDesignationDriftPercentagePoints).toBeGreaterThan(5);
  });

  it('keeps historical 25 to 50 and 100 to 200 composition comparisons distinct from the phase change', () => {
    const report = buildGovernanceReport();
    const transitions = report.lanes.historicalPrefixRegression.compositionDrift;
    expect(transitions.map((item) => item.classification)).toEqual([
      'COMPARABLE_WORKLOAD',
      'WORKLOAD_PHASE_CHANGE',
      'COMPARABLE_WORKLOAD',
    ]);
  });

  it('classifies every controlled transition as comparable', () => {
    const report = buildGovernanceReport();
    expect(
      report.lanes.compositionControlledScale.compositionDrift.map((item) => item.classification),
    ).toEqual(['COMPARABLE_WORKLOAD', 'COMPARABLE_WORKLOAD', 'COMPARABLE_WORKLOAD']);
  });

  it('compares the union of keys and uses an explicit percentage-point boundary', () => {
    expect(
      compareComposition(
        { designationPercentages: { listed: 99.95 }, cellPercentages: { TQ: 12.5 } },
        {
          designationPercentages: { listed: 99.901, scheduled: 0.049 },
          cellPercentages: { TQ: 12.451 },
        },
        tolerance,
      ).classification,
    ).toBe('COMPARABLE_WORKLOAD');
    expect(
      compareComposition(
        { designationPercentages: { listed: 99.95 }, cellPercentages: { TQ: 12.5 } },
        { designationPercentages: { listed: 99.8, scheduled: 0.2 }, cellPercentages: { TQ: 12.5 } },
        tolerance,
      ).classification,
    ).toBe('WORKLOAD_PHASE_CHANGE');
  });
});
