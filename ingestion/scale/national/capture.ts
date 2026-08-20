/**
 * A deterministic, geographically stratified national NHLE sample.
 *
 *   pnpm --filter @whilom/ingestion national:capture
 *
 * The existing scale ladder (scale/manifest.json) is a single Yorkshire
 * envelope. That was the right dataset for proving the pipeline correct, and
 * the wrong one for proving it scales NATIONALLY: Yorkshire is one density
 * regime, and a national map has to survive London as well as the Dales.
 *
 * So this samples across the whole country. The audit found 27 occupied OS
 * 100km cells with the densest (TQ, London) holding 12.9% of the dominant
 * layer, and this sample reproduces that distribution rather than flattening
 * it. A benchmark on uniformly spread points would be a benchmark on a country
 * that does not exist.
 *
 * ---------------------------------------------------------------------------
 * Determinism
 * ---------------------------------------------------------------------------
 *
 * No randomness. The sample is defined entirely by the committed manifest:
 *
 *   - each occupied cell gets a quota proportional to its national share;
 *   - within a cell, records are taken in ListEntry-ascending order;
 *   - the tier order interleaves cells so that any prefix of size N carries
 *     the same national mix — tier 25k and tier 100k differ in size, not in
 *     character.
 *
 * The manifest records every cell, quota and the checksum of the assembled
 * cache, so the sample is auditable and rebuildable byte-for-byte without
 * committing hundreds of thousands of records.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INGESTED_LAYERS, NHLE_SERVICE } from './audit';
import type { Cache as TierCache } from './tier';

const HERE = dirname(fileURLToPath(import.meta.url));
export const NATIONAL_CACHE_DIR = resolve(HERE, '../../.national-cache');
export const NATIONAL_CACHE_FILE = resolve(NATIONAL_CACHE_DIR, 'nhle-national-cache.json');
export const LEGACY_NATIONAL_CACHE_FILE = resolve(
  NATIONAL_CACHE_DIR,
  'nhle-national-cache-legacy-100k.json',
);
export const NATIONAL_MANIFEST_FILE = resolve(HERE, 'manifest.json');

/** National checkpoints. Capture may supply fewer; the ladder reports NOT_RUN. */
export const NATIONAL_CHECKPOINTS = [25_000, 50_000, 100_000, 200_000] as const;
export const NATIONAL_SAMPLE_SIZE = 200_000;

const CELL_M = 100_000;
const GRID_COLS = 7;
const GRID_ROWS = 13;
const USER_AGENT =
  'WhilomNationalPilot/0.1 (https://github.com/hourwise/Whilom; philgeran@gmail.com)';

export interface NationalManifest {
  dataset: string;
  publisher: string;
  licence: string;
  service: string;
  strategy: string;
  sampleSize: number;
  checkpoints: number[];
  retrievedAt: string;
  /** Per-cell, per-layer quotas that define the sample. */
  cells: { cell: string; col: number; row: number; nationalCount: number; quota: number }[];
  composition: { total: number; perLayer: Record<string, number> };
  cache: { file: string; sha256: string; bytes: number };
}

interface Feature {
  attributes: Record<string, unknown>;
}

function stableFeatureKey(layerId: number, feature: Feature): string {
  const attributes = feature.attributes;
  const value = attributes['ListEntry'] ?? attributes['NHLE_ID'] ?? attributes['RecordID'];
  return `${layerId}|${String(value)}`;
}

function cacheOrder(cache: TierCache): { layerIndex: number; feature: Feature }[] {
  if (cache.order) {
    return cache.order.map(({ layerIndex, featureIndex }) => {
      const feature = cache.layers[layerIndex]?.features[featureIndex];
      if (!feature) throw new Error('national cache order points to a missing feature');
      return { layerIndex, feature };
    });
  }
  const byCell = new Map<string, { layerIndex: number; feature: Feature }[]>();
  cache.layers.forEach((layer, layerIndex) => {
    for (const feature of layer.features) {
      const e = Number(feature.attributes['Easting']);
      const n = Number(feature.attributes['Northing']);
      const key =
        Number.isFinite(e) && Number.isFinite(n)
          ? `${Math.floor(e / CELL_M)},${Math.floor(n / CELL_M)}`
          : 'none';
      const bucket = byCell.get(key) ?? [];
      bucket.push({ layerIndex, feature });
      byCell.set(key, bucket);
    }
  });
  const cells = [...byCell.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  const cursors = new Map(cells.map(([key]) => [key, 0]));
  const order: { layerIndex: number; feature: Feature }[] = [];
  let remaining = cells.reduce((sum, [, list]) => sum + list.length, 0);
  while (remaining > 0) {
    for (const [key, list] of cells) {
      const at = cursors.get(key) ?? 0;
      if (at >= list.length) continue;
      const take = Math.max(1, Math.round(list.length / 100));
      for (let i = 0; i < take && at + i < list.length; i += 1) {
        order.push(list[at + i]!);
        remaining -= 1;
      }
      cursors.set(key, at + take);
    }
  }
  return order;
}

async function arcgis(layer: number, params: Record<string, string>): Promise<any> {
  const url = `${NHLE_SERVICE}/${layer}/query?${new URLSearchParams({ ...params, f: 'json' })}`;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      if (response.ok) {
        const body = (await response.json()) as { error?: unknown } & Record<string, unknown>;
        if (body.error)
          throw new Error(`layer ${layer}: ${JSON.stringify(body.error).slice(0, 160)}`);
        return body;
      }
      if (response.status < 500 && response.status !== 429)
        throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === 5) throw error;
    }
    await new Promise((r) => setTimeout(r, 1_500 * 2 ** (attempt - 1)));
  }
  throw new Error('unreachable');
}

function envelope(col: number, row: number) {
  return {
    xmin: col * CELL_M,
    ymin: row * CELL_M,
    xmax: (col + 1) * CELL_M,
    ymax: (row + 1) * CELL_M,
  };
}

function envParams(env: ReturnType<typeof envelope>): Record<string, string> {
  return {
    geometry: JSON.stringify(env),
    geometryType: 'esriGeometryEnvelope',
    inSR: '27700',
    spatialRel: 'esriSpatialRelIntersects',
  };
}

async function cellCount(layer: number, env: ReturnType<typeof envelope>): Promise<number> {
  const body = await arcgis(layer, { where: '1=1', returnCountOnly: 'true', ...envParams(env) });
  return Number(body.count ?? 0);
}

/** Fetch up to `limit` records of a layer within a cell, ListEntry-ascending. */
async function fetchCell(
  layer: number,
  env: ReturnType<typeof envelope>,
  limit: number,
): Promise<Feature[]> {
  const out: Feature[] = [];
  const page = 2000;
  for (let offset = 0; out.length < limit; offset += page) {
    const body = await arcgis(layer, {
      where: '1=1',
      outFields: '*',
      returnGeometry: 'false',
      orderByFields: 'ListEntry ASC',
      resultOffset: String(offset),
      resultRecordCount: String(Math.min(page, limit - out.length)),
      ...envParams(env),
    });
    const features = (body.features ?? []) as Feature[];
    if (features.length === 0) break;
    out.push(...features);
  }
  return out.slice(0, limit);
}

/**
 * Osgrid label for a cell — imported behaviour, duplicated as a tiny helper to
 * avoid a cycle with audit.ts's default export path.
 */
function osGridSquare(col: number, row: number): string {
  let l1 = 19 - row - ((19 - row) % 5) + Math.floor((col + 10) / 5);
  let l2 = (((19 - row) * 5) % 25) + (col % 5);
  if (l1 > 7) l1 += 1;
  if (l2 > 7) l2 += 1;
  const a = 'A'.charCodeAt(0);
  return String.fromCharCode(a + l1) + String.fromCharCode(a + l2);
}

export async function captureNational(
  options: {
    sampleSize?: number;
    outputFile?: string;
    outputManifestFile?: string;
    previousCacheFile?: string;
  } = {},
): Promise<NationalManifest> {
  const sampleSize = options.sampleSize ?? NATIONAL_SAMPLE_SIZE;
  const outputFile = options.outputFile ?? NATIONAL_CACHE_FILE;
  const outputManifestFile = options.outputManifestFile ?? NATIONAL_MANIFEST_FILE;
  const previousCacheFile = options.previousCacheFile ?? outputFile;
  const previousCache = existsSync(previousCacheFile)
    ? (JSON.parse(readFileSync(previousCacheFile, 'utf8')) as TierCache)
    : undefined;
  // 1. Measure each occupied cell across all ingested layers. Per-layer counts
  //    are kept so phase 3 does not re-query them.
  const occupied: {
    cell: string;
    col: number;
    row: number;
    nationalCount: number;
    layerCounts: number[];
  }[] = [];
  for (let col = 0; col < GRID_COLS; col += 1) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      const env = envelope(col, row);
      const layerCounts = await Promise.all(INGESTED_LAYERS.map((l) => cellCount(l.id, env)));
      const n = layerCounts.reduce((a, b) => a + b, 0);
      if (n > 0)
        occupied.push({ cell: osGridSquare(col, row), col, row, nationalCount: n, layerCounts });
    }
  }
  const nationalTotal = occupied.reduce((sum, c) => sum + c.nationalCount, 0);

  // 2. Proportional quota per cell. Largest-remainder rounding so the quotas
  //    sum to exactly the sample size rather than drifting by rounding.
  const raw = occupied.map((c) => ({
    ...c,
    exact: (sampleSize * c.nationalCount) / nationalTotal,
  }));
  const quotas = raw.map((c) => ({ ...c, quota: Math.floor(c.exact) }));
  let assigned = quotas.reduce((sum, c) => sum + c.quota, 0);
  quotas
    .map((c, i) => ({ i, frac: c.exact - Math.floor(c.exact) }))
    .sort((a, b) => b.frac - a.frac)
    .slice(0, sampleSize - assigned)
    .forEach(({ i }) => {
      const q = quotas[i];
      if (q) q.quota += 1;
    });

  // 3. Fetch each cell, distributing its quota across layers in proportion to
  //    the layers present there. Points dominate, but scheduled monuments and
  //    the rest carry the behaviours the matcher must still handle.
  const perLayer: Record<string, number> = {};
  // Emit the field names the NHLE adapter reads from a fixture: `layerId` and
  // `layerName`, not the audit module's `id`/`name`.
  const layers = INGESTED_LAYERS.map((l) => ({
    layerId: l.id,
    layerName: l.name,
    features: [] as Feature[],
  }));
  for (const cell of quotas) {
    if (cell.quota === 0) continue;
    const env = envelope(cell.col, cell.row);
    const layerCounts = cell.layerCounts;
    const cellTotal = layerCounts.reduce((a, b) => a + b, 0) || 1;
    for (let li = 0; li < INGESTED_LAYERS.length; li += 1) {
      const want = Math.min(
        layerCounts[li] ?? 0,
        Math.round((cell.quota * (layerCounts[li] ?? 0)) / cellTotal),
      );
      if (want === 0) continue;
      const layer = INGESTED_LAYERS[li]!;
      const features = await fetchCell(layer.id, env, want);
      layers[li]!.features.push(...features);
      perLayer[layer.name] = (perLayer[layer.name] ?? 0) + features.length;
    }
  }
  const total = layers.reduce((sum, l) => sum + l.features.length, 0);

  const cache: TierCache = {
    _source: {
      dataset: 'National Heritage List for England (NHLE)',
      publisher: 'Historic England',
      service: NHLE_SERVICE,
      licence: 'OGL-UK-3.0',
      attribution:
        'Contains Historic England information © Historic England. Contains Ordnance Survey data © Crown copyright and database right. Licensed under the Open Government Licence v3.0.',
      strategy:
        'geographically stratified national sample; per-cell quota proportional to national share',
      retrievedAt: new Date().toISOString(),
    },
    layers: layers.filter((l) => l.features.length > 0),
  };

  // Preserve the already approved ~100k ordering when the requested sample is
  // extended. The old API response is retained by prefix in each cell/layer;
  // the persisted reference order makes that guarantee independent of how
  // the larger sample's per-cell quotas change.
  if (previousCache) {
    const currentByKey = new Map<string, { layerIndex: number; featureIndex: number }[]>();
    cache.layers.forEach((layer, layerIndex) => {
      layer.features.forEach((feature, featureIndex) => {
        const key = stableFeatureKey(layer.layerId, feature);
        const bucket = currentByKey.get(key) ?? [];
        bucket.push({ layerIndex, featureIndex });
        currentByKey.set(key, bucket);
      });
    });
    const order: { layerIndex: number; featureIndex: number }[] = [];
    const seen = new Set<string>();
    const takeCurrent = (key: string): { layerIndex: number; featureIndex: number } | undefined => {
      const bucket = currentByKey.get(key);
      const current = bucket?.find((item) => !seen.has(`${item.layerIndex}:${item.featureIndex}`));
      return current;
    };
    for (const item of cacheOrder(previousCache)) {
      const oldLayer = previousCache.layers[item.layerIndex];
      if (!oldLayer) continue;
      const key = stableFeatureKey(oldLayer.layerId, item.feature);
      const current = takeCurrent(key);
      if (current && !seen.has(`${current.layerIndex}:${current.featureIndex}`)) {
        order.push(current);
        seen.add(`${current.layerIndex}:${current.featureIndex}`);
      }
    }
    for (const item of cacheOrder(cache)) {
      const layer = cache.layers[item.layerIndex];
      if (!layer) continue;
      const key = stableFeatureKey(layer.layerId, item.feature);
      const current = takeCurrent(key);
      if (current && !seen.has(`${current.layerIndex}:${current.featureIndex}`)) {
        order.push(current);
        seen.add(`${current.layerIndex}:${current.featureIndex}`);
      }
    }
    cache.order = order;
  }
  mkdirSync(NATIONAL_CACHE_DIR, { recursive: true });
  writeFileSync(outputFile, JSON.stringify(cache));
  const bytes = readFileSync(outputFile).length;
  const sha256 = createHash('sha256').update(readFileSync(outputFile)).digest('hex');

  const manifest: NationalManifest = {
    dataset: 'National Heritage List for England (NHLE)',
    publisher: 'Historic England',
    licence: 'OGL-UK-3.0',
    service: NHLE_SERVICE,
    strategy:
      'geographically stratified national sample; per-cell quota proportional to national share; ListEntry-ascending within a cell',
    sampleSize: total,
    checkpoints: [...NATIONAL_CHECKPOINTS],
    retrievedAt: String(cache._source['retrievedAt'] ?? new Date().toISOString()),
    cells: quotas.map((c) => ({
      cell: c.cell,
      col: c.col,
      row: c.row,
      nationalCount: c.nationalCount,
      quota: c.quota,
    })),
    composition: { total, perLayer },
    cache: { file: 'nhle-national-cache.json', sha256, bytes },
  };
  writeFileSync(outputManifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export function readNationalManifest(): NationalManifest {
  return JSON.parse(readFileSync(NATIONAL_MANIFEST_FILE, 'utf8')) as NationalManifest;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]).endsWith('capture.ts');
if (invokedDirectly) {
  const run = async () => {
    if (
      existsSync(NATIONAL_MANIFEST_FILE) &&
      existsSync(NATIONAL_CACHE_FILE) &&
      !process.argv.includes('--refresh')
    ) {
      const m = readNationalManifest();
      if (
        createHash('sha256').update(readFileSync(NATIONAL_CACHE_FILE)).digest('hex') ===
        m.cache.sha256
      ) {
        console.log('national cache present and matches the manifest checksum; nothing to do');
        return;
      }
    }
    const m = await captureNational();
    console.log(`sample           ${m.composition.total.toLocaleString()} records`);
    console.log(`cells            ${m.cells.filter((c) => c.quota > 0).length} occupied`);
    console.log(`perLayer         ${JSON.stringify(m.composition.perLayer)}`);
    console.log(
      `cache            ${(m.cache.bytes / 1_048_576).toFixed(1)} MB, sha ${m.cache.sha256.slice(0, 16)}`,
    );
  };
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
