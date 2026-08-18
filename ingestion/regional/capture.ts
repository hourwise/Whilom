/**
 * Fetch the regional dataset and write its reproducible manifest.
 *
 *   pnpm --filter @whilom/ingestion regional:capture
 *
 * Payloads are not committed. `regional-dataset-manifest.json` records the
 * boundary, the exact query, every list entry number and a checksum — enough to
 * rebuild the dataset byte-for-byte and to audit precisely which records the
 * region contains, without carrying megabytes of ArcGIS attributes in the
 * repository's history.
 *
 * Paths are derived from this module's own location, so nothing
 * machine-specific reaches the manifest.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NHLE_IMPORTER_VERSION, NHLE_LICENCE, NHLE_ATTRIBUTION } from '../sources/historic-england/nhle-adapter';
import {
  NHLE_SERVICE_URL,
  PUBLICATION_POLICY_VERSION,
  REGIONAL_DATASET_ID,
  REGIONAL_DATASET_VERSION,
  REGIONAL_ENVELOPE,
  REGIONAL_ENVELOPE_CRS,
  REGIONAL_ENVELOPE_DESCRIPTION,
  REGIONAL_EXCLUSIONS,
  REGIONAL_EXPECTED_RECORDS,
  REGIONAL_IMPORTER_VERSION,
  REGIONAL_LAYERS,
} from './dataset';

const HERE = dirname(fileURLToPath(import.meta.url));

export const REGIONAL_CACHE_DIR = resolve(HERE, '../.regional-cache');
export const REGIONAL_CACHE_FILE = resolve(REGIONAL_CACHE_DIR, 'nhle-regional.json');
export const REGIONAL_MANIFEST_FILE = resolve(HERE, 'regional-dataset-manifest.json');

export interface RegionalManifest {
  datasetId: string;
  datasetVersion: string;
  geographicScope: {
    envelope: typeof REGIONAL_ENVELOPE;
    crs: string;
    description: string;
    approximateAreaKm2: number;
  };
  source: { name: string; publisher: string; service: string; licence: string; attribution: string };
  sourceLayers: typeof REGIONAL_LAYERS;
  sourceQuery: Record<string, string>;
  exclusions: typeof REGIONAL_EXCLUSIONS;
  retrievalTimestamp: string;
  ingestionVersion: string;
  matcherVersion: string;
  publicationPolicyVersion: string;
  composition: { total: number; perLayer: Record<string, number>; expected: typeof REGIONAL_EXPECTED_RECORDS };
  cache: { file: string; sha256: string; bytes: number };
  /** Every list entry in the region, in retrieval order. The reproducible rule. */
  sourceRecordIds: number[];
}

interface Feature {
  attributes: Record<string, unknown>;
}

async function queryPage(layerId: number, offset: number, pageSize: number): Promise<Feature[]> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: JSON.stringify(REGIONAL_ENVELOPE),
    geometryType: 'esriGeometryEnvelope',
    inSR: '27700',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false',
    resultOffset: String(offset),
    resultRecordCount: String(pageSize),
    orderByFields: 'ListEntry ASC',
    f: 'json',
  });
  const response = await fetch(`${NHLE_SERVICE_URL}/${layerId}/query?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`layer ${layerId}: HTTP ${response.status}`);
  const body = (await response.json()) as { features?: Feature[]; error?: unknown };
  if (body.error) throw new Error(`layer ${layerId}: ${JSON.stringify(body.error).slice(0, 200)}`);
  return body.features ?? [];
}

export function sha256OfFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function readRegionalManifest(): RegionalManifest {
  return JSON.parse(readFileSync(REGIONAL_MANIFEST_FILE, 'utf8')) as RegionalManifest;
}

export async function capture(): Promise<RegionalManifest> {
  const existing = existsSync(REGIONAL_MANIFEST_FILE) ? readRegionalManifest() : null;
  if (existing && existsSync(REGIONAL_CACHE_FILE) && sha256OfFile(REGIONAL_CACHE_FILE) === existing.cache.sha256) {
    console.log('regional cache present and matches the manifest checksum; nothing to do');
    return existing;
  }

  const PAGE = 1000;
  const layers: { layerId: number; layerName: string; features: Feature[] }[] = [];
  const perLayer: Record<string, number> = {};
  const sourceRecordIds: number[] = [];

  for (const layer of REGIONAL_LAYERS) {
    const features: Feature[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await queryPage(layer.layerId, offset, PAGE);
      if (page.length === 0) break;
      features.push(...page);
      if (page.length < PAGE) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    for (const feature of features) {
      const listEntry = feature.attributes['ListEntry'];
      if (typeof listEntry === 'number') sourceRecordIds.push(listEntry);
    }
    perLayer[layer.layerName] = features.length;
    layers.push({ layerId: layer.layerId, layerName: layer.layerName, features });
    console.log(`  layer ${String(layer.layerId).padStart(2)} ${layer.layerName.padEnd(26)} ${features.length}`);
  }

  const total = layers.reduce((sum, l) => sum + l.features.length, 0);
  const retrievalTimestamp = new Date().toISOString();

  // Written in exactly the shape the unmodified NHLE adapter's file mode reads,
  // so the product dataset travels the same code path as everything else.
  mkdirSync(REGIONAL_CACHE_DIR, { recursive: true });
  writeFileSync(
    REGIONAL_CACHE_FILE,
    JSON.stringify({
      _source: {
        dataset: REGIONAL_DATASET_ID,
        publisher: 'Historic England',
        service: NHLE_SERVICE_URL,
        licence: NHLE_LICENCE,
        attribution: NHLE_ATTRIBUTION,
        envelope: REGIONAL_ENVELOPE,
        retrievedAt: retrievalTimestamp,
      },
      layers,
    }),
  );

  const { xmin, ymin, xmax, ymax } = REGIONAL_ENVELOPE;
  const manifest: RegionalManifest = {
    datasetId: REGIONAL_DATASET_ID,
    datasetVersion: REGIONAL_DATASET_VERSION,
    geographicScope: {
      envelope: REGIONAL_ENVELOPE,
      crs: REGIONAL_ENVELOPE_CRS,
      description: REGIONAL_ENVELOPE_DESCRIPTION,
      approximateAreaKm2: ((xmax - xmin) / 1000) * ((ymax - ymin) / 1000),
    },
    source: {
      name: 'National Heritage List for England (NHLE)',
      publisher: 'Historic England',
      service: NHLE_SERVICE_URL,
      licence: NHLE_LICENCE,
      attribution: NHLE_ATTRIBUTION,
    },
    sourceLayers: REGIONAL_LAYERS,
    sourceQuery: {
      where: '1=1',
      geometryType: 'esriGeometryEnvelope',
      inSR: '27700',
      spatialRel: 'esriSpatialRelIntersects',
      orderByFields: 'ListEntry ASC',
      returnGeometry: 'false',
      note: 'Paged at 1000 records per request; every layer taken in full with no quota.',
    },
    exclusions: REGIONAL_EXCLUSIONS,
    retrievalTimestamp,
    ingestionVersion: REGIONAL_IMPORTER_VERSION,
    matcherVersion: NHLE_IMPORTER_VERSION,
    publicationPolicyVersion: PUBLICATION_POLICY_VERSION,
    composition: { total, perLayer, expected: REGIONAL_EXPECTED_RECORDS },
    cache: {
      file: 'nhle-regional.json',
      sha256: sha256OfFile(REGIONAL_CACHE_FILE),
      bytes: readFileSync(REGIONAL_CACHE_FILE).length,
    },
    sourceRecordIds,
  };

  writeFileSync(REGIONAL_MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\ntotal ${total} records; manifest written`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  capture().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
