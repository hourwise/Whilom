import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

type CsvRow = string[];

type Disposition =
  | 'APPROVE_MATCH'
  | 'REJECT_MATCH'
  | 'KEEP_SEPARATE_CANONICAL'
  | 'DEFER_INSUFFICIENT_EVIDENCE';

interface Candidate {
  provenance?: {
    sourceId?: string;
    sourceRecordId?: string;
    originalUrl?: string;
    licence?: string;
    attribution?: string;
  };
  name?: string;
  placeType?: string;
  rawType?: string;
  location?: { lng?: number; lat?: number };
  sourcePosition?: { coordinates?: { easting?: number; northing?: number } };
  designations?: { designation?: string }[];
}

interface CandidateRow {
  ordinal: string;
  candidateId: string;
  candidate: Candidate;
  status: string;
  confidence: string;
  publicationClass: string;
  reason: string;
  rationale: string;
  matchedSourceRecordId: string;
}

interface SourceRecord {
  layerName: string;
  designation: string;
  attributes: Record<string, unknown>;
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

interface AuditDocument {
  dataset: {
    sourceRows: number;
    validCandidateRows: number;
    reviewRequiredRows: number;
  };
  canonicalEvidenceHashes: Record<string, string>;
  queue: {
    records: ReviewRecord[];
    duplicateSourceIds: Record<string, { ordinal: string; candidateId: string; objectId?: number }[]>;
  };
}

interface ConflictEvidence {
  field: string;
  existing: string;
  candidate: string;
}

const workingDirectory = resolve(process.cwd());
const ROOT = basename(workingDirectory) === 'ingestion' ? resolve(workingDirectory, '..') : workingDirectory;
const fromRoot = (...parts: string[]) => resolve(ROOT, ...parts);
const outputDir = fromRoot('docs', 'evidence');
const decisionBatchId = 'DATA-R2-YORKSHIRE-REVIEW-32810D388A33';

const sealedHashes: Record<string, string> = {
  'ingestion/regional/regional-dataset-manifest.json':
    '7F620A6F60F7337D07842B776F79CFE23755612EB933BE0155B854AB92AB1513',
  'ingestion/.regional-cache/nhle-regional.json':
    '23FFFA87082EBD6B60C44C1FA89DAC3ECFD8EFC0B65EAF665170F4B0654A69A2',
  'ingestion/regional-activation-plan.json':
    '0201857D6391766F5CC4CFE3A994E5E1A01EFD716F3DA5C1F33EE52BECC11466',
  'ingestion/regional-candidates.csv':
    'A31A870C9F769C48CB58260EE766F35048DEE9E89FC2A48BC16E246EE2DA7C00',
  'ingestion/regional-conflicts.csv':
    'A317087EB292BF4A36E0360ACC449EA1807E9F0164B78A0118B356019645188C',
  'ingestion/regional-approved.csv':
    'FE7FBEDECF472C0DEC0D22DBCB0CC8C6883D210AB97CC124D79D6DC04A4F862A',
  'ingestion/regional-temporal.csv':
    'BBB8D6C04CE24A0A04ED6ABCAC30ADCAB43F2939DE7A86C5AA4FCAD10C2B3D16',
  'ingestion/regional-temporal-wikidata.csv':
    'E353015177EF412DFEBB7AD0A8537E14A34F61CCDAC042C47AB712B2EE58DB8A',
  'ingestion/regional-temporal-rejected.csv':
    'F13F9633F501490F250DA217AAC4EA9264BBE35470308C70D84970CD0B64D052',
  'ingestion/regional-temporal-audit.json':
    'EAFD855DC806C1802469D239A20C421DB15E21B076D72E48ACDCED6A56A50108',
  'ingestion/regional/activate.ts':
    '5E17C7A6039954750B96333CA13A9A1AF2B21BB364ADF45B5CFFD5A4FA511C50',
  'ingestion/transforms/temporal.ts':
    'D501699CFF7D1D77AB7377CCED68129903DD2BA1195B8E7754AB5E906CB57D13',
  'supabase/regional/activate.sql':
    '692E881B230CF939092E29D2048BBCD77C4A7EFE6952E507DF211037CC935858',
};

const dataR1Hashes = {
  markdown: '9D4D7D73018C32B5795363EBC238A14FA616E8A58378FCB8CDAC72A251D1A3CB',
  json: '958C4CE6725D508CD7E7D4503CE49E2EB0D1E4F31387A4D2637E7A6B58D83BFD',
};

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
  if (value !== '' || row.length > 0) row.push(value);
  return rows.filter((candidate) => candidate.some((field) => field !== ''));
}

function readCandidates(file: string): CandidateRow[] {
  return parseCsv(readFileSync(file, 'utf8')).map((fields) => ({
    ordinal: fields[0]!,
    candidateId: fields[1]!,
    candidate: JSON.parse(fields[2]!) as Candidate,
    status: fields[3]!,
    confidence: fields[4]!,
    publicationClass: fields[5]!,
    reason: fields[6]!,
    rationale: fields[7]!,
    matchedSourceRecordId: fields[8]!,
  }));
}

function readSources(file: string): Map<string, SourceRecord[]> {
  const cache = JSON.parse(readFileSync(file, 'utf8')) as {
    layers?: { layerName?: string; features?: { attributes?: Record<string, unknown> }[] }[];
  };
  const result = new Map<string, SourceRecord[]>();
  for (const layer of cache.layers ?? []) {
    for (const feature of layer.features ?? []) {
      const attributes = feature.attributes ?? {};
      if (attributes.ListEntry === undefined) continue;
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
      const key = String(attributes.ListEntry);
      const records = result.get(key) ?? [];
      records.push({ layerName, designation, attributes });
      result.set(key, records);
    }
  }
  return result;
}

function readConflicts(file: string): Map<string, ConflictEvidence[]> {
  const result = new Map<string, ConflictEvidence[]>();
  for (const fields of parseCsv(readFileSync(file, 'utf8'))) {
    if (!fields[0] || !fields[1]) continue;
    const values = result.get(fields[0]) ?? [];
    values.push({ field: fields[1], existing: fields[2] ?? '', candidate: fields[3] ?? '' });
    result.set(fields[0], values);
  }
  return result;
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase();
}

function assertSealedInputs(audit: AuditDocument): Record<string, string> {
  const auditMarkdown = fromRoot('docs', 'evidence', 'YORKSHIRE_REVIEW_REQUIRED_AUDIT.md');
  const auditJson = fromRoot('docs', 'evidence', 'yorkshire-review-required-audit.json');
  if (sha256(auditMarkdown) !== dataR1Hashes.markdown || sha256(auditJson) !== dataR1Hashes.json) {
    throw new Error('DATA-R1 derived evidence hash mismatch; refusing governed review generation');
  }
  const current: Record<string, string> = {};
  for (const [relative, expected] of Object.entries(sealedHashes)) {
    const absolute = fromRoot(...relative.split('/'));
    if (!existsSync(absolute)) throw new Error(`sealed input missing: ${relative}`);
    const actual = sha256(absolute);
    current[relative] = actual;
    if (actual !== expected) throw new Error(`sealed input hash mismatch: ${relative}`);
    if (audit.canonicalEvidenceHashes[relative] !== expected) {
      throw new Error(`DATA-R1 hash map mismatch: ${relative}`);
    }
  }
  return current;
}

function sourceForCandidate(
  sources: Map<string, SourceRecord[]>,
  candidate: Candidate | undefined,
): SourceRecord | undefined {
  if (!candidate) return undefined;
  const sourceRecordId = String(candidate.provenance?.sourceRecordId ?? '');
  const records = sources.get(sourceRecordId) ?? [];
  const sameLayer = records.filter((record) => record.layerName === candidate.rawType);
  const easting = candidate.sourcePosition?.coordinates?.easting;
  const northing = candidate.sourcePosition?.coordinates?.northing;
  return (
    sameLayer.find(
      (record) => record.attributes.Easting === easting && record.attributes.Northing === northing,
    ) ?? sameLayer[0] ?? records[0]
  );
}

function designationOf(candidate: Candidate | undefined): string {
  return candidate?.designations?.map((item) => item.designation).filter(Boolean).join('|') || 'unknown';
}

function distanceMeters(a: Candidate | undefined, b: Candidate | undefined): number | null {
  const lat1 = a?.location?.lat;
  const lon1 = a?.location?.lng;
  const lat2 = b?.location?.lat;
  const lon2 = b?.location?.lng;
  if (![lat1, lon1, lat2, lon2].every((value) => typeof value === 'number')) return null;
  const earthRadius = 6_371_000;
  const radians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = radians(lat2! - lat1!);
  const deltaLon = radians(lon2! - lon1!);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(lat1!)) * Math.cos(radians(lat2!)) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

function coordinates(candidate: Candidate | undefined) {
  if (!candidate?.location) return null;
  return { lat: candidate.location.lat ?? null, lng: candidate.location.lng ?? null };
}

function chooseMatchedCandidate(
  candidatesBySource: Map<string, CandidateRow[]>,
  sourceRecordId: string,
): CandidateRow | undefined {
  return [...(candidatesBySource.get(sourceRecordId) ?? [])].sort((a, b) => {
    const approved = Number(b.publicationClass === 'AUTO_SAFE') - Number(a.publicationClass === 'AUTO_SAFE');
    return approved || Number(a.ordinal) - Number(b.ordinal);
  })[0];
}

function decisionFor(
  record: ReviewRecord,
  sourceCandidate: CandidateRow | undefined,
  matchedCandidate: CandidateRow | undefined,
  duplicate: boolean,
): { disposition: Disposition; rationale: string; confidence: string } {
  if (duplicate) {
    return {
      disposition: 'DEFER_INSUFFICIENT_EVIDENCE',
      confidence: 'INSUFFICIENT_DUE_TO_SOURCE_DUPLICATE',
      rationale:
        'The sealed source evidence contains the same source ID and OBJECTID on two activation rows. The rows are retained independently, but identity is not decided until the duplicate-source anomaly is resolved outside this review pass.',
    };
  }
  if (record.taxonomy === 'IDENTITY_NAME_CONTAINMENT') {
    const sourceDesignation = record.designation;
    const matchedDesignation = designationOf(matchedCandidate?.candidate);
    if (sourceDesignation !== matchedDesignation) {
      return {
        disposition: 'KEEP_SEPARATE_CANONICAL',
        confidence: 'HIGH_FOR_SEPARATION',
        rationale:
          `The matcher explicitly records association-like name containment rather than identity. The source is a ${sourceDesignation} record while the proposed canonical is ${matchedDesignation}; these are distinct source designations and the source record is retained as a separate canonical candidate. No merge is approved.`,
      };
    }
  }
  if (record.taxonomy === 'DESIGNATION_AREA_VS_STRUCTURE') {
    return {
      disposition: 'KEEP_SEPARATE_CANONICAL',
      confidence: 'HIGH_FOR_SEPARATION',
      rationale:
        'The matcher explicitly records a designated landscape/area versus a structure. The review preserves the area and structure as separate canonical candidates rather than merging a wider designation into a single building record.',
    };
  }
  if (record.taxonomy === 'CONFLICT_LOCATION' || record.taxonomy === 'CONFLICT_PLACE_TYPE') {
    return {
      disposition: 'REJECT_MATCH',
      confidence: 'HIGH_FOR_REJECTION',
      rationale:
        `The sealed conflict evidence marks ${record.conflictFields.join(', ') || 'a material field'} and the matcher states that the source and proposed candidate disagree. The proposed match is rejected; no replacement identity is inferred in this pass.`,
    };
  }
  return {
    disposition: 'DEFER_INSUFFICIENT_EVIDENCE',
    confidence: 'INSUFFICIENT',
    rationale:
      'The captured evidence is not sufficient to distinguish identity from a nearby or similarly named place without introducing a new threshold or external evidence. The row remains deferred fail-closed.',
  };
}

function escapeMarkdown(value: unknown): string {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function run() {
  const audit = JSON.parse(
    readFileSync(fromRoot('docs', 'evidence', 'yorkshire-review-required-audit.json'), 'utf8'),
  ) as AuditDocument;
  const verifiedSealedHashes = assertSealedInputs(audit);
  const candidates = readCandidates(fromRoot('ingestion', 'regional-candidates.csv'));
  const sources = readSources(fromRoot('ingestion', '.regional-cache', 'nhle-regional.json'));
  const conflicts = readConflicts(fromRoot('ingestion', 'regional-conflicts.csv'));
  const candidatesBySource = new Map<string, CandidateRow[]>();
  for (const candidate of candidates) {
    const sourceRecordId = String(candidate.candidate.provenance?.sourceRecordId ?? '');
    const rows = candidatesBySource.get(sourceRecordId) ?? [];
    rows.push(candidate);
    candidatesBySource.set(sourceRecordId, rows);
  }

  const reviewRecords = [...audit.queue.records].sort((a, b) => Number(a.ordinal) - Number(b.ordinal));
  if (reviewRecords.length !== 143 || audit.dataset.reviewRequiredRows !== 143) {
    throw new Error(`expected exactly 143 DATA-R1 review rows, found ${reviewRecords.length}`);
  }
  const actualReviews = candidates.filter((candidate) => candidate.publicationClass === 'REVIEW_REQUIRED');
  const actualReviewIds = new Set(actualReviews.map((candidate) => candidate.candidateId));
  const auditReviewIds = new Set(reviewRecords.map((record) => record.candidateId));
  if (actualReviewIds.size !== 143 || auditReviewIds.size !== 143) {
    throw new Error('review candidate identity set is not exactly 143');
  }
  if ([...actualReviewIds].some((id) => !auditReviewIds.has(id))) {
    throw new Error('DATA-R1 audit omitted a current REVIEW_REQUIRED candidate');
  }
  if (candidates.some((candidate) => candidate.publicationClass !== 'REVIEW_REQUIRED' && auditReviewIds.has(candidate.candidateId))) {
    throw new Error('an AUTO_SAFE or non-review candidate entered the governed review set');
  }

  const decisions = reviewRecords.map((record) => {
    const sourceCandidate = candidates.find((candidate) => candidate.candidateId === record.candidateId);
    const matchedCandidate = chooseMatchedCandidate(candidatesBySource, record.matchedSourceRecordId);
    const source = sourceForCandidate(sources, sourceCandidate?.candidate);
    const matchedSource = sourceForCandidate(sources, matchedCandidate?.candidate);
    const conflictEvidence = conflicts.get(record.candidateId) ?? [];
    const duplicate = Boolean(audit.queue.duplicateSourceIds[record.sourceRecordId]);
    const decision = decisionFor(record, sourceCandidate, matchedCandidate, duplicate);
    const sourceDesignation = record.designation;
    const matchedDesignation = designationOf(matchedCandidate?.candidate);
    const sourceUrl = sourceCandidate?.candidate.provenance?.originalUrl;
    return {
      activationOrdinal: Number(record.ordinal),
      candidateId: record.candidateId,
      sourceId: sourceCandidate?.candidate.provenance?.sourceId ?? 'historic-england-nhle',
      sourceRecordId: record.sourceRecordId,
      sourceObjectId: record.sourceEvidence.objectId ?? null,
      sourcePlaceName: record.name,
      proposedCanonicalMatch: matchedCandidate?.candidate.name ?? null,
      proposedCanonicalSourceRecordId: record.matchedSourceRecordId || null,
      proposedCanonicalCandidateId: matchedCandidate?.candidateId ?? null,
      matchClass: record.conflictFields.length > 0 ? 'CONFLICT_REVIEW' : 'MATCH_REVIEW',
      dataR1Taxonomy: record.taxonomy,
      nameSimilarityEvidence: {
        matcherConfidence: Number(record.confidence),
        matcherReason: record.matcherReason,
        recordedRationale: record.rationale,
      },
      geographicDistance: {
        meters: distanceMeters(sourceCandidate?.candidate, matchedCandidate?.candidate),
        method: 'Haversine distance from sealed candidate coordinates; no coordinate threshold changed',
      },
      placeTypeComparison: {
        source: sourceCandidate?.candidate.placeType ?? record.placeType,
        proposedCanonical: matchedCandidate?.candidate.placeType ?? null,
        sourceRawType: sourceCandidate?.candidate.rawType ?? source?.layerName ?? null,
        proposedCanonicalRawType: matchedCandidate?.candidate.rawType ?? matchedSource?.layerName ?? null,
      },
      designationAreaStructureContext: {
        sourceDesignation,
        proposedCanonicalDesignation: matchedDesignation,
        sourceLayer: source?.layerName ?? record.layerName,
        proposedCanonicalLayer: matchedSource?.layerName ?? matchedCandidate?.candidate.rawType ?? null,
        explicitAreaStructureLanguage:
          record.rationale.includes('one record protects a landscape') || record.taxonomy === 'DESIGNATION_AREA_VS_STRUCTURE',
      },
      sourceCoordinates: coordinates(sourceCandidate?.candidate),
      candidateCoordinates: coordinates(matchedCandidate?.candidate),
      conflictingCandidateInformation: conflictEvidence,
      sourceEvidenceReferences: [
        {
          sourceRecordId: record.sourceRecordId,
          objectId: record.sourceEvidence.objectId ?? null,
          listEntry: record.sourceEvidence.listEntry ?? null,
          originalUrl: sourceUrl ?? null,
          sourceLayer: source?.layerName ?? record.layerName,
          licence: sourceCandidate?.candidate.provenance?.licence ?? 'OGL-UK-3.0',
        },
      ],
      priorActivationRationale: {
        matcherReason: record.matcherReason,
        rationale: record.rationale,
        conflictFields: record.conflictFields,
        temporalEvidence: record.temporalEvidence,
      },
      duplicateSourceIndication: duplicate
        ? {
            sourceRecordId: record.sourceRecordId,
            activationRows: audit.queue.duplicateSourceIds[record.sourceRecordId],
            interpretation: 'Same source ID and source OBJECTID occur on two activation rows; retain both ordinals and defer both decisions pending source-pipeline resolution.',
          }
        : null,
      reviewerDisposition: decision.disposition,
      reviewerRationale: decision.rationale,
      reviewConfidence: decision.confidence,
      reviewDecisionBatchId: decisionBatchId,
    };
  });

  const ordinals = decisions.map((decision) => decision.activationOrdinal);
  if (new Set(ordinals).size !== 143 || ordinals.some((ordinal, index) => index > 0 && ordinal <= ordinals[index - 1]!)) {
    throw new Error('activation ordinals are not unique and deterministic');
  }
  const validDispositions = new Set<Disposition>([
    'APPROVE_MATCH',
    'REJECT_MATCH',
    'KEEP_SEPARATE_CANONICAL',
    'DEFER_INSUFFICIENT_EVIDENCE',
  ]);
  if (decisions.some((decision) => !validDispositions.has(decision.reviewerDisposition))) {
    throw new Error('invalid governed disposition');
  }
  const decisionCounts = Object.fromEntries(
    [...validDispositions].map((disposition) => [
      disposition,
      decisions.filter((decision) => decision.reviewerDisposition === disposition).length,
    ]),
  );
  const byTaxonomy: Record<string, Record<string, number>> = {};
  for (const decision of decisions) {
    byTaxonomy[decision.dataR1Taxonomy] ??= {};
    byTaxonomy[decision.dataR1Taxonomy][decision.reviewerDisposition] =
      (byTaxonomy[decision.dataR1Taxonomy][decision.reviewerDisposition] ?? 0) + 1;
  }
  const projection = {
    existingAutoSafe: 23_171,
    reviewApproveMatch: decisionCounts.APPROVE_MATCH,
    reviewRejectMatch: decisionCounts.REJECT_MATCH,
    reviewKeepSeparateCanonical: decisionCounts.KEEP_SEPARATE_CANONICAL,
    reviewDeferred: decisionCounts.DEFER_INSUFFICIENT_EVIDENCE,
    projectedPublishableCandidateRows:
      23_171 + decisionCounts.APPROVE_MATCH + decisionCounts.KEEP_SEPARATE_CANONICAL,
    projectedBlockedReviewRows:
      decisionCounts.REJECT_MATCH + decisionCounts.DEFER_INSUFFICIENT_EVIDENCE,
    note: 'Projection only. No activation plan, canonical evidence or hosted database was changed.',
  };

  const result = {
    schema: 'whilom.yorkshire.governed-review.v1',
    dataset: {
      id: 'WHILOM_REGION_YORKSHIRE_V1',
      version: '1.0.0',
      source: 'Historic England NHLE / OGL-UK-3.0',
      sourceRows: audit.dataset.sourceRows,
      validCandidateRows: audit.dataset.validCandidateRows,
      reviewRequiredRows: decisions.length,
    },
    sourceCheckpoint: '32810d388a3326978c21a107896e684df1b0534f',
    dataR1Artefacts: dataR1Hashes,
    sealedCanonicalEvidenceHashes: verifiedSealedHashes,
    reviewMethod: {
      decisionBatchId,
      reviewer: 'governed-review-batch',
      principles: [
        'Uses only sealed DATA-R1 source, candidate, conflict and cache evidence.',
        'Does not add matching thresholds or alter the matcher.',
        'Approves no identity on name similarity alone.',
        'Treats explicit area/structure and distinct source-designation evidence as separate-canonical evidence.',
        'Rejects proposed matches with explicit material location/type conflicts.',
        'Defers ambiguity and the duplicate-source anomaly fail-closed.',
      ],
    },
    decisionCounts,
    decisionCountsByTaxonomy: byTaxonomy,
    projection,
    duplicateSourceIds: audit.queue.duplicateSourceIds,
    decisions,
    safety: {
      activationExecuted: false,
      hostedSupabaseContacted: false,
      canonicalEvidenceModified: false,
      migrationsModified: false,
    },
  };

  mkdirSync(outputDir, { recursive: true });
  const jsonPath = resolve(outputDir, 'yorkshire-governed-review-decisions.json');
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);

  const summaryRows = Object.entries(decisionCounts)
    .map(([disposition, count]) => `| ${disposition} | ${count} |`)
    .join('\n');
  const taxonomyRows = Object.entries(byTaxonomy)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([taxonomy, counts]) => {
      const cells = [...validDispositions].map((disposition) => counts[disposition] ?? 0);
      return `| ${taxonomy} | ${cells.join(' | ')} |`;
    })
    .join('\n');
  const decisionRows = decisions
    .map(
      (decision) =>
        `| ${decision.activationOrdinal} | ${escapeMarkdown(decision.sourceRecordId)} | ${escapeMarkdown(decision.sourcePlaceName)} | ${escapeMarkdown(decision.proposedCanonicalMatch)} | ${decision.dataR1Taxonomy} | ${decision.reviewerDisposition} | ${escapeMarkdown(decision.reviewerRationale)} |`,
    )
    .join('\n');
  const markdown = [
    '# Yorkshire Governed Review Decisions',
    '',
    'Generated as a derived DATA-R2 evidence layer from DATA-R1 checkpoint 32810d388a3326978c21a107896e684df1b0534f. This document does not replace or modify sealed activation evidence.',
    '',
    '## Scope and method',
    '',
    'The 143 DATA-R1 REVIEW_REQUIRED activation rows are represented once each, in activation-ordinal order. Decisions use only the captured matcher rationale, source designation/layer, candidate coordinates/types, and conflict artefacts. No new matcher threshold or heuristic was introduced. Ambiguous evidence remains deferred.',
    '',
    `Decision batch: ${decisionBatchId}`,
    '',
    '## Decision totals',
    '',
    '| Disposition | Count |',
    '|---|---:|',
    summaryRows,
    '',
    '## Taxonomy breakdown',
    '',
    '| DATA-R1 taxonomy | APPROVE_MATCH | REJECT_MATCH | KEEP_SEPARATE_CANONICAL | DEFER_INSUFFICIENT_EVIDENCE |',
    '|---|---:|---:|---:|---:|',
    taxonomyRows,
    '',
    '## Projection',
    '',
    '- Existing AUTO_SAFE: **23,171**.',
    `- Projected publishable candidate rows (AUTO_SAFE + APPROVE_MATCH + KEEP_SEPARATE_CANONICAL): **${projection.projectedPublishableCandidateRows}**.`,
    `- Review rows rejected: **${projection.reviewRejectMatch}**.`,
    `- Review rows deferred: **${projection.reviewDeferred}**.`,
    `- Projected blocked review rows: **${projection.projectedBlockedReviewRows}**.`,
    '',
    'This is a dry projection only. No activation plan, SQL, hosted database, source cache or canonical evidence was changed.',
    '',
    '## Source ID 1000099',
    '',
    'Source ID 1000099 appears on activation ordinals 23312 and 23313, with the same sealed source OBJECTID 15. Both ordinals are retained independently in the decision file and both are deferred because this is a source-pipeline duplicate requiring resolution outside this review pass. The canonical inputs were not rewritten.',
    '',
    '## Per-row decisions',
    '',
    '| Ordinal | Source ID | Source name | Proposed canonical | DATA-R1 taxonomy | Disposition | Governed rationale |',
    '|---:|---|---|---|---|---|---|',
    decisionRows,
    '',
    '## Sealed evidence',
    '',
    'The machine-readable artefact records the DATA-R1 derived hashes and the verified canonical evidence hashes. No credentials or personal data are included.',
    '',
    '## Safety',
    '',
    'Activation was not executed. Hosted Supabase was not contacted. No migrations, RLS/grant changes, Auth changes, Cloudflare/DNS changes, ingestion execution or Mobile changes were performed.',
    '',
  ].join('\n');
  const markdownPath = resolve(outputDir, 'YORKSHIRE_GOVERNED_REVIEW_DECISIONS.md');
  writeFileSync(markdownPath, markdown);
  console.log(JSON.stringify({
    jsonPath,
    markdownPath,
    decisionCounts,
    decisionCountsByTaxonomy: byTaxonomy,
    projection,
  }, null, 2));
}

run();
