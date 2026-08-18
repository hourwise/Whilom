/**
 * Health gates for the staged scale experiment.
 *
 * These are DECLARED BEFORE ANY TIER IS RUN and committed ahead of the first
 * result, so that git history shows they were not fitted to the numbers. Each
 * threshold is justified by a product consequence, not by what the pipeline
 * happens to score — a gate chosen after seeing the result is not a gate.
 *
 * If a tier fails a BLOCKING gate the experiment stops there. Failing an
 * ADVISORY gate is recorded and reported but does not stop the ladder: it
 * describes something that would need attention before a regional product,
 * not something that makes the next tier meaningless.
 */

export type GateSeverity = 'blocking' | 'advisory';

export interface GateDefinition {
  id: string;
  title: string;
  severity: GateSeverity;
  /** Why this number, in product terms. */
  rationale: string;
  /** Human-readable statement of the threshold. */
  threshold: string;
}

export interface GateResult extends GateDefinition {
  passed: boolean;
  observed: string;
  /** Present when the gate could not be evaluated at this tier. */
  notEvaluated?: string;
}

/**
 * The declared set. Ordered roughly by how early a failure would invalidate
 * everything downstream.
 */
export const GATES: readonly GateDefinition[] = [
  {
    id: 'G1-completes',
    title: 'The tier ingests to completion',
    severity: 'blocking',
    rationale:
      'A run that throws or silently drops records tells us nothing about the tiers above it. Every source row must reach a recorded outcome.',
    threshold: 'no unhandled error, and sourceRows === sum(outcomes)',
  },
  {
    id: 'G2-rejection-rate',
    title: 'Normalisation is not losing real data',
    severity: 'blocking',
    rationale:
      'NHLE is a well-formed statutory register. A high rejection rate means our normaliser, not the source, is at fault — and the discarded records would be invisible heritage.',
    threshold: 'rejected / sourceRows <= 5%',
  },
  {
    id: 'G3-review-pressure',
    title: 'The review queue is clearable by a small team',
    severity: 'blocking',
    rationale:
      'Whilom has no moderation staff at launch. At 2 minutes per decision, 20% of 5,000 records is ~33 hours of work — already the practical ceiling for one person. Above that the governed publish model stops being operable and records would sit unpublished indefinitely.',
    threshold: '(MATCH_REVIEW + CONFLICT_REVIEW) / valid <= 20%',
  },
  {
    id: 'G4-no-false-merges',
    title: 'No incorrect automatic merges in the audited sample',
    severity: 'blocking',
    rationale:
      'The matcher is built on an asymmetric cost: a wrong split is tidy-up, a wrong merge destroys information and is very hard to notice later. A single false merge in a hand-audited sample of automatic matches means the confident path is unsafe at this scale.',
    threshold: '0 incorrect merges in a 20-record audit of MATCH_CONFIDENT decisions',
  },
  {
    id: 'G5-matcher-scaling',
    title: 'Matching cost does not grow quadratically in practice',
    severity: 'blocking',
    rationale:
      'The matcher compares each candidate against the accumulated canonical set. If per-record match time grows in proportion to the set size, the approach cannot reach national scale whatever the hardware — this gate is the difference between "slow" and "architecturally wrong".',
    threshold:
      'mean match time per record at 5,000 <= 3x the mean at 1,000, and <= 50ms absolute',
  },
  {
    id: 'G6-query-latency',
    title: 'Canonical read queries stay interactive',
    severity: 'blocking',
    rationale:
      'The map and search screens are the product. 300ms p95 is the point past which a bounded-area pan stops feeling immediate.',
    threshold: 'p95 <= 300ms for bounded-area, text-search and detail queries at tier size',
  },
  {
    id: 'G7-throughput',
    title: 'Ingestion throughput is workable for a regional import',
    severity: 'advisory',
    rationale:
      'Excluding network fetch, a regional refresh should complete inside a maintenance window rather than a working day. Below this a national import becomes a multi-day operation.',
    threshold: '>= 20 records/second through normalise + validate + match',
  },
  {
    id: 'G8-generic-typing',
    title: 'Place typing carries real meaning',
    severity: 'advisory',
    rationale:
      'A place type that falls back to `structure` or `unknown` for most of the corpus cannot drive filters, icons or browse pages. This measures how much of the register we genuinely understand.',
    threshold: 'genericallyTyped / valid <= 35%',
  },
  {
    id: 'G9-conflict-detection-live',
    title: 'Conflict detection is actually firing',
    severity: 'advisory',
    rationale:
      'Zero conflicts across thousands of real records would mean the detector is broken, not that the data is perfect. A very high rate would mean it is crying wolf and the queue is noise.',
    threshold: '0 < conflicts / valid <= 15%',
  },
  {
    id: 'G10-storage-linearity',
    title: 'Storage grows linearly with records',
    severity: 'advisory',
    rationale:
      'Super-linear growth per record signals write amplification — usually index or provenance duplication — which would make national scale expensive in a way that is hard to undo later.',
    threshold: 'bytes per record at the largest tier <= 1.5x bytes per record at the smallest',
  },
] as const;

export function gateById(id: string): GateDefinition {
  const found = GATES.find((g) => g.id === id);
  if (!found) throw new Error(`unknown gate ${id}`);
  return found;
}

/** A tier may proceed to the next only if no blocking gate failed. */
export function mayProceed(results: readonly GateResult[]): boolean {
  return !results.some((r) => r.severity === 'blocking' && !r.passed);
}
