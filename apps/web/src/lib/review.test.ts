import { describe, expect, it } from 'vitest';
import {
  CONFLICT_RESOLUTIONS,
  DifferenceKind,
  REVIEW_DECISIONS,
  canPublish,
  classifyField,
  isConflictResolution,
  isReviewDecision,
  sortDifferences,
  type CandidatePreview,
  type FieldDifference,
} from './review';

/**
 * The workbench's job is to let a reviewer see quickly what needs thought. These
 * cover the rules that decide that, and the rule that the UI may never offer an
 * action the backend cannot execute.
 */

function preview(over: Partial<CandidatePreview> = {}): CandidatePreview {
  return {
    candidateId: 'c1',
    status: 'approved',
    alreadyPublished: false,
    action: 'create_new_place',
    canonicalEntity: null,
    candidate: { name: 'A Place', placeType: 'castle', locationAccuracyM: '10', externalIds: [] },
    sourceMapped: true,
    facts: [],
    relationships: [],
    designations: [],
    conflicts: [],
    blockers: [],
    ...over,
  };
}

describe('classifyField', () => {
  it('calls identical values agreement', () => {
    expect(classifyField('castle', 'castle')).toBe(DifferenceKind.Agreement);
    expect(classifyField('Castle', ' castle ')).toBe(DifferenceKind.Agreement);
  });

  it('calls a value only the source has complementary', () => {
    // The common case, and the reason not everything is styled as a warning:
    // one source knowing something the other does not is additive, not alarming.
    expect(classifyField(null, 'https://example.org')).toBe(DifferenceKind.Complementary);
  });

  it('calls a value only Whilom has missing, not a conflict', () => {
    expect(classifyField('castle', null)).toBe(DifferenceKind.Missing);
    expect(classifyField(null, null)).toBe(DifferenceKind.Missing);
  });

  it('defers to the backend on what a conflict is', () => {
    // The UI must never disagree with the engine about this, so `conflicted`
    // comes from the backend rather than being re-derived from the values.
    expect(classifyField('castle', 'castle', { conflicted: true })).toBe(DifferenceKind.Conflict);
    expect(classifyField('a', 'b', { conflicted: true, positional: true })).toBe(
      DifferenceKind.Positional,
    );
  });
});

describe('sortDifferences', () => {
  it('puts what needs a decision before what needs only a glance', () => {
    const differences: FieldDifference[] = [
      { field: 'a', label: 'Agrees', canonicalValue: 'x', incomingValue: 'x', kind: DifferenceKind.Agreement },
      { field: 'b', label: 'New', canonicalValue: null, incomingValue: 'y', kind: DifferenceKind.Complementary },
      { field: 'c', label: 'Clash', canonicalValue: 'p', incomingValue: 'q', kind: DifferenceKind.Conflict },
      { field: 'd', label: 'Position', canonicalValue: '1', incomingValue: '2', kind: DifferenceKind.Positional },
    ];
    expect(sortDifferences(differences).map((d) => d.kind)).toEqual([
      DifferenceKind.Conflict,
      DifferenceKind.Positional,
      DifferenceKind.Complementary,
      DifferenceKind.Agreement,
    ]);
  });
});

describe('action validation', () => {
  it('accepts only decisions the backend implements', () => {
    expect(isReviewDecision('approved')).toBe(true);
    expect(isReviewDecision('rejected')).toBe(true);
    expect(isReviewDecision('needs_review')).toBe(true);
    // `published` is not a reviewer decision — publication is what the publish
    // transaction does, not a status a human sets.
    expect(isReviewDecision('published')).toBe(false);
    expect(isReviewDecision('superseded')).toBe(false);
    expect(isReviewDecision('')).toBe(false);
  });

  it('accepts only the six conflict resolutions the database enum defines', () => {
    for (const resolution of CONFLICT_RESOLUTIONS) {
      expect(isConflictResolution(resolution.value)).toBe(true);
    }
    expect(isConflictResolution('delete_the_evidence')).toBe(false);
    expect(isConflictResolution(null)).toBe(false);
  });

  it('offers no decision the review RPC would reject', () => {
    // review_import_candidate() accepts exactly these three.
    expect(REVIEW_DECISIONS.map((d) => d.value).sort()).toEqual(
      ['approved', 'needs_review', 'rejected'].sort(),
    );
  });
});

describe('canPublish', () => {
  it('mirrors the engine preconditions', () => {
    expect(canPublish(preview())).toBe(true);
    expect(canPublish(preview({ blockers: ['unresolved conflicts: 1'] }))).toBe(false);
    expect(canPublish(preview({ alreadyPublished: true }))).toBe(false);
  });

  it('is only a hint, never the authority', () => {
    // A preview with no blockers still cannot make publication happen: the
    // governed transaction re-checks state, conflicts and authority itself.
    // This test exists to record that the button is advisory.
    const optimistic = preview({ blockers: [] });
    expect(canPublish(optimistic)).toBe(true);
    expect(optimistic.blockers).toEqual([]);
  });
});
