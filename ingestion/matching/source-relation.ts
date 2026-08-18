/**
 * Same-source duplication versus cross-source disagreement.
 *
 * These are two different questions and the pipeline must never confuse them
 * again. Batch 6 did: `compareSources` was invoked on any within-run match,
 * including two records from the same source, and every one of the 1,000-record
 * tier's 142 "cross-source conflicts" turned out to be Historic England
 * compared against Historic England.
 *
 * The distinction is not a technicality:
 *
 *   CROSS_SOURCE  Two independent bodies describe one place. "Do they agree?"
 *                 is meaningful, and a disagreement is a claim a human should
 *                 arbitrate — one of them is wrong.
 *
 *   SAME_SOURCE   One body's register holds two overlapping entries. Nothing
 *                 disagrees. A listed building and the scheduled monument
 *                 around it differ in type and position *by design*, and the
 *                 register is not contradicting itself by saying so. The useful
 *                 questions here are about duplication and multi-designation,
 *                 not arbitration.
 *
 * Presenting the second as the first tells a reviewer that two sources
 * disagreed when only one was ever involved — which is not merely noisy, it is
 * false, and it invites them to "resolve" a conflict that does not exist.
 */

/** What kind of relationship two matched records stand in. */
export const SourcePairRelation = {
  /** Both records came from the same source. */
  SameSource: 'SAME_SOURCE',
  /** The records came from different sources. */
  CrossSource: 'CROSS_SOURCE',
} as const;
export type SourcePairRelation = (typeof SourcePairRelation)[keyof typeof SourcePairRelation];

/** The minimum a record must carry to be classified. */
export interface SourceAttributed {
  provenance: { sourceId: string };
}

export function classifySourcePair(a: SourceAttributed, b: SourceAttributed): SourcePairRelation {
  return a.provenance.sourceId === b.provenance.sourceId
    ? SourcePairRelation.SameSource
    : SourcePairRelation.CrossSource;
}

/**
 * Whether cross-source comparison should run for this pair.
 *
 * The single gate the pipeline consults. Kept as a named predicate rather than
 * an inline string comparison so that the rule has one home, is greppable, and
 * is directly testable — the Batch 6 defect was exactly the kind that hides in
 * an unexamined inline condition.
 */
export function shouldCompareAcrossSources(a: SourceAttributed, b: SourceAttributed): boolean {
  return classifySourcePair(a, b) === SourcePairRelation.CrossSource;
}

/**
 * Why two records from one source both describe the same ground.
 *
 * Recorded instead of a conflict. This is descriptive, not adjudicative: it
 * says what kind of overlap the register contains, and never that one entry is
 * wrong.
 */
export const SameSourceOverlap = {
  /** The identical register entry arriving twice, e.g. one row per geometry part. */
  RepeatedEntry: 'REPEATED_ENTRY',
  /** Two entries under different designations, e.g. scheduled and listed. */
  MultiDesignation: 'MULTI_DESIGNATION',
  /** Two distinct entries the matcher nonetheless finds hard to separate. */
  DistinctEntries: 'DISTINCT_ENTRIES',
} as const;
export type SameSourceOverlap = (typeof SameSourceOverlap)[keyof typeof SameSourceOverlap];

export interface SameSourceRecord {
  provenance: { sourceId: string; sourceRecordId: string };
  designations: readonly { designation: string }[];
}

/**
 * Classify a same-source overlap.
 *
 * Mirrors the matcher's own register rule so the two accounts of "why do these
 * two entries coexist" cannot diverge: a shared record id is one entry seen
 * twice, disjoint designations are one site protected two ways, and anything
 * else is two genuinely different things.
 */
export function classifySameSourceOverlap(a: SameSourceRecord, b: SameSourceRecord): SameSourceOverlap {
  if (a.provenance.sourceRecordId === b.provenance.sourceRecordId) {
    return SameSourceOverlap.RepeatedEntry;
  }
  const theirs = new Set(b.designations.map((d) => d.designation));
  const shared = a.designations.some((d) => theirs.has(d.designation));
  return shared ? SameSourceOverlap.DistinctEntries : SameSourceOverlap.MultiDesignation;
}
