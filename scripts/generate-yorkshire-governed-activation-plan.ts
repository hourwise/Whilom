import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type JsonObject = Record<string, unknown>;

export type GovernedAction =
  | 'MERGE_EXISTING_CANONICAL'
  | 'CREATE_SEPARATE_CANONICAL'
  | 'EXCLUDE_SOURCE'
  | 'DEFER'
  | 'RETAIN_MULTI_GEOMETRY';

const ROOT = process.cwd();
const R2_MARKDOWN = join(ROOT, 'docs/evidence/YORKSHIRE_GOVERNED_REVIEW_DECISIONS.md');
const R2_JSON = join(ROOT, 'docs/evidence/yorkshire-governed-review-decisions.json');
const R3_MARKDOWN = join(ROOT, 'docs/evidence/YORKSHIRE_RESIDUAL_REVIEW.md');
const R3_JSON = join(ROOT, 'docs/evidence/yorkshire-residual-review.json');
const R4_JSON = join(ROOT, 'docs/evidence/yorkshire-activation-policy.json');
const R4_MARKDOWN = join(ROOT, 'docs/evidence/YORKSHIRE_ACTIVATION_POLICY.md');
const ACTIVATION_PLAN = join(ROOT, 'ingestion/regional-activation-plan.json');
const CANDIDATES = join(ROOT, 'ingestion/regional-candidates.csv');
const CONFLICTS = join(ROOT, 'ingestion/regional-conflicts.csv');
const APPROVED = join(ROOT, 'ingestion/regional-approved.csv');
const CACHE = join(ROOT, 'ingestion/.regional-cache/nhle-regional.json');
const MANIFEST = join(ROOT, 'ingestion/regional/regional-dataset-manifest.json');
const TEMPORAL = join(ROOT, 'ingestion/regional-temporal.csv');
const TEMPORAL_WIKIDATA = join(ROOT, 'ingestion/regional-temporal-wikidata.csv');
const TEMPORAL_REJECTED = join(ROOT, 'ingestion/regional-temporal-rejected.csv');
const ACTIVATION_SQL = join(ROOT, 'supabase/regional/activate.sql');

const OUTPUT_PLAN = join(ROOT, 'docs/evidence/yorkshire-governed-activation-plan.json');
const OUTPUT_MARKDOWN = join(ROOT, 'docs/evidence/YORKSHIRE_GOVERNED_DRY_RUN.md');
const OUTPUT_MANIFEST = join(ROOT, 'docs/evidence/yorkshire-governed-activation-manifest.json');

const SOURCE_CHECKPOINT = '3e6552f893b897cc5f82e3d0e9c6982f39419fc0';
const DATA_R4_POLICY_HASH = '008CB154DBA9C065D1AB6E1F9F6DBF500F0B52302F310377AB488BFCEC16B364';
const DATA_R4_MARKDOWN_HASH = '63F4BE521B68B6E55FE763A9C64B7242D27AB3E8A73782FB3273E0657CF305F7';
const DATA_R4_BATCH_ID = 'DATA-R4-YORKSHIRE-ACTIVATION-POLICY-7BFEEA47';
const DATA_R5_BATCH_ID = 'DATA-R5-YORKSHIRE-GOVERNED-DRY-RUN-3E6552F8';
const GENERATOR_VERSION = 'whilom.yorkshire.governed-activation-plan.v1';

const SEALED_HASHES: Record<string, string> = {
  [R2_MARKDOWN]: 'B1A41E08B2945B18C456241871C4D8C4A964B859ADF9A2CA478BBBE608CDA1D8',
  [R2_JSON]: '2EDA6C46502CDA74350E999C4574777A507FB214237D1CEE2FC266CA04DA97FE',
  [R3_MARKDOWN]: '0A80E9FAEF13B74D373D7CA04B26B09911AD632E64F517846F54AE856DFFB535',
  [R3_JSON]: '89A7D45F3419D94C48ADDEE4DF7702FD06DDEDF9173B89592277355AA3B74672',
  [CACHE]: '23FFFA87082EBD6B60C44C1FA89DAC3ECFD8EFC0B65EAF665170F4B0654A69A2',
  [MANIFEST]: '7F620A6F60F7337D07842B776F79CFE23755612EB933BE0155B854AB92AB1513',
  [ACTIVATION_PLAN]: '0201857D6391766F5CC4CFE3A994E5E1A01EFD716F3DA5C1F33EE52BECC11466',
  [CANDIDATES]: 'A31A870C9F769C48CB58260EE766F35048DEE9E89FC2A48BC16E246EE2DA7C00',
  [CONFLICTS]: 'A317087EB292BF4A36E0360ACC449EA1807E9F0164B78A0118B356019645188C',
  [APPROVED]: 'FE7FBEDECF472C0DEC0D22DBCB0CC8C6883D210AB97CC124D79D6DC04A4F862A',
  [TEMPORAL]: 'BBB8D6C04CE24A0A04ED6ABCAC30ADCAB43F2939DE7A86C5AA4FCAD10C2B3D16',
  [TEMPORAL_WIKIDATA]: 'E353015177EF412DFEBB7AD0A8537E14A34F61CCDAC042C47AB712B2EE58DB8A',
  [TEMPORAL_REJECTED]: 'F13F9633F501490F250DA217AAC4EA9264BBE35470308C70D84970CD0B64D052',
  [ACTIVATION_SQL]: '692E881B230CF939092E29D2048BBCD77C4A7EFE6952E507DF211037CC935858',
};

export interface CandidateRow {
  ordinal: number;
  candidateId: string;
  normalised: JsonObject;
  status: string;
  confidence: number;
  publicationClass: string;
  policyReason: string;
  matcherRationale: string;
  matchedSourceRecordId: string | null;
}

export interface PolicyRow {
  activationOrdinal: number;
  sourceId: string;
  sourceRecordId: string;
  sourceObjectId: number | null;
  candidateId: string;
  dataR2Decision: string;
  dataR3Resolution: string | null;
  governedAction: GovernedAction;
  reason: string;
  activationTransform: {
    candidateRetained: boolean;
    publicationClass: string;
    matchedSourceRecordId: string | null;
    deferPublication: boolean;
  };
}

export interface AppliedReview {
  resultingPublicationClass: 'AUTO_SAFE' | 'REVIEW_REQUIRED' | 'EXCLUDED';
  resultingMatchedSourceRecordId: string | null;
  publishable: boolean;
  canonicalCreation: boolean;
  existingCanonicalMerge: boolean;
  multiGeometry: boolean;
  reason: string;
}

export interface PlanRow extends CandidateRow {
  sourceId: string;
  sourceRecordId: string;
  originalActivationDisposition: 'AUTO_SAFE' | 'REVIEW_REQUIRED';
  governedCategory:
    | 'AUTO_SAFE_NEW_CANONICAL'
    | 'AUTO_SAFE_EXISTING_CANONICAL'
    | 'GOVERNED_NEW_CANONICAL'
    | 'GOVERNED_EXISTING_CANONICAL'
    | 'GOVERNED_MULTI_GEOMETRY'
    | 'GOVERNED_DEFER'
    | 'GOVERNED_EXCLUDE';
  governedAction: 'AUTO_SAFE_CARRIED_FORWARD' | GovernedAction;
  resultingPublicationClass: AppliedReview['resultingPublicationClass'];
  resultingMatchedSourceRecordId: string | null;
  publishable: boolean;
  canonicalCreation: boolean;
  existingCanonicalMerge: boolean;
  multiGeometry: boolean;
  reason: string;
  policyBatchId: string | null;
  policyDataR2Decision: string | null;
  policyDataR3Resolution: string | null;
  sourceObjectId: number | null;
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected)
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

function asRecord(value: unknown, label: string): JsonObject {
  assertCondition(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `${label} must be an object`,
  );
  return value as JsonObject;
}

function asString(value: unknown, label: string): string {
  assertCondition(typeof value === 'string', `${label} must be a string`);
  return value;
}

function asNumber(value: unknown, label: string): number {
  assertCondition(
    typeof value === 'number' && Number.isFinite(value),
    `${label} must be a finite number`,
  );
  return value;
}

function sha256Bytes(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase();
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function relativePath(path: string): string {
  return path.startsWith(`${ROOT}/`) || path.startsWith(`${ROOT}\\`)
    ? path.slice(ROOT.length + 1).replaceAll('\\', '/')
    : path;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  assertCondition(!quoted, 'unterminated CSV quote');
  return fields;
}

function readCandidateRows(): CandidateRow[] {
  const rows: CandidateRow[] = [];
  for (const line of readFileSync(CANDIDATES, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    assertEqual(fields.length, 9, 'candidate CSV field count');
    const normalised = asRecord(JSON.parse(fields[2]), `candidate ${fields[1]} normalised`);
    rows.push({
      ordinal: Number(fields[0]),
      candidateId: fields[1],
      normalised,
      status: fields[3],
      confidence: Number(fields[4]),
      publicationClass: fields[5],
      policyReason: fields[6],
      matcherRationale: fields[7],
      matchedSourceRecordId: fields[8] || null,
    });
  }
  return rows;
}

function sourceIdOf(candidate: CandidateRow): string {
  return asString(
    asRecord(candidate.normalised.provenance, `${candidate.candidateId}.provenance`).sourceId,
    `${candidate.candidateId}.sourceId`,
  );
}

function sourceRecordIdOf(candidate: CandidateRow): string {
  return asString(
    asRecord(candidate.normalised.provenance, `${candidate.candidateId}.provenance`).sourceRecordId,
    `${candidate.candidateId}.sourceRecordId`,
  );
}

function policyFromJson(value: unknown): PolicyRow {
  const row = asRecord(value, 'policy row');
  const transform = asRecord(row.activationTransform, 'policy activationTransform');
  const action = asString(row.governedAction, 'policy governedAction');
  assertCondition(
    [
      'MERGE_EXISTING_CANONICAL',
      'CREATE_SEPARATE_CANONICAL',
      'EXCLUDE_SOURCE',
      'DEFER',
      'RETAIN_MULTI_GEOMETRY',
    ].includes(action),
    `unknown governed action ${action}`,
  );
  return {
    activationOrdinal: asNumber(row.activationOrdinal, 'policy activationOrdinal'),
    sourceId: asString(row.sourceId, 'policy sourceId'),
    sourceRecordId: asString(row.sourceRecordId, 'policy sourceRecordId'),
    sourceObjectId:
      row.sourceObjectId === null ? null : asNumber(row.sourceObjectId, 'policy sourceObjectId'),
    candidateId: asString(row.candidateId, 'policy candidateId'),
    dataR2Decision: asString(row.dataR2Decision, 'policy dataR2Decision'),
    dataR3Resolution:
      row.dataR3Resolution === null
        ? null
        : asString(row.dataR3Resolution, 'policy dataR3Resolution'),
    governedAction: action as GovernedAction,
    reason: asString(row.reason, 'policy reason'),
    activationTransform: {
      candidateRetained: Boolean(transform.candidateRetained),
      publicationClass: asString(transform.publicationClass, 'policy publicationClass'),
      matchedSourceRecordId:
        transform.matchedSourceRecordId === null
          ? null
          : asString(transform.matchedSourceRecordId, 'policy matchedSourceRecordId'),
      deferPublication: Boolean(transform.deferPublication),
    },
  };
}

/**
 * Applies one governed DATA-R4 review action to one sealed candidate.
 * This is deliberately strict: the candidate identity and source identity
 * must match the reviewed policy row before any publication meaning is set.
 */
export function applyGovernedReview(candidate: CandidateRow, policy: PolicyRow): AppliedReview {
  assertEqual(
    candidate.ordinal,
    policy.activationOrdinal,
    `policy ordinal for ${candidate.candidateId}`,
  );
  assertEqual(
    candidate.candidateId,
    policy.candidateId,
    `policy candidate ID for ordinal ${candidate.ordinal}`,
  );
  assertEqual(
    sourceIdOf(candidate),
    policy.sourceId,
    `policy source ID for ${candidate.candidateId}`,
  );
  assertEqual(
    sourceRecordIdOf(candidate),
    policy.sourceRecordId,
    `policy source record ID for ${candidate.candidateId}`,
  );

  switch (policy.governedAction) {
    case 'CREATE_SEPARATE_CANONICAL':
      return {
        resultingPublicationClass: 'AUTO_SAFE',
        resultingMatchedSourceRecordId: null,
        publishable: true,
        canonicalCreation: true,
        existingCanonicalMerge: false,
        multiGeometry: false,
        reason: policy.reason,
      };
    case 'MERGE_EXISTING_CANONICAL':
      assertCondition(
        policy.activationTransform.matchedSourceRecordId,
        `merge policy ${candidate.candidateId} has no target`,
      );
      return {
        resultingPublicationClass: 'AUTO_SAFE',
        resultingMatchedSourceRecordId: policy.activationTransform.matchedSourceRecordId,
        publishable: true,
        canonicalCreation: false,
        existingCanonicalMerge: true,
        multiGeometry: false,
        reason: policy.reason,
      };
    case 'RETAIN_MULTI_GEOMETRY':
      return {
        resultingPublicationClass: 'AUTO_SAFE',
        resultingMatchedSourceRecordId: null,
        publishable: true,
        canonicalCreation: true,
        existingCanonicalMerge: false,
        multiGeometry: true,
        reason: policy.reason,
      };
    case 'DEFER':
      return {
        resultingPublicationClass: 'REVIEW_REQUIRED',
        resultingMatchedSourceRecordId: null,
        publishable: false,
        canonicalCreation: false,
        existingCanonicalMerge: false,
        multiGeometry: false,
        reason: policy.reason,
      };
    case 'EXCLUDE_SOURCE':
      return {
        resultingPublicationClass: 'EXCLUDED',
        resultingMatchedSourceRecordId: null,
        publishable: false,
        canonicalCreation: false,
        existingCanonicalMerge: false,
        multiGeometry: false,
        reason: policy.reason,
      };
    default:
      throw new Error(
        `unsupported governed action ${(policy as { governedAction: string }).governedAction}`,
      );
  }
}

export function validatePolicyCoverage(
  candidates: CandidateRow[],
  policies: PolicyRow[],
): Map<number, PolicyRow> {
  const reviewRows = candidates.filter(
    (candidate) => candidate.publicationClass === 'REVIEW_REQUIRED',
  );
  const policyByOrdinal = new Map<number, PolicyRow>();
  for (const policy of policies) {
    assertCondition(
      !policyByOrdinal.has(policy.activationOrdinal),
      `duplicate policy ordinal ${policy.activationOrdinal}`,
    );
    policyByOrdinal.set(policy.activationOrdinal, policy);
  }
  assertEqual(policies.length, reviewRows.length, 'policy/review row count');
  for (const candidate of reviewRows) {
    const policy = policyByOrdinal.get(candidate.ordinal);
    assertCondition(policy, `missing policy for review ordinal ${candidate.ordinal}`);
    applyGovernedReview(candidate, policy);
  }
  for (const policy of policies) {
    const candidate = candidates.find((row) => row.ordinal === policy.activationOrdinal);
    assertCondition(candidate, `unknown policy ordinal ${policy.activationOrdinal}`);
    assertEqual(
      candidate.publicationClass,
      'REVIEW_REQUIRED',
      `policy ordinal ${policy.activationOrdinal} class`,
    );
  }
  return policyByOrdinal;
}

function buildPlanRow(candidate: CandidateRow, policyByOrdinal: Map<number, PolicyRow>): PlanRow {
  const sourceId = sourceIdOf(candidate);
  const sourceRecordId = sourceRecordIdOf(candidate);
  assertCondition(
    candidate.publicationClass === 'AUTO_SAFE' || candidate.publicationClass === 'REVIEW_REQUIRED',
    `unexpected original class ${candidate.publicationClass}`,
  );
  if (candidate.publicationClass === 'AUTO_SAFE') {
    const merge = candidate.matchedSourceRecordId !== null;
    return {
      ...candidate,
      sourceId,
      sourceRecordId,
      originalActivationDisposition: 'AUTO_SAFE',
      governedCategory: merge ? 'AUTO_SAFE_EXISTING_CANONICAL' : 'AUTO_SAFE_NEW_CANONICAL',
      governedAction: 'AUTO_SAFE_CARRIED_FORWARD',
      resultingPublicationClass: 'AUTO_SAFE',
      resultingMatchedSourceRecordId: candidate.matchedSourceRecordId,
      publishable: true,
      canonicalCreation: !merge,
      existingCanonicalMerge: merge,
      multiGeometry: false,
      reason: 'Original sealed AUTO_SAFE decision carried forward unchanged.',
      policyBatchId: null,
      policyDataR2Decision: null,
      policyDataR3Resolution: null,
      sourceObjectId: null,
    };
  }

  const policy = policyByOrdinal.get(candidate.ordinal);
  assertCondition(policy, `review candidate ${candidate.ordinal} has no governed policy`);
  const applied = applyGovernedReview(candidate, policy);
  const governedCategory = applied.multiGeometry
    ? 'GOVERNED_MULTI_GEOMETRY'
    : applied.publishable
      ? applied.existingCanonicalMerge
        ? 'GOVERNED_EXISTING_CANONICAL'
        : 'GOVERNED_NEW_CANONICAL'
      : applied.resultingPublicationClass === 'EXCLUDED'
        ? 'GOVERNED_EXCLUDE'
        : 'GOVERNED_DEFER';
  return {
    ...candidate,
    sourceId,
    sourceRecordId,
    originalActivationDisposition: 'REVIEW_REQUIRED',
    governedCategory,
    governedAction: policy.governedAction,
    resultingPublicationClass: applied.resultingPublicationClass,
    resultingMatchedSourceRecordId: applied.resultingMatchedSourceRecordId,
    publishable: applied.publishable,
    canonicalCreation: applied.canonicalCreation,
    existingCanonicalMerge: applied.existingCanonicalMerge,
    multiGeometry: applied.multiGeometry,
    reason: applied.reason,
    policyBatchId: DATA_R4_BATCH_ID,
    policyDataR2Decision: policy.dataR2Decision,
    policyDataR3Resolution: policy.dataR3Resolution,
    sourceObjectId: policy.sourceObjectId,
  };
}

function assertPlanInvariants(
  rows: PlanRow[],
  originalPlan: JsonObject,
  policies: PolicyRow[],
): void {
  const publishable = rows.filter((row) => row.publishable).length;
  const deferred = rows.filter((row) => row.resultingPublicationClass === 'REVIEW_REQUIRED').length;
  const excluded = rows.filter((row) => row.resultingPublicationClass === 'EXCLUDED').length;
  const newCanonical = rows.filter((row) => row.canonicalCreation).length;
  const merges = rows.filter((row) => row.existingCanonicalMerge).length;
  const valid = asNumber(originalPlan.valid, 'activation plan valid');
  const sourceRows = asNumber(originalPlan.sourceRows, 'activation plan sourceRows');
  const rejected = asNumber(originalPlan.rejected, 'activation plan rejected');
  assertEqual(rows.length, valid, 'complete plan row count');
  assertEqual(valid + rejected, sourceRows, 'source rows = valid + rejected');
  assertEqual(
    sourceRows,
    publishable + deferred + excluded + rejected,
    'source rows reconcile to governed plan',
  );
  assertEqual(
    rows.length,
    publishable + deferred + excluded,
    'valid candidates = publishable + deferred + excluded',
  );
  assertEqual(publishable, newCanonical + merges, 'publishable = new canonical + existing merge');
  const reviewRows = rows.filter((row) => row.originalActivationDisposition === 'REVIEW_REQUIRED');
  assertEqual(reviewRows.length, 143, 'review row count');
  assertEqual(
    reviewRows.filter((row) => row.publishable).length,
    126,
    'governed publishable review rows',
  );
  assertEqual(
    reviewRows.filter((row) => !row.publishable).length,
    17,
    'governed blocked review rows',
  );
  assertEqual(policies.length, reviewRows.length, 'policy rows reconciled');
  assertEqual(
    rows.filter(
      (row) =>
        row.originalActivationDisposition === 'AUTO_SAFE' &&
        row.governedAction !== 'AUTO_SAFE_CARRIED_FORWARD',
    ).length,
    0,
    'AUTO_SAFE override count',
  );
  assertEqual(
    rows.filter((row) => row.resultingPublicationClass === 'REVIEW_REQUIRED' && row.publishable)
      .length,
    0,
    'deferred publication leakage',
  );
  const saltaire = rows.filter((row) => row.sourceRecordId === '1000099');
  assertEqual(saltaire.length, 2, 'Saltaire row count');
  assertEqual(
    saltaire.filter(
      (row) =>
        row.ordinal === 23312 && row.sourceObjectId === 15 && row.multiGeometry && row.publishable,
    ).length,
    1,
    'Saltaire Buffer invariant',
  );
  assertEqual(
    saltaire.filter(
      (row) =>
        row.ordinal === 23313 && row.sourceObjectId === 16 && row.multiGeometry && row.publishable,
    ).length,
    1,
    'Saltaire Core invariant',
  );
}

interface AutoSafeFingerprintRow {
  ordinal: number;
  candidateId: string;
  sourceId: string;
  sourceRecordId: string;
  originalPublicationClass: string;
  originalMatchedSourceRecordId: string | null;
  resultingPublicationClass: string;
  resultingMatchedSourceRecordId: string | null;
  governedAction: string;
}

function computeFingerprint(rows: AutoSafeFingerprintRow[]): string {
  const fingerprint = rows.slice().sort((a, b) => a.ordinal - b.ordinal);
  return sha256Bytes(stableJson(fingerprint));
}

function computeAutoSafeFingerprint(rows: PlanRow[]): string {
  return computeFingerprint(
    rows
      .filter((row) => row.originalActivationDisposition === 'AUTO_SAFE')
      .map((row) => ({
        ordinal: row.ordinal,
        candidateId: row.candidateId,
        sourceId: row.sourceId,
        sourceRecordId: row.sourceRecordId,
        originalPublicationClass: row.publicationClass,
        originalMatchedSourceRecordId: row.matchedSourceRecordId,
        resultingPublicationClass: row.resultingPublicationClass,
        resultingMatchedSourceRecordId: row.resultingMatchedSourceRecordId,
        governedAction: row.governedAction,
      })),
  );
}

function computeOriginalAutoSafeFingerprint(rows: CandidateRow[]): string {
  return computeFingerprint(
    rows
      .filter((row) => row.publicationClass === 'AUTO_SAFE')
      .map((row) => ({
        ordinal: row.ordinal,
        candidateId: row.candidateId,
        sourceId: sourceIdOf(row),
        sourceRecordId: sourceRecordIdOf(row),
        originalPublicationClass: row.publicationClass,
        originalMatchedSourceRecordId: row.matchedSourceRecordId,
        resultingPublicationClass: row.publicationClass,
        resultingMatchedSourceRecordId: row.matchedSourceRecordId,
        governedAction: 'AUTO_SAFE_CARRIED_FORWARD',
      })),
  );
}

function renderMarkdown(
  plan: JsonObject,
  planHash: string,
  deferredRows: PlanRow[],
  reviewRows: PlanRow[],
): string {
  const counts = asRecord(plan.counts, 'plan counts');
  const stability = asRecord(plan.autoSafeStability, 'AUTO_SAFE stability');
  const lines = [
    '# Yorkshire DATA-R5 Governed Dry-Run Activation Plan',
    '',
    `This is a deterministic offline transformation of the sealed Yorkshire activation inputs plus DATA-R4 policy batch \`${DATA_R4_BATCH_ID}\`. It does not execute SQL, connect to Supabase, or authorize activation.`,
    '',
    '## Evidence and provenance',
    '',
    `- Source checkpoint: \`${SOURCE_CHECKPOINT}\``,
    `- DATA-R4 policy JSON SHA-256: \`${DATA_R4_POLICY_HASH}\``,
    `- DATA-R4 policy Markdown SHA-256: \`${DATA_R4_MARKDOWN_HASH}\``,
    `- Derived plan SHA-256: \`${planHash}\``,
    '- The sealed candidates CSV remains the canonical payload; the derived plan references it by sealed hash and does not duplicate its normalized JSON payload.',
    '- External evidence used: no.',
    '- Hosted activation performed: no.',
    '',
    '## Derived counts',
    '',
    '| Category | Count |',
    '|---|---:|',
    `| Source rows | ${counts.sourceRows} |`,
    `| Valid candidate rows | ${counts.validCandidateRows} |`,
    `| Original AUTO_SAFE carried forward | ${counts.autoSafeCarriedForwardRows} |`,
    `| Governed publishable rows | ${counts.governedPublishableRows} |`,
    `| Governed deferred rows | ${counts.governedDeferredRows} |`,
    `| Governed excluded rows | ${counts.governedExcludedRows} |`,
    `| Publishable rows | ${counts.publishableRows} |`,
    `| New canonical creations | ${counts.newCanonicalCreations} |`,
    `| Existing canonical merges | ${counts.existingCanonicalMerges} |`,
    '',
    'The invariants are `23,314 = 23,297 + 17 + 0`, `23,297 = 23,272 + 25`, and `143 = 126 + 17 + 0`.',
    '',
    '## AUTO_SAFE stability',
    '',
    `All ${counts.autoSafeCarriedForwardRows} original AUTO_SAFE rows were carried forward without policy override. The before/after semantic fingerprint is ${stability.fingerprintEqual ? 'identical' : 'different'}; existing-canonical merge targets remain ${counts.existingCanonicalMerges}.`,
    '',
    '## DATA-R4 review transitions',
    '',
    '| Ordinal | Candidate | DATA-R2 | DATA-R3 | Governed action | Result | Match target | Publishable |',
    '|---:|---|---|---|---|---|---|---:|',
  ];
  for (const row of reviewRows) {
    lines.push(
      `| ${row.ordinal} | ${row.candidateId} | ${row.policyDataR2Decision} | ${row.policyDataR3Resolution ?? '—'} | ${row.governedAction} | ${row.resultingPublicationClass} | ${row.resultingMatchedSourceRecordId ?? '—'} | ${row.publishable ? 'yes' : 'no'} |`,
    );
  }
  lines.push(
    '',
    '## Deferred rows',
    '',
    'These rows are present in the governed plan but absent from the publishable activation set:',
    '',
    '| Ordinal | Candidate | Source record | Reason |',
    '|---:|---|---|---|',
  );
  for (const row of deferredRows) {
    lines.push(
      `| ${row.ordinal} | ${row.candidateId} | ${row.sourceRecordId} | ${row.reason.replaceAll('|', '\\|').replaceAll('\n', ' ')} |`,
    );
  }
  lines.push(
    '',
    '## Saltaire invariants',
    '',
    '- Ordinal 23312 remains candidate `afd0cd1d-0000-4000-8000-000001000099`, OBJECTID 15, Buffer Zone, `RETAIN_MULTI_GEOMETRY`, publishable.',
    '- Ordinal 23313 remains candidate `afd0cd1e-0000-4000-8000-000001000099`, OBJECTID 16, Core Area, `RETAIN_MULTI_GEOMETRY`, publishable.',
    '- Neither row merges into Saltaire Mills, is deduplicated, or overwrites the other source feature.',
    '- Under the current point-place schema these two retained features project to two canonical-place creations.',
    '',
    '## SQL compatibility audit',
    '',
    'The sealed `supabase/regional/activate.sql` consumes `regional-candidates.csv`, `regional-conflicts.csv`, and temporal CSVs through `\\copy`. It publishes only rows with `publication_class = AUTO_SAFE`. DATA-R5 does not emit a duplicate execution CSV: the future pre-SQL adapter must materialize the governed rows into that exact nine-column shape, preserving the sealed source file and leaving deferred rows non-publishable. No SQL change was made here.',
    '',
    '## Dry-run boundary',
    '',
    'This plan is certified as an internally consistent candidate for DATA-R6 execution-artefact and transaction-safety review. It is not live activation authorization. DATA-R6 must inspect transaction, rollback, idempotency, editor identity, temporal ordering, and exact derived input handling before any separate activation authorization.',
    '',
  );
  return lines.join('\n');
}

function run(): void {
  for (const [path, expected] of Object.entries(SEALED_HASHES)) {
    assertEqual(sha256File(path), expected, `sealed hash ${relativePath(path)}`);
  }
  assertEqual(sha256File(R4_JSON), DATA_R4_POLICY_HASH, 'DATA-R4 policy JSON hash');
  assertEqual(sha256File(R4_MARKDOWN), DATA_R4_MARKDOWN_HASH, 'DATA-R4 policy Markdown hash');

  const originalPlan = asRecord(
    JSON.parse(readFileSync(ACTIVATION_PLAN, 'utf8')),
    'sealed activation plan',
  );
  const candidates = readCandidateRows();
  const policyDocument = asRecord(JSON.parse(readFileSync(R4_JSON, 'utf8')), 'DATA-R4 policy');
  const policyRows = (policyDocument.actions as unknown[]).map(policyFromJson);
  const policyByOrdinal = validatePolicyCoverage(candidates, policyRows);
  assertEqual(
    candidates.length,
    asNumber(originalPlan.valid, 'sealed valid candidates'),
    'candidate row count',
  );
  assertEqual(
    candidates.filter((row) => row.publicationClass === 'AUTO_SAFE').length,
    23171,
    'original AUTO_SAFE count',
  );
  assertEqual(
    candidates.filter((row) => row.publicationClass === 'REVIEW_REQUIRED').length,
    143,
    'original REVIEW_REQUIRED count',
  );
  assertEqual(
    candidates.filter((row) => !['AUTO_SAFE', 'REVIEW_REQUIRED'].includes(row.publicationClass))
      .length,
    0,
    'unexpected original classes',
  );

  const approvedIds = new Set(
    readFileSync(APPROVED, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => parseCsvLine(line)[0]),
  );
  const autoSafeIds = new Set(
    candidates.filter((row) => row.publicationClass === 'AUTO_SAFE').map((row) => row.candidateId),
  );
  assertEqual(approvedIds.size, autoSafeIds.size, 'approved/AUTO_SAFE ID count');
  assertEqual(
    [...approvedIds].filter((id) => !autoSafeIds.has(id)).length,
    0,
    'approved ID stability',
  );

  const rows = candidates
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((candidate) => buildPlanRow(candidate, policyByOrdinal));
  const rowIds = new Set(rows.map((row) => row.candidateId));
  assertEqual(rowIds.size, rows.length, 'complete candidate ID uniqueness');
  assertPlanInvariants(rows, originalPlan, policyRows);

  const originalAutoSafeFingerprint = computeOriginalAutoSafeFingerprint(candidates);
  const resultingAutoSafeFingerprint = computeAutoSafeFingerprint(rows);
  assertEqual(
    resultingAutoSafeFingerprint,
    originalAutoSafeFingerprint,
    'AUTO_SAFE semantic fingerprint',
  );
  const mergeRows = rows.filter((row) => row.existingCanonicalMerge);
  assertEqual(mergeRows.length, 25, 'existing AUTO_SAFE merge count');
  const originalMergeTargets = candidates
    .filter((row) => row.publicationClass === 'AUTO_SAFE' && row.matchedSourceRecordId !== null)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((row) => ({
      candidateId: row.candidateId,
      sourceId: sourceIdOf(row),
      matchedSourceRecordId: row.matchedSourceRecordId,
    }));
  const resultingMergeTargets = mergeRows
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((row) => ({
      candidateId: row.candidateId,
      sourceId: row.sourceId,
      matchedSourceRecordId: row.resultingMatchedSourceRecordId,
    }));
  assertEqual(
    stableJson(resultingMergeTargets),
    stableJson(originalMergeTargets),
    'AUTO_SAFE merge target stability',
  );
  const saltaire = rows.filter((row) => row.sourceRecordId === '1000099');
  assertEqual(saltaire.length, 2, 'Saltaire complete row count');
  assertEqual(
    saltaire.filter(
      (row) =>
        row.ordinal === 23312 &&
        row.sourceObjectId === 15 &&
        row.governedAction === 'RETAIN_MULTI_GEOMETRY',
    ).length,
    1,
    'Saltaire Buffer plan row',
  );
  assertEqual(
    saltaire.filter(
      (row) =>
        row.ordinal === 23313 &&
        row.sourceObjectId === 16 &&
        row.governedAction === 'RETAIN_MULTI_GEOMETRY',
    ).length,
    1,
    'Saltaire Core plan row',
  );

  const reviewRows = rows.filter((row) => row.originalActivationDisposition === 'REVIEW_REQUIRED');
  const deferredRows = rows.filter((row) => !row.publishable);
  const compactRows = rows.map(
    ({ normalised: _normalised, matcherRationale: _matcherRationale, ...row }) => row,
  );
  const compactReviewRows = reviewRows.map(({ normalised: _normalised, ...row }) => ({
    ...row,
    originalMatcherRationale: row.matcherRationale,
  }));
  const compactDeferredRows = deferredRows.map(({ normalised: _normalised, ...row }) => ({
    ...row,
    originalMatcherRationale: row.matcherRationale,
  }));
  const plan = {
    schema: 'whilom.yorkshire.governed-activation-plan.v1',
    sourceCheckpoint: SOURCE_CHECKPOINT,
    policyBatchId: DATA_R4_BATCH_ID,
    dataR4PolicyHash: DATA_R4_POLICY_HASH,
    dataR4PolicyMarkdownHash: DATA_R4_MARKDOWN_HASH,
    sealedInputHashes: Object.fromEntries(
      Object.entries(SEALED_HASHES).map(([path, hash]) => [relativePath(path), hash]),
    ),
    sealedCandidateCsv: { path: relativePath(CANDIDATES), sha256: SEALED_HASHES[CANDIDATES] },
    generatorVersion: GENERATOR_VERSION,
    batchId: DATA_R5_BATCH_ID,
    activationAuthorised: false,
    externalEvidenceUsed: false,
    rows: compactRows,
    reviewTransitions: compactReviewRows,
    deferredRows: compactDeferredRows,
    counts: {
      sourceRows: asNumber(originalPlan.sourceRows, 'sourceRows'),
      validCandidateRows: rows.length,
      rejectedBeforeCandidate: asNumber(originalPlan.rejected, 'rejectedBeforeCandidate'),
      originalAutoSafeRows: rows.filter((row) => row.originalActivationDisposition === 'AUTO_SAFE')
        .length,
      originalReviewRequiredRows: reviewRows.length,
      autoSafeCarriedForwardRows: rows.filter(
        (row) => row.originalActivationDisposition === 'AUTO_SAFE',
      ).length,
      governedPublishableRows: reviewRows.filter((row) => row.publishable).length,
      governedDeferredRows: reviewRows.filter(
        (row) => row.resultingPublicationClass === 'REVIEW_REQUIRED',
      ).length,
      governedExcludedRows: reviewRows.filter((row) => row.resultingPublicationClass === 'EXCLUDED')
        .length,
      publishableRows: rows.filter((row) => row.publishable).length,
      deferredRows: deferredRows.filter(
        (row) => row.resultingPublicationClass === 'REVIEW_REQUIRED',
      ).length,
      excludedRows: deferredRows.filter((row) => row.resultingPublicationClass === 'EXCLUDED')
        .length,
      newCanonicalCreations: rows.filter((row) => row.canonicalCreation).length,
      existingCanonicalMerges: mergeRows.length,
      governedNewCanonicalCreations: reviewRows.filter((row) => row.canonicalCreation).length,
      governedExistingCanonicalMerges: reviewRows.filter((row) => row.existingCanonicalMerge)
        .length,
      governedMultiGeometryRows: reviewRows.filter((row) => row.multiGeometry).length,
    },
    autoSafeStability: {
      originalApprovedCsvSha256: sha256File(APPROVED),
      originalSemanticFingerprintSha256: originalAutoSafeFingerprint,
      resultingSemanticFingerprintSha256: resultingAutoSafeFingerprint,
      fingerprintEqual: resultingAutoSafeFingerprint === originalAutoSafeFingerprint,
      mergeTargetCount: mergeRows.length,
      mergeTargets: resultingMergeTargets,
      mergeTargetsEqual: true,
    },
    validation: {
      policyRows: policyRows.length,
      completeCandidateRows: rows.length,
      uniqueCandidateIds: rowIds.size,
      uniqueActivationOrdinals: new Set(rows.map((row) => row.ordinal)).size,
      missingPolicyRows: 0,
      duplicatePolicyOrdinals: 0,
      unknownPolicyOrdinals: 0,
      candidateIdMismatches: 0,
      sourceIdMismatches: 0,
      deferredPublicationLeaks: 0,
      saltaireRowsRetained: 2,
      candidateIdsRegenerated: 0,
    },
    sqlCompatibility: {
      sealedSqlPath: relativePath(ACTIVATION_SQL),
      candidateInputPath: relativePath(CANDIDATES),
      futureAdapterOutputShape: 'same nine-column CSV shape as the sealed candidate input',
      executionMode: 'future pre-SQL materialization only',
      publicationClassForPublishableRows: 'AUTO_SAFE',
      publicationClassForDeferredRows: 'REVIEW_REQUIRED',
      sealedSqlChanged: false,
      hostedExecution: false,
    },
  };
  assertPlanInvariants(rows, originalPlan, policyRows);
  writeFileSync(OUTPUT_PLAN, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  const planHash = sha256File(OUTPUT_PLAN);
  const markdown = renderMarkdown(
    plan as unknown as JsonObject,
    planHash,
    deferredRows,
    reviewRows,
  );
  writeFileSync(OUTPUT_MARKDOWN, markdown, 'utf8');
  const manifest = {
    schema: 'whilom.yorkshire.governed-activation-manifest.v1',
    sourceCheckpoint: SOURCE_CHECKPOINT,
    dataR4PolicyHash: DATA_R4_POLICY_HASH,
    dataR4PolicyMarkdownHash: DATA_R4_MARKDOWN_HASH,
    policyBatchId: DATA_R4_BATCH_ID,
    batchId: DATA_R5_BATCH_ID,
    generatorVersion: GENERATOR_VERSION,
    inputHashes: plan.sealedInputHashes,
    derivedPlan: { path: relativePath(OUTPUT_PLAN), sha256: planHash },
    sealedCandidateCsv: { path: relativePath(CANDIDATES), sha256: SEALED_HASHES[CANDIDATES] },
    counts: plan.counts,
    deterministic: true,
    generationTimestamp: null,
    activationAuthorised: false,
  };
  writeFileSync(OUTPUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : '';
if (invokedPath.endsWith('generate-yorkshire-governed-activation-plan.ts')) run();
