/**
 * The national scale harness: deterministic sampling and honest classification.
 *
 * The sampling tests use a synthetic cache rather than the live 100k download,
 * so they run in ordinary CI. They protect the property that matters — the
 * sample is reproducible and every prefix is geographically representative —
 * not any particular record.
 */

import { describe, expect, it } from 'vitest';
import { interleavedOrder, type Cache } from '../scale/national/tier';
import { osGridSquare } from '../scale/national/audit';

/** A synthetic cache: three cells of very different sizes, all in one layer. */
function syntheticCache(sizes: Record<string, number>): Cache {
  const features = [] as { attributes: Record<string, unknown> }[];
  for (const [cell, n] of Object.entries(sizes)) {
    const [col, row] = cell.split(',').map(Number);
    for (let i = 0; i < n; i += 1) {
      features.push({
        attributes: {
          ListEntry: Number(`${col}${row}${String(i).padStart(5, '0')}`),
          Easting: (col ?? 0) * 100_000 + 500,
          Northing: (row ?? 0) * 100_000 + 500,
        },
      });
    }
  }
  return { _source: {}, layers: [{ layerId: 0, layerName: 'Listed Building points', features }] };
}

describe('OS grid squares', () => {
  it('names the squares a reader would recognise', () => {
    // col = E/100km, row = N/100km. TQ is London, SE is Yorkshire.
    expect(osGridSquare(5, 1)).toBe('TQ');
    expect(osGridSquare(4, 4)).toBe('SE');
    expect(osGridSquare(2, 0)).toBe('SX'); // Plymouth
    expect(osGridSquare(4, 5)).toBe('NZ'); // Teesside
  });
});

describe('deterministic national sampling', () => {
  const cache = syntheticCache({ '5,1': 5000, '4,4': 2000, '2,0': 500 });

  it('produces the same order every time', () => {
    const a = interleavedOrder(cache).map((r) => r.feature.attributes['ListEntry']);
    const b = interleavedOrder(cache).map((r) => r.feature.attributes['ListEntry']);
    expect(a).toEqual(b);
  });

  it('includes every record exactly once', () => {
    const order = interleavedOrder(cache);
    expect(order).toHaveLength(7500);
    expect(new Set(order.map((r) => r.feature.attributes['ListEntry'])).size).toBe(7500);
  });

  it('spreads a small prefix across all cells rather than draining the largest', () => {
    // The whole point: tier 25k and tier 100k must differ in size, not in
    // character. A prefix must already carry every cell.
    const order = interleavedOrder(cache);
    const prefixCells = new Set(
      order.slice(0, 300).map((r) => {
        const e = Math.floor(Number(r.feature.attributes['Easting']) / 100_000);
        const n = Math.floor(Number(r.feature.attributes['Northing']) / 100_000);
        return `${e},${n}`;
      }),
    );
    expect(prefixCells).toEqual(new Set(['5,1', '4,4', '2,0']));
  });

  it('keeps the prefix roughly proportional to cell sizes', () => {
    // In the first 750 records (10% of the sample), the densest cell (5,1, two
    // thirds of the data) should hold roughly two thirds — not be starved and
    // not swamp the others.
    const order = interleavedOrder(cache).slice(0, 750);
    const inDensest = order.filter(
      (r) => Math.floor(Number(r.feature.attributes['Easting']) / 100_000) === 5,
    ).length;
    expect(inDensest).toBeGreaterThan(750 * 0.5);
    expect(inDensest).toBeLessThan(750 * 0.8);
  });

  it('is stable when a cell is empty', () => {
    const sparse = syntheticCache({ '5,1': 10 });
    expect(interleavedOrder(sparse)).toHaveLength(10);
  });
});
