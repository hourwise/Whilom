import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type JsonRecord = Record<string, unknown>;

const ROOT = process.cwd();
const DATA_R2_JSON = join(ROOT, 'docs/evidence/yorkshire-governed-review-decisions.json');
const DATA_R2_MARKDOWN = join(ROOT, 'docs/evidence/YORKSHIRE_GOVERNED_REVIEW_DECISIONS.md');
const CACHE = join(ROOT, 'ingestion/.regional-cache/nhle-regional.json');
const MANIFEST = join(ROOT, 'ingestion/regional/regional-dataset-manifest.json');
const CANDIDATES = join(ROOT, 'ingestion/regional-candidates.csv');
const ACTIVATION_PLAN = join(ROOT, 'ingestion/regional-activation-plan.json');
const CONFLICTS = join(ROOT, 'ingestion/regional-conflicts.csv');
const APPROVED = join(ROOT, 'ingestion/regional-approved.csv');
const TEMPORAL = join(ROOT, 'ingestion/regional-temporal.csv');
const TEMPORAL_WIKIDATA = join(ROOT, 'ingestion/regional-temporal-wikidata.csv');
const TEMPORAL_REJECTED = join(ROOT, 'ingestion/regional-temporal-rejected.csv');
const TEMPORAL_AUDIT = join(ROOT, 'ingestion/regional-temporal-audit.json');
const ACTIVATE_SOURCE = join(ROOT, 'ingestion/regional/activate.ts');
const TEMPORAL_SOURCE = join(ROOT, 'ingestion/transforms/temporal.ts');
const ACTIVATION_SQL = join(ROOT, 'supabase/regional/activate.sql');
const OUTPUT_JSON = join(ROOT, 'docs/evidence/yorkshire-residual-review.json');
const OUTPUT_MARKDOWN = join(ROOT, 'docs/evidence/YORKSHIRE_RESIDUAL_REVIEW.md');

const SOURCE_CHECKPOINT = '8cc140e993d760d0412298f54b32ed643ff4e7f6';
const DATA_R2_MARKDOWN_SHA = 'B1A41E08B2945B18C456241871C4D8C4A964B859ADF9A2CA478BBBE608CDA1D8';
const DATA_R2_JSON_SHA = '2EDA6C46502CDA74350E999C4574777A507FB214237D1CEE2FC266CA04DA97FE';

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
  [ACTIVATE_SOURCE]: '5E17C7A6039954750B96333CA13A9A1AF2B21BB364ADF45B5CFFD5A4FA511C50',
  [TEMPORAL_SOURCE]: 'D501699CFF7D1D77AB7377CCED68129903DD2BA1195B8E7754AB5E906CB57D13',
  [ACTIVATION_SQL]: '692E881B230CF939092E29D2048BBCD77C4A7EFE6952E507DF211037CC935858',
};

const RESIDUAL_RATIONALES: Record<number, { summary: string; evidenceNeeded: string[] }> = {
  21068: {
    summary:
      'The proposed and source names are identical and the points are 10.3m apart, but the sealed rationale records a near-tie with another candidate. The source is a scheduled monument while the proposed record is a listed building, and the captured artefacts do not preserve enough competing-candidate identity/context to prove which physical bridge is intended.',
    evidenceNeeded: [
      'An authoritative identity/designation link distinguishing the two Tanfield Bridge candidates.',
    ],
  },
  21076: {
    summary:
      "The points are 9.2m apart and both labels describe St Peter's Church, but the source is a scheduled monument and the proposed record is a listed building. No source-specific alternate name or contextual description is captured that proves these are the same designation rather than overlapping records for different church elements.",
    evidenceNeeded: [
      'A source-level designation or description tying the scheduled monument to the proposed listed building.',
    ],
  },
  21166: {
    summary:
      "The points are 3.6m apart, but the names differ between The Abbot's Staithes and Abbots Staith Buildings and the inferred types conflict (archaeological_site versus structure). The captured evidence does not establish whether the entries denote the same remains or adjacent built elements.",
    evidenceNeeded: [
      'An authoritative identity or site-description link resolving the name/type difference.',
    ],
  },
  21198: {
    summary:
      'The names are the non-distinctive New Bridge and the points are 2.2m apart. The source is a scheduled monument and the proposed record is a listed building; proximity alone cannot establish identity for a generic bridge name.',
    evidenceNeeded: [
      'A distinctive locality, designation description or authoritative identity link for this New Bridge.',
    ],
  },
  21618: {
    summary:
      'The source names a moat at Fairburn Ings/Newton Abbey and the proposed record names the remains of Newton Abbey; the points are 16.6m apart and both infer abbey. The captured evidence does not establish whether the source is the same abbey remains or a separate moat feature within the wider site.',
    evidenceNeeded: [
      'A designation description or authoritative site plan connecting the moat and the proposed abbey remains.',
    ],
  },
  21823: {
    summary:
      'The source explicitly names Lord Dacre’s/Towton Cross and the proposed record contains Lord Dacres Cross; the points are 34.1m apart and both infer monument. The sealed evidence does not preserve enough contextual detail to distinguish a confirmed identity from a nearby cross reference.',
    evidenceNeeded: [
      'A source-level description or authoritative location identity for Lord Dacre’s Cross.',
    ],
  },
  21997: {
    summary:
      "The source is a cross base in All Saints' churchyard, while the proposed record is Church of All Saints; the points are 16.1m apart and the inferred types differ (monument versus church). The captured evidence supports proximity but not identity of the cross and church records.",
    evidenceNeeded: [
      'A designation description proving whether the cross base is included in the proposed church record or is a separate monument.',
    ],
  },
  22066: {
    summary:
      'The names are the generic Village cross/Village Cross and the points are 6.3m apart, with matching monument inference but different source designations. A shared generic label and proximity are insufficient to merge the records safely.',
    evidenceNeeded: [
      'A distinctive locality or authoritative designation identity for the village cross.',
    ],
  },
  22585: {
    summary:
      "The source describes St Leonard's Church plus a cross base adjacent to St Mary's Church, while the proposed record is Church of St Leonard's; the points are 2.2m apart and both infer church. The captured evidence does not determine whether the designation is a wider complex or a separate cross/ church relationship.",
    evidenceNeeded: [
      'A designation description or plan clarifying the boundary and included components.',
    ],
  },
  22714: {
    summary:
      'The source names an icehouse 75m north west of Sutton Hall and the proposed record names an ice house at Sutton Park approximately 75m north west of the house; the points are 8.0m apart. However, the inferred types differ (country_house versus historic_landscape), and the captured data does not resolve the source designation identity.',
    evidenceNeeded: [
      'A designation description confirming that both records refer to the same icehouse within Sutton Park.',
    ],
  },
  22751: {
    summary:
      'The names and inferred priory type agree, but the source is a 15.78ha scheduled area with an estimated 224.1m feature radius and the proposed point is 229.8m away, outside the 150m agreement radius. The area/centroid explanation is plausible but not captured strongly enough to prove identity without widening the global rule.',
    evidenceNeeded: [
      'A reliable boundary/centroid or designation identity showing that the two points represent the same Ellerton Priory area.',
    ],
  },
  22939: {
    summary:
      'The source is Haltemprice Augustinian priory and the proposed record is Haltemprice Priory Farm, 122.3m away. The inferred types conflict (priory versus monument), the name is not sufficiently distinctive, and the captured evidence does not establish whether the farm record is the priory remains or a separate property.',
    evidenceNeeded: [
      'An authoritative designation description distinguishing the priory remains from the farm record.',
    ],
  },
  23171: {
    summary:
      "The source is St Margaret's Church and churchyard and the proposed record is Church of St Margaret (old Church) and Boundary Wall, 5.4m away; both infer church. The source/proposed designations differ and the captured evidence does not prove whether the churchyard and boundary wall are the same published entity.",
    evidenceNeeded: [
      'A designation description or identity link confirming the scope of the old church and churchyard records.',
    ],
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
    const candidateId = fields[1];
    if (!candidateId || !fields[2]) continue;
    const candidate = JSON.parse(fields[2]) as JsonRecord;
    map.set(candidateId, {
      candidateId,
      status: fields[3],
      confidence: Number(fields[4]),
      publicationClass: fields[5],
      rationale: fields[6],
      candidate,
    });
  }
  return map;
}

function haversineMeters(a: JsonRecord, b: JsonRecord): number {
  const locationA = a.location as { lat: number; lng: number };
  const locationB = b.location as { lat: number; lng: number };
  const radians = Math.PI / 180;
  const dLat = (locationB.lat - locationA.lat) * radians;
  const dLng = (locationB.lng - locationA.lng) * radians;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(locationA.lat * radians) * Math.cos(locationB.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function candidateDetails(row: JsonRecord | undefined): JsonRecord | null {
  if (!row) return null;
  const candidate = row.candidate as JsonRecord;
  const provenance = candidate.provenance as JsonRecord;
  const designations = (candidate.designations as JsonRecord[] | undefined) ?? [];
  return {
    candidateId: row.candidateId,
    sourceRecordId: provenance.sourceRecordId,
    name: candidate.name,
    altNames: candidate.altNames,
    rawType: candidate.rawType,
    placeType: candidate.placeType,
    designations,
    location: candidate.location,
    locationMethod: candidate.locationMethod,
    locationAccuracyMeters: candidate.locationAccuracyMeters,
    sourcePosition: candidate.sourcePosition,
    areaHectares: candidate.areaHectares,
    sourceNotes: candidate.sourceNotes,
    warnings: candidate.warnings,
  };
}

function sourceFeatureRows(): JsonRecord[] {
  const cache = JSON.parse(readFileSync(CACHE, 'utf8')) as JsonRecord;
  const rows: JsonRecord[] = [];
  for (const layer of (cache.layers as JsonRecord[]) ?? []) {
    for (const feature of (layer.features as JsonRecord[]) ?? []) {
      const attributes = feature.attributes as JsonRecord | undefined;
      if (String(attributes?.ListEntry ?? '') !== '1000099') continue;
      rows.push({
        layerId: layer.layerId,
        layerName: layer.layerName,
        objectId: attributes?.OBJECTID,
        listEntry: attributes?.ListEntry,
        name: attributes?.Name,
        notes: attributes?.Notes,
        areaHectares: attributes?.area_ha,
        ngr: attributes?.NGR,
        easting: attributes?.Easting,
        northing: attributes?.Northing,
        originalUrl: attributes?.hyperlink,
      });
    }
  }
  return rows;
}

function sourceEvidence(
  d: JsonRecord,
  source: JsonRecord | null,
  matched: JsonRecord | null,
): JsonRecord {
  const sourceCandidate = source?.candidate as JsonRecord | undefined;
  const matchedCandidate = matched?.candidate as JsonRecord | undefined;
  return {
    sourceCandidate: candidateDetails(source),
    proposedCanonicalCandidate: candidateDetails(matched),
    sourceEvidenceReferences: d.sourceEvidenceReferences,
    sourceCoordinates: sourceCandidate?.location,
    candidateCoordinates: matchedCandidate?.location,
    computedDistanceMeters:
      sourceCandidate && matchedCandidate
        ? Number(haversineMeters(sourceCandidate, matchedCandidate).toFixed(1))
        : null,
  };
}

function run(): void {
  assertEqual(sha256(DATA_R2_MARKDOWN), DATA_R2_MARKDOWN_SHA, 'DATA-R2 Markdown hash');
  assertEqual(sha256(DATA_R2_JSON), DATA_R2_JSON_SHA, 'DATA-R2 JSON hash');
  const sealedHashes = Object.fromEntries(
    Object.entries(SEALED_HASHES).map(([path]) => [relativePath(path), sha256(path)]),
  );
  for (const [path, expected] of Object.entries(SEALED_HASHES)) {
    assertEqual(sha256(path), expected, `sealed artefact hash ${relativePath(path)}`);
  }

  const dataR2 = JSON.parse(readFileSync(DATA_R2_JSON, 'utf8')) as JsonRecord;
  const decisions = dataR2.decisions as JsonRecord[];
  assertEqual(decisions.length, 143, 'DATA-R2 decision count');
  const deferred = decisions.filter(
    (decision) => decision.reviewerDisposition === 'DEFER_INSUFFICIENT_EVIDENCE',
  );
  assertEqual(deferred.length, 15, 'DATA-R2 deferred count');

  const candidates = readCandidateRows();
  const duplicateDecisions = deferred.filter((decision) => decision.sourceRecordId === '1000099');
  const residualDecisions = deferred.filter((decision) => decision.sourceRecordId !== '1000099');
  assertEqual(duplicateDecisions.length, 2, 'source 1000099 deferred rows');
  assertEqual(residualDecisions.length, 13, 'non-duplicate deferred rows');

  const sourceRows = sourceFeatureRows();
  assertEqual(sourceRows.length, 2, 'sealed source 1000099 feature count');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as JsonRecord;
  const sourceRecordIds = manifest.sourceRecordIds as string[];
  const manifestIndexes = sourceRecordIds
    .map((value, index) => (String(value) === '1000099' ? index : -1))
    .filter((index) => index >= 0);
  assertEqual(manifestIndexes.length, 2, 'manifest source 1000099 occurrence count');

  const duplicateRows = duplicateDecisions.map((decision, index) => {
    const source = candidates.get(decision.candidateId as string);
    const sourceDetails = candidateDetails(source);
    return {
      activationOrdinal: decision.activationOrdinal,
      candidateId: decision.candidateId,
      sourceRecordId: decision.sourceRecordId,
      dataR2SourceObjectId: decision.sourceObjectId,
      actualSealedSourceObjectId: sourceRows[index]?.objectId,
      sourceFeature: sourceRows[index],
      candidate: sourceDetails,
      matcher: {
        proposedCanonicalSourceRecordId: decision.proposedCanonicalSourceRecordId,
        proposedCanonicalCandidateId: decision.proposedCanonicalCandidateId,
        rationale: decision.priorActivationRationale,
        outcome: 'MATCH_REVIEW',
        confidence: source?.confidence,
      },
      reviewerDisposition: decision.reviewerDisposition,
      pipelineDisposition: 'EXPECTED_MULTI_CANDIDATE',
      resolution: 'RETAIN_TWO_GEOMETRY_ROWS',
      rationale:
        'The sealed NHLE cache contains two geometry features for one World Heritage ListEntry: OBJECTID 15 is the Buffer Zone and OBJECTID 16 is the Core Area. The adapter and normalizer preserve one candidate per geometry feature, and the activation ordinal is part of the deterministic candidate ID. This is an expected multi-geometry source relationship, not an exact duplicate candidate-ID defect. The rows remain independently review-gated because no identity decision is granted by this evidence pass.',
    };
  });

  const residualRows = residualDecisions.map((decision) => {
    const candidate = candidates.get(decision.candidateId as string);
    const matched = candidates.get(decision.proposedCanonicalCandidateId as string);
    const rationale = RESIDUAL_RATIONALES[Number(decision.activationOrdinal)];
    if (!rationale)
      throw new Error(`Missing DATA-R3 rationale for ordinal ${decision.activationOrdinal}`);
    return {
      activationOrdinal: decision.activationOrdinal,
      candidateId: decision.candidateId,
      sourceId: decision.sourceId,
      sourceRecordId: decision.sourceRecordId,
      sourceObjectId: decision.sourceObjectId,
      sourcePlaceName: decision.sourcePlaceName,
      proposedCanonicalMatch: decision.proposedCanonicalMatch,
      proposedCanonicalSourceRecordId: decision.proposedCanonicalSourceRecordId,
      proposedCanonicalCandidateId: decision.proposedCanonicalCandidateId,
      matchClass: decision.matchClass,
      dataR1Taxonomy: decision.dataR1Taxonomy,
      nameSimilarityEvidence: decision.nameSimilarityEvidence,
      geographicDistance: {
        ...((decision.geographicDistance as JsonRecord | null) ?? {}),
        recomputedMeters:
          candidate && matched
            ? Number(
                haversineMeters(
                  candidate.candidate as JsonRecord,
                  matched.candidate as JsonRecord,
                ).toFixed(1),
              )
            : null,
      },
      placeTypeComparison: decision.placeTypeComparison,
      designationAreaStructureContext: decision.designationAreaStructureContext,
      sourceCoordinates: (candidate?.candidate as JsonRecord | undefined)?.location,
      candidateCoordinates: (matched?.candidate as JsonRecord | undefined)?.location,
      capturedEvidenceComparison: sourceEvidence(decision, candidate, matched),
      conflictingCandidateInformation: decision.conflictingCandidateInformation,
      sourceEvidenceReferences: decision.sourceEvidenceReferences,
      priorActivationRationale: decision.priorActivationRationale,
      duplicateSourceIndication: null,
      reviewerDisposition: 'DEFER_INSUFFICIENT_EVIDENCE',
      reviewerRationale: rationale.summary,
      evidenceNeeded: rationale.evidenceNeeded,
      reviewConfidence: 'INSUFFICIENT',
      reviewDecisionBatchId: 'DATA-R3-YORKSHIRE-RESIDUAL-8CC140E993D7',
      externalEvidence: [],
    };
  });

  const output = {
    schema: 'whilom.yorkshire.residual-review.v1',
    dataset: dataR2.dataset,
    sourceCheckpoint: SOURCE_CHECKPOINT,
    dataR2Artefacts: {
      markdown: DATA_R2_MARKDOWN_SHA,
      json: DATA_R2_JSON_SHA,
    },
    sealedCanonicalEvidenceHashes: sealedHashes,
    reviewMethod: {
      decisionBatchId: 'DATA-R3-YORKSHIRE-RESIDUAL-8CC140E993D7',
      reviewer: 'governed-residual-review-batch',
      externalEvidenceUsed: false,
      principles: [
        'Uses only sealed DATA-R2, candidate CSV, manifest and NHLE cache evidence.',
        'Does not lower matcher thresholds or introduce heuristic approvals.',
        'Treats the two 1000099 geometry rows as an expected multi-candidate source relationship.',
        'Keeps every unresolved residual identity decision deferred fail-closed.',
      ],
    },
    source1000099Trace: {
      sourceRecordId: '1000099',
      sourceName: 'Saltaire',
      firstDuplicateStage: 'SEALED_NHLE_CACHE_AND_CAPTURE_MANIFEST',
      rootCause:
        'Historic England exposes the World Heritage Site as two geometry rows for the same ListEntry. Capture records both features, the adapter emits both raw records, normalisation preserves both feature-specific area/notes values, and deterministic activation IDs use sourceRecordId plus activation ordinal. Duplication is therefore present before candidate generation and is expected for this multi-geometry source representation.',
      sourceCache: {
        rowCount: sourceRows.length,
        rows: sourceRows,
      },
      captureManifest: {
        occurrenceCount: manifestIndexes.length,
        zeroBasedIndexes: manifestIndexes,
        sourceRecordId: '1000099',
      },
      adapter: {
        emittedRawRows: 2,
        sourceRecordIds: ['1000099', '1000099'],
        sourceObjectIds: sourceRows.map((row) => row.objectId),
      },
      normalisation: {
        validRows: 2,
        candidateIds: duplicateRows.map((row) => row.candidateId),
        normalizedCandidates: duplicateRows.map((row) => row.candidate),
      },
      candidateGeneration: {
        rows: 2,
        candidateIds: duplicateRows.map((row) => row.candidateId),
        idRule:
          'candidateUuid(sourceRecordId, activationOrdinal) — ordinal keeps geometry rows distinct.',
      },
      matcher: {
        rows: 2,
        outcomes: duplicateRows.map((row) => row.matcher),
      },
      activationClassification: {
        rows: 2,
        publicationClass: 'REVIEW_REQUIRED',
        outcome: 'MATCH_REVIEW',
        approvedRows: 0,
      },
      reviewArtefact: {
        rows: 2,
        ordinals: duplicateRows.map((row) => row.activationOrdinal),
        pipelineDisposition: 'EXPECTED_MULTI_CANDIDATE',
        priorDataR2ObjectIdProjectionCorrection:
          'DATA-R2 sourceEvidence.objectId was 15 for both rows because its derived lookup selected the first same-coordinate cache feature. The sealed cache itself contains OBJECTID 15 (Buffer Zone) and OBJECTID 16 (Core Area); this DATA-R3 artefact uses the actual feature order and object IDs.',
      },
      remediation: {
        required: false,
        productionCodeChanged: false,
        reason:
          'No generic pipeline defect was found. Existing source-relation documentation and the curtilage-merges regression test cover repeated NHLE geometry rows. Deduplicating by ListEntry would erase the meaningful Buffer/Core distinction.',
      },
    },
    sourceDuplicateRows: duplicateRows,
    residualRows,
    residualDecisionCounts: {
      APPROVE_MATCH: 0,
      REJECT_MATCH: 0,
      KEEP_SEPARATE_CANONICAL: 0,
      DEFER_INSUFFICIENT_EVIDENCE: residualRows.length,
    },
    residualTaxonomyCounts: Object.fromEntries(
      [...new Set(residualRows.map((row) => row.dataR1Taxonomy as string))]
        .sort()
        .map((taxonomy) => [
          taxonomy,
          residualRows.filter((row) => row.dataR1Taxonomy === taxonomy).length,
        ]),
    ),
    stability: {
      productionCodeChanged: false,
      candidateIdsChanged: [],
      unrelatedDispositionChanges: [],
      candidateIdStability:
        'UNCHANGED — no pipeline reclassification was run because no production code changed.',
    },
    revisedActivationProjection: {
      existingAutoSafe: 23171,
      dataR2KeepSeparateCanonical: 110,
      dataR3ApprovedMatches: 0,
      dataR2RejectedMatches: 18,
      dataR3ResidualDeferred: residualRows.length,
      expectedMultiCandidateRowsRetained: duplicateRows.length,
      expectedMultiCandidateRowsRemoved: 0,
      projectedPublishableCandidateRows: 23281,
      projectedBlockedRows: 33,
      note: 'No new row is made publishable by DATA-R3. The two 1000099 geometry candidates are retained but remain review-gated; the 13 non-duplicate residual rows remain deferred. The 33 blocked rows therefore remain 18 rejected + 13 residual deferred + 2 expected multi-candidate rows.',
    },
    validation: {
      deferredRowsRepresented: deferred.length,
      source1000099RowsRepresented: duplicateRows.length,
      residualRowsRepresented: residualRows.length,
      externalEvidenceRecords: 0,
      activationPerformed: false,
    },
  };

  const jsonText = `${JSON.stringify(output, null, 2)}\n`;
  writeFileSync(OUTPUT_JSON, jsonText, 'utf8');
  writeFileSync(OUTPUT_MARKDOWN, renderMarkdown(output), 'utf8');
}

function renderMarkdown(output: JsonRecord): string {
  const trace = output.source1000099Trace as JsonRecord;
  const duplicateRows = output.sourceDuplicateRows as JsonRecord[];
  const residualRows = output.residualRows as JsonRecord[];
  const projection = output.revisedActivationProjection as JsonRecord;
  const counts = output.residualDecisionCounts as JsonRecord;
  const taxonomyCounts = output.residualTaxonomyCounts as Record<string, number>;
  const lines: string[] = [
    '# Yorkshire DATA-R3 Residual Review',
    '',
    `Derived from governed DATA-R2 checkpoint ${SOURCE_CHECKPOINT}. This is offline review evidence only; it does not replace sealed activation inputs and does not authorize activation.`,
    '',
    '## Evidence and scope',
    '',
    `- DATA-R2 Markdown SHA-256: \`${DATA_R2_MARKDOWN_SHA}\``,
    `- DATA-R2 JSON SHA-256: \`${DATA_R2_JSON_SHA}\``,
    '- External evidence used: no.',
    '- Production ingestion code changed: no.',
    '- Hosted activation performed: no.',
    '',
    '## Source 1000099 trace',
    '',
    `The first duplicated logical identity is the sealed NHLE cache/capture boundary. The cache contains ${trace.sourceCache && (trace.sourceCache as JsonRecord).rowCount} World Heritage geometry rows for ListEntry \`1000099\`, both named Saltaire, with distinct OBJECTIDs 15 (Buffer Zone) and 16 (Core Area). The capture manifest preserves two occurrences.`,
    '',
    '| Stage | Rows | Evidence |',
    '|---|---:|---|',
    '| Sealed NHLE cache | 2 | OBJECTIDs 15/16; same ListEntry, name, layer and URL; feature notes distinguish Buffer/Core. |',
    '| Capture manifest | 2 | ListEntry `1000099` at zero-based indexes 23313 and 23314. |',
    '| File adapter | 2 | One raw record per source feature; sourceRecordId remains `1000099`. |',
    '| Normalisation | 2 | Both valid; feature-specific area/notes are preserved; same normalized Saltaire identity/location. |',
    '| Candidate generation | 2 | Stable IDs `afd0cd1d-...0099` and `afd0cd1e-...0099`; ordinal prevents collision. |',
    '| Matcher/classifier | 2 | Both `MATCH_REVIEW` / `REVIEW_REQUIRED`; no approved rows. |',
    '| DATA-R2 review | 2 | Independently retained and deferred. |',
    '',
    `**Root cause:** ${trace.rootCause}`,
    '',
    `**Pipeline disposition:** \`${duplicateRows[0]?.pipelineDisposition}\`. The rows are retained, not silently deduplicated. DATA-R2's repeated OBJECTID 15 projection was a derived lookup limitation; the sealed cache itself contains OBJECTIDs 15 and 16.`,
    '',
    'No generic remediation is justified. Deduplicating by ListEntry would collapse meaningful Buffer/Core geometry evidence. Existing source-relation handling and the repeated-NHLE-geometry regression coverage remain applicable.',
    '',
    '## Residual 13-row method',
    '',
    'The two 1000099 rows were excluded from this identity pass. The remaining 13 rows were reviewed against sealed candidate JSON, DATA-R2 rationale/conflicts, coordinates, inferred types, designations, alternate names, source warnings and temporal evidence. No threshold was lowered, no heuristic approval was introduced, and no external enrichment was used. Every case remains deferred because the captured evidence does not safely establish identity, rejection, or an independently publishable canonical record.',
    '',
    '| Ordinal | Taxonomy | Source | Proposed canonical | Distance | Decision |',
    '|---:|---|---|---|---:|---|',
  ];
  for (const row of residualRows) {
    lines.push(
      `| ${row.activationOrdinal} | ${row.dataR1Taxonomy} | ${escapeCell(String(row.sourcePlaceName))} | ${escapeCell(String(row.proposedCanonicalMatch))} | ${String((row.geographicDistance as JsonRecord).recomputedMeters)}m | DEFER_INSUFFICIENT_EVIDENCE |`,
    );
  }
  lines.push('', '### Residual decisions', '');
  for (const row of residualRows) {
    lines.push(`#### Ordinal ${row.activationOrdinal} — ${row.sourcePlaceName}`);
    lines.push('');
    lines.push(
      `- Candidate: \`${row.candidateId}\`; source record: \`${row.sourceRecordId}\`; DATA-R1 taxonomy: \`${row.dataR1Taxonomy}\`.`,
    );
    lines.push(
      `- Proposed canonical: ${row.proposedCanonicalMatch} (source record \`${row.proposedCanonicalSourceRecordId}\`).`,
    );
    lines.push(`- Evidence comparison: ${compactEvidence(row)}.`);
    lines.push(`- Decision: **DEFER_INSUFFICIENT_EVIDENCE** — ${row.reviewerRationale}`);
    lines.push(`- Additional evidence needed: ${(row.evidenceNeeded as string[]).join(' ')}`);
    lines.push('');
  }
  lines.push(
    '## Decision totals',
    '',
    '| Residual disposition | Count |',
    '|---|---:|',
    `| APPROVE_MATCH | ${counts.APPROVE_MATCH} |`,
    `| REJECT_MATCH | ${counts.REJECT_MATCH} |`,
    `| KEEP_SEPARATE_CANONICAL | ${counts.KEEP_SEPARATE_CANONICAL} |`,
    `| DEFER_INSUFFICIENT_EVIDENCE | ${counts.DEFER_INSUFFICIENT_EVIDENCE} |`,
    '',
    '| Residual taxonomy | Count |',
    '|---|---:|',
  );
  for (const taxonomy of Object.keys(taxonomyCounts).sort())
    lines.push(`| ${taxonomy} | ${taxonomyCounts[taxonomy]} |`);
  lines.push(
    '',
    '## Revised dry projection',
    '',
    `- Existing AUTO_SAFE: **${projection.existingAutoSafe}**.`,
    `- DATA-R2 KEEP_SEPARATE_CANONICAL: **${projection.dataR2KeepSeparateCanonical}**.`,
    `- DATA-R3 approvals: **${projection.dataR3ApprovedMatches}**.`,
    `- DATA-R2 rejected rows: **${projection.dataR2RejectedMatches}**.`,
    `- DATA-R3 residual deferred rows: **${projection.dataR3ResidualDeferred}**.`,
    `- Expected multi-candidate 1000099 rows retained: **${projection.expectedMultiCandidateRowsRetained}**; removed: **${projection.expectedMultiCandidateRowsRemoved}**.`,
    `- Projected publishable candidate rows: **${projection.projectedPublishableCandidateRows}**.`,
    `- Projected blocked rows: **${projection.projectedBlockedRows}**.`,
    '',
    'This remains a projection only. The sealed activation plan, candidate artefacts, SQL and hosted database were not changed. The recommended next step is a separately governed activation-policy decision for the 18 rejected rows, 13 residual deferred rows and the two retained 1000099 geometry rows; no activation should proceed from this artefact alone.',
    '',
  );
  return lines.join('\n');
}

function compactEvidence(row: JsonRecord): string {
  const source = row.capturedEvidenceComparison as JsonRecord;
  const sourceCandidate = source.sourceCandidate as JsonRecord;
  const proposed = source.proposedCanonicalCandidate as JsonRecord;
  const sourceDesignations =
    ((sourceCandidate.designations as JsonRecord[]) ?? []).map((d) => d.designation).join(', ') ||
    'none';
  const proposedDesignations =
    ((proposed.designations as JsonRecord[]) ?? []).map((d) => d.designation).join(', ') || 'none';
  return `${sourceCandidate.name} (${sourceCandidate.placeType}, ${sourceDesignations}) versus ${proposed.name} (${proposed.placeType}, ${proposedDesignations}), ${source.computedDistanceMeters}m apart`;
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

run();
