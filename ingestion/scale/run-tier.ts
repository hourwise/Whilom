/**
 * Run one tier of the staged scale experiment and evaluate the declared gates.
 *
 *   pnpm --filter @whilom/ingestion scale:run -- --tier 1000
 *
 * Writes `scale-results-<tier>.json`. Exits non-zero if a BLOCKING gate failed,
 * so the workflow stops the ladder rather than spending the next tier on a
 * pipeline already known to be unsound.
 *
 * This runs the ordinary pipeline. The adapter, normaliser, matcher and
 * comparator are the ones the Yorkshire POC uses; the only additions are the
 * measurement taps on `runIngestion`. A benchmark that exercises a private
 * fast path measures the benchmark.
 */

import { cpus } from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HistoricEnglandNhleAdapter } from '../sources/historic-england/nhle-adapter';
import { normaliseNhleRecord } from '../transforms/normalise-nhle';
import { runIngestion } from '../pipeline/run';
import type { DecidedCandidate } from '../pipeline/run';
import { MatchOutcome } from '../pipeline/candidate';
import type { MatchStats } from '../matching/matcher';
import { GATES, mayProceed } from './gates';
import type { GateResult } from './gates';
import { TIER_SIZES, buildTierFixture, isTierSize } from './tier';
import { evenSample, round, timingStats } from './metrics';
import type { QualitySample, ReviewPressure, TierMetrics } from './metrics';

const SAMPLE_SIZE = 20;

function parseTier(argv: readonly string[]): number {
  const index = argv.indexOf('--tier');
  const raw = index >= 0 ? argv[index + 1] : undefined;
  const tier = Number(raw);
  if (!Number.isFinite(tier) || !isTierSize(tier)) {
    throw new Error(`--tier must be one of 1000, 2500, 5000 (got ${String(raw)})`);
  }
  return tier;
}

/**
 * Why a record is in the review queue.
 *
 * The matcher already writes a plain-English rationale; grouping on the reason
 * rather than the sentence turns "1,200 records need review" into a list of
 * fixable causes.
 */
function reviewCause(decided: DecidedCandidate): string {
  const { decision } = decided;
  if (decision.outcome === MatchOutcome.ConflictReview) {
    const fields = decision.conflicts.map((c) => c.field).sort().join(' + ');
    return `sources disagree on ${fields || 'an unnamed field'}`;
  }
  const why = decision.rationale.split('needs review: ')[1] ?? decision.rationale;
  if (why.includes('protects a landscape')) return 'landscape designation versus a structure inside it';
  if (why.includes('the name is not distinctive')) return 'name is not distinctive';
  if (why.includes('scores almost as well')) return 'two candidates score alike';
  if (why.includes('outside the')) return 'position outside the agreement radius';
  if (why.includes('names are not close enough')) return 'names not close enough';
  return 'score below the confident threshold';
}

function buildReviewPressure(decided: readonly DecidedCandidate[], valid: number): ReviewPressure {
  const queued = decided.filter(
    (d) =>
      d.decision.outcome === MatchOutcome.MatchReview ||
      d.decision.outcome === MatchOutcome.ConflictReview,
  );
  const grouped = new Map<string, DecidedCandidate[]>();
  for (const item of queued) {
    const cause = reviewCause(item);
    const bucket = grouped.get(cause);
    if (bucket) bucket.push(item);
    else grouped.set(cause, [item]);
  }

  const matchReview = queued.filter((d) => d.decision.outcome === MatchOutcome.MatchReview).length;
  const conflictReview = queued.length - matchReview;

  return {
    matchReview,
    conflictReview,
    totalForReview: queued.length,
    shareOfValid: valid > 0 ? round(queued.length / valid, 5) : 0,
    // Two minutes is optimistic for a genuine identity decision; it is used
    // consistently so tiers are comparable, not as a claim about real speed.
    estimatedReviewHours: round((queued.length * 2) / 60, 2),
    causes: [...grouped.entries()]
      .map(([cause, items]) => ({
        cause,
        count: items.length,
        share: round(items.length / Math.max(1, queued.length), 4),
        example: `${items[0]!.candidate.name} — ${items[0]!.decision.rationale}`,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

function sampleFor(
  category: QualitySample['category'],
  decided: readonly DecidedCandidate[],
): QualitySample {
  const chosen = evenSample(decided, SAMPLE_SIZE);
  return {
    category,
    sampled: chosen.length,
    records: chosen.map((d) => {
      const distance = d.decision.signals.find((s) => s.name === 'distance');
      const name = d.decision.signals.find((s) => s.name === 'name');
      const meters = distance?.detail.match(/^(\d+)m/)?.[1];
      const similarity = name?.detail.match(/\((\d\.\d+)\)/)?.[1];
      return {
        name: d.candidate.name,
        sourceRecordId: d.candidate.provenance.sourceRecordId,
        placeType: d.candidate.placeType,
        rationale: d.decision.rationale,
        ...(d.decision.matchedPlaceId ? { matchedTo: d.decision.matchedPlaceId } : {}),
        ...(meters ? { distanceMeters: Number(meters) } : {}),
        ...(similarity ? { nameSimilarity: Number(similarity) } : {}),
        ...(d.decision.conflicts.length
          ? {
              conflicts: d.decision.conflicts.map(
                (c) => `${c.field}: ${String(c.existingValue)} vs ${String(c.candidateValue)}`,
              ),
            }
          : {}),
      };
    }),
  };
}

/**
 * Load the tier immediately below this one, if it has already been run.
 *
 * G5 asks how matching cost GROWS, which no single tier can answer. Rather
 * than re-running the smaller tier, the ladder reads the result it already
 * wrote — and if that file is absent the gate reports itself unevaluated
 * rather than quietly passing.
 */
function loadPreviousTier(tier: number): TierMetrics | undefined {
  const index = TIER_SIZES.indexOf(tier as (typeof TIER_SIZES)[number]);
  const previousTier = index > 0 ? TIER_SIZES[index - 1] : undefined;
  if (previousTier === undefined) return undefined;
  const path = resolve(process.cwd(), `scale-results-${previousTier}.json`);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as TierMetrics;
}

export async function runTier(tier: number): Promise<TierMetrics> {
  const fixture = buildTierFixture(tier);
  const startedAt = new Date();

  const matchStats: MatchStats = { comparisons: 0, vetoedByDistance: 0, vetoedByName: 0, vetoedByRegister: 0 };
  const normaliseSamples: number[] = [];
  const validateSamples: number[] = [];
  const matchSamples: number[] = [];

  const report = await runIngestion({
    importRunId: `scale-${tier}`,
    sources: [
      {
        adapter: new HistoricEnglandNhleAdapter({ kind: 'file', path: fixture.path }),
        normalise: normaliseNhleRecord,
      },
    ],
    observer: {
      matchStats,
      onRecord: ({ normaliseMs, validateMs, matchMs }) => {
        normaliseSamples.push(normaliseMs);
        validateSamples.push(validateMs);
        matchSamples.push(matchMs);
      },
    },
  });

  const finishedAt = new Date();

  const rejectionReasons = new Map<string, number>();
  for (const rejection of report.rejections) {
    for (const reason of rejection.reasons) {
      // Collapse the variable part so reasons group.
      const key = reason.replace(/\d+(\.\d+)?/g, 'N');
      rejectionReasons.set(key, (rejectionReasons.get(key) ?? 0) + 1);
    }
  }

  const conflictFields = new Map<string, number>();
  for (const decided of report.decided) {
    for (const conflict of decided.decision.conflicts) {
      conflictFields.set(conflict.field, (conflictFields.get(conflict.field) ?? 0) + 1);
    }
  }

  const matchTiming = timingStats(matchSamples);
  const valid = report.valid;
  const outcomes = report.outcomes;
  const autoMatched = outcomes[MatchOutcome.MatchConfident];

  const review = buildReviewPressure(report.decided, valid);

  const metrics: TierMetrics = {
    tier,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      cpus: cpus().length,
      ci: process.env['CI'] === 'true',
    },
    composition: fixture.mix,
    ingestion: {
      sourceRows: report.sourceRows,
      valid,
      rejected: report.rejected,
      rejectionRate: report.sourceRows > 0 ? round(report.rejected / report.sourceRows, 5) : 0,
      genericallyTyped: report.genericallyTyped,
      genericTypingRate: valid > 0 ? round(report.genericallyTyped / valid, 5) : 0,
      recordsPerSecond:
        report.runtimeMs > 0 ? round((report.sourceRows / report.runtimeMs) * 1000, 1) : 0,
      normaliseMs: round(normaliseSamples.reduce((a, b) => a + b, 0)),
      validateMs: round(validateSamples.reduce((a, b) => a + b, 0)),
      totalMs: report.runtimeMs,
      rejectionReasons: [...rejectionReasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    },
    matching: {
      outcomes,
      comparisons: report.comparisons,
      duplicatesWithinRun: report.duplicatesWithinRun,
      withinSourceMatches: report.withinSourceMatches,
      conflicts: report.conflicts,
      conflictRate: valid > 0 ? round(report.conflicts / valid, 5) : 0,
      autoMatchRate: valid > 0 ? round(autoMatched / valid, 5) : 0,
      work: {
        ...matchTiming,
        meanComparisonsPerRecord: round(
          matchStats.comparisons / Math.max(1, matchSamples.length),
          1,
        ),
        totalComparisons: matchStats.comparisons,
        vetoedByDistance: matchStats.vetoedByDistance,
        vetoedByName: matchStats.vetoedByName,
        vetoedByRegister: matchStats.vetoedByRegister,
      },
      conflictFields: [...conflictFields.entries()]
        .map(([field, count]) => ({ field, count }))
        .sort((a, b) => b.count - a.count),
    },
    review,
    quality: [
      sampleFor(
        'auto_match',
        report.decided.filter((d) => d.decision.outcome === MatchOutcome.MatchConfident),
      ),
      sampleFor(
        'new_canonical',
        report.decided.filter((d) => d.decision.outcome === MatchOutcome.NewCanonical),
      ),
      sampleFor(
        'review_match',
        report.decided.filter((d) => d.decision.outcome === MatchOutcome.MatchReview),
      ),
      sampleFor(
        'conflict',
        report.decided.filter((d) => d.decision.outcome === MatchOutcome.ConflictReview),
      ),
    ],
    gates: [],
    proceeded: false,
  };

  metrics.gates = evaluateGates(metrics, loadPreviousTier(tier));
  metrics.proceeded = mayProceed(metrics.gates);
  return metrics;
}

/**
 * Evaluate the gates this tier can answer.
 *
 * Gates needing evidence a single in-process tier cannot supply — a database
 * (G6, G10), a cross-tier comparison (G5) or a human audit (G4) — are marked
 * not-evaluated here and settled by the lane that has that evidence. They are
 * never silently passed.
 */
export function evaluateGates(metrics: TierMetrics, previous?: TierMetrics): GateResult[] {
  const results: GateResult[] = [];
  const g = (id: string): (typeof GATES)[number] => GATES.find((x) => x.id === id)!;
  const { ingestion, matching, review } = metrics;

  const accountedFor = Object.values(matching.outcomes).reduce((a, b) => a + b, 0);
  results.push({
    ...g('G1-completes'),
    passed: accountedFor === ingestion.sourceRows && ingestion.sourceRows === metrics.tier,
    observed: `${ingestion.sourceRows} source rows, ${accountedFor} recorded outcomes, tier size ${metrics.tier}`,
  });

  results.push({
    ...g('G2-rejection-rate'),
    passed: ingestion.rejectionRate <= 0.05,
    observed: `${(ingestion.rejectionRate * 100).toFixed(2)}% rejected (${ingestion.rejected}/${ingestion.sourceRows})`,
  });

  results.push({
    ...g('G3-review-pressure'),
    passed: review.shareOfValid <= 0.2,
    observed: `${(review.shareOfValid * 100).toFixed(2)}% of valid records queued (${review.totalForReview}), ~${review.estimatedReviewHours}h to clear`,
  });

  results.push({
    ...g('G4-no-false-merges'),
    passed: true,
    observed: `${matching.outcomes[MatchOutcome.MatchConfident]} automatic matches; ${
      metrics.quality.find((q) => q.category === 'auto_match')?.sampled ?? 0
    } sampled for audit`,
    notEvaluated:
      'Requires reading the sampled matches; settled in the scale report, not by the runner.',
  });

  if (previous) {
    const growth =
      previous.matching.work.meanMsPerRecord > 0
        ? matching.work.meanMsPerRecord / previous.matching.work.meanMsPerRecord
        : Infinity;
    results.push({
      ...g('G5-matcher-scaling'),
      passed: growth <= 3 && matching.work.meanMsPerRecord <= 50,
      observed: `${matching.work.meanMsPerRecord}ms/record vs ${previous.matching.work.meanMsPerRecord}ms at tier ${previous.tier} (${growth.toFixed(2)}x); ${matching.work.meanComparisonsPerRecord} comparisons/record`,
    });
  } else {
    results.push({
      ...g('G5-matcher-scaling'),
      passed: matching.work.meanMsPerRecord <= 50,
      observed: `${matching.work.meanMsPerRecord}ms/record, ${matching.work.meanComparisonsPerRecord} comparisons/record (baseline tier)`,
      notEvaluated: 'Growth ratio needs a smaller tier to compare against; absolute limit checked.',
    });
  }

  results.push({
    ...g('G6-query-latency'),
    passed: true,
    observed: metrics.queries ? `${metrics.queries.length} queries measured` : 'not measured in this lane',
    ...(metrics.queries
      ? {}
      : { notEvaluated: 'Needs a database; measured by the query lane of the scale workflow.' }),
  });

  results.push({
    ...g('G7-throughput'),
    passed: ingestion.recordsPerSecond >= 20,
    observed: `${ingestion.recordsPerSecond} records/second`,
  });

  results.push({
    ...g('G8-generic-typing'),
    passed: ingestion.genericTypingRate <= 0.35,
    observed: `${(ingestion.genericTypingRate * 100).toFixed(2)}% typed by fallback (${ingestion.genericallyTyped}/${ingestion.valid})`,
  });

  results.push({
    ...g('G9-conflict-detection-live'),
    passed: matching.conflicts > 0 && matching.conflictRate <= 0.15,
    observed: `${matching.conflicts} conflicts (${(matching.conflictRate * 100).toFixed(2)}% of valid records)`,
  });

  results.push({
    ...g('G10-storage-linearity'),
    passed: true,
    observed: metrics.storage ? `${metrics.storage.bytesPerRecord} bytes/record` : 'not measured in this lane',
    ...(metrics.storage
      ? {}
      : { notEvaluated: 'Needs a database; measured by the storage lane of the scale workflow.' }),
  });

  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tier = parseTier(process.argv.slice(2));
  runTier(tier)
    .then((metrics) => {
      const out = resolve(process.cwd(), `scale-results-${tier}.json`);
      writeFileSync(out, JSON.stringify(metrics, null, 2) + '\n');

      console.log(`\n=== tier ${tier} ===`);
      console.log(`composition        ${JSON.stringify(metrics.composition)}`);
      console.log(`valid / rejected   ${metrics.ingestion.valid} / ${metrics.ingestion.rejected}`);
      console.log(`throughput         ${metrics.ingestion.recordsPerSecond} rec/s`);
      console.log(`outcomes           ${JSON.stringify(metrics.matching.outcomes)}`);
      console.log(
        `match work         ${metrics.matching.work.meanMsPerRecord}ms/rec, ${metrics.matching.work.meanComparisonsPerRecord} comparisons/rec`,
      );
      console.log(
        `review queue       ${metrics.review.totalForReview} (${(metrics.review.shareOfValid * 100).toFixed(1)}% of valid)`,
      );
      console.log('\ngates:');
      for (const gate of metrics.gates) {
        const mark = gate.notEvaluated ? '-' : gate.passed ? 'PASS' : 'FAIL';
        console.log(`  ${mark.padEnd(4)} ${gate.id.padEnd(26)} ${gate.observed}`);
        if (gate.notEvaluated) console.log(`       (${gate.notEvaluated})`);
      }
      console.log(`\nwrote ${out}`);

      const blocking = metrics.gates.filter((x) => x.severity === 'blocking' && !x.passed);
      if (blocking.length > 0) {
        console.error(
          `\nBLOCKING gate failure: ${blocking.map((x) => x.id).join(', ')} — the ladder stops here.`,
        );
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
