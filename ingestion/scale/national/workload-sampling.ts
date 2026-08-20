import { createHash } from 'node:crypto';

/**
 * Deterministic secondary sampling for composition-controlled diagnostics.
 *
 * This is deliberately not used by the authoritative national ladder. It
 * selects exact stratum quotas from an existing persisted order, where a
 * stratum is normally an OS 100km cell × NHLE layer. The source order inside a
 * stratum is retained, making the result reproducible and auditable.
 */

export interface OrderedStratumRecord {
  index: number;
  stratum: string;
}

export function stableSampleDigest<T>(records: readonly T[], referenceOf: (record: T) => string): string {
  return createHash('sha256')
    .update(records.map(referenceOf).join('\n'))
    .digest('hex');
}

export function compositionControlledPrefix<T>(
  records: readonly T[],
  size: number,
  stratumOf: (record: T) => string,
): T[] {
  if (!Number.isInteger(size) || size < 0 || size > records.length) {
    throw new Error(`composition-controlled size must be in [0, ${records.length}]`);
  }
  if (size === 0) return [];

  const groups = new Map<string, T[]>();
  for (const record of records) {
    const key = stratumOf(record);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  const entries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const quotas = entries.map(([key, group]) => ({
    key,
    group,
    quota: Math.floor((size * group.length) / records.length),
    remainder: (size * group.length) % records.length,
  }));
  let assigned = quotas.reduce((sum, item) => sum + item.quota, 0);
  for (const item of [...quotas].sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key))) {
    if (assigned >= size) break;
    item.quota += 1;
    assigned += 1;
  }

  return quotas.flatMap(({ group, quota }) => group.slice(0, quota));
}
