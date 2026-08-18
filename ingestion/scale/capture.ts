/**
 * Regenerate the scale-experiment dataset from `manifest.json`.
 *
 * The payloads are deliberately NOT committed: ~5,000 NHLE records is 1.8MB of
 * churn that would dominate the repository's diff history and tell a reader
 * nothing. What is committed is the manifest — the service, the exact grid
 * envelope, the layer quotas, the ordering rule, the checksum, and the full
 * ordered list of ListEntry numbers. That is enough to rebuild the dataset
 * byte-for-byte and to audit precisely which records the experiment used.
 *
 *   pnpm --filter @whilom/ingestion scale:capture
 *
 * Writes to `.scale-cache/` (git-ignored). In CI the same file is restored from
 * the actions cache when the checksum still matches, so a re-run of the ladder
 * does not re-query Historic England.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const CACHE_DIR = resolve(HERE, '../.scale-cache');
export const CACHE_FILE = resolve(CACHE_DIR, 'nhle-scale-cache.json');
export const MANIFEST_FILE = resolve(HERE, 'manifest.json');

export interface ScaleManifest {
  dataset: string;
  publisher: string;
  licence: string;
  service: string;
  capture: {
    envelope: { xmin: number; ymin: number; xmax: number; ymax: number };
    envelopeCrs: string;
    envelopeDescription: string;
    spatialRel: string;
    orderByFields: string;
    retrievedAt: string;
    layerQuotas: { layerId: number; layerName: string; quota: number }[];
  };
  composition: { total: number; perLayer: Record<string, number>; note: string };
  tierOrder: { strategy: string; tiers: { size: number; mix: Record<string, number> }[] };
  cache: { file: string; sha256: string; bytes: number };
  /** Every ListEntry, in stratified tier order. Tier N is the first N. */
  order: number[];
}

export function readManifest(): ScaleManifest {
  return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) as ScaleManifest;
}

export function sha256OfFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

interface Feature {
  attributes: Record<string, unknown>;
}

async function queryPage(
  service: string,
  layerId: number,
  envelope: unknown,
  offset: number,
  pageSize: number,
): Promise<Feature[]> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: JSON.stringify(envelope),
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
  const response = await fetch(`${service}/${layerId}/query?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`layer ${layerId}: HTTP ${response.status}`);
  const body = (await response.json()) as { features?: Feature[]; error?: unknown };
  if (body.error) throw new Error(`layer ${layerId}: ${JSON.stringify(body.error).slice(0, 200)}`);
  return body.features ?? [];
}

export async function capture(): Promise<void> {
  const manifest = readManifest();

  if (existsSync(CACHE_FILE) && sha256OfFile(CACHE_FILE) === manifest.cache.sha256) {
    console.log('cache present and matches the manifest checksum; nothing to do');
    return;
  }

  // Only the records the manifest names are kept, so a later upstream edit
  // adding or removing entries cannot silently change the experiment.
  const wanted = new Set(manifest.order);
  const collected = new Map<number, { layerId: number; layerName: string; attributes: Record<string, unknown> }>();

  for (const layer of manifest.capture.layerQuotas) {
    let seen = 0;
    for (let offset = 0; ; offset += 1000) {
      const features = await queryPage(manifest.service, layer.layerId, manifest.capture.envelope, offset, 1000);
      if (features.length === 0) break;
      for (const feature of features) {
        const listEntry = feature.attributes['ListEntry'];
        if (typeof listEntry !== 'number' || !wanted.has(listEntry)) continue;
        collected.set(listEntry, {
          layerId: layer.layerId,
          layerName: layer.layerName,
          attributes: feature.attributes,
        });
        seen += 1;
      }
      if (features.length < 1000 || seen >= layer.quota) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    console.log(`  layer ${layer.layerId} ${layer.layerName}: ${seen}`);
  }

  const missing = manifest.order.filter((id) => !collected.has(id));
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} manifest records are no longer retrievable (first: ${missing.slice(0, 5).join(', ')}). ` +
        'Historic England has changed the register; regenerate the manifest deliberately rather than running a partial tier.',
    );
  }

  const byLayer = new Map<number, { layerId: number; layerName: string; features: Feature[] }>();
  for (const listEntry of manifest.order) {
    const record = collected.get(listEntry)!;
    let block = byLayer.get(record.layerId);
    if (!block) {
      block = { layerId: record.layerId, layerName: record.layerName, features: [] };
      byLayer.set(record.layerId, block);
    }
    block.features.push({ attributes: record.attributes });
  }

  const cache = {
    _source: {
      dataset: manifest.dataset,
      publisher: manifest.publisher,
      service: manifest.service,
      licence: manifest.licence,
      attribution:
        '© Historic England. Contains Ordnance Survey data © Crown copyright and database right. Licensed under the Open Government Licence v3.0.',
      envelope: manifest.capture.envelope,
      retrievedAt: manifest.capture.retrievedAt,
    },
    layers: [...byLayer.values()].sort((a, b) => a.layerId - b.layerId),
  };

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache));

  const actual = sha256OfFile(CACHE_FILE);
  if (actual !== manifest.cache.sha256) {
    console.warn(
      `warning: rebuilt cache checksum ${actual} does not match the manifest's ${manifest.cache.sha256}.\n` +
        'The same records were retrieved, but at least one attribute value has changed upstream. ' +
        'Results remain comparable by record set, not byte-for-byte.',
    );
  }
  console.log(`wrote ${CACHE_FILE} (${manifest.order.length} records)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  capture().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
