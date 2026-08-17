/**
 * Shapes and classification for the import review workbench.
 *
 * Kept free of JSX so the rules a reviewer relies on can be tested directly.
 * The classification exists because rendering every difference in identical
 * warning styling makes a reviewer read all of them equally carefully, which is
 * exactly the wrong use of their attention: most differences are one source
 * knowing something the other does not.
 */

export const DifferenceKind = {
  /** Both sources assert the same value. */
  Agreement: 'agreement',
  /** The incoming source knows something Whilom does not. Additive, safe. */
  Complementary: 'complementary',
  /** Both assert and they cannot both be true. Needs a decision. */
  Conflict: 'conflict',
  /** Coordinates differ by more than the sources claim to resolve. */
  Positional: 'positional',
  /** Cannot tell which existing place this is. */
  Ambiguous: 'ambiguous',
  /** Neither side has a value. */
  Missing: 'missing',
} as const;
export type DifferenceKind = (typeof DifferenceKind)[keyof typeof DifferenceKind];

/** Ordering for display: what needs thought comes first. */
export const DIFFERENCE_PRIORITY: Record<DifferenceKind, number> = {
  [DifferenceKind.Conflict]: 0,
  [DifferenceKind.Ambiguous]: 1,
  [DifferenceKind.Positional]: 2,
  [DifferenceKind.Complementary]: 3,
  [DifferenceKind.Agreement]: 4,
  [DifferenceKind.Missing]: 5,
};

export interface FieldDifference {
  field: string;
  label: string;
  canonicalValue: string | null;
  incomingValue: string | null;
  kind: DifferenceKind;
  detail?: string;
}

/**
 * Classify one field. `conflicted` comes from the backend's own conflict
 * detection rather than being re-derived here — the UI must never disagree with
 * the engine about what a conflict is.
 */
export function classifyField(
  canonicalValue: string | null | undefined,
  incomingValue: string | null | undefined,
  options: { conflicted?: boolean; positional?: boolean } = {},
): DifferenceKind {
  const canonical = normalise(canonicalValue);
  const incoming = normalise(incomingValue);

  if (options.conflicted) {
    return options.positional ? DifferenceKind.Positional : DifferenceKind.Conflict;
  }
  if (canonical === null && incoming === null) return DifferenceKind.Missing;
  if (canonical === null && incoming !== null) return DifferenceKind.Complementary;
  if (canonical !== null && incoming === null) return DifferenceKind.Missing;
  return canonical === incoming ? DifferenceKind.Agreement : DifferenceKind.Complementary;
}

function normalise(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed.toLowerCase();
}

/** Sort so a reviewer meets the decisions before the corroboration. */
export function sortDifferences(differences: readonly FieldDifference[]): FieldDifference[] {
  return [...differences].sort(
    (a, b) => DIFFERENCE_PRIORITY[a.kind] - DIFFERENCE_PRIORITY[b.kind] || a.label.localeCompare(b.label),
  );
}

// --- Backend contract -------------------------------------------------------
// Mirrors `public.preview_import_candidate()`. The workbench renders this and
// nothing else, so it can never offer an action the engine cannot perform.

export interface PreviewFact {
  predicate: string;
  value: unknown;
  registered: boolean;
  alreadyPresent: boolean;
}

export interface PreviewRelationship {
  label: string;
  role: string;
  externalId: string | null;
  predicate: string;
}

export interface PreviewConflict {
  id: string;
  field: string;
  existingValue: unknown;
  incomingValue: unknown;
  reason: string | null;
  resolution: string | null;
  resolved: boolean;
}

export interface CandidatePreview {
  candidateId: string;
  status: string;
  alreadyPublished: boolean;
  action: 'already_published' | 'attach_to_existing' | 'create_new_place';
  canonicalEntity: {
    id: string;
    name: string;
    slug: string;
    placeType: string;
    locationAccuracyM: number | null;
  } | null;
  candidate: {
    name: string | null;
    placeType: string | null;
    locationAccuracyM: string | null;
    externalIds: { scheme: string; value: string }[];
  };
  sourceMapped: boolean;
  facts: PreviewFact[];
  relationships: PreviewRelationship[];
  designations: { designation: string; grade?: string; reference?: string }[];
  conflicts: PreviewConflict[];
  /** Reasons publication would be refused. Empty means it would proceed. */
  blockers: string[];
}

/** The decisions the backend can actually execute. Nothing else is offered. */
export const REVIEW_DECISIONS = [
  { value: 'approved', label: 'Approve candidate', hint: 'Ready to publish once conflicts are resolved.' },
  { value: 'rejected', label: 'Reject candidate', hint: 'This record should not become canonical data.' },
  { value: 'needs_review', label: 'Defer', hint: 'Leave in the queue for someone else or more research.' },
] as const;

export const CONFLICT_RESOLUTIONS = [
  { value: 'keep_canonical', label: 'Keep our value', hint: 'The value we already hold is right.' },
  { value: 'accept_source_value', label: 'Accept the source value', hint: 'The incoming source is right.' },
  { value: 'keep_both_as_distinct_facts', label: 'Keep both', hint: 'Both are true of different aspects.' },
  { value: 'mark_not_a_conflict', label: 'Not a conflict', hint: 'The detector was wrong.' },
  { value: 'reject_source_claim', label: 'Reject the claim', hint: 'The source is wrong; do not raise again.' },
  { value: 'defer', label: 'Defer', hint: 'Real, but needs research. Blocks publication.' },
] as const;

export type ReviewDecision = (typeof REVIEW_DECISIONS)[number]['value'];
export type ConflictResolution = (typeof CONFLICT_RESOLUTIONS)[number]['value'];

export function isReviewDecision(value: unknown): value is ReviewDecision {
  return REVIEW_DECISIONS.some((d) => d.value === value);
}

export function isConflictResolution(value: unknown): value is ConflictResolution {
  return CONFLICT_RESOLUTIONS.some((r) => r.value === value);
}

/**
 * Whether the workbench should offer a Publish button.
 *
 * Mirrors the engine's own preconditions. It is only ever a hint: the button
 * calls the governed transaction, which re-checks everything server-side and is
 * the sole authority on whether publication happens.
 */
export function canPublish(preview: CandidatePreview): boolean {
  return !preview.alreadyPublished && preview.blockers.length === 0;
}
