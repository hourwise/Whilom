/**
 * Deterministic workload-composition guard used by both scale evidence lanes.
 * Percentages are compared as percentage points, not relative percentages.
 */

export type CompositionDriftClassification = 'COMPARABLE_WORKLOAD' | 'WORKLOAD_PHASE_CHANGE';

export interface CompositionSnapshot {
  designationPercentages: Record<string, number>;
  cellPercentages: Record<string, number>;
}

export interface CompositionDriftResult {
  classification: CompositionDriftClassification;
  maxDesignationDriftPercentagePoints: number;
  maxGeographyDriftPercentagePoints: number;
  designationViolations: string[];
  geographyViolations: string[];
}

export interface CompositionDriftTolerance {
  layerTolerancePercentagePoints: number;
  geographyTolerancePercentagePoints: number;
}

function maxDrift(
  earlier: Record<string, number>,
  later: Record<string, number>,
): { maximum: number; keys: string[] } {
  const keys = new Set([...Object.keys(earlier), ...Object.keys(later)]);
  let maximum = 0;
  const maximumKeys: string[] = [];
  for (const key of [...keys].sort()) {
    const drift = Math.abs((later[key] ?? 0) - (earlier[key] ?? 0));
    if (drift > maximum) {
      maximum = drift;
      maximumKeys.length = 0;
      maximumKeys.push(key);
    } else if (drift === maximum && drift > 0) {
      maximumKeys.push(key);
    }
  }
  return { maximum, keys: maximumKeys };
}

function violations(
  earlier: Record<string, number>,
  later: Record<string, number>,
  tolerance: number,
): string[] {
  const keys = new Set([...Object.keys(earlier), ...Object.keys(later)]);
  return [...keys]
    .sort()
    .filter((key) => Math.abs((later[key] ?? 0) - (earlier[key] ?? 0)) > tolerance);
}

export function compareComposition(
  earlier: CompositionSnapshot,
  later: CompositionSnapshot,
  tolerance: CompositionDriftTolerance,
): CompositionDriftResult {
  const designation = maxDrift(earlier.designationPercentages, later.designationPercentages);
  const geography = maxDrift(earlier.cellPercentages, later.cellPercentages);
  const designationViolations = violations(
    earlier.designationPercentages,
    later.designationPercentages,
    tolerance.layerTolerancePercentagePoints,
  );
  const geographyViolations = violations(
    earlier.cellPercentages,
    later.cellPercentages,
    tolerance.geographyTolerancePercentagePoints,
  );
  return {
    classification:
      designationViolations.length === 0 && geographyViolations.length === 0
        ? 'COMPARABLE_WORKLOAD'
        : 'WORKLOAD_PHASE_CHANGE',
    maxDesignationDriftPercentagePoints: designation.maximum,
    maxGeographyDriftPercentagePoints: geography.maximum,
    designationViolations,
    geographyViolations,
  };
}
