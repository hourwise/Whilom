import { describe, expect, it } from 'vitest';

import {
  applyGovernedReview,
  type CandidateRow,
  type PolicyRow,
  validatePolicyCoverage,
} from '../../scripts/generate-yorkshire-governed-activation-plan';

function candidate(
  ordinal: number,
  candidateId: string,
  sourceRecordId: string,
  sourceObjectId?: number,
): CandidateRow {
  return {
    ordinal,
    candidateId,
    normalised: {
      provenance: { sourceId: 'historic-england-nhle', sourceRecordId },
      ...(sourceObjectId === undefined ? {} : { sourceObjectId }),
    },
    status: 'needs_review',
    confidence: 0.5,
    publicationClass: 'REVIEW_REQUIRED',
    policyReason: 'review',
    matcherRationale: 'review',
    matchedSourceRecordId: 'proposed-target',
  };
}

function policy(
  row: CandidateRow,
  governedAction: PolicyRow['governedAction'],
  matchedSourceRecordId: string | null = null,
): PolicyRow {
  return {
    activationOrdinal: row.ordinal,
    sourceId: 'historic-england-nhle',
    sourceRecordId:
      row.normalised.provenance instanceof Object
        ? String((row.normalised.provenance as Record<string, unknown>).sourceRecordId)
        : '',
    sourceObjectId: null,
    candidateId: row.candidateId,
    dataR2Decision: 'DEFER_INSUFFICIENT_EVIDENCE',
    dataR3Resolution: null,
    governedAction,
    reason: governedAction,
    activationTransform: {
      candidateRetained: governedAction !== 'DEFER' && governedAction !== 'EXCLUDE_SOURCE',
      publicationClass:
        governedAction === 'DEFER' || governedAction === 'EXCLUDE_SOURCE'
          ? 'REVIEW_REQUIRED'
          : 'AUTO_SAFE',
      matchedSourceRecordId,
      deferPublication: governedAction === 'DEFER',
    },
  };
}

describe('DATA-R5 governed activation policy adapter', () => {
  it('fails closed when a review row has no policy', () => {
    const row = candidate(1, 'candidate-1', '1000001');
    expect(() => validatePolicyCoverage([row], [])).toThrow(/policy\/review row count/);
  });

  it('fails closed on duplicate policy ordinals', () => {
    const row = candidate(1, 'candidate-1', '1000001');
    const decision = policy(row, 'DEFER');
    expect(() => validatePolicyCoverage([row], [decision, decision])).toThrow(
      /duplicate policy ordinal/,
    );
  });

  it('fails closed on candidate identity mismatch', () => {
    const row = candidate(1, 'candidate-1', '1000001');
    const decision = policy(row, 'CREATE_SEPARATE_CANONICAL');
    expect(() => applyGovernedReview(row, { ...decision, candidateId: 'candidate-other' })).toThrow(
      /candidate ID/,
    );
  });

  it('never makes DEFER publishable or converts it to a new canonical', () => {
    const row = candidate(1, 'candidate-1', '1000001');
    const result = applyGovernedReview(row, policy(row, 'DEFER'));
    expect(result).toMatchObject({
      resultingPublicationClass: 'REVIEW_REQUIRED',
      resultingMatchedSourceRecordId: null,
      publishable: false,
      canonicalCreation: false,
      existingCanonicalMerge: false,
    });
  });

  it('retains two distinct multi-geometry rows without deduplication', () => {
    const buffer = candidate(23312, 'candidate-buffer', '1000099', 15);
    const core = candidate(23313, 'candidate-core', '1000099', 16);
    const decisions = [
      policy(buffer, 'RETAIN_MULTI_GEOMETRY'),
      policy(core, 'RETAIN_MULTI_GEOMETRY'),
    ];
    const policyMap = validatePolicyCoverage([buffer, core], decisions);
    expect(policyMap.size).toBe(2);
    expect(applyGovernedReview(buffer, decisions[0])).toMatchObject({
      publishable: true,
      canonicalCreation: true,
      multiGeometry: true,
    });
    expect(applyGovernedReview(core, decisions[1])).toMatchObject({
      publishable: true,
      canonicalCreation: true,
      multiGeometry: true,
    });
  });
});
