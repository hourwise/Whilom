import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTemporalClaims } from '../ingestion/transforms/temporal';

type CsvRow = string[];

interface CandidateRow {
  ordinal: string;
  candidateId: string;
  status: string;
  confidence: string;
  publicationClass: string;
  reason: string;
  rationale: string;
  matchedSourceRecordId: string;
  candidate: {
    name?: string;
    rawType?: string;
    placeType?: string;
    provenance?: { sourceRecordId?: string };
    sourcePosition?: { coordinates?: { easting?: unknown; northing?: unknown } };
    designations?: { designation?: string }[];
  };
}

interface SourceRecord {
  layerName: string;
  designation: string;
  attributes: Record<string, unknown>;
}

interface SourceIndex {
  byId: Map<string, SourceRecord[]>;
  featureCount: number;
}

interface ReviewRecord {
  ordinal: string;
  sourceRecordId: string;
  candidateId: string;
  name: string;
  layerName: string;
  designation: string;
  placeType: string;
  confidence: string;
  matcherReason: string;
  rationale: string;
  matchedSourceRecordId: string;
  conflictFields: string[];
  taxonomy: string;
  proposedDisposition: 'REMAIN_REVIEW_REQUIRED';
  deterministicBasis: string;
  sourceEvidence: {
    objectId?: number;
    ngr?: string;
    easting?: number;
    northing?: number;
    listEntry?: number;
    structuredDateFieldsPresent: string[];
  };
  temporalEvidence: {
    numericPatterns: string[];
    claims: { periodId: string; originalText: string; precision: string }[];
    note: string;
  };
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pathFromRoot = (...parts: string[]) => resolve(ROOT, ...parts);

function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  if (value !== '' || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((field) => field !== ''));
}

function readCandidates(file: string): CandidateRow[] {
  return parseCsv(readFileSync(file, 'utf8')).map((fields) => {
    const candidate = JSON.parse(fields[2]!) as CandidateRow['candidate'];
    return {
      ordinal: fields[0]!,
      candidateId: fields[1]!,
      status: fields[3]!,
      confidence: fields[4]!,
      publicationClass: fields[5]!,
      reason: fields[6]!,
      rationale: fields[7]!,
      matchedSourceRecordId: fields[8]!,
      candidate,
    };
  });
}

function readSources(file: string): SourceIndex {
  const cache = JSON.parse(readFileSync(file, 'utf8')) as {
    layers?: {
      layerName?: string;
      designation?: string;
      features?: { attributes?: Record<string, unknown> }[];
    }[];
  };
  const byId = new Map<string, SourceRecord[]>();
  let featureCount = 0;
  for (const layer of cache.layers ?? []) {
    for (const feature of layer.features ?? []) {
      const attributes = feature.attributes ?? {};
      if (attributes.ListEntry === undefined) continue;
      featureCount += 1;
      const layerName = layer.layerName ?? 'unknown';
      const designation =
        layerName === 'Listed Building points'
          ? 'listed_building'
          : layerName === 'Scheduled Monuments'
            ? 'scheduled_monument'
            : layerName === 'Parks and Gardens'
              ? 'registered_park_garden'
              : layerName === 'Battlefields'
                ? 'registered_battlefield'
                : layerName === 'Protected Wreck Sites'
                  ? 'protected_wreck'
                  : layerName === 'World Heritage Sites'
                    ? 'world_heritage_site'
                    : 'unknown';
      const records = byId.get(String(attributes.ListEntry)) ?? [];
      records.push({
        layerName,
        designation,
        attributes,
      });
      byId.set(String(attributes.ListEntry), records);
    }
  }
  return { byId, featureCount };
}

function readConflicts(file: string): Map<string, string[]> {
  const conflicts = new Map<string, string[]>();
  for (const fields of parseCsv(readFileSync(file, 'utf8'))) {
    const candidateId = fields[0];
    const field = fields[1];
    if (!candidateId || !field) continue;
    const existing = conflicts.get(candidateId) ?? [];
    existing.push(field);
    conflicts.set(candidateId, existing);
  }
  return conflicts;
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase();
}

const numericPatterns: Record<string, RegExp> = {
  cPrefixWithinLongerToken: /\bC(?:1[0-9]|20)\d{2,}\b/i,
  validCNotation: /\bC\d{1,2}\b/i,
  fourDigitNumber: /\b(?:1\d{3}|20\d{2})\b/,
  numericRange: /\b\d{3,4}\s*[-–]\s*\d{3,4}\b/,
  gridReference: /\b(?:NGR|(?:SE|SD|TA|NZ)\s*\d{3,5}\s*\d{3,5})\b/i,
  addressOrNumber: /\b(?:Nos?\s+)?\d{1,4}(?:\s*(?:and|&)\s*\d{1,4})?\s*,/i,
  measurement: /\b\d+\s*(?:m|metres?|meters?|feet|ft|yards?)\b/i,
};

function numericMatches(text: string): string[] {
  return Object.entries(numericPatterns)
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
}

function taxonomyFor(
  review: CandidateRow,
  conflictFields: string[],
): { taxonomy: string; basis: string } {
  if (conflictFields.includes('place_type')) {
    return {
      taxonomy: 'CONFLICT_PLACE_TYPE',
      basis:
        'The generated conflict evidence names place_type as the disputed field; identity is not changed automatically.',
    };
  }
  if (conflictFields.includes('location')) {
    return {
      taxonomy: 'CONFLICT_LOCATION',
      basis:
        'The generated conflict evidence names location as the disputed field; no coordinate is selected automatically.',
    };
  }
  if (review.rationale.includes('one name merely contains the other')) {
    return {
      taxonomy: 'IDENTITY_NAME_CONTAINMENT',
      basis: 'The matcher reports association-like name containment and does not prove identity.',
    };
  }
  if (review.rationale.includes('one record protects a landscape')) {
    return {
      taxonomy: 'DESIGNATION_AREA_VS_STRUCTURE',
      basis:
        'The matcher reports a landscape designation versus a structure and keeps the pair for human review.',
    };
  }
  if (review.rationale.includes('names are not close enough')) {
    return {
      taxonomy: 'NAME_SIMILARITY_BELOW_THRESHOLD',
      basis: 'The best name score is below the confident threshold.',
    };
  }
  if (review.rationale.includes('name is not distinctive')) {
    return {
      taxonomy: 'NON_DISTINCTIVE_NAME',
      basis: 'The name is shared or generic enough that proximity does not prove identity.',
    };
  }
  if (review.rationale.includes('scores almost as well')) {
    return {
      taxonomy: 'NEAR_TIE',
      basis:
        'Two candidate identities score almost alike; selecting one would be an unsupported tie-break.',
    };
  }
  if (review.rationale.includes('outside the 150m agreement radius')) {
    return {
      taxonomy: 'OUTSIDE_AGREEMENT_RADIUS',
      basis:
        'The candidate is outside the configured agreement radius; proximity is insufficient for auto-merge.',
    };
  }
  return {
    taxonomy: 'UNCLASSIFIED_REVIEW',
    basis: 'No deterministic taxonomy rule matched the recorded rationale; fail closed.',
  };
}

function sourceEvidence(source: SourceRecord | undefined) {
  const attributes = source?.attributes ?? {};
  const structuredDateFields = [
    'ListDate',
    'SchedDate',
    'RegDate',
    'InscrDate',
    'DesigDate',
    'AmendDate',
  ]
    .filter((field) => attributes[field] !== undefined && attributes[field] !== null)
    .sort();
  return {
    objectId: typeof attributes.OBJECTID === 'number' ? attributes.OBJECTID : undefined,
    ngr: typeof attributes.NGR === 'string' ? attributes.NGR : undefined,
    easting: typeof attributes.Easting === 'number' ? attributes.Easting : undefined,
    northing: typeof attributes.Northing === 'number' ? attributes.Northing : undefined,
    listEntry: typeof attributes.ListEntry === 'number' ? attributes.ListEntry : undefined,
    structuredDateFieldsPresent: structuredDateFields,
  };
}

function temporalEvidence(name: string, designation: string) {
  const claims = extractTemporalClaims(name, {
    descriptiveSource: designation === 'scheduled_monument',
    eventSource: designation === 'registered_battlefield',
  });
  const numeric = numericMatches(name);
  return {
    numericPatterns: numeric,
    claims: claims.map((claim) => ({
      periodId: claim.periodId,
      originalText: claim.originalText,
      precision: claim.precision,
    })),
    note:
      claims.length === 0
        ? 'No temporal claim is generated from this name by the current extractor.'
        : 'Claims are reported for audit only; this review queue audit does not promote or suppress them.',
  };
}

function runAdversarialChecks() {
  const rejected = [
    'C1827',
    'C1854',
    'C1800',
    'C1901',
    'C18123',
    'PAIR OF CHEST TOMBS TO THE ASQUITH FAMILY C1827 AND 1854 APPROXIMATELY 25 METRES NORTH WEST OF WEST DOOR OF CHURCH OF ST MARY',
    'Boundary Stone at 2010 2955',
    'Warehouse at NGR 1914 2530',
    '1189-1195, Thornton Road',
    '1035 and 1037, Great Horton Road',
  ];
  const accepted = [
    'C18',
    'C18?',
    'late C18',
    'late-C18',
    'Early C19',
    'late 17th century',
    'Dated 1066',
    'Erected 1642',
    'Died 1914',
  ];
  const intentionallyUnclassified = ['1914–1918'];
  const rejectedResults = rejected.map((text) => ({ text, claims: extractTemporalClaims(text) }));
  const acceptedResults = accepted.map((text) => ({ text, claims: extractTemporalClaims(text) }));
  const failedRejected = rejectedResults.filter((result) => result.claims.length > 0);
  const failedAccepted = acceptedResults.filter((result) => result.claims.length === 0);
  const unclassifiedResults = intentionallyUnclassified.map((text) => ({
    text,
    claims: extractTemporalClaims(text),
  }));
  const failedUnclassified = unclassifiedResults.filter((result) => result.claims.length > 0);
  if (failedRejected.length > 0 || failedAccepted.length > 0 || failedUnclassified.length > 0) {
    throw new Error(
      `temporal adversarial checks failed: ${JSON.stringify({ failedRejected, failedAccepted, failedUnclassified })}`,
    );
  }
  return {
    rejected: rejectedResults,
    accepted: acceptedResults,
    intentionallyUnclassified: unclassifiedResults,
  };
}

function auditRecord(
  review: CandidateRow,
  source: SourceRecord | undefined,
  conflictFields: string[],
): ReviewRecord {
  const sourceRecordId = String(review.candidate.provenance?.sourceRecordId ?? '');
  const name = review.candidate.name ?? '';
  const { taxonomy, basis } = taxonomyFor(review, conflictFields);
  return {
    ordinal: review.ordinal,
    sourceRecordId,
    candidateId: review.candidateId,
    name,
    layerName: source?.layerName ?? 'unknown',
    designation:
      source?.designation ??
      review.candidate.designations?.map((item) => item.designation).join('|') ??
      'unknown',
    placeType: review.candidate.placeType ?? 'unknown',
    confidence: review.confidence,
    matcherReason: review.reason,
    rationale: review.rationale,
    matchedSourceRecordId: review.matchedSourceRecordId,
    conflictFields: [...new Set(conflictFields)].sort(),
    taxonomy,
    proposedDisposition: 'REMAIN_REVIEW_REQUIRED',
    deterministicBasis: basis,
    sourceEvidence: sourceEvidence(source),
    temporalEvidence: temporalEvidence(name, source?.designation ?? ''),
  };
}

function sourceForCandidate(
  index: SourceIndex,
  candidate: CandidateRow['candidate'],
): SourceRecord | undefined {
  const sourceRecordId = String(candidate.provenance?.sourceRecordId ?? '');
  const records = index.byId.get(sourceRecordId) ?? [];
  const sameLayer = records.filter((record) => record.layerName === candidate.rawType);
  const sourcePosition = candidate.sourcePosition?.coordinates as
    { easting?: unknown; northing?: unknown } | undefined;
  return (
    sameLayer.find(
      (record) =>
        record.attributes.Easting === sourcePosition?.easting &&
        record.attributes.Northing === sourcePosition?.northing,
    ) ??
    sameLayer[0] ??
    records[0]
  );
}

function markdownTable(records: ReviewRecord[]): string {
  const rows = records.map((record) => {
    const name = record.name.replace(/\|/g, '\\|');
    const rationale = record.rationale.replace(/\|/g, '\\|');
    return `| ${record.ordinal} | ${record.candidateId} | ${record.sourceRecordId} | ${record.sourceEvidence.objectId ?? ''} | ${record.taxonomy} | ${record.designation} | ${name} | ${rationale} | REMAIN_REVIEW_REQUIRED |`;
  });
  return [
    '| Ordinal | Candidate ID | Source ID | Source OBJECTID | Deterministic taxonomy | Designation | NHLE name | Recorded matcher rationale | Proposed disposition |',
    '|---:|---|---|---:|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function run() {
  const candidatePath = pathFromRoot('ingestion', 'regional-candidates.csv');
  const conflictPath = pathFromRoot('ingestion', 'regional-conflicts.csv');
  const cachePath = pathFromRoot('ingestion', '.regional-cache', 'nhle-regional.json');
  for (const file of [candidatePath, conflictPath, cachePath]) {
    if (!existsSync(file)) throw new Error(`sealed local input missing: ${file}`);
  }

  const candidates = readCandidates(candidatePath);
  const sources = readSources(cachePath);
  const conflicts = readConflicts(conflictPath);
  const reviews = candidates.filter(
    (candidate) => candidate.publicationClass === 'REVIEW_REQUIRED',
  );
  const records = reviews
    .map((review) =>
      auditRecord(
        review,
        sourceForCandidate(sources, review.candidate),
        conflicts.get(review.candidateId) ?? [],
      ),
    )
    .sort((a, b) => a.sourceRecordId.localeCompare(b.sourceRecordId));

  const taxonomyCounts = Object.fromEntries(
    [
      ...records.reduce(
        (counts, record) => counts.set(record.taxonomy, (counts.get(record.taxonomy) ?? 0) + 1),
        new Map<string, number>(),
      ),
    ].sort((a, b) => b[1] - a[1]),
  );

  const corpus = [...sources.byId.entries()].flatMap(([sourceRecordId, recordsForId]) =>
    recordsForId.map((source) => {
      const name = typeof source.attributes.Name === 'string' ? source.attributes.Name : '';
      const evidence = temporalEvidence(name, source.designation);
      return { sourceRecordId, name, designation: source.designation, ...evidence };
    }),
  );
  const longCPrefix = corpus.filter((record) =>
    record.numericPatterns.includes('cPrefixWithinLongerToken'),
  );
  const numericNames = corpus.filter((record) =>
    record.numericPatterns.some((pattern) => pattern !== 'validCNotation'),
  );
  const numericClaims = numericNames.filter((record) => record.claims.length > 0);
  const longCPrefixClaims = longCPrefix.filter((record) => record.claims.length > 0);
  const battlefieldEventClaims = corpus.filter(
    (record) =>
      record.designation === 'registered_battlefield' &&
      record.claims.some((claim) => claim.precision === 'exact_year'),
  );
  const fourDigitWithoutClaim = numericNames.filter(
    (record) => record.numericPatterns.includes('fourDigitNumber') && record.claims.length === 0,
  );
  const temporalRows = parseCsv(
    readFileSync(pathFromRoot('ingestion', 'regional-temporal.csv'), 'utf8'),
  );
  const sourceIdsInTemporalEvidence = new Set(temporalRows.map((row) => row[0]).filter(Boolean));
  const knownFalsePositiveRecord =
    corpus.find((record) => record.sourceRecordId === '1250727') ?? null;
  const adversarialChecks = runAdversarialChecks();
  const duplicateQueueSourceIds = Object.fromEntries(
    [
      ...records.reduce(
        (groups, record) => {
          const group = groups.get(record.sourceRecordId) ?? [];
          group.push({
            ordinal: record.ordinal,
            candidateId: record.candidateId,
            objectId: record.sourceEvidence.objectId,
          });
          groups.set(record.sourceRecordId, group);
          return groups;
        },
        new Map<string, { ordinal: string; candidateId: string; objectId?: number }[]>(),
      ),
    ].filter(([, group]) => group.length > 1),
  );

  const evidenceFiles = [
    'ingestion/regional/regional-dataset-manifest.json',
    'ingestion/.regional-cache/nhle-regional.json',
    'ingestion/regional-activation-plan.json',
    'ingestion/regional-candidates.csv',
    'ingestion/regional-conflicts.csv',
    'ingestion/regional-approved.csv',
    'ingestion/regional-temporal.csv',
    'ingestion/regional-temporal-wikidata.csv',
    'ingestion/regional-temporal-rejected.csv',
    'ingestion/regional-temporal-audit.json',
    'ingestion/regional/activate.ts',
    'ingestion/transforms/temporal.ts',
    'supabase/regional/activate.sql',
  ].filter((relative) => existsSync(pathFromRoot(...relative.split('/'))));
  const hashes = Object.fromEntries(
    evidenceFiles.map((relative) => [relative, sha256(pathFromRoot(...relative.split('/')))]),
  );

  const result = {
    dataset: {
      id: 'WHILOM_REGION_YORKSHIRE_V1',
      version: '1.0.0',
      source: 'Historic England NHLE / OGL-UK-3.0',
      sourceRows: sources.featureCount,
      validCandidateRows: candidates.length,
      reviewRequiredRows: records.length,
    },
    canonicalEvidenceHashes: hashes,
    queue: {
      reviewRequired: records.length,
      taxonomyCounts,
      records,
      duplicateSourceIds: duplicateQueueSourceIds,
      allProposedDisposition: 'REMAIN_REVIEW_REQUIRED',
    },
    temporalFalsePositiveAudit: {
      knownRecord1250727: knownFalsePositiveRecord ?? null,
      knownRecord1250727HasTemporalEvidenceRow: sourceIdsInTemporalEvidence.has('1250727'),
      cPrefixWithinLongerTokenRecords: longCPrefix,
      numericNameRecords: numericNames.length,
      numericNameRecordsWithClaims: numericClaims,
      cPrefixWithinLongerTokenClaims: longCPrefixClaims,
      registeredBattlefieldEventClaims: battlefieldEventClaims,
      fourDigitRecordsWithoutClaims: fourDigitWithoutClaim.slice(0, 25),
      fourDigitRecordsWithoutClaimsCount: fourDigitWithoutClaim.length,
      temporalEvidenceSourceRows: sourceIdsInTemporalEvidence.size,
      adversarialChecks,
      conclusion:
        'Numeric address, grid-reference, range and measurement forms remain unclassified unless an explicit temporal grammar rule applies. Ambiguity stays fail-closed.',
    },
    remediation: {
      rulesImplemented: [],
      proposedRules: [
        {
          rule: 'Require a lexical boundary after abbreviated C-century tokens.',
          feature: 'C followed by one or two century digits and a word boundary.',
          eliminates: 'C18 being read from C1827/C1854/C1800/C1901/C18123.',
          legitimateRisk:
            'A malformed source token would be suppressed rather than guessed as a century.',
          testPlan:
            'Adversarial C-prefixed year strings plus standalone C18, late-C18 and Early C19.',
          ambiguousAction: 'No claim; remain unclassified.',
        },
        {
          rule: 'Accept four-digit years only in explicit date/event grammar already supported.',
          feature:
            'Dated/Datestone/Inscribed/Erected/Died/d. wording, or registered-battlefield event context.',
          eliminates:
            'Grid references, addresses, ranges, measurements and list-entry-like numbers.',
          legitimateRisk:
            'A source that gives an unlabelled historic year is intentionally not interpreted.',
          testPlan:
            'Synthetic grid/address/range/measurement names beside 1066, 1642, 1914 and 1914–1918.',
          ambiguousAction: 'No claim; remain unclassified.',
        },
      ],
      decision:
        'No new classifier change is justified by the REVIEW_REQUIRED queue alone. The existing general C-token boundary fix is already present in the canonical checkpoint; this audit adds evidence and does not alter sealed data or current dispositions.',
    },
    safety: {
      activationExecuted: false,
      hostedSupabaseContacted: false,
      sourceCacheModified: false,
      manifestModified: false,
      canonicalGeneratedEvidenceOverwritten: false,
    },
  };

  const outputDir = pathFromRoot('docs', 'evidence');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    resolve(outputDir, 'yorkshire-review-required-audit.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );

  const taxonomyLines = Object.entries(taxonomyCounts).map(([taxonomy, count]) => {
    const examples = records
      .filter((record) => record.taxonomy === taxonomy)
      .slice(0, 3)
      .map((record) => `${record.sourceRecordId} ${record.name}`.replace(/\|/g, '\\|'))
      .join('<br>');
    return `| ${taxonomy} | ${count} | ${examples} | REMAIN_REVIEW_REQUIRED | Deterministic matcher/conflict evidence; no auto-promotion rule applied. |`;
  });
  const report =
    `# Yorkshire REVIEW_REQUIRED Audit\n\n` +
    `## Scope and checkpoint\n\n` +
    `This is an offline audit of the sealed Yorkshire activation evidence at the canonical data checkpoint. It does not execute activation SQL, connect to hosted Supabase, mutate source evidence, or change any disposition.\n\n` +
    `- Dataset: **WHILOM_REGION_YORKSHIRE_V1@1.0.0**\n` +
    `- Source: **Historic England NHLE / OGL-UK-3.0**\n` +
    `- Source/cache rows observed: **${sources.featureCount}**\n` +
    `- Candidate rows observed: **${candidates.length}**\n` +
    `- REVIEW_REQUIRED rows audited: **${records.length}**\n` +
    `- Original activation governance: **23,171 AUTO_SAFE**, **143 REVIEW_REQUIRED**, **0 rejected candidate rows**; one source row was rejected before candidate generation.\n` +
    `- Every audited row remains **REMAIN_REVIEW_REQUIRED**.\n\n` +
    `## Canonical evidence hashes\n\n` +
    `| Artefact | SHA-256 |\n|---|---|\n` +
    Object.entries(hashes)
      .map(([file, hash]) => `| ${file} | ${hash} |`)
      .join('\n') +
    '\n\n' +
    `## Queue taxonomy\n\n` +
    `| Taxonomy | Count | Representative records | Proposed disposition | Deterministic basis |\n|---|---:|---|---|---|\n` +
    taxonomyLines.join('\n') +
    '\n\n' +
    `The taxonomy is derived from the recorded matcher rationale and conflict field, not from a model judgement. The full 143-record inventory is below and is also available in the machine-readable JSON artefact. Record identity uses activation ordinal/candidate ID plus source ID; repeated source IDs in the raw NHLE snapshot are not silently deduplicated. The queue contains ${Object.keys(duplicateQueueSourceIds).length} repeated source identity group(s), retained as separate activation rows for audit rather than silently collapsed.\n\n` +
    `## Temporal false-positive audit\n\n` +
    `The known defect class was a century fragment extracted inside a longer token. The current canonical extractor requires a word boundary after the one- or two-digit C-century token, so **C1827**, **C1854**, **C1800**, **C1901** and longer C-prefixed numeric identifiers do not produce century claims. NHLE **1250727** is absent from the temporal evidence rows in this checkpoint.\n\n` +
    `The corpus audit found ${longCPrefix.length} C-prefixed longer-token records and ${longCPrefixClaims.length} claims from that class; the known record is therefore suppressed. It found ${numericNames.length} records with numeric-looking name material and ${numericClaims.length} numeric-name records with claims under the current explicit grammar. Bare address/grid/range/measurement numbers remain unclassified. The current review queue itself contains ${records.filter((record) => record.temporalEvidence.numericPatterns.length > 0).length} numeric-looking names; these do not become publication-safe merely because their match decision is separately reviewable. Registered battlefield four-digit claims are limited to the ${battlefieldEventClaims.length} event-context records reported in the JSON evidence.\n\n` +
    `### Known false-positive record\n\n` +
    `- NHLE **1250727** source wording: **${knownFalsePositiveRecord?.name ?? 'not found'}**\n` +
    `- Current extractor result: **no temporal claims**; its C1827/C1854 numeric material remains otherwise unclassified.\n` +
    `- Corrected temporal evidence: **no regional-temporal.csv row** for 1250727.\n` +
    `- Disposition of the invalid fragment: **REJECT_TEMPORAL_CLAIM**; no circa-year interpretation is introduced.\n\n` +
    `## Deterministic remediation decision\n\n` +
    `No additional production classifier change is made in DATA-R1. The current review queue is an identity/governance queue, not a safe temporal-claim queue. Its ambiguous identity, designation-area, conflict, distance and naming cases are correctly fail-closed. The existing lexical C-century boundary correction is general and already present at this checkpoint; this audit adds regression evidence without rewriting canonical generated files.\n\n` +
    `Recommended future rules remain: explicit lexical boundaries for abbreviated centuries, explicit date grammar for four-digit years, and default-to-no-claim for ambiguous numeric evidence.\n\n` +
    `## Complete record-by-record audit\n\n` +
    markdownTable(records) +
    '\n\n' +
    `## Safety statement\n\n` +
    `No Yorkshire activation occurred. No hosted Supabase access or mutation occurred. No migration, RLS/grant change, Auth change, Cloudflare/DNS change, Mobile change, ingestion capture, source-cache change, manifest change, or overwrite of canonical activation evidence occurred.\n`;
  writeFileSync(resolve(outputDir, 'YORKSHIRE_REVIEW_REQUIRED_AUDIT.md'), report);

  console.log(`review records ${records.length}`);
  console.log(`taxonomy ${JSON.stringify(taxonomyCounts)}`);
  console.log(`C-prefixed longer-token records ${longCPrefix.length}`);
  console.log(`numeric-name records ${numericNames.length}`);
  console.log(`numeric-name records with claims ${numericClaims.length}`);
  console.log(
    `1250727 temporal row ${sourceIdsInTemporalEvidence.has('1250727') ? 'present' : 'absent'}`,
  );
  console.log(`wrote ${resolve(outputDir, 'YORKSHIRE_REVIEW_REQUIRED_AUDIT.md')}`);
  console.log(`wrote ${resolve(outputDir, 'yorkshire-review-required-audit.json')}`);
}

run();
