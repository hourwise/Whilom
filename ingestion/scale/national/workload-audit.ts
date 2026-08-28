/**
 * Batch 19A diagnostic: explain the national 50k → 100k workload phase.
 *
 * This reads the existing persisted national order and runs only candidate
 * accounting over selected prefixes. It does not run the authoritative scale
 * gate, change matcher behavior, or replace the production national order.
 *
 *   pnpm --filter @whilom/ingestion national:workload-audit
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CandidateMode } from '../../matching/candidates';
import { ChunkedCandidateIndex } from '../../matching/chunked-candidates';
import type { CanonicalPlaceRef, PlaceCandidate } from '../../pipeline/candidate';
import { NHLE_LAYERS } from '../../sources/historic-england/nhle-layers';
import { executeTier } from '../run-tier';
import { buildNationalTier, interleavedOrder, type Cache, type Feature } from './tier';
import { compositionControlledPrefix } from './workload-sampling';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const INGESTION_ROOT = resolve(REPO_ROOT, 'ingestion');
const NATIONAL_CACHE_FILE = resolve(INGESTION_ROOT, '.national-cache', 'nhle-national-cache.json');
const OUTPUT = resolve(INGESTION_ROOT, 'national-workload-audit.json');
const AUDIT_PREFIXES = [25_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000, 125_000, 150_000, 175_000, 199_980];
const PAIR_PREFIXES = new Set([50_000, 100_000, 199_980]);

interface OrderedRecord {
  layerName: string;
  layerId: number;
  designation: string;
  cell: string;
  feature: Feature;
}

interface CountMap {
  [key: string]: number;
}

interface Composition {
  records: number;
  layers: CountMap;
  layerPercentages: CountMap;
  designations: CountMap;
  designationPercentages: CountMap;
  cells: CountMap;
  cellPercentages: CountMap;
  sourceIds: CountMap;
  uniqueSourceRecordIds: number;
  sharedSourceRecordIds: number;
}

interface PairMatrix {
  [candidateDesignation: string]: CountMap;
}

function increment(map: CountMap, key: string, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount;
}

function cellFor(feature: Feature): string {
  const easting = Number(feature.attributes['Easting']);
  const northing = Number(feature.attributes['Northing']);
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return 'none';
  return osGridSquare(Math.floor(easting / 100_000), Math.floor(northing / 100_000));
}

function osGridSquare(col: number, row: number): string {
  let l1 = 19 - row - ((19 - row) % 5) + Math.floor((col + 10) / 5);
  let l2 = (((19 - row) * 5) % 25) + (col % 5);
  if (l1 > 7) l1 += 1;
  if (l2 > 7) l2 += 1;
  const a = 'A'.charCodeAt(0);
  return String.fromCharCode(a + l1) + String.fromCharCode(a + l2);
}

function loadOrderedRecords(): OrderedRecord[] {
  const cache = JSON.parse(readFileSync(NATIONAL_CACHE_FILE, 'utf8')) as Cache;
  return interleavedOrder(cache).map(({ layerIndex, feature }) => {
    const layer = cache.layers[layerIndex];
    if (!layer) throw new Error(`missing layer ${layerIndex} in persisted national order`);
    const designation = NHLE_LAYERS.find((item) => item.layerId === layer.layerId)?.designation ?? layer.layerName;
    return {
      layerName: layer.layerName,
      layerId: layer.layerId,
      designation,
      cell: cellFor(feature),
      feature,
    };
  });
}

function composition(records: readonly OrderedRecord[]): Composition {
  const layers: CountMap = {};
  const designations: CountMap = {};
  const cells: CountMap = {};
  const sourceIds: CountMap = { 'historic-england-nhle': records.length };
  const sourceRecordIds = new Map<string, number>();
  for (const record of records) {
    increment(layers, record.layerName);
    increment(designations, record.designation);
    increment(cells, record.cell);
    const sourceRecordId = String(record.feature.attributes['ListEntry'] ?? 'missing');
    incrementMap(sourceRecordIds, sourceRecordId);
  }
  return {
    records: records.length,
    layers,
    layerPercentages: percentages(layers, records.length),
    designations,
    designationPercentages: percentages(designations, records.length),
    cells,
    cellPercentages: percentages(cells, records.length),
    sourceIds,
    uniqueSourceRecordIds: sourceRecordIds.size,
    sharedSourceRecordIds: [...sourceRecordIds.values()].filter((count) => count > 1).length,
  };
}

function percentages(counts: CountMap, total: number): CountMap {
  return Object.fromEntries(
    Object.entries(counts).map(([key, count]) => [key, Number(((count / Math.max(1, total)) * 100).toFixed(4))]),
  );
}

function incrementMap(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function firstAppearance(records: readonly OrderedRecord[]): {
  layers: Record<string, number>;
  designations: Record<string, number>;
  cells: Record<string, number>;
} {
  const layers: Record<string, number> = {};
  const designations: Record<string, number> = {};
  const cells: Record<string, number> = {};
  records.forEach((record, index) => {
    if (layers[record.layerName] === undefined) layers[record.layerName] = index + 1;
    if (designations[record.designation] === undefined) designations[record.designation] = index + 1;
    if (cells[record.cell] === undefined) cells[record.cell] = index + 1;
  });
  return { layers, designations, cells };
}

function addPair(matrix: PairMatrix, candidateDesignation: string, existingDesignation: string): void {
  const row = matrix[candidateDesignation] ?? {};
  increment(row, existingDesignation);
  matrix[candidateDesignation] = row;
}

function designationNames(candidate: PlaceCandidate): string[] {
  return candidate.designations.length > 0
    ? candidate.designations.map((item) => item.designation)
    : ['none'];
}

function existingDesignationNames(existing: CanonicalPlaceRef): string[] {
  return existing.sourceIdentity?.designations.length
    ? [...existing.sourceIdentity.designations]
    : ['none'];
}

function checkpointAround(records: readonly OrderedRecord[], index: number): OrderedRecord[] {
  return records.slice(Math.max(0, index - 3), Math.min(records.length, index + 3));
}

async function accountPrefix(size: number, ordered: readonly OrderedRecord[]): Promise<{
  size: number;
  composition: Composition;
  exactRadiusCandidates: number;
  registerPrunedCandidates: number;
  finalMatcherCandidates: number;
  conflicts: number;
  pairMatrix?: PairMatrix;
}> {
  const directory = resolve(INGESTION_ROOT, '.national-chunk-cache', `workload-audit-${size}-${process.pid}`);
  const store = new ChunkedCandidateIndex(directory, 65_536, CandidateMode.RegisterPruned);
  const pairMatrix: PairMatrix = {};
  const execution = await executeTier(size, CandidateMode.RegisterPruned, buildNationalTier, {
    candidateStore: store,
    chunkSize: 4_096,
    retainDecided: false,
    onCandidateSet: PAIR_PREFIXES.has(size)
      ? (candidate, shortlist) => {
          for (const existing of shortlist) {
            for (const candidateDesignation of designationNames(candidate)) {
              for (const existingDesignation of existingDesignationNames(existing)) {
                addPair(pairMatrix, candidateDesignation, existingDesignation);
              }
            }
          }
        }
      : undefined,
  });
  const result = {
    size,
    composition: composition(ordered.slice(0, size)),
    exactRadiusCandidates: execution.candidateStats.exactSpatialCandidates,
    registerPrunedCandidates: execution.candidateStats.registerVetoCandidates,
    finalMatcherCandidates: execution.candidateStats.finalCandidatePairs,
    conflicts: execution.report.outcomes['CONFLICT_REVIEW'] ?? 0,
    ...(PAIR_PREFIXES.has(size) ? { pairMatrix } : {}),
  };
  rmSync(directory, { recursive: true, force: true });
  return result;
}

async function main(): Promise<void> {
  const ordered = loadOrderedRecords();
  const compositions = Object.fromEntries(
    [25_000, 50_000, 100_000, 199_980].map((size) => [size, composition(ordered.slice(0, size))]),
  );
  const appearance = firstAppearance(ordered);
  const transition = {
    before50k: checkpointAround(ordered, 50_000),
    after50k: checkpointAround(ordered, 100_000),
  };
  const reuseAccounting = process.argv.includes('--reuse-accounting');
  const prefixes = reuseAccounting && existsSync(OUTPUT)
    ? ((JSON.parse(readFileSync(OUTPUT, 'utf8')) as { prefixes: Awaited<ReturnType<typeof accountPrefix>>[] }).prefixes)
    : [];
  if (!reuseAccounting) {
    for (const size of AUDIT_PREFIXES) {
      console.log(`auditing candidate workload prefix ${size.toLocaleString()}...`);
      prefixes.push(await accountPrefix(size, ordered));
    }
  }

  const controlledDesign = {
    status: 'DESIGNED' as const,
    strata: 'OS 100km cell × NHLE layer',
    algorithm:
      'For each requested size, allocate largest-remainder quotas proportional to the full persisted capture, take that many records from each stratum in persisted order, and concatenate strata by stable key. The authoritative order is not overwritten.',
    examples: [25_000, 50_000, 100_000, 199_980],
    sample: compositionControlledPrefix(ordered, Math.min(100, ordered.length), (record) => `${record.cell}|${record.layerName}`).length,
  };
  const output = {
    generatedAt: new Date().toISOString(),
    source: NATIONAL_CACHE_FILE,
    sourceRecords: ordered.length,
    authoritativeCheckpoints: compositions,
    firstAppearance: appearance,
    transition,
    prefixes,
    compositionControlledLadder: controlledDesign,
    officialScaleClassification: {
      maximumProvenSafeScale: 'PROVEN_SAFE_TO_50K',
      nationalExpansionClassification: 'REMEDIATION_INSUFFICIENT',
    },
  };
  writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ output, outputPath: OUTPUT }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
