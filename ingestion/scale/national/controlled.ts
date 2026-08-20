/**
 * Materialise the Batch 19B secondary composition-controlled national sample.
 *
 * The authoritative persisted order is read-only. Controlled samples are
 * written under the ignored national cache and are consumed by the ordinary
 * NHLE adapter through the same NDJSON path as the national ladder.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { NATIONAL_CACHE_DIR, NATIONAL_CACHE_FILE } from './paths';
import { NHLE_LAYERS } from '../../sources/historic-england/nhle-layers';
import { osGridSquare } from './audit';
import { interleavedOrder, type Cache, type Feature, type NationalTierFixture } from './tier';
import { compositionControlledPrefix, stableSampleDigest } from './workload-sampling';

export const CONTROLLED_SIZES = [25_000, 50_000, 100_000, 199_980] as const;
export const CONTROLLED_CACHE_DIR = resolve(NATIONAL_CACHE_DIR, 'controlled');

interface OrderedRecord {
  layerId: number;
  layerName: string;
  designation: string;
  cell: string;
  feature: Feature;
}

interface CountMap {
  [key: string]: number;
}

export interface ControlledSampleReport {
  records: number;
  layers: CountMap;
  layerPercentages: CountMap;
  designations: CountMap;
  designationPercentages: CountMap;
  cells: CountMap;
  cellPercentages: CountMap;
  sampleDigest: string;
  firstReference: string;
  lastReference: string;
  uniqueSourceRecordIds: number;
  duplicateSourceRecordIds: number;
}

export interface ControlledTierFixture extends NationalTierFixture {
  report: ControlledSampleReport;
}

function increment(map: CountMap, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function percentages(counts: CountMap, total: number): CountMap {
  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [
      key,
      Number(((value / Math.max(1, total)) * 100).toFixed(4)),
    ]),
  );
}

function cellFor(feature: Feature): string {
  const easting = Number(feature.attributes['Easting']);
  const northing = Number(feature.attributes['Northing']);
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return 'none';
  return osGridSquare(Math.floor(easting / 100_000), Math.floor(northing / 100_000));
}

function reference(record: OrderedRecord): string {
  return `${record.layerId}:${String(record.feature.attributes['ListEntry'] ?? 'missing')}`;
}

function loadOrderedRecords(): OrderedRecord[] {
  const cache = JSON.parse(readFileSync(NATIONAL_CACHE_FILE, 'utf8')) as Cache;
  return interleavedOrder(cache).map(({ layerIndex, feature }) => {
    const layer = cache.layers[layerIndex];
    if (!layer) throw new Error(`missing national layer ${layerIndex}`);
    return {
      layerId: layer.layerId,
      layerName: layer.layerName,
      designation: NHLE_LAYERS.find((item) => item.layerId === layer.layerId)?.designation ?? layer.layerName,
      cell: cellFor(feature),
      feature,
    };
  });
}

function reportFor(records: readonly OrderedRecord[]): ControlledSampleReport {
  const layers: CountMap = {};
  const designations: CountMap = {};
  const cells: CountMap = {};
  const sourceRecordIds = new Map<string, number>();
  for (const record of records) {
    increment(layers, record.layerName);
    increment(designations, record.designation);
    increment(cells, record.cell);
    const id = String(record.feature.attributes['ListEntry'] ?? 'missing');
    sourceRecordIds.set(id, (sourceRecordIds.get(id) ?? 0) + 1);
  }
  return {
    records: records.length,
    layers,
    layerPercentages: percentages(layers, records.length),
    designations,
    designationPercentages: percentages(designations, records.length),
    cells,
    cellPercentages: percentages(cells, records.length),
    sampleDigest: stableSampleDigest(records, reference),
    firstReference: records.length > 0 ? reference(records[0]!) : '',
    lastReference: records.length > 0 ? reference(records[records.length - 1]!) : '',
    uniqueSourceRecordIds: sourceRecordIds.size,
    duplicateSourceRecordIds: [...sourceRecordIds.values()].filter((count) => count > 1).length,
  };
}

export function controlledSample(size: number): { records: OrderedRecord[]; report: ControlledSampleReport; retrievedAt: string } {
  const cache = JSON.parse(readFileSync(NATIONAL_CACHE_FILE, 'utf8')) as Cache;
  const ordered = interleavedOrder(cache).map(({ layerIndex, feature }) => {
    const layer = cache.layers[layerIndex];
    if (!layer) throw new Error(`missing national layer ${layerIndex}`);
    return {
      layerId: layer.layerId,
      layerName: layer.layerName,
      designation: NHLE_LAYERS.find((item) => item.layerId === layer.layerId)?.designation ?? layer.layerName,
      cell: cellFor(feature),
      feature,
    };
  });
  const records = compositionControlledPrefix(ordered, size, (record) => `${record.cell}|${record.layerName}`);
  return {
    records,
    report: reportFor(records),
    retrievedAt: String(cache._source['retrievedAt'] ?? new Date().toISOString()),
  };
}

export function buildControlledNationalTier(size: number): ControlledTierFixture {
  const { records, report, retrievedAt } = controlledSample(size);
  mkdirSync(CONTROLLED_CACHE_DIR, { recursive: true });
  const path = resolve(CONTROLLED_CACHE_DIR, `controlled-tier-${size}.ndjson`);
  const lines = records.map((record) =>
    JSON.stringify({ layerId: record.layerId, attributes: record.feature.attributes, retrievedAt }),
  );
  writeFileSync(path, `${lines.join('\n')}\n`);
  return {
    path,
    size,
    mix: report.layers,
    mode: 'ndjson',
    report,
  };
}

export function loadControlledOrderForTest(): OrderedRecord[] {
  return loadOrderedRecords();
}
