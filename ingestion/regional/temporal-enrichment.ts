/**
 * Bounded temporal enrichment for the regional dataset.
 *
 *   pnpm --filter @whilom/ingestion regional:temporal
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 *
 * The audit that opened this batch settled the question that had been assumed
 * for three batches. The National Heritage List's FeatureServer carries exactly
 * sixteen attributes, and every one of its five date fields — ListDate,
 * SchedDate, RegDate, InscrDate, AmendDate — records when the state conferred
 * protection. There is no historic date being discarded during ingestion,
 * because there is no historic date to discard.
 *
 * The names are nearly as thin: across 23,314 Yorkshire records, 39 contain a
 * four-digit number and roughly a third of those are grid references or house
 * numbers. Sharpening the name parser is worth about twenty-five places.
 *
 * So the depth has to come from a source that actually holds dates. Wikidata
 * does, it is already an approved source in this pipeline, it is CC0, and — the
 * part that makes it usable rather than merely available — it records how
 * precisely it knows each date.
 *
 * ---------------------------------------------------------------------------
 * What makes this bounded
 * ---------------------------------------------------------------------------
 *
 * The join is `wdt:P1216`, Wikidata's National Heritage List entry number: the
 * same identifier Whilom already carries on every regional place, and the same
 * join the people enrichment uses. Nothing is imported because it is famous or
 * nearby. A statement is taken only when its NHLE number is one Whilom has
 * already published, which is why this cannot quietly become national ingestion.
 *
 * Only structured claims are read. No article prose, no inference from
 * architectural style, no dating from a photograph.
 *
 * ---------------------------------------------------------------------------
 * The trap this is built around
 * ---------------------------------------------------------------------------
 *
 * Wikidata stores "14th century" as the time value `+1350-01-01` carrying
 * `timePrecision` 7. An importer that reads the time value and ignores the
 * precision records the year 1350 for a source that never named a year. In this
 * region that is not a corner case: 48% of the statements Whilom can use are
 * century-precision, so ignoring the field would make about half of everything
 * imported quietly false.
 *
 * Precision is therefore read first and the normaliser decides what the value
 * means. Nothing here converts a date on its own.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NORMALISER_VERSION,
  type NormalisedSpan,
  type RejectionReason,
  normaliseWikidataTime,
} from '../transforms/temporal-normaliser';
import { PERIOD_SPANS } from '../transforms/temporal';
import { eventTerm, periodTerm } from '../transforms/source-vocabulary';
import { runSparql } from '../sources/wikidata/sparql';
import { readRegionalManifest } from './capture';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TEMPORAL_CACHE_DIR = resolve(HERE, '../.regional-cache');
export const TEMPORAL_CACHE_FILE = resolve(TEMPORAL_CACHE_DIR, 'regional-temporal-wikidata.json');

export const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
export const TEMPORAL_IMPORTER_VERSION = '0.1.0';

/**
 * The Wikidata time properties worth reading, and what each actually asserts.
 *
 * Deliberately three. `inception` is the date a thing came into being;
 * `official opening` is an event that happened to it; `dissolved, abolished or
 * demolished` is when it stopped. Each maps onto the association type that
 * matches what the property means, not onto whichever is most convenient for
 * the map — an opening date is evidence of an event, and calling it
 * construction would be an inference Wikidata never made.
 */
export const TEMPORAL_PROPERTIES = [
  {
    property: 'P571',
    field: 'inception (P571)',
    associationType: 'built' as const,
    note: 'the date the structure came into being',
  },
  {
    property: 'P1619',
    field: 'date of official opening (P1619)',
    associationType: 'event' as const,
    note: 'an opening is an event; treating it as construction would be an inference the source did not make',
  },
  {
    property: 'P576',
    field: 'dissolved, abolished or demolished (P576)',
    associationType: 'lost' as const,
    note: 'when the structure ceased',
  },
] as const;

/**
 * A ceiling on rows accepted, so a query that goes wrong cannot become a bulk
 * import. The measured regional yield is roughly 1,200, so this is loose enough
 * to be invisible in normal operation and tight enough to matter if something
 * changes upstream.
 */
export const TEMPORAL_ROW_CAP = 6_000;

export interface TemporalClaimRow {
  /** NHLE list entry of the regional place. */
  sourceRecordId: string;
  /** The Wikidata item the claim came from. */
  qid: string;
  property: string;
  sourceField: string;
  associationType: 'built' | 'event' | 'lost' | 'altered' | 'associated';
  /** The source's own value, kept verbatim as the evidence. */
  rawValue: string;
  /** Wikidata's own statement of how precisely it knows this. */
  rawPrecision: number;
  /** Wikidata statement rank. Deprecated statements never reach here. */
  rank: StatementRank;
  span: NormalisedSpan;
}

/** Wikidata statement ranks, in the sense Wikidata gives them. */
export type StatementRank = 'preferred' | 'normal' | 'deprecated';

/**
 * Read the rank from the ontology URI Wikidata returns.
 *
 * Unknown values are treated as normal rather than dropped: an unrecognised
 * rank is a reason to be cautious about precedence, not a reason to lose a
 * claim. Only an explicit deprecation refuses evidence.
 */
export function rankOf(uri: string | undefined): StatementRank {
  if (!uri) return 'normal';
  if (uri.endsWith('DeprecatedRank')) return 'deprecated';
  if (uri.endsWith('PreferredRank')) return 'preferred';
  return 'normal';
}

export interface TemporalRejectionRow {
  sourceRecordId: string;
  qid: string;
  sourceField: string;
  rawValue: string;
  rawPrecision: number;
  reason: RejectionReason;
  note: string;
}

export interface TemporalCapture {
  retrievedAt: string;
  endpoint: string;
  importerVersion: string;
  normaliserVersion: string;
  properties: typeof TEMPORAL_PROPERTIES;
  claims: TemporalClaimRow[];
  rejections: TemporalRejectionRow[];
  /** Rows the queries returned before the regional intersection. */
  candidateRows: number;
  /** Rows discarded because their place is not in the regional corpus. */
  outsideRegion: number;
}


/**
 * The query for one property.
 *
 * It reaches through the statement node (`p:` then `psv:`) rather than taking
 * the simple `wdt:` value, because only the full statement carries
 * `wikibase:timePrecision`. That indirection is the whole point: the truthful
 * version of this import is impossible through the shortcut form.
 */
export function buildTemporalQuery(property: string): string {
  return `SELECT ?nhle ?item ?value ?precision ?rank WHERE {
  ?item wdt:P1216 ?nhle ; p:${property} ?statement .
  ?statement psv:${property} ?node ; wikibase:rank ?rank .
  ?node wikibase:timeValue ?value ; wikibase:timePrecision ?precision .
${REGION_BOX}
} LIMIT 8000`;
}

/**
 * The regional envelope, in the form Wikidata's geospatial service wants.
 *
 * Not merely an optimisation, though it is that — the unbounded form asks the
 * public endpoint to walk every statement node on roughly 400,000 English
 * listed entries and is answered with a 502. It is also the right query: this
 * import is bounded to one region, and saying so in the query is more honest
 * than fetching the country and discarding it locally.
 *
 * The box is the WGS84 extent of the British National Grid envelope in the
 * dataset manifest, and matches the coverage region migration 0031 publishes.
 */
const REGION_BOX = `  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(-2.60 53.20)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(0.40 54.80)"^^geo:wktLiteral .
  }`;

/** Dated significant events: P793 with a point-in-time qualifier. */
export const EVENT_QUERY = `SELECT ?nhle ?item ?event ?value ?precision ?rank WHERE {
  ?item wdt:P1216 ?nhle ; p:P793 ?statement .
  ?statement ps:P793 ?event ; wikibase:rank ?rank .
  ?statement pqv:P585 ?node .
  ?node wikibase:timeValue ?value ; wikibase:timePrecision ?precision .
${REGION_BOX}
} LIMIT 4000`;

/** Controlled period vocabulary: P2348. */
export const PERIOD_QUERY = `SELECT ?nhle ?item ?period ?rank WHERE {
  ?item wdt:P1216 ?nhle ; p:P2348 ?statement .
  ?statement ps:P2348 ?period ; wikibase:rank ?rank .
${REGION_BOX}
} LIMIT 4000`;

export async function captureTemporal(): Promise<TemporalCapture> {
  const manifest = readRegionalManifest();
  const regional = new Set(manifest.sourceRecordIds.map(String));

  const claims: TemporalClaimRow[] = [];
  const rejections: TemporalRejectionRow[] = [];
  let candidateRows = 0;
  let outsideRegion = 0;

  for (const spec of TEMPORAL_PROPERTIES) {
    // One property per query. The combined UNION form times out on the public
    // endpoint, and three cheap queries are kinder to a shared service.
    const rows = await runSparql(buildTemporalQuery(spec.property), {
      userAgent: `Whilom/${TEMPORAL_IMPORTER_VERSION} (bounded regional temporal enrichment)`,
    });
    candidateRows += rows.length;

    for (const row of rows) {
      const nhle = row['nhle']?.value?.trim();
      const itemUri = row['item']?.value;
      const rawValue = row['value']?.value;
      const rawPrecision = Number(row['precision']?.value);
      const rank = rankOf(row['rank']?.value);
      if (!nhle || !itemUri || !rawValue || !Number.isFinite(rawPrecision)) continue;

      // The intersection that keeps this bounded.
      if (!regional.has(nhle)) {
        outsideRegion += 1;
        continue;
      }
      if (claims.length >= TEMPORAL_ROW_CAP) break;

      const qid = itemUri.split('/').pop() ?? '';

      // A deprecated statement is one Wikidata's own editors have marked as
      // wrong or superseded. Importing it as ordinary evidence would give a
      // known-bad claim the same standing as a good one.
      if (rank === 'deprecated') {
        rejections.push({
          sourceRecordId: nhle, qid, sourceField: spec.field, rawValue, rawPrecision,
          reason: 'deprecated_statement',
          note: 'Wikidata marks this statement deprecated; not imported as evidence',
        });
        continue;
      }

      const result = normaliseWikidataTime(rawValue, rawPrecision, { field: spec.field });

      if (!result.ok) {
        rejections.push({
          sourceRecordId: nhle,
          qid,
          sourceField: spec.field,
          rawValue,
          rawPrecision,
          reason: result.rejection.reason,
          note: result.rejection.note,
        });
        continue;
      }

      claims.push({
        sourceRecordId: nhle,
        qid,
        property: spec.property,
        sourceField: spec.field,
        associationType: spec.associationType,
        rawValue,
        rawPrecision,
        rank,
        span: result.span,
      });
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  // ---------------------------------------------------------------------
  // Dated significant events
  // ---------------------------------------------------------------------
  // P793 with a P585 qualifier: a real, dated thing that happened here.
  // Thirty-three distinct types appear in this region and they are NOT
  // interchangeable — a demolition, a fire and a geophysical survey say three
  // different things, and the last says nothing about the place at all. Each
  // type is governed by name in transforms/source-vocabulary.ts.
  {
    const rows = await runSparql(EVENT_QUERY, {
      userAgent: `Whilom/${TEMPORAL_IMPORTER_VERSION} (bounded regional temporal enrichment)`,
    });
    candidateRows += rows.length;
    for (const row of rows) {
      const nhle = row['nhle']?.value?.trim();
      const itemUri = row['item']?.value;
      const eventUri = row['event']?.value;
      const rawValue = row['value']?.value;
      const rawPrecision = Number(row['precision']?.value);
      const rank = rankOf(row['rank']?.value);
      if (!nhle || !itemUri || !eventUri || !rawValue || !Number.isFinite(rawPrecision)) continue;
      if (!regional.has(nhle)) {
        outsideRegion += 1;
        continue;
      }

      const qid = itemUri.split('/').pop() ?? '';
      const eventQid = eventUri.split('/').pop() ?? '';
      const term = eventTerm(eventQid);
      const field = `significant event (P793) — ${term?.label ?? eventQid}`;

      if (rank === 'deprecated') {
        rejections.push({
          sourceRecordId: nhle, qid, sourceField: field, rawValue, rawPrecision,
          reason: 'deprecated_statement',
          note: 'Wikidata marks this statement deprecated',
        });
        continue;
      }
      if (!term) {
        rejections.push({
          sourceRecordId: nhle, qid, sourceField: field, rawValue, rawPrecision,
          reason: 'unmapped_event',
          note: `event type ${eventQid} is not governed; ranked for a future batch`,
        });
        continue;
      }
      if (term.association === null) {
        rejections.push({
          sourceRecordId: nhle, qid, sourceField: field, rawValue, rawPrecision,
          reason: 'event_not_about_place',
          note: term.note,
        });
        continue;
      }
      const result = normaliseWikidataTime(rawValue, rawPrecision, { field });
      if (!result.ok) {
        rejections.push({
          sourceRecordId: nhle, qid, sourceField: field, rawValue, rawPrecision,
          reason: result.rejection.reason, note: result.rejection.note,
        });
        continue;
      }
      claims.push({
        sourceRecordId: nhle, qid, property: 'P793', sourceField: field,
        associationType: term.association, rawValue, rawPrecision, rank, span: result.span,
      });
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  // ---------------------------------------------------------------------
  // Controlled period vocabulary
  // ---------------------------------------------------------------------
  // P2348 is the only genuinely controlled period vocabulary either source
  // offers; everything else is a word read out of a name. Five distinct items
  // regionally — small, and worth governing precisely for that reason.
  {
    const rows = await runSparql(PERIOD_QUERY, {
      userAgent: `Whilom/${TEMPORAL_IMPORTER_VERSION} (bounded regional temporal enrichment)`,
    });
    candidateRows += rows.length;
    for (const row of rows) {
      const nhle = row['nhle']?.value?.trim();
      const itemUri = row['item']?.value;
      const periodUri = row['period']?.value;
      const rank = rankOf(row['rank']?.value);
      if (!nhle || !itemUri || !periodUri) continue;
      if (!regional.has(nhle)) {
        outsideRegion += 1;
        continue;
      }

      const qid = itemUri.split('/').pop() ?? '';
      const periodQid = periodUri.split('/').pop() ?? '';
      const term = periodTerm(periodQid);
      const field = `time period (P2348) — ${term?.label ?? periodQid}`;

      if (rank === 'deprecated') {
        rejections.push({
          sourceRecordId: nhle, qid, sourceField: field, rawValue: periodQid, rawPrecision: 0,
          reason: 'deprecated_statement', note: 'Wikidata marks this statement deprecated',
        });
        continue;
      }
      if (!term || term.classification === 'REJECTED' || term.classification === 'AMBIGUOUS') {
        rejections.push({
          sourceRecordId: nhle, qid, sourceField: field, rawValue: periodQid, rawPrecision: 0,
          reason: 'unmapped_period',
          note: term ? term.note : `period item ${periodQid} is not governed; ranked for a future batch`,
        });
        continue;
      }
      const span = term.periodId ? PERIOD_SPANS[term.periodId] : term.span;
      if (!span) {
        rejections.push({
          sourceRecordId: nhle, qid, sourceField: field, rawValue: periodQid, rawPrecision: 0,
          reason: 'unmapped_period', note: `no span for ${term.label}`,
        });
        continue;
      }
      claims.push({
        sourceRecordId: nhle, qid, property: 'P2348', sourceField: field,
        associationType: 'associated',
        rawValue: `${periodQid} (${term.label})`,
        rawPrecision: 0,
        rank,
        span: {
          startYear: span.start,
          endYear: span.end,
          precision: 'period',
          qualifier: null,
          // The SOURCE's word, not Whilom's nearest registry name. A claim that
          // said "Middle Ages" must not come back reading "Medieval".
          label: term.label,
          derivation:
            `Wikidata time period (P2348) = ${periodQid} (${term.label}); classified ${term.classification}; ` +
            `${term.note}; years from the Whilom period registry, which is a navigation convention`,
          normaliserVersion: NORMALISER_VERSION,
        },
      });
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  // Deterministic order, so a rebuild produces byte-identical output and the
  // idempotency gate means something.
  claims.sort(
    (a, b) =>
      a.sourceRecordId.localeCompare(b.sourceRecordId) ||
      a.property.localeCompare(b.property) ||
      a.span.startYear - b.span.startYear ||
      a.span.endYear - b.span.endYear,
  );
  rejections.sort(
    (a, b) => a.sourceRecordId.localeCompare(b.sourceRecordId) || a.rawValue.localeCompare(b.rawValue),
  );

  const capture: TemporalCapture = {
    retrievedAt: new Date().toISOString(),
    endpoint: WIKIDATA_SPARQL_ENDPOINT,
    importerVersion: TEMPORAL_IMPORTER_VERSION,
    normaliserVersion: NORMALISER_VERSION,
    properties: TEMPORAL_PROPERTIES,
    claims,
    rejections,
    candidateRows,
    outsideRegion,
  };

  mkdirSync(TEMPORAL_CACHE_DIR, { recursive: true });
  writeFileSync(TEMPORAL_CACHE_FILE, JSON.stringify(capture, null, 2) + '\n');
  return capture;
}

/**
 * Summarise a capture for the build report.
 *
 * Reports by precision class deliberately: a single "dated" count would let
 * century-level evidence pass itself off as exact dating, which is the specific
 * dishonesty this batch is meant to remove.
 */
export function summariseCapture(capture: TemporalCapture) {
  const byPrecision: Record<string, number> = {};
  const byAssociation: Record<string, number> = {};
  const byRejection: Record<string, number> = {};
  for (const c of capture.claims) {
    byPrecision[c.span.precision] = (byPrecision[c.span.precision] ?? 0) + 1;
    byAssociation[c.associationType] = (byAssociation[c.associationType] ?? 0) + 1;
  }
  for (const r of capture.rejections) {
    byRejection[r.reason] = (byRejection[r.reason] ?? 0) + 1;
  }
  return {
    claims: capture.claims.length,
    places: new Set(capture.claims.map((c) => c.sourceRecordId)).size,
    byPrecision,
    byAssociation,
    rejections: capture.rejections.length,
    byRejection,
    candidateRows: capture.candidateRows,
    outsideRegion: capture.outsideRegion,
  };
}

export function readTemporalCapture(): TemporalCapture {
  return JSON.parse(readFileSync(TEMPORAL_CACHE_FILE, 'utf8')) as TemporalCapture;
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Emit the CSV the activation SQL loads.
 *
 * Every column the database needs to answer "why does Whilom believe this"
 * travels with the claim: the Wikidata item, the property it came from, the
 * value exactly as the source wrote it, the precision the source stated, and
 * the version of the rules that read it. None of that is reconstructible from
 * the years alone, which is the point.
 */
export function writeTemporalCsv(capture: TemporalCapture, outDir: string): void {
  const rows = capture.claims.map((c) =>
    [
      csvField(c.sourceRecordId),
      csvField(c.associationType),
      csvField(String(c.span.startYear)),
      csvField(String(c.span.endYear)),
      csvField(c.span.precision),
      csvField(c.span.qualifier ?? ''),
      csvField(c.span.label),
      csvField(c.rawValue),
      csvField(String(c.rawPrecision)),
      csvField(c.sourceField),
      csvField(c.qid),
      csvField(c.span.derivation),
      csvField(c.span.normaliserVersion),
      csvField(c.property),
      csvField(c.rank),
    ].join(','),
  );
  const rejected = capture.rejections.map((r) =>
    [
      csvField(r.sourceRecordId),
      csvField(r.rawValue),
      csvField(String(r.rawPrecision)),
      csvField(r.sourceField),
      csvField(r.reason),
      csvField(r.note),
    ].join(','),
  );
  writeFileSync(resolve(outDir, 'regional-temporal-wikidata.csv'), rows.join('\n') + (rows.length ? '\n' : ''));
  writeFileSync(resolve(outDir, 'regional-temporal-rejected.csv'), rejected.join('\n') + (rejected.length ? '\n' : ''));
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const run = async () => {
    // A cached capture is reused unless --refresh is passed, so a rebuild does
    // not hit a shared public endpoint for data it already has.
    const capture =
      existsSync(TEMPORAL_CACHE_FILE) && !process.argv.includes('--refresh')
        ? readTemporalCapture()
        : await captureTemporal();

    writeTemporalCsv(capture, process.cwd());
    const s = summariseCapture(capture);
    console.log(`candidate rows   ${s.candidateRows} (before the regional intersection)`);
    console.log(`outside region   ${s.outsideRegion}`);
    console.log(`claims           ${s.claims} across ${s.places} places`);
    console.log(`by precision     ${JSON.stringify(s.byPrecision)}`);
    console.log(`by association   ${JSON.stringify(s.byAssociation)}`);
    console.log(`quarantined      ${s.rejections} ${JSON.stringify(s.byRejection)}`);
    const digest = createHash('sha256').update(JSON.stringify(capture.claims)).digest('hex');
    console.log(`temporal digest  ${digest.slice(0, 16)}`);
  };
  run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
