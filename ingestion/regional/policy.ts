/**
 * What may publish automatically, and what a human must see first.
 *
 * Declared and committed BEFORE the regional activation runs, so the record
 * shows the rules were not fitted to the coverage they produced.
 *
 * The policy invents nothing. It is a restatement of the decision the matcher
 * already reached, because the matcher is where identity is decided and adding
 * a second, looser opinion here would quietly widen what publishes. Coverage is
 * subordinate to correctness: if a class of record cannot be published safely,
 * the right number of published records is fewer.
 */

import { MatchOutcome } from '../pipeline/candidate';

export const PublicationClass = {
  /**
   * The matcher is certain, and certainty here already means the conservative
   * thing: either nothing plausible exists nearby, or an identifier is shared
   * and nothing about the records contradicts it.
   */
  AutoSafe: 'AUTO_SAFE',
  /** A human decides. Stays in the review queue, unpublished. */
  ReviewRequired: 'REVIEW_REQUIRED',
  /** Structurally unusable. Never becomes a place. */
  Rejected: 'REJECTED',
} as const;
export type PublicationClass = (typeof PublicationClass)[keyof typeof PublicationClass];

export interface Classification {
  publicationClass: PublicationClass;
  /** Plain-English reason, carried into the candidate row for audit. */
  reason: string;
}

/**
 * Classify one matcher decision.
 *
 * Only two outcomes publish, and both are ones the production contract already
 * treats as safe:
 *
 *   NEW_CANONICAL     nothing plausible was found, so there is nothing to merge
 *                     into and nothing to get wrong. This is the overwhelming
 *                     majority of a first regional import.
 *   MATCH_CONFIDENT   the matcher's confident path, which since the 25,000-record
 *                     audit refuses containment-only evidence, refuses a guessed
 *                     type as corroboration, refuses two entries of one register
 *                     under a shared designation, and refuses a landscape against
 *                     a structure inside it.
 *
 * Everything else waits. MATCH_REVIEW and CONFLICT_REVIEW are the matcher saying
 * it cannot tell, and publishing on top of that would convert an honest "maybe"
 * into a canonical fact.
 */
export function classifyDecision(outcome: MatchOutcome): Classification {
  switch (outcome) {
    case MatchOutcome.NewCanonical:
      return {
        publicationClass: PublicationClass.AutoSafe,
        reason: 'No plausible existing place; a new canonical record is created.',
      };
    case MatchOutcome.MatchConfident:
      return {
        publicationClass: PublicationClass.AutoSafe,
        reason: 'Confident identity with an existing place; attached rather than duplicated.',
      };
    case MatchOutcome.MatchReview:
      return {
        publicationClass: PublicationClass.ReviewRequired,
        reason: 'Possible identity the matcher cannot confirm; a human decides.',
      };
    case MatchOutcome.ConflictReview:
      return {
        publicationClass: PublicationClass.ReviewRequired,
        reason: 'Matched, but the records disagree on something material.',
      };
    case MatchOutcome.RejectInvalid:
      return {
        publicationClass: PublicationClass.Rejected,
        reason: 'Structurally unusable; never reaches a queue as a place.',
      };
  }
}

/**
 * The `moderation_state` a candidate row is created with.
 *
 * `approved` is the reviewer's decision in production and is reached here by
 * calling `review_import_candidate` as an editor, not by writing the column —
 * the governed path is the point.
 */
export function moderationStateFor(publicationClass: PublicationClass): 'approved' | 'needs_review' | 'rejected' {
  switch (publicationClass) {
    case PublicationClass.AutoSafe:
      return 'approved';
    case PublicationClass.ReviewRequired:
      return 'needs_review';
    case PublicationClass.Rejected:
      return 'rejected';
  }
}

// ---------------------------------------------------------------------------
// Activation gates
// ---------------------------------------------------------------------------

export type GateSeverity = 'blocking' | 'advisory';

export interface ActivationGate {
  id: string;
  title: string;
  severity: GateSeverity;
  rationale: string;
  threshold: string;
}

/**
 * Declared before the activation run. A gate chosen after seeing the number it
 * judges is not a gate.
 */
export const ACTIVATION_GATES: readonly ActivationGate[] = [
  {
    id: 'G1-database-integrity',
    title: 'Migrations, tests and generated types are green',
    severity: 'blocking',
    rationale:
      'A dataset published onto a schema that cannot rebuild from zero is not reproducible, whatever the row counts say.',
    threshold: 'migrations replay, pgTAP passes, generated types show no drift',
  },
  {
    id: 'G2-matcher-regressions',
    title: 'Every known matcher safety case still passes',
    severity: 'blocking',
    rationale:
      'The regression suite encodes real false merges found at 5,000, 10,000 and 25,000 records. A regional dataset built by a matcher that has lost one of them would need rebuilding.',
    threshold: 'the full ingestion test suite passes',
  },
  {
    id: 'G3-automatic-merge-correctness',
    title: 'No false-positive automatic merge in the audit',
    severity: 'blocking',
    rationale:
      'A wrong split is a tidy-up job; a wrong merge destroys information and is very hard to notice once published. One confirmed false merge stops the activation.',
    threshold: '0 incorrect merges across the audited automatic-merge population',
  },
  {
    id: 'G4-provenance',
    title: 'Every published canonical record traces to a source record',
    severity: 'blocking',
    rationale:
      'Whilom\'s claim is that every fact is attributable. A canonical place with no source record is an assertion nobody made.',
    threshold: '100% of imported published places have at least one source record',
  },
  {
    id: 'G5-review-integrity',
    title: 'Ambiguous and conflicting candidates remain unpublished',
    severity: 'blocking',
    rationale:
      'The review queue only means anything if being in it prevents publication.',
    threshold: 'no candidate with status needs_review has a published entity',
  },
  {
    id: 'G6-publication-integrity',
    title: 'No orphan facts, relationships or source records',
    severity: 'blocking',
    rationale:
      'Publication is atomic per candidate. A partial failure that leaves a fact pointing at a place that was never created is silent corruption.',
    threshold: 'zero rows in facts, entity_relationships or source_records referencing a missing entity',
  },
  {
    id: 'G7-idempotency',
    title: 'Repeat activation does not multiply canonical data',
    severity: 'blocking',
    rationale:
      'The dataset must be rebuildable. If a second run doubles the places, it cannot be re-run against a real database.',
    threshold: 'places, source_records, facts, relationships and conflicts unchanged after a repeat run',
  },
  {
    id: 'G8-query-usability',
    title: 'Regional discovery queries stay interactive',
    severity: 'blocking',
    rationale:
      'The dataset exists to sit behind a map. 300ms p95 is the point past which a bounded pan stops feeling immediate; the same figure used for the scale gates, deliberately unchanged.',
    threshold: 'p95 <= 300ms for every product query at regional size',
  },
  {
    id: 'G9-review-load',
    title: 'Review load is proportionate',
    severity: 'advisory',
    rationale:
      'The corrected 25,000-record benchmark queued 0.72%. A materially higher rate would suggest a systematic matcher defect rather than genuine ambiguity, and is worth investigating before it is worth staffing.',
    threshold: 'investigate above 5% of valid records',
  },
] as const;

export interface GateResult extends ActivationGate {
  passed: boolean;
  observed: string;
  notEvaluated?: string;
}

export function activationMayProceed(results: readonly GateResult[]): boolean {
  return !results.some((r) => r.severity === 'blocking' && !r.passed);
}
