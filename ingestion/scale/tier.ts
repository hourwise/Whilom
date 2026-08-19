/**
 * Tier construction.
 *
 * A tier is the first N entries of the manifest's stratified order. Because the
 * order interleaves designation types in proportion, every tier carries the
 * same mix — the alternative (taking the first N of a layer-ordered capture)
 * would have made tier 1 entirely listed buildings and concealed every
 * scheduled-monument behaviour until the largest and most expensive tier.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CACHE_DIR, CACHE_FILE, readManifest } from './capture';

export const TIER_SIZES = [1000, 2500, 5000, 10000, 25000] as const;

/**
 * Tiers for which an exhaustive decision oracle is maintained.
 *
 * The oracle exists to prove bounded candidate generation equivalent, and that
 * proof does not need to be re-run at every size: exhaustive matching at 25,000
 * records is ~312 million comparisons, which costs minutes to demonstrate
 * something already established. Above this the bounded path runs alone.
 */
export const ORACLE_TIER_SIZES = [1000, 2500, 5000] as const;

export function isOracleTierSize(value: number): value is (typeof ORACLE_TIER_SIZES)[number] {
  return (ORACLE_TIER_SIZES as readonly number[]).includes(value);
}
export type TierSize = (typeof TIER_SIZES)[number];

export function isTierSize(value: number): value is TierSize {
  return (TIER_SIZES as readonly number[]).includes(value);
}

interface CacheFile {
  _source: Record<string, unknown>;
  layers: {
    layerId: number;
    layerName: string;
    features: { attributes: Record<string, unknown> }[];
  }[];
}

export interface TierFixture {
  /** Path to a fixture the unmodified NHLE adapter can read in `file` mode. */
  path: string;
  size: number;
  mix: Record<string, number>;
  /** National streaming fixtures use NDJSON; ordinary tiers use JSON. */
  mode?: 'file' | 'ndjson';
}

/**
 * Materialise one tier as an NHLE fixture file.
 *
 * Writing a real fixture rather than filtering inside the runner keeps the
 * production adapter, normaliser and matcher on exactly the path they take for
 * the Yorkshire POC. There is no scale-only ingestion route to drift.
 */
export function buildTierFixture(size: number): TierFixture {
  const manifest = readManifest();
  if (size > manifest.order.length) {
    throw new Error(`tier ${size} exceeds the ${manifest.order.length} records in the manifest`);
  }

  const cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as CacheFile;

  // Tier membership is a MULTISET, not a set. The NHLE FeatureServer returns
  // one row per geometry part, so a multi-part designation arrives more than
  // once under a single ListEntry — Saltaire and Studley Royal both do, being
  // World Heritage Sites with separate core and buffer polygons. Those repeats
  // are real rows a production import would receive, and deduplicating them is
  // the matcher's job, so the experiment keeps them rather than quietly
  // filtering them out and flattering its own duplicate rate.
  const remaining = new Map<number, number>();
  for (const listEntry of manifest.order.slice(0, size)) {
    remaining.set(listEntry, (remaining.get(listEntry) ?? 0) + 1);
  }

  const mix: Record<string, number> = {};
  const layers = cache.layers
    .map((layer) => {
      const features = layer.features.filter((feature) => {
        const listEntry = feature.attributes['ListEntry'];
        if (typeof listEntry !== 'number') return false;
        const left = remaining.get(listEntry) ?? 0;
        if (left === 0) return false;
        remaining.set(listEntry, left - 1);
        return true;
      });
      if (features.length > 0) mix[layer.layerName] = features.length;
      return { ...layer, features };
    })
    .filter((layer) => layer.features.length > 0);

  const total = layers.reduce((sum, l) => sum + l.features.length, 0);
  if (total !== size) {
    throw new Error(
      `tier ${size} assembled ${total} records; the cache does not match the manifest`,
    );
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  const path = resolve(CACHE_DIR, `tier-${size}.json`);
  writeFileSync(path, JSON.stringify({ _source: cache._source, layers }));
  return { path, size, mix };
}
