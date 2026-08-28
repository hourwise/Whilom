import { describe, expect, it } from 'vitest';
import { MatchOutcome } from '../pipeline/candidate';
import { PublicationClass } from '../regional/policy';
import { serializeActivationPlan, serializeActivationTelemetry } from '../regional/activate';
import type { ActivationPlan } from '../regional/activate';

const plan: ActivationPlan = {
  datasetId: 'WHILOM_REGION_TEST',
  datasetVersion: '0.0.0',
  publicationPolicyVersion: 'test-policy',
  importerVersion: 'test-importer',
  sourceRows: 1,
  valid: 1,
  rejected: 0,
  counts: {
    [PublicationClass.AutoSafe]: 1,
    [PublicationClass.ReviewRequired]: 0,
    [PublicationClass.Rejected]: 0,
  },
  expectedAttachments: 0,
  rejectedBeforeCandidate: 0,
  rejectionReasons: [],
  outcomes: {
    [MatchOutcome.NewCanonical]: 1,
    [MatchOutcome.MatchConfident]: 0,
    [MatchOutcome.MatchReview]: 0,
    [MatchOutcome.ConflictReview]: 0,
    [MatchOutcome.RejectInvalid]: 0,
  },
  candidatePairs: 0,
  candidatePairsPerRecord: 0,
  placeTypes: { building: 1 },
  designations: {},
  genericallyTyped: 0,
  recordsWithTemporal: 0,
  temporalCoverageRate: 0,
  temporalByPeriod: {},
  rejectedTemporalFields: [],
  reviewCauses: [],
  reviewMinutesEstimate: 0,
};

describe('activation evidence serialisation', () => {
  it('keeps runtime measurements out of the deterministic activation plan', () => {
    const serialised = serializeActivationPlan(plan);

    expect(serialised).not.toContain('matchMs');
    expect(serialised).not.toContain('candidateGenerationMs');
    expect(serialised).not.toContain('ingestionMs');
    expect(serialised).not.toContain('recordsPerSecond');
    expect(serialised).not.toContain('generatedAt');
    expect(serializeActivationPlan({ ...plan })).toBe(serialised);
  });

  it('writes runtime telemetry separately from the sealed plan', () => {
    const first = serializeActivationTelemetry(
      { matchMs: 10, candidateGenerationMs: 20, ingestionMs: 30, recordsPerSecond: 40 },
      '2026-01-01T00:00:00.000Z',
    );
    const second = serializeActivationTelemetry(
      { matchMs: 11, candidateGenerationMs: 21, ingestionMs: 31, recordsPerSecond: 39 },
      '2026-01-01T00:00:01.000Z',
    );

    expect(first).not.toBe(second);
    expect(first).toContain('"ingestionMs": 30');
    expect(first).toContain('"generatedAt": "2026-01-01T00:00:00.000Z"');
  });
});
