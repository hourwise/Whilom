/**
 * Build the regional activation payload.
 *
 *   pnpm --filter @whilom/ingestion regional:activate
 *
 * Runs the real pipeline over the regional dataset, classifies every decision
 * under the committed publication policy, and emits two files for the database
 * lane:
 *
 *   regional-candidates.csv   one import candidate per line, streamed via \copy
 *   regional-activation.sql   governed publication, batched and instrumented
 *
 * The candidates are streamed rather than inlined because 23,000 normalised
 * records is tens of megabytes of SQL text, and a statement that large tells
 * you nothing useful when it fails.
 *
 * Nothing here writes to `places`. Publication goes through
 * `publish_import_candidate()` exactly as a reviewer's action would, because a
 * bulk path that inserts canonical rows directly would prove that bulk
 * insertion works, not that the governed contract does.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HistoricEnglandNhleAdapter } from '../sources/historic-england/nhle-adapter';
import { normaliseNhleRecord } from '../transforms/normalise-nhle';
import { runIngestion } from '../pipeline/run';
import type { RunReport } from '../pipeline/run';
import { MatchOutcome } from '../pipeline/candidate';
import { CandidateMode, emptyCandidateStats } from '../matching/candidates';
import type { MatchStats } from '../matching/matcher';
import { REGIONAL_CACHE_FILE, readRegionalManifest } from './capture';
import { NAME_DERIVED_ASSOCIATION, extractTemporalClaims } from '../transforms/temporal';
import { PublicationClass, classifyDecision, moderationStateFor } from './policy';
import {
  PUBLICATION_POLICY_VERSION,
  REGIONAL_DATASET_ID,
  REGIONAL_DATASET_VERSION,
  REGIONAL_IMPORTER_VERSION,
} from './dataset';

/**
 * Candidates published per transaction.
 *
 * 500 is a deliberate middle: large enough that connection and planning cost is
 * amortised across a batch, small enough that a batch which does fail is a
 * comprehensible unit to inspect and re-run. Each candidate is additionally
 * wrapped in its own subtransaction, so one bad record cannot take the other
 * 499 with it — the batch bounds the blast radius, the subtransaction bounds
 * the damage. Not tuned upwards for a faster number; throughput was never the
 * constraint here.
 */
export const PUBLISH_BATCH_SIZE = 500;

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** A deterministic UUID per source record, so a rebuild reuses candidate ids. */
function candidateUuid(sourceRecordId: string, ordinal: number): string {
  // Not a real UUIDv5; a stable synthetic id derived from the record's identity
  // so that a repeat activation addresses the same candidate rows rather than
  // creating a second set. Determinism is the requirement, not cryptography.
  const hex = [...`${sourceRecordId}:${ordinal}`]
    .reduce((acc, ch) => (acc * 33 + ch.charCodeAt(0)) >>> 0, 5381)
    .toString(16)
    .padStart(8, '0');
  const tail = sourceRecordId.replace(/\D/g, '').padStart(12, '0').slice(-12);
  return `${hex}-0000-4000-8000-${tail}`;
}

/**
 * Why one record is in the queue.
 *
 * Grouping on the reason rather than the sentence turns "143 records need
 * review" into a list of things a person could actually act on.
 */
function reviewCause(
  outcome: MatchOutcome,
  rationale: string,
  conflicts: readonly { field: string }[],
): string {
  if (outcome === MatchOutcome.ConflictReview) {
    const fields = conflicts.map((c) => c.field).sort().join(' + ');
    return `sources disagree on ${fields || 'an unnamed field'}`;
  }
  const why = rationale.split('needs review: ')[1] ?? rationale;
  if (why.includes('association rather than identity')) return 'one name contains the other';
  if (why.includes('protects a landscape')) return 'landscape designation versus a structure inside it';
  if (why.includes('the name is not distinctive')) return 'name is not distinctive';
  if (why.includes('scores almost as well')) return 'two candidates score alike';
  if (why.includes('outside the')) return 'position outside the agreement radius';
  if (why.includes('names are not close enough')) return 'names not close enough';
  return 'score below the confident threshold';
}

export interface ActivationPlan {
  datasetId: string;
  datasetVersion: string;
  publicationPolicyVersion: string;
  importerVersion: string;
  sourceRows: number;
  valid: number;
  rejected: number;
  /**
   * Classification of records that became candidates.
   *
   * REJECTED is always 0 here and that is correct, not a bug: a record rejected
   * during normalise or validate never becomes an import candidate at all, so
   * there is nothing to classify. `rejectedBeforeCandidate` is where those
   * records are counted.
   */
  counts: Record<PublicationClass, number>;
  /** Auto-safe records that should attach to a place another record created. */
  expectedAttachments: number;
  /** Records dropped before a candidate row could exist. */
  rejectedBeforeCandidate: number;
  rejectionReasons: { reason: string; count: number }[];
  outcomes: Record<MatchOutcome, number>;
  candidatePairs: number;
  candidatePairsPerRecord: number;
  matchMs: number;
  candidateGenerationMs: number;
  ingestionMs: number;
  recordsPerSecond: number;
  /** Distribution of the classification the normaliser actually assigned. */
  placeTypes: Record<string, number>;
  designations: Record<string, number>;
  genericallyTyped: number;
  /** Records with at least one defensible temporal claim. */
  recordsWithTemporal: number;
  temporalCoverageRate: number;
  temporalByPeriod: Record<string, number>;
  /** Source fields rejected as temporal evidence, and why. */
  rejectedTemporalFields: { field: string; reason: string }[];
  /** Why records are queued, grouped so the queue reads as causes not rows. */
  reviewCauses: { cause: string; count: number; share: number; example: string }[];
  reviewMinutesEstimate: number;
  report: RunReport;
}

export async function buildActivation(outDir: string): Promise<ActivationPlan> {
  const manifest = readRegionalManifest();
  const matchStats: MatchStats = {
    comparisons: 0,
    vetoedByDistance: 0,
    vetoedByName: 0,
    vetoedByRegister: 0,
    beyondMaxDistance: 0,
  };
  const candidateStats = emptyCandidateStats();
  const matchSamples: number[] = [];

  const started = Date.now();
  const report = await runIngestion({
    importRunId: `${REGIONAL_DATASET_ID}@${REGIONAL_DATASET_VERSION}`,
    candidateMode: CandidateMode.Bounded,
    sources: [
      {
        adapter: new HistoricEnglandNhleAdapter({ kind: 'file', path: REGIONAL_CACHE_FILE }),
        normalise: normaliseNhleRecord,
      },
    ],
    observer: {
      matchStats,
      candidateStats,
      onRecord: ({ matchMs }) => matchSamples.push(matchMs),
    },
  });
  const ingestionMs = Date.now() - started;

  const counts: Record<PublicationClass, number> = {
    [PublicationClass.AutoSafe]: 0,
    [PublicationClass.ReviewRequired]: 0,
    [PublicationClass.Rejected]: 0,
  };
  const placeTypes: Record<string, number> = {};
  const designations: Record<string, number> = {};

  // --- Candidate rows -------------------------------------------------------
  const rows: string[] = [];
  const approved: string[] = [];
  const conflictRows: string[] = [];

  report.decided.forEach((decided, ordinal) => {
    const { candidate, decision } = decided;
    const classification = classifyDecision(decision.outcome);
    counts[classification.publicationClass] += 1;

    placeTypes[candidate.placeType] = (placeTypes[candidate.placeType] ?? 0) + 1;
    for (const designation of candidate.designations) {
      designations[designation.designation] = (designations[designation.designation] ?? 0) + 1;
    }

    const id = candidateUuid(candidate.provenance.sourceRecordId, ordinal);
    const status = moderationStateFor(classification.publicationClass);

    // The candidate's own normalised shape is what publish_import_candidate
    // reads; it is not reshaped here, so the database sees exactly what the
    // pipeline produced.
    const normalised = JSON.stringify(candidate);

    // The matcher's `matchedPlaceId` is a synthetic within-run handle and means
    // nothing to the database. What travels instead is the SOURCE RECORD id of
    // the record it matched, which the database can resolve to a real place
    // once that record has been published. Without this the confident-match
    // path never fires and every match is published as a second place — which
    // is exactly what the first activation did, silently, until the audit found
    // zero automatic merges where the plan said twenty-five.
    rows.push(
      [
        csvField(String(ordinal)),
        csvField(id),
        csvField(normalised),
        csvField(status),
        csvField(decision.confidence.toFixed(3)),
        csvField(classification.publicationClass),
        csvField(classification.reason),
        csvField(decision.rationale),
        csvField(decided.matchedSourceRecordId ?? ''),
      ].join(','),
    );

    if (classification.publicationClass === PublicationClass.AutoSafe) approved.push(id);

    // Conflicts are recorded so the review queue carries the evidence, and so
    // that publish_import_candidate's own refusal to publish over an unresolved
    // conflict is exercised rather than assumed.
    for (const conflict of decision.conflicts) {
      conflictRows.push(
        [
          csvField(id),
          csvField(conflict.field),
          csvField(JSON.stringify(String(conflict.existingValue))),
          csvField(JSON.stringify(String(conflict.candidateValue))),
        ].join(','),
      );
    }
  });

  // --- Temporal claims ------------------------------------------------------
  // Only what the source itself says. NHLE carries six date fields and not one
  // of them is a historic date — they all record when protection was conferred
  // — so the only defensible evidence is period language in the record's own
  // description. Coverage is consequently tiny, and that is the true answer.
  const temporalRows: string[] = [];
  let recordsWithTemporal = 0;
  const temporalByPeriod = new Map<string, number>();

  for (const decided of report.decided) {
    const { candidate } = decided;
    // Scheduled monuments are named with formal archaeological descriptions;
    // listed buildings are named with postal addresses. A bare period word
    // means something in the first and nothing in the second.
    const descriptiveSource = candidate.designations.some(
      (d) => d.designation === 'scheduled_monument',
    );
    const claims = extractTemporalClaims(candidate.name, { descriptiveSource });
    if (claims.length === 0) continue;
    recordsWithTemporal += 1;
    for (const claim of claims) {
      temporalByPeriod.set(claim.periodId, (temporalByPeriod.get(claim.periodId) ?? 0) + 1);
      temporalRows.push(
        [
          csvField(candidate.provenance.sourceRecordId),
          csvField(NAME_DERIVED_ASSOCIATION),
          csvField(String(claim.startYear)),
          csvField(String(claim.endYear)),
          csvField(claim.precision),
          csvField(claim.periodId),
          csvField(claim.originalText),
          csvField(claim.derivation),
        ].join(','),
      );
    }
  }

  writeFileSync(
    resolve(outDir, 'regional-temporal.csv'),
    temporalRows.join('\n') + (temporalRows.length ? '\n' : ''),
  );

  writeFileSync(resolve(outDir, 'regional-candidates.csv'), rows.join('\n') + '\n');
  writeFileSync(resolve(outDir, 'regional-conflicts.csv'), conflictRows.join('\n') + (conflictRows.length ? '\n' : ''));
  writeFileSync(resolve(outDir, 'regional-approved.csv'), approved.map((id) => csvField(id)).join('\n') + '\n');

  // --- Review causes --------------------------------------------------------
  const causeGroups = new Map<string, { count: number; example: string }>();
  for (const decided of report.decided) {
    if (classifyDecision(decided.decision.outcome).publicationClass !== PublicationClass.ReviewRequired) {
      continue;
    }
    const cause = reviewCause(decided.decision.outcome, decided.decision.rationale, decided.decision.conflicts);
    const entry = causeGroups.get(cause);
    if (entry) entry.count += 1;
    else causeGroups.set(cause, { count: 1, example: `${decided.candidate.name} — ${decided.decision.rationale}` });
  }
  const queued = counts[PublicationClass.ReviewRequired];
  const reviewCauses = [...causeGroups.entries()]
    .map(([cause, v]) => ({
      cause,
      count: v.count,
      share: Math.round((v.count / Math.max(1, queued)) * 10000) / 10000,
      example: v.example,
    }))
    .sort((a, b) => b.count - a.count);

  const matchMs = matchSamples.reduce((a, b) => a + b, 0);

  const plan: ActivationPlan = {
    datasetId: REGIONAL_DATASET_ID,
    datasetVersion: REGIONAL_DATASET_VERSION,
    publicationPolicyVersion: PUBLICATION_POLICY_VERSION,
    importerVersion: REGIONAL_IMPORTER_VERSION,
    sourceRows: report.sourceRows,
    valid: report.valid,
    rejected: report.rejected,
    counts,
    expectedAttachments: report.outcomes[MatchOutcome.MatchConfident],
    rejectedBeforeCandidate: report.rejected,
    rejectionReasons: (() => {
      const grouped = new Map<string, number>();
      for (const rejection of report.rejections) {
        for (const reason of rejection.reasons) {
          const key = reason.replace(/\d+(\.\d+)?/g, 'N');
          grouped.set(key, (grouped.get(key) ?? 0) + 1);
        }
      }
      return [...grouped.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);
    })(),
    outcomes: report.outcomes,
    candidatePairs: candidateStats.candidatePairs,
    candidatePairsPerRecord:
      Math.round((candidateStats.candidatePairs / Math.max(1, matchSamples.length)) * 10) / 10,
    matchMs: Math.round(matchMs),
    candidateGenerationMs: Math.round(candidateStats.generationMs),
    ingestionMs,
    recordsPerSecond: Math.round((report.sourceRows / Math.max(1, ingestionMs)) * 1000),
    placeTypes,
    designations,
    genericallyTyped: report.genericallyTyped,
    recordsWithTemporal,
    temporalCoverageRate: Math.round((recordsWithTemporal / Math.max(1, report.valid)) * 100000) / 100000,
    temporalByPeriod: Object.fromEntries([...temporalByPeriod].sort((a, b) => b[1] - a[1])),
    rejectedTemporalFields: [
      { field: 'ListDate', reason: 'when the building was listed, not when it was built' },
      { field: 'SchedDate', reason: 'when the monument was scheduled' },
      { field: 'RegDate', reason: 'when the park or battlefield was registered' },
      { field: 'InscrDate', reason: 'when the World Heritage Site was inscribed' },
      { field: 'DesigDate', reason: 'when the designation was made' },
      { field: 'AmendDate', reason: 'when the register entry was last amended' },
      { field: 'first_designated', reason: 'the published fact derived from the above' },
    ],
    reviewCauses,
    // Two minutes per decision, the figure used throughout the scale work. An
    // estimate from a documented assumption, not observed reviewer productivity.
    reviewMinutesEstimate: counts[PublicationClass.ReviewRequired] * 2,
    report,
  };

  // Manifest composition is a claim about the region; assert the run agrees.
  if (report.sourceRows !== manifest.composition.total) {
    throw new Error(
      `manifest says ${manifest.composition.total} records, the run processed ${report.sourceRows}`,
    );
  }

  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = process.cwd();
  buildActivation(outDir)
    .then((plan) => {
      const { report, ...summary } = plan;
      void report;
      writeFileSync(
        resolve(outDir, 'regional-activation-plan.json'),
        JSON.stringify(summary, null, 2) + '\n',
      );
      console.log(`dataset          ${plan.datasetId}@${plan.datasetVersion}`);
      console.log(`source rows      ${plan.sourceRows}`);
      console.log(`valid / rejected ${plan.valid} / ${plan.rejected}`);
      console.log(`outcomes         ${JSON.stringify(plan.outcomes)}`);
      console.log(`classes          ${JSON.stringify(plan.counts)}`);
      console.log(`expected merges  ${plan.expectedAttachments} (attach to an existing place)`);
      console.log(`rejected early   ${plan.rejectedBeforeCandidate} ${JSON.stringify(plan.rejectionReasons)}`);
      console.log(`candidate pairs  ${plan.candidatePairs} (${plan.candidatePairsPerRecord}/record)`);
      console.log(`ingestion        ${plan.ingestionMs}ms (${plan.recordsPerSecond} rec/s)`);
      console.log(`place types      ${Object.keys(plan.placeTypes).length} distinct`);
      console.log(`batch size       ${PUBLISH_BATCH_SIZE}`);
      console.log(`review causes    ${plan.reviewCauses.map((c) => `${c.cause} (${c.count})`).join('; ')}`);
      console.log(`review estimate  ~${Math.round(plan.reviewMinutesEstimate / 6) / 10}h`);
      console.log(
        `temporal         ${plan.recordsWithTemporal} records (${(plan.temporalCoverageRate * 100).toFixed(2)}%) ${JSON.stringify(plan.temporalByPeriod)}`,
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
