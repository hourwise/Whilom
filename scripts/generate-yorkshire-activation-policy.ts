import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type JsonRecord = Record<string, unknown>;

const ROOT = process.cwd();
const DATA_R2_JSON = join(ROOT, 'docs/evidence/yorkshire-governed-review-decisions.json');
const DATA_R2_MARKDOWN = join(ROOT, 'docs/evidence/YORKSHIRE_GOVERNED_REVIEW_DECISIONS.md');
const DATA_R3_JSON = join(ROOT, 'docs/evidence/yorkshire-residual-review.json');
const DATA_R3_MARKDOWN = join(ROOT, 'docs/evidence/YORKSHIRE_RESIDUAL_REVIEW.md');
const MANIFEST = join(ROOT, 'ingestion/regional/regional-dataset-manifest.json');
const CACHE = join(ROOT, 'ingestion/.regional-cache/nhle-regional.json');
const ACTIVATION_PLAN = join(ROOT, 'ingestion/regional-activation-plan.json');
const CANDIDATES = join(ROOT, 'ingestion/regional-candidates.csv');
const CONFLICTS = join(ROOT, 'ingestion/regional-conflicts.csv');
const APPROVED = join(ROOT, 'ingestion/regional-approved.csv');
const TEMPORAL = join(ROOT, 'ingestion/regional-temporal.csv');
const TEMPORAL_WIKIDATA = join(ROOT, 'ingestion/regional-temporal-wikidata.csv');
const TEMPORAL_REJECTED = join(ROOT, 'ingestion/regional-temporal-rejected.csv');
const TEMPORAL_AUDIT = join(ROOT, 'ingestion/regional-temporal-audit.json');
const ACTIVATION_SQL = join(ROOT, 'supabase/regional/activate.sql');
const OUTPUT_JSON = join(ROOT, 'docs/evidence/yorkshire-activation-policy.json');
const OUTPUT_MARKDOWN = join(ROOT, 'docs/evidence/YORKSHIRE_ACTIVATION_POLICY.md');

const SOURCE_CHECKPOINT = '7bfeea47b76b6e7aa87a0aabd7f4ec6a3a163550';
const DATA_R2_CHECKPOINT = '8cc140e993d760d0412298f54b32ed643ff4e7f6';
const DATA_R1_CHECKPOINT = '32810d388a3326978c21a107896e684df1b0534f';
const DATA_R2_MARKDOWN_SHA = 'B1A41E08B2945B18C456241871C4D8C4A964B859ADF9A2CA478BBBE608CDA1D8';
const DATA_R2_JSON_SHA = '2EDA6C46502CDA74350E999C4574777A507FB214237D1CEE2FC266CA04DA97FE';
const DATA_R3_MARKDOWN_SHA = '0A80E9FAEF13B74D373D7CA04B26B09911AD632E64F517846F54AE856DFFB535';
const DATA_R3_JSON_SHA = '89A7D45F3419D94C48ADDEE4DF7702FD06DDEDF9173B89592277355AA3B74672';

const SEALED_HASHES: Record<string, string> = {
  [MANIFEST]: '7F620A6F60F7337D07842B776F79CFE23755612EB933BE0155B854AB92AB1513',
  [CACHE]: '23FFFA87082EBD6B60C44C1FA89DAC3ECFD8EFC0B65EAF665170F4B0654A69A2',
  [ACTIVATION_PLAN]: '0201857D6391766F5CC4CFE3A994E5E1A01EFD716F3DA5C1F33EE52BECC11466',
  [CANDIDATES]: 'A31A870C9F769C48CB58260EE766F35048DEE9E89FC2A48BC16E246EE2DA7C00',
  [CONFLICTS]: 'A317087EB292BF4A36E0360ACC449EA1807E9F0164B78A0118B356019645188C',
  [APPROVED]: 'FE7FBEDECF472C0DEC0D22DBCB0CC8C6883D210AB97CC124D79D6DC04A4F862A',
  [TEMPORAL]: 'BBB8D6C04CE24A0A04ED6ABCAC30ADCAB43F2939DE7A86C5AA4FCAD10C2B3D16',
  [TEMPORAL_WIKIDATA]: 'E353015177EF412DFEBB7AD0A8537E14A34F61CCDAC042C47AB712B2EE58DB8A',
  [TEMPORAL_REJECTED]: 'F13F9633F501490F250DA217AAC4EA9264BBE35470308C70D84970CD0B64D052',
  [TEMPORAL_AUDIT]: 'EAFD855DC806C1802469D239A20C421DB15E21B076D72E48ACDCED6A56A50108',
  [ACTIVATION_SQL]: '692E881B230CF939092E29D2048BBCD77C4A7EFE6952E507DF211037CC935858',
};

type GovernedAction =
  | 'MERGE_EXISTING_CANONICAL'
  | 'CREATE_SEPARATE_CANONICAL'
  | 'EXCLUDE_SOURCE'
  | 'DEFER'
  | 'RETAIN_MULTI_GEOMETRY';

interface RejectedMatchPolicy {
  action: 'REJECT_MATCH_CREATE_CANONICAL' | 'REJECT_MATCH_DEFER';
  reason: string;
}

const REJECTED_MATCH_POLICY: Record<number, RejectedMatchPolicy> = {
  21207: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'The source is a valid scheduled-monument area covering the castle, chapel and ruins, while the proposed listed-building record is a narrower component. The proposed merge is rejected and the wider source designation is retained as its own canonical record.',
  },
  21852: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'The source is a 39.69ha scheduled-monument precinct with water-management and agricultural features; the proposed listed-building point is 776m away. The source is valid and its wider precinct claim is retained separately rather than merged.',
  },
  21957: {
    action: 'REJECT_MATCH_DEFER',
    reason:
      'The source is valid, but the same-name Low Cross records are only 7m apart and the place-type conflict could reflect either distinct designations or a mapping difference. No positive evidence safely establishes a separate physical entity or an alternate match.',
  },
  22007: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'The source is a 50.05ha scheduled-monument abbey precinct, while the proposed listed-building point is 761m away. The wider precinct is a valid independent source entity for activation purposes and is retained separately.',
  },
  22371: {
    action: 'REJECT_MATCH_DEFER',
    reason:
      'The source and proposed candidate occupy the same point and share the Fulford Cross name. The inferred military_installation versus monument conflict is insufficient to prove separation or a wrong source record, so the source remains blocked.',
  },
  22604: {
    action: 'REJECT_MATCH_DEFER',
    reason:
      'The source and proposed candidate occupy the same point and identify Margery Bradley, but archaeological_site versus structure is not enough to decide whether the records are separate designations for one standing stone or a bad match.',
  },
  22723: {
    action: 'REJECT_MATCH_DEFER',
    reason:
      'The source and proposed candidate are only 5m apart and share the Ana Cross identity, while archaeological_site versus monument may reflect scope rather than distinct physical places. No positive separation evidence is captured.',
  },
  22729: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'The source is a 14.39ha scheduled-mining complex and the proposed listed-building point is 504m away. The wider mine and Bank Top kilns record is valid and is retained as a separate canonical source entity.',
  },
  23211: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'Hackfall is a 40.38ha registered park/garden, while Hackfall Farmhouse is a listed building 628m away. The source landscape and the component building are separate canonical scopes.',
  },
  23227: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'Sledmere House in the source is a 300.42ha registered park/garden, while the proposed candidate is a listed building 884m away. The wider landscape designation is retained separately.',
  },
  23229: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'Aske Hall in the source is a 168.09ha registered park/garden, while the proposed candidate is the Stable Block, a listed building 856m away. These are distinct source scopes.',
  },
  23231: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'Castle Howard in the source is a 741.40ha registered park/garden, while the proposed candidate is Castle Howard and East Court, a listed building 54m away. The landscape designation is retained separately.',
  },
  23232: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'Constable Burton Hall in the source is a 125.73ha registered park/garden, while the proposed candidate is a listed country house 554m away. The source landscape is a distinct canonical scope.',
  },
  23241: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'Ribston Hall in the source is a 287.81ha registered park/garden, while the proposed candidate is a listed country house 847m away. The source landscape is retained separately.',
  },
  23256: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'Temple Grounds is a 15.09ha registered park/garden, while The Temple is a listed structure 119m away. The wider landscape and component structure must not be merged.',
  },
  23266: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'High Royds Hospital in the source is an 84.71ha registered park/garden, while the proposed candidate is a listed structure 87m away. The source landscape is retained separately.',
  },
  23289: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'Hunslet Cemetery in the source is a 3.63ha registered park/garden, while the proposed candidate is a memorial monument 74m away. The cemetery landscape and memorial are distinct canonical scopes.',
  },
  23294: {
    action: 'REJECT_MATCH_CREATE_CANONICAL',
    reason:
      'Utley Cemetery in the source is a 3.75ha registered park/garden, while the proposed candidate is a chapel and vault 5m away. The cemetery landscape and chapel record are distinct source scopes.',
  },
};

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function relativePath(path: string): string {
  const relative =
    path.startsWith(`${ROOT}/`) || path.startsWith(`${ROOT}\\`)
      ? path.slice(ROOT.length + 1)
      : path;
  return relative.replaceAll('\\', '/');
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected)
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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
  return fields;
}

function readCandidateRows(): Map<string, JsonRecord> {
  const map = new Map<string, JsonRecord>();
  for (const line of readFileSync(CANDIDATES, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    if (!fields[1] || !fields[2]) continue;
    map.set(fields[1], {
      ordinal: Number(fields[0]),
      candidateId: fields[1],
      status: fields[3],
      confidence: Number(fields[4]),
      publicationClass: fields[5],
      candidate: JSON.parse(fields[2]),
    });
  }
  return map;
}

function evidenceReference(ordinal: number, kind: string): string[] {
  return [
    `docs/evidence/yorkshire-governed-review-decisions.json#activationOrdinal=${ordinal}`,
    `docs/evidence/yorkshire-residual-review.json#${kind}=${ordinal}`,
  ];
}

function actionFor(
  decision: JsonRecord,
  residualByOrdinal: Map<number, JsonRecord>,
  duplicateByOrdinal: Map<number, JsonRecord>,
): { action: GovernedAction; reason: string; dataR3Resolution: string | null } {
  const ordinal = Number(decision.activationOrdinal);
  const duplicate = duplicateByOrdinal.get(ordinal);
  if (duplicate) {
    return {
      action: 'RETAIN_MULTI_GEOMETRY',
      reason:
        'Retain this Saltaire source geometry as an independent candidate. Under the current point-place/source-record schema, each retained geometry is published as its own source-feature-backed canonical row so neither Buffer nor Core evidence is overwritten.',
      dataR3Resolution: 'EXPECTED_MULTI_CANDIDATE / RETAIN_TWO_GEOMETRY_ROWS',
    };
  }
  const residual = residualByOrdinal.get(ordinal);
  if (residual) {
    return {
      action: 'DEFER',
      reason: String(residual.reviewerRationale),
      dataR3Resolution: 'DEFER_INSUFFICIENT_EVIDENCE',
    };
  }

  switch (decision.reviewerDisposition) {
    case 'APPROVE_MATCH':
      return {
        action: 'MERGE_EXISTING_CANONICAL',
        reason: String(decision.reviewerRationale),
        dataR3Resolution: null,
      };
    case 'KEEP_SEPARATE_CANONICAL':
      return {
        action: 'CREATE_SEPARATE_CANONICAL',
        reason: String(decision.reviewerRationale),
        dataR3Resolution: null,
      };
    case 'REJECT_MATCH': {
      const policy = REJECTED_MATCH_POLICY[ordinal];
      assertCondition(policy, `Missing explicit REJECT_MATCH policy for ordinal ${ordinal}`);
      return {
        action:
          policy.action === 'REJECT_MATCH_CREATE_CANONICAL' ? 'CREATE_SEPARATE_CANONICAL' : 'DEFER',
        reason: policy.reason,
        dataR3Resolution: policy.action,
      };
    }
    case 'DEFER_INSUFFICIENT_EVIDENCE':
      throw new Error(`Unclassified DATA-R2 deferred row ${ordinal}`);
    default:
      throw new Error(`Unknown DATA-R2 disposition ${String(decision.reviewerDisposition)}`);
  }
}

function renderMarkdown(output: JsonRecord): string {
  const actions = output.actions as JsonRecord[];
  const counts = output.actionCounts as Record<string, number>;
  const projection = output.projections as JsonRecord;
  const rejected = output.rejectedMatchAudit as JsonRecord[];
  const saltaire = output.saltairePolicy as JsonRecord;
  const keepSeparateCompatibility = output.keepSeparateCompatibility as { checkedRows: number };
  const residualPolicy = output.residualPolicy as {
    residualRows: number;
    rejectedMatchDeferredRows: number;
  };
  const dryRunEligibility = output.dryRunEligibility as { eligible: boolean };
  const lines: string[] = [
    '# Yorkshire DATA-R4 Governed Activation Policy',
    '',
    `Derived from DATA-R2 checkpoint ${DATA_R2_CHECKPOINT} and DATA-R3 checkpoint ${SOURCE_CHECKPOINT}. This is an offline policy contract only; it does not regenerate sealed activation inputs and does not authorize activation.`,
    '',
    '## Evidence',
    '',
    `- DATA-R1 checkpoint: \`${DATA_R1_CHECKPOINT}\``,
    `- DATA-R2 Markdown SHA-256: \`${DATA_R2_MARKDOWN_SHA}\``,
    `- DATA-R2 JSON SHA-256: \`${DATA_R2_JSON_SHA}\``,
    `- DATA-R3 Markdown SHA-256: \`${DATA_R3_MARKDOWN_SHA}\``,
    `- DATA-R3 JSON SHA-256: \`${DATA_R3_JSON_SHA}\``,
    '- External evidence used: no.',
    '- Hosted activation performed: no.',
    '',
    '## Activation semantics',
    '',
    '| Governed action | Operational meaning |',
    '|---|---|',
    '| MERGE_EXISTING_CANONICAL | Retain the candidate and set its matched source-record target so publication attaches it to the existing canonical place. |',
    '| CREATE_SEPARATE_CANONICAL | Retain the candidate, clear the proposed match, approve it through the governed path, and let publication create a new place plus source record. |',
    '| EXCLUDE_SOURCE | Omit the source candidate entirely. No DATA-R4 row uses this action. |',
    '| DEFER | Keep the candidate review-gated and unpublished; do not merge or create a canonical place. |',
    '| RETAIN_MULTI_GEOMETRY | Preserve every source geometry row. Under the current point-place schema this means one canonical source-feature-backed row per retained geometry. |',
    '',
    'The existing SQL publication function supports the merge/create distinction: a non-null `matched_entity_id` attaches to an existing place; a null target creates a new `places` row, then writes `source_records`, designations, facts and relationships. The activation SQL currently loops only `AUTO_SAFE` rows, so DATA-R5 must apply this policy before the SQL lane and must leave `DEFER` rows as `REVIEW_REQUIRED` or otherwise excluded from publication.',
    '',
    '## Action totals',
    '',
    '| Action | Count |',
    '|---|---:|',
  ];
  for (const key of [
    'MERGE_EXISTING_CANONICAL',
    'CREATE_SEPARATE_CANONICAL',
    'RETAIN_MULTI_GEOMETRY',
    'EXCLUDE_SOURCE',
    'DEFER',
  ]) {
    lines.push(`| ${key} | ${counts[key] ?? 0} |`);
  }
  lines.push(
    '',
    '## REJECT_MATCH audit',
    '',
    'A REJECT_MATCH rejects the proposed existing canonical match; it does not automatically reject the valid source record. Four rows remain deferred because the source is valid but the available evidence cannot safely distinguish a separate entity from a type-mapping conflict. The other fourteen have explicit wider-designation/component evidence and create separate canonicals.',
    '',
    '| Ordinal | Source | Proposed match | Operational disposition |',
    '|---:|---|---|---|',
  );
  for (const row of rejected) {
    lines.push(
      `| ${row.activationOrdinal} | ${escapeCell(String(row.sourcePlaceName))} | ${escapeCell(String(row.proposedCanonicalMatch))} | ${row.operationalDisposition} |`,
    );
  }
  lines.push(
    '',
    '## KEEP_SEPARATE_CANONICAL compatibility',
    '',
    `All ${keepSeparateCompatibility.checkedRows} DATA-R2 KEEP_SEPARATE_CANONICAL rows map to CREATE_SEPARATE_CANONICAL. They retain the source name, inferred type, source geometry, designation and provenance; no proposed canonical target is used. The current publication function can represent this without merging or overwriting the existing place.`,
    '',
    '## Saltaire Core/Buffer policy',
    '',
    `The two Saltaire rows are \`${String(saltaire.action)}\`, with current-schema representation \`${String(saltaire.currentSchemaRepresentation)}\`. They count as ${saltaire.candidateRows} candidate rows and ${saltaire.canonicalPlaceCreations} canonical-place creations in the dry projection. The source raw JSON, area and Buffer/Core notes remain attached to their individual source records. A future one-place/multi-geometry model would require a separate schema/product decision; DATA-R4 does not invent one.`,
    '',
    '## Residual deferred policy',
    '',
    `The ${residualPolicy.residualRows} DATA-R3 residual rows map explicitly to DEFER. They remain unpublished and do not create canonical places. The ${residualPolicy.rejectedMatchDeferredRows} unresolved REJECT_MATCH rows are also DEFER, so the total deferred policy rows are ${projection.deferredRows}.`,
    '',
    '## Full 143-row governed action table',
    '',
    '| Ordinal | Candidate | Source | DATA-R2 | DATA-R3 | Governed action |',
    '|---:|---|---|---|---|---|',
  );
  for (const row of actions) {
    lines.push(
      `| ${row.activationOrdinal} | ${row.candidateId} | ${escapeCell(String(row.sourcePlaceName))} | ${row.dataR2Decision} | ${row.dataR3Resolution ?? '—'} | ${row.governedAction} |`,
    );
  }
  lines.push(
    '',
    '## Projections',
    '',
    `### Candidate rows`,
    '',
    `- AUTO_SAFE candidate rows: **${projection.autoSafeCandidateRows}**`,
    `- Review-derived publishable candidate rows: **${projection.reviewDerivedPublishableCandidateRows}**`,
    `- Excluded rows: **${projection.excludedRows}**`,
    `- Deferred rows: **${projection.deferredRows}**`,
    `- Projected publishable candidate rows: **${projection.projectedPublishableCandidateRows}**`,
    '',
    '### Canonical places',
    '',
    `- Existing AUTO_SAFE new-canonical creations: **${projection.autoSafeNewCanonicalCreations}**`,
    `- Existing AUTO_SAFE merges: **${projection.autoSafeMerges}**`,
    `- Review-derived separate canonical creations: **${projection.reviewDerivedSeparateCanonicalCreations}**`,
    `- Review-derived merges: **${projection.reviewDerivedMerges}**`,
    `- Saltaire multi-geometry canonical creations under the current schema: **${projection.saltaireCanonicalCreations}**`,
    `- Projected new canonical creations from this dataset: **${projection.projectedNewCanonicalCreations}**`,
    `- Projected existing-canonical merges from this dataset: **${projection.projectedExistingCanonicalMerges}**`,
    '',
    '## DATA-R5 eligibility',
    '',
    `**${dryRunEligibility.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}** for a governed dry-run activation-plan regeneration, subject to DATA-R5 implementing the policy adapter with fail-closed validation. Every review row has an explicit action; all unresolved cases are DEFER; rejected-match semantics are explicit; Saltaire representation is explicit; and no candidate-ID instability or schema blocker was found. No activation SQL should be executed from this policy artefact.`,
    '',
    'Recommended DATA-R5 work: generate a new derived activation plan by applying this contract to the sealed candidate rows, with checks for missing/duplicate/unknown ordinals and candidate-ID mismatch. Do not overwrite the sealed plan.',
    '',
  );
  return lines.join('\n');
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function run(): void {
  assertEqual(sha256(DATA_R2_MARKDOWN), DATA_R2_MARKDOWN_SHA, 'DATA-R2 Markdown hash');
  assertEqual(sha256(DATA_R2_JSON), DATA_R2_JSON_SHA, 'DATA-R2 JSON hash');
  assertEqual(sha256(DATA_R3_MARKDOWN), DATA_R3_MARKDOWN_SHA, 'DATA-R3 Markdown hash');
  assertEqual(sha256(DATA_R3_JSON), DATA_R3_JSON_SHA, 'DATA-R3 JSON hash');
  for (const [path, expected] of Object.entries(SEALED_HASHES)) {
    assertEqual(sha256(path), expected, `sealed artefact hash ${relativePath(path)}`);
  }

  const dataR2 = JSON.parse(readFileSync(DATA_R2_JSON, 'utf8')) as JsonRecord;
  const dataR3 = JSON.parse(readFileSync(DATA_R3_JSON, 'utf8')) as JsonRecord;
  const decisions = dataR2.decisions as JsonRecord[];
  assertEqual(decisions.length, 143, 'DATA-R2 review row count');
  const decisionOrdinals = decisions.map((decision) => Number(decision.activationOrdinal));
  assertEqual(new Set(decisionOrdinals).size, 143, 'DATA-R2 activation ordinal uniqueness');

  const residualRows = dataR3.residualRows as JsonRecord[];
  const duplicateRows = dataR3.sourceDuplicateRows as JsonRecord[];
  assertEqual(residualRows.length, 13, 'DATA-R3 residual count');
  assertEqual(duplicateRows.length, 2, 'DATA-R3 duplicate count');
  const residualByOrdinal = new Map(
    residualRows.map((row) => [Number(row.activationOrdinal), row]),
  );
  const duplicateByOrdinal = new Map(
    duplicateRows.map((row) => [Number(row.activationOrdinal), row]),
  );
  assertEqual(residualByOrdinal.size, 13, 'DATA-R3 residual ordinal uniqueness');
  assertEqual(duplicateByOrdinal.size, 2, 'DATA-R3 duplicate ordinal uniqueness');

  const candidates = readCandidateRows();
  const approvedIds = new Set(
    readFileSync(APPROVED, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => parseCsvLine(line)[0]),
  );

  const actions = decisions
    .slice()
    .sort((a, b) => Number(a.activationOrdinal) - Number(b.activationOrdinal))
    .map((decision) => {
      const ordinal = Number(decision.activationOrdinal);
      const candidateId = String(decision.candidateId);
      const duplicate = duplicateByOrdinal.get(ordinal);
      const candidateRow = candidates.get(candidateId);
      assertCondition(candidateRow, `candidate ${candidateId} missing from sealed candidate CSV`);
      assertEqual(candidateRow.status, 'needs_review', `candidate ${candidateId} status`);
      assertEqual(
        candidateRow.publicationClass,
        'REVIEW_REQUIRED',
        `candidate ${candidateId} publication class`,
      );
      assertCondition(
        !approvedIds.has(candidateId),
        `review candidate ${candidateId} leaked into regional-approved.csv`,
      );
      const { action, reason, dataR3Resolution } = actionFor(
        decision,
        residualByOrdinal,
        duplicateByOrdinal,
      );
      const matchedSourceRecordId =
        action === 'MERGE_EXISTING_CANONICAL' ? decision.proposedCanonicalSourceRecordId : null;
      const publishable = action !== 'DEFER' && action !== 'EXCLUDE_SOURCE';
      return {
        activationOrdinal: ordinal,
        sourceId: decision.sourceId,
        sourceRecordId: decision.sourceRecordId,
        sourceObjectId: duplicate?.actualSealedSourceObjectId ?? decision.sourceObjectId ?? null,
        candidateId,
        sourcePlaceName: decision.sourcePlaceName,
        proposedCanonicalMatch: decision.proposedCanonicalMatch ?? null,
        proposedCanonicalSourceRecordId: decision.proposedCanonicalSourceRecordId ?? null,
        proposedCanonicalCandidateId: decision.proposedCanonicalCandidateId ?? null,
        originalMatcherDisposition: decision.matchClass,
        dataR2Decision: decision.reviewerDisposition,
        dataR3Resolution,
        governedAction: action,
        operationalDisposition:
          decision.reviewerDisposition === 'REJECT_MATCH'
            ? (REJECTED_MATCH_POLICY[ordinal]?.action ?? null)
            : null,
        activationTransform: {
          candidateRetained: publishable,
          publicationClass: publishable ? 'AUTO_SAFE' : 'REVIEW_REQUIRED',
          matchedSourceRecordId,
          matchedCanonicalAction:
            action === 'MERGE_EXISTING_CANONICAL' ? 'ATTACH_EXISTING_PLACE' : null,
          newCanonicalAction:
            action === 'CREATE_SEPARATE_CANONICAL' || action === 'RETAIN_MULTI_GEOMETRY'
              ? 'CREATE_PLACE_AND_SOURCE_RECORD'
              : null,
          deferPublication: action === 'DEFER',
        },
        reason,
        evidenceReferences: evidenceReference(
          ordinal,
          duplicateByOrdinal.has(ordinal)
            ? 'source1000099Trace'
            : residualByOrdinal.has(ordinal)
              ? 'residualRows'
              : 'decisions',
        ),
        policyBatchId: 'DATA-R4-YORKSHIRE-ACTIVATION-POLICY-7BFEEA47',
      };
    });

  assertEqual(actions.length, 143, 'governed action count');
  assertEqual(
    new Set(actions.map((action) => action.activationOrdinal)).size,
    143,
    'governed action ordinal uniqueness',
  );
  assertEqual(
    actions.filter(
      (action) =>
        action.dataR2Decision === 'KEEP_SEPARATE_CANONICAL' &&
        action.governedAction !== 'CREATE_SEPARATE_CANONICAL',
    ).length,
    0,
    'keep-separate action mapping',
  );
  assertEqual(
    actions.filter(
      (action) =>
        action.dataR2Decision === 'DEFER_INSUFFICIENT_EVIDENCE' &&
        !['DEFER', 'RETAIN_MULTI_GEOMETRY'].includes(action.governedAction),
    ).length,
    0,
    'defer action mapping',
  );
  assertEqual(
    actions.filter(
      (action) =>
        action.dataR2Decision === 'REJECT_MATCH' && action.operationalDisposition === null,
    ).length,
    0,
    'reject action mapping',
  );

  const rejectedMatchAudit = actions
    .filter((action) => action.dataR2Decision === 'REJECT_MATCH')
    .map((action) => ({
      activationOrdinal: action.activationOrdinal,
      sourceRecordId: action.sourceRecordId,
      sourcePlaceName: action.sourcePlaceName,
      proposedCanonicalMatch: action.proposedCanonicalMatch,
      proposedCanonicalSourceRecordId: action.proposedCanonicalSourceRecordId,
      sourceRecordValid: true,
      proposedMatchRejected: true,
      sourceExclusionEvidence: false,
      alternateMatchCandidate: null,
      operationalDisposition: action.operationalDisposition,
      governedAction: action.governedAction,
      rationale: action.reason,
    }));

  const actionCounts = Object.fromEntries(
    [
      'MERGE_EXISTING_CANONICAL',
      'CREATE_SEPARATE_CANONICAL',
      'RETAIN_MULTI_GEOMETRY',
      'EXCLUDE_SOURCE',
      'DEFER',
    ].map((action) => [action, actions.filter((row) => row.governedAction === action).length]),
  );
  const reviewDerivedPublishable = actions.filter(
    (action) => action.activationTransform.candidateRetained,
  ).length;
  const residualPolicyRows = residualRows.length;
  const rejectedDeferred = rejectedMatchAudit.filter(
    (row) => row.governedAction === 'DEFER',
  ).length;

  const output = {
    schema: 'whilom.yorkshire.activation-policy.v1',
    sourceCheckpoint: SOURCE_CHECKPOINT,
    dataR1Checkpoint: DATA_R1_CHECKPOINT,
    dataR2Checkpoint: DATA_R2_CHECKPOINT,
    dataR2Artefacts: { markdown: DATA_R2_MARKDOWN_SHA, json: DATA_R2_JSON_SHA },
    dataR3Artefacts: { markdown: DATA_R3_MARKDOWN_SHA, json: DATA_R3_JSON_SHA },
    sealedCanonicalEvidenceHashes: Object.fromEntries(
      Object.entries(SEALED_HASHES).map(([path, hash]) => [relativePath(path), hash]),
    ),
    policyBatchId: 'DATA-R4-YORKSHIRE-ACTIVATION-POLICY-7BFEEA47',
    policyMethod: {
      reviewer: 'governed-activation-policy-batch',
      externalEvidenceUsed: false,
      activationPerformed: false,
      noSealedInputChanged: true,
      principles: [
        'APPROVE_MATCH maps to an existing canonical attachment; no such DATA-R2 row exists.',
        'KEEP_SEPARATE_CANONICAL maps to a new canonical place with no proposed target.',
        'REJECT_MATCH rejects only the proposed match; source exclusion requires separate evidence and is not assumed.',
        'DEFER remains blocked and unpublished.',
        'EXPECTED_MULTI_CANDIDATE retains each source geometry row without collapsing Buffer/Core evidence.',
      ],
    },
    activationArchitecture: {
      candidateInput:
        'regional-candidates.csv contains one normalized candidate per row; all are staged as needs_review.',
      mergeMechanism:
        'Set import_candidates.matched_entity_id through the source record matched by matched_source_record_id, then publish_import_candidate().',
      separateMechanism:
        'Clear matched_source_record_id/matched_entity_id, approve through the governed path, and publish_import_candidate() creates places plus source_records and related provenance.',
      deferMechanism:
        'Keep publication_class REVIEW_REQUIRED and do not send the row through the AUTO_SAFE publication loop.',
      provenance:
        'publish_import_candidate() writes normalized raw JSON and source position/provenance into source_records; source feature distinctions are not discarded by the policy.',
      currentToolingGap:
        'The existing activation SQL does not consume this derived policy. DATA-R5 must apply the policy before generating a new derived plan; no sealed plan or SQL was changed here.',
    },
    actionCounts,
    actions,
    rejectedMatchAudit,
    keepSeparateCompatibility: {
      checkedRows: actions.filter((action) => action.dataR2Decision === 'KEEP_SEPARATE_CANONICAL')
        .length,
      action: 'CREATE_SEPARATE_CANONICAL',
      compatibleWithCurrentPublicationFunction: true,
      representation:
        'One new place plus one source_records row per retained candidate; proposed canonical target is not used.',
      preserves: [
        'source name',
        'place type',
        'point/area-derived location',
        'designation',
        'raw provenance',
        'source position',
      ],
    },
    saltairePolicy: {
      sourceRecordId: '1000099',
      sourceName: 'Saltaire',
      ordinals: actions
        .filter((action) => action.sourceRecordId === '1000099')
        .map((action) => action.activationOrdinal),
      action: 'RETAIN_MULTI_GEOMETRY',
      currentSchemaRepresentation:
        'TWO_CANONICAL_PLACE_ROWS — one per retained Buffer/Core source geometry candidate',
      candidateRows: 2,
      canonicalPlaceCreations: 2,
      sourceFeaturesPreserved: 2,
      sameExternalIdHandling:
        'The source_records uniqueness key includes entity_id, so two separate place entities preserve both same-external-id feature rows without overwriting one raw payload.',
      onePlaceAlternative:
        'Not available without a schema/product change because places stores a point and source_records uniquely keys source/external/entity; DATA-R4 does not invent a geometry aggregation table or external-id rewrite.',
    },
    residualPolicy: {
      residualRows: residualPolicyRows,
      rejectedMatchDeferredRows: rejectedDeferred,
      totalDeferredRows: residualPolicyRows + rejectedDeferred,
      action: 'DEFER',
      publishable: false,
      canonicalPlaceCreations: 0,
    },
    projections: {
      autoSafeCandidateRows: 23171,
      reviewDerivedPublishableCandidateRows: reviewDerivedPublishable,
      excludedRows: actions.filter((action) => action.governedAction === 'EXCLUDE_SOURCE').length,
      deferredRows: actions.filter((action) => action.governedAction === 'DEFER').length,
      projectedPublishableCandidateRows: 23171 + reviewDerivedPublishable,
      autoSafeNewCanonicalCreations: 23146,
      autoSafeMerges: 25,
      reviewDerivedSeparateCanonicalCreations: actions.filter(
        (action) => action.governedAction === 'CREATE_SEPARATE_CANONICAL',
      ).length,
      reviewDerivedMerges: actions.filter(
        (action) => action.governedAction === 'MERGE_EXISTING_CANONICAL',
      ).length,
      saltaireCanonicalCreations: 2,
      projectedNewCanonicalCreations:
        23146 +
        actions.filter((action) =>
          ['CREATE_SEPARATE_CANONICAL', 'RETAIN_MULTI_GEOMETRY'].includes(action.governedAction),
        ).length,
      projectedExistingCanonicalMerges:
        25 +
        actions.filter((action) => action.governedAction === 'MERGE_EXISTING_CANONICAL').length,
      sourceRows: 23315,
      validCandidateRows: 23314,
      reviewRows: 143,
    },
    dryRunEligibility: {
      eligible: true,
      target: 'DATA-R5 — governed dry-run activation-plan regeneration',
      prerequisitesSatisfied: {
        everyReviewRowHasExplicitAction: true,
        unresolvedRowsExplicitlyBlocked: true,
        rejectedMatchSemanticsResolved: true,
        saltaireRepresentationResolvedForCurrentSchema: true,
        schemaModelBlocker: false,
        candidateIdsStable: true,
      },
      nextStepBoundary:
        'Regenerate a NEW derived plan through a fail-closed policy adapter. Do not overwrite sealed activation-plan.json and do not execute SQL.',
    },
    validationContract: {
      originalReviewRows: 143,
      governedActions: actions.length,
      uniqueActivationOrdinals: new Set(actions.map((action) => action.activationOrdinal)).size,
      autoSafeRowsIncluded: 0,
      deferredRowsPromoted: actions.filter(
        (action) =>
          action.dataR2Decision === 'DEFER_INSUFFICIENT_EVIDENCE' &&
          action.activationTransform.candidateRetained,
      ).length,
      candidateIdMismatches: 0,
      missingDecisions: 0,
      duplicateDecisions: 0,
    },
  };

  writeFileSync(OUTPUT_JSON, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  writeFileSync(OUTPUT_MARKDOWN, renderMarkdown(output), 'utf8');
}

run();
