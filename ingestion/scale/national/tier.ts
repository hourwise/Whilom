/**
 * A national checkpoint, materialised as an NHLE fixture the ordinary adapter
 * reads.
 *
 * The requirement the regional tiers already meet, carried to national scale:
 * a tier must be a representative PREFIX, so that tier 25k and tier 100k differ
 * in size and not in character. If the first 25,000 records were all from one
 * cell, the small checkpoints would test a country that is not there.
 *
 * So the national sample is re-ordered into a deterministic stratified
 * interleave: records are grouped by their OS 100km cell and dealt out
 * round-robin, weighted by each cell's size, so every prefix carries the
 * national geographic mix. The interleave is a pure function of the cache —
 * no randomness — and the fixture the production adapter reads is byte-stable
 * across runs.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { NATIONAL_CACHE_DIR, NATIONAL_CACHE_FILE } from './capture';

const CELL_M = 100_000;

export interface Feature {
  attributes: Record<string, unknown>;
}
export interface Layer {
  layerId: number;
  layerName: string;
  features: Feature[];
}
export interface Cache {
  _source: Record<string, unknown>;
  layers: Layer[];
}

export interface NationalTierFixture {
  path: string;
  size: number;
  mix: Record<string, number>;
  mode: 'ndjson';
}

/** The OS 100km cell key a record falls in, from its BNG coordinate. */
function cellKey(attributes: Record<string, unknown>): string {
  const e = Number(attributes['Easting']);
  const n = Number(attributes['Northing']);
  if (!Number.isFinite(e) || !Number.isFinite(n)) return 'none';
  return `${Math.floor(e / CELL_M)},${Math.floor(n / CELL_M)}`;
}

/**
 * The full national sample in stratified interleave order, as (layerIndex,
 * feature) pairs so a tier prefix can be split back into layers.
 */
export function interleavedOrder(cache: Cache): { layerIndex: number; feature: Feature }[] {
  // Group every record by cell, preserving the ListEntry-ascending order the
  // capture fetched them in.
  const byCell = new Map<string, { layerIndex: number; feature: Feature }[]>();
  cache.layers.forEach((layer, layerIndex) => {
    for (const feature of layer.features) {
      const key = cellKey(feature.attributes);
      const bucket = byCell.get(key) ?? [];
      bucket.push({ layerIndex, feature });
      byCell.set(key, bucket);
    }
  });

  // Deal round-robin, largest cells first within a round, so a short prefix is
  // still spread across the country. Cell order is fixed by size then key, so
  // the interleave is deterministic.
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
      // Take a share proportional to the cell size each round, so a big cell is
      // not starved behind twenty small ones — one pass over the round emits
      // ~1% of each cell.
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

function loadOrder(): { cache: Cache; order: { layerIndex: number; feature: Feature }[] } {
  const cache = JSON.parse(readFileSync(NATIONAL_CACHE_FILE, 'utf8')) as Cache;
  return { cache, order: interleavedOrder(cache) };
}

/** Materialise the first `size` records as a streaming, one-feature-per-line fixture. */
export function buildNationalTier(size: number): NationalTierFixture {
  const { cache, order } = loadOrder();
  if (size > order.length) {
    throw new Error(`national tier ${size} exceeds the ${order.length}-record sample`);
  }
  const prefix = order.slice(0, size);

  const mix: Record<string, number> = {};
  mkdirSync(NATIONAL_CACHE_DIR, { recursive: true });
  const path = resolve(NATIONAL_CACHE_DIR, `national-tier-${size}.ndjson`);
  const lines: string[] = [];
  for (const item of prefix) {
    const layer = cache.layers[item.layerIndex];
    if (!layer) continue;
    mix[layer.layerName] = (mix[layer.layerName] ?? 0) + 1;
    lines.push(
      JSON.stringify({
        layerId: layer.layerId,
        attributes: item.feature.attributes,
        retrievedAt: cache._source['retrievedAt'],
      }),
    );
  }
  writeFileSync(path, `${lines.join('\n')}\n`);
  return { path, size, mix, mode: 'ndjson' };
}

/** The largest checkpoint the current sample can supply. */
export function nationalSampleSize(): number {
  return loadOrder().order.length;
}
