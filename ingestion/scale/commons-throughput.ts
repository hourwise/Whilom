/**
 * How fast media can honestly be imported from Wikimedia Commons.
 *
 *   pnpm --filter @whilom/ingestion scale:commons
 *
 * A bounded live probe, not a load test. Commons is a shared public service run
 * on donations, and the useful question is not how hard we could push it but
 * what rate is sustainable while behaving well — so the adapter's courtesy
 * delay stays in place and the probe measures the throughput that results.
 *
 * Deliberately small: a fixed handful of categories, a low per-category cap,
 * and a hard ceiling on total requests. Expanding Commons harvesting to
 * heritage scale is explicitly out of scope for this batch; this exists to
 * answer whether the media lane would be the bottleneck in a regional import,
 * which it can do from a hundred requests as well as from a hundred thousand.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WikimediaCommonsAdapter } from '../sources/commons/commons-adapter';
import type { CommonsRequestRecord } from '../sources/commons/commons-adapter';
import { MediaRightsState, assessMediaRights, normaliseCommonsRecord } from '../transforms/normalise-commons';
import { percentile, round } from './metrics';

/** Real Yorkshire heritage categories, the same ones the POC sampled. */
const CATEGORIES = [
  { category: 'Fountains Abbey', qid: 'Q540237', label: 'Fountains Abbey' },
  { category: 'Richmond Castle', qid: 'Q6645746', label: 'Richmond Castle' },
  { category: 'Middleham Castle', qid: 'Q2705370', label: 'Middleham Castle' },
  { category: 'Saltaire', qid: 'Q838920', label: 'Saltaire' },
  { category: 'Whitby Abbey', qid: 'Q1191243', label: 'Whitby Abbey' },
  { category: 'Bolton Abbey', qid: 'Q4939377', label: 'Bolton Abbey' },
  { category: 'Rievaulx Abbey', qid: 'Q1138468', label: 'Rievaulx Abbey' },
  { category: 'Skipton Castle', qid: 'Q2531016', label: 'Skipton Castle' },
] as const;

const PER_CATEGORY = 8;

export interface CommonsThroughputReport {
  startedAt: string;
  finishedAt: string;
  categories: number;
  perCategory: number;
  filesRetrieved: number;
  requests: number;
  rateLimited429: number;
  retries: number;
  wallClockSeconds: number;
  /** End-to-end, including the courtesy delay. The number that matters. */
  filesPerMinute: number;
  requestsPerMinute: number;
  /** Server response time alone, with our own waiting excluded. */
  serverLatencyMs: { p50: number; p95: number; max: number };
  /** What the rights gate made of them, since throughput of unusable files is not throughput. */
  rightsStates: Record<string, number>;
  publishableShare: number;
  projection: {
    note: string;
    placesToIllustrate: number;
    requestsPerPlace: number;
    estimatedRequests: number;
    estimatedHours: number;
  };
}

export async function measureCommonsThroughput(): Promise<CommonsThroughputReport> {
  const requests: CommonsRequestRecord[] = [];
  const adapter = new WikimediaCommonsAdapter(
    { kind: 'api', categories: [...CATEGORIES], perCategory: PER_CATEGORY },
    { onRequest: (record) => requests.push(record) },
  );

  const startedAt = new Date();
  const rightsStates: Record<string, number> = {};
  let files = 0;
  let publishable = 0;

  for await (const raw of adapter.fetch()) {
    files += 1;
    const media = normaliseCommonsRecord(raw);
    // Association is assumed confident here on purpose: this probe measures the
    // media LANE, and mixing in subject uncertainty would confuse a throughput
    // figure with a matching figure.
    const rights = assessMediaRights(media, { associationConfident: true });
    rightsStates[rights.state] = (rightsStates[rights.state] ?? 0) + 1;
    if (rights.state === MediaRightsState.Ready && rights.attribution !== null) publishable += 1;
  }

  const finishedAt = new Date();
  const wallClockSeconds = (finishedAt.getTime() - startedAt.getTime()) / 1000;
  const latencies = requests.map((r) => r.durationMs).sort((a, b) => a - b);

  const filesPerMinute = wallClockSeconds > 0 ? (files / wallClockSeconds) * 60 : 0;
  const requestsPerMinute = wallClockSeconds > 0 ? (requests.length / wallClockSeconds) * 60 : 0;

  // Project on REQUESTS, not files. The file rate above is flattered by the
  // probe's shape: these are dense, well-populated categories, so eight files
  // arrive per request. A real import asks about one place at a time and gets
  // back however few images exist for it, so the cost is set by the number of
  // requests a place needs — a category listing and an image-info call — not by
  // how many files a good category happens to yield.
  const placesToIllustrate = 5000;
  const requestsPerPlace = 2;
  const estimatedRequests = placesToIllustrate * requestsPerPlace;

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    categories: CATEGORIES.length,
    perCategory: PER_CATEGORY,
    filesRetrieved: files,
    requests: requests.length,
    rateLimited429: requests.filter((r) => r.rateLimited).length,
    retries: requests.filter((r) => r.retries > 0).length,
    wallClockSeconds: round(wallClockSeconds, 2),
    filesPerMinute: round(filesPerMinute, 2),
    requestsPerMinute: round(requestsPerMinute, 2),
    serverLatencyMs: {
      p50: round(percentile(latencies, 50)),
      p95: round(percentile(latencies, 95)),
      max: round(latencies.at(-1) ?? 0),
    },
    rightsStates,
    publishableShare: files > 0 ? round(publishable / files, 4) : 0,
    projection: {
      note:
        'Projected from the measured REQUEST rate, including the adapter courtesy delay, at two ' +
        'requests per place. The file rate above is not a safe basis: these are dense categories ' +
        'yielding eight files per request, which a per-place import would not see. Assumes no ' +
        'parallelism, which a real import would revisit before accepting this figure.',
      placesToIllustrate,
      requestsPerPlace,
      estimatedRequests,
      estimatedHours: requestsPerMinute > 0 ? round(estimatedRequests / requestsPerMinute / 60, 1) : 0,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  measureCommonsThroughput()
    .then((report) => {
      const out = resolve(process.cwd(), 'commons-throughput.json');
      writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
      console.log(`files            ${report.filesRetrieved} from ${report.categories} categories`);
      console.log(`requests         ${report.requests} (${report.rateLimited429} rate-limited, ${report.retries} retried)`);
      console.log(`wall clock       ${report.wallClockSeconds}s`);
      console.log(`rate             ${report.filesPerMinute} files/min, ${report.requestsPerMinute} requests/min`);
      console.log(`server latency   p50 ${report.serverLatencyMs.p50}ms  p95 ${report.serverLatencyMs.p95}ms`);
      console.log(`rights states    ${JSON.stringify(report.rightsStates)}`);
      console.log(`publishable      ${(report.publishableShare * 100).toFixed(1)}%`);
      console.log(
        `projection       ~${report.projection.estimatedHours}h for ${report.projection.placesToIllustrate} places ` +
          `(${report.projection.estimatedRequests} requests)`,
      );
      console.log(`\nwrote ${out}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
