/**
 * The national NHLE dataset, measured before anything is ingested.
 *
 *   pnpm --filter @whilom/ingestion national:audit
 *
 * Batch 12 classified the national extent as PILOT on an approximate count of
 * "~401,539". Batch 13 replaces the approximation with the source's own answer,
 * because a scale decision built on a remembered figure is a scale decision
 * built on nothing.
 *
 * Everything here comes from the FeatureServer's aggregate endpoints —
 * returnCountOnly and outStatistics — so the audit costs a few dozen small
 * queries rather than a bulk download. No records are retrieved; this measures
 * the shape of the dataset, not its contents.
 *
 * The measured snapshot is committed alongside this module as
 * `national-source-audit.json`, with its retrieval timestamp, so the evidence
 * the scale decision rests on is in the history rather than only in a CI log.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NHLE_SERVICE =
  'https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/ArcGIS/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer';

/** The six layers Whilom ingests, by FeatureServer layer id. */
export const INGESTED_LAYERS: { id: number; name: string }[] = [
  { id: 0, name: 'Listed Building points' },
  { id: 6, name: 'Scheduled Monuments' },
  { id: 7, name: 'Parks and Gardens' },
  { id: 8, name: 'Battlefields' },
  { id: 9, name: 'Protected Wreck Sites' },
  { id: 10, name: 'World Heritage Sites' },
];

/** The current regional envelope, in British National Grid metres. */
export const REGIONAL_ENVELOPE = { xmin: 400000, ymin: 420000, xmax: 545000, ymax: 510000 };

/** GB National Grid extent in 100km cells: cols 0–6, rows 0–12. */
const GRID_COLS = 7;
const GRID_ROWS = 13;
const CELL_M = 100_000;

const USER_AGENT = 'WhilomNationalAudit/0.1 (https://github.com/hourwise/Whilom; philgeran@gmail.com)';

async function arcgis(layer: number, params: Record<string, string>): Promise<any> {
  const url = `${NHLE_SERVICE}/${layer}/query?${new URLSearchParams({ ...params, f: 'json' })}`;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
      if (response.ok) return await response.json();
      if (response.status < 500 && response.status !== 429) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === 4) throw error;
    }
    await new Promise((r) => setTimeout(r, 1_500 * 2 ** (attempt - 1)));
  }
  throw new Error('unreachable');
}

async function count(layer: number, extra: Record<string, string> = {}): Promise<number> {
  const body = await arcgis(layer, { where: '1=1', returnCountOnly: 'true', ...extra });
  return Number(body.count ?? 0);
}

function envelopeParams(env: { xmin: number; ymin: number; xmax: number; ymax: number }): Record<string, string> {
  return {
    geometry: JSON.stringify(env),
    geometryType: 'esriGeometryEnvelope',
    inSR: '27700',
    spatialRel: 'esriSpatialRelIntersects',
  };
}

/**
 * The OS two-letter code for a 100km cell, so the distribution reads as places
 * rather than as coordinates. TQ is London, SE is Yorkshire, and a reviewer
 * should be able to see that without decoding a grid reference.
 */
export function osGridSquare(col: number, row: number): string {
  // The Ordnance Survey reference algorithm, indexing a 5×5 letter block with
  // 'I' omitted. Verified against known squares: TQ is London (5,1), SE is
  // Yorkshire (4,4).
  let l1 = 19 - row - ((19 - row) % 5) + Math.floor((col + 10) / 5);
  let l2 = (((19 - row) * 5) % 25) + (col % 5);
  if (l1 > 7) l1 += 1; // skip 'I'
  if (l2 > 7) l2 += 1;
  const a = 'A'.charCodeAt(0);
  return String.fromCharCode(a + l1) + String.fromCharCode(a + l2);
}

export async function auditNationalSource() {
  const perLayer: Record<string, number> = {};
  let total = 0;
  for (const layer of INGESTED_LAYERS) {
    const n = await count(layer.id);
    perLayer[layer.name] = n;
    total += n;
  }

  // The dominant layer carries 95% of the records; its statistics stand in for
  // the identifier and geometry health of the dataset as a whole.
  const stats = await arcgis(0, {
    where: '1=1',
    outStatistics: JSON.stringify([
      { statisticType: 'count', onStatisticField: 'ListEntry', outStatisticFieldName: 'n' },
      { statisticType: 'min', onStatisticField: 'ListEntry', outStatisticFieldName: 'lo' },
      { statisticType: 'max', onStatisticField: 'ListEntry', outStatisticFieldName: 'hi' },
    ]),
  });
  const s = stats.features?.[0]?.attributes ?? {};
  const nullEasting = await count(0, { where: 'Easting IS NULL' });

  // Geographic distribution of the dominant layer across occupied 100km cells.
  const cells: { cell: string; col: number; row: number; count: number }[] = [];
  for (let col = 0; col < GRID_COLS; col += 1) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      const env = { xmin: col * CELL_M, ymin: row * CELL_M, xmax: (col + 1) * CELL_M, ymax: (row + 1) * CELL_M };
      const c = await count(0, envelopeParams(env));
      if (c > 0) cells.push({ cell: osGridSquare(col, row), col, row, count: c });
    }
  }
  cells.sort((a, b) => b.count - a.count);
  const dominantTotal = cells.reduce((sum, c) => sum + c.count, 0);
  const densest = cells[0] ?? { cell: 'none', count: 0 };

  const regionalPoints = await count(0, envelopeParams(REGIONAL_ENVELOPE));

  return {
    generatedAt: new Date().toISOString(),
    service: NHLE_SERVICE,
    licence: 'OGL-UK-3.0',
    attribution:
      'Contains Historic England information © Historic England. Contains Ordnance Survey data © Crown copyright and database right.',
    layers: INGESTED_LAYERS.map((l) => l.name),
    counts: { perLayer, total },
    identifier: {
      field: 'ListEntry',
      statisticCount: Number(s.n ?? 0),
      min: Number(s.lo ?? 0),
      max: Number(s.hi ?? 0),
      // The points layer is 1:1 by ListEntry. The polygon and WHS layers repeat
      // a ListEntry per geometry part — documented in the scale manifest — so
      // "duplicate identifiers" at national scale is a known, matcher-handled
      // property of multi-part designations, not a data fault.
      duplicateSemantics:
        'points are 1:1 by ListEntry; polygon and WHS layers repeat a ListEntry per geometry part (core + buffer), which the matcher deduplicates',
    },
    geometry: {
      dominantLayer: 'Listed Building points',
      nullGeometry: nullEasting,
      note: nullEasting === 0 ? 'every dominant-layer record carries a coordinate' : 'some records lack a coordinate',
    },
    distribution: {
      unit: 'OS 100km grid square',
      dominantLayer: 'Listed Building points',
      occupiedCells: cells.length,
      dominantTotal,
      topCells: cells.slice(0, 15).map((c) => ({
        cell: c.cell,
        count: c.count,
        share: Math.round((c.count / dominantTotal) * 10000) / 100,
      })),
      // The single most important number for a national map: how concentrated
      // the densest cell is.
      densestCellShare: Math.round((densest.count / dominantTotal) * 10000) / 100,
    },
    currentCorpus: {
      regionalEnvelope: REGIONAL_ENVELOPE,
      regionalListedBuildingPoints: regionalPoints,
      approximateIngested: 23_315,
      shareOfNational: Math.round((regionalPoints / (perLayer['Listed Building points'] ?? 1)) * 10000) / 100,
    },
    expansion: {
      nationalTotal: total,
      candidateNewRecords: total - 23_315,
      multiplier: Math.round((total / 23_315) * 10) / 10,
    },
  };
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  auditNationalSource()
    .then((audit) => {
      const out = resolve(process.cwd(), 'national-source-audit.json');
      writeFileSync(out, JSON.stringify(audit, null, 2) + '\n');
      console.log(`national total        ${audit.counts.total.toLocaleString()}`);
      console.log(`candidate new records ${audit.expansion.candidateNewRecords.toLocaleString()} (${audit.expansion.multiplier}x)`);
      console.log(`occupied 100km cells  ${audit.distribution.occupiedCells}`);
      console.log(`densest cell          ${audit.distribution.topCells[0]?.cell ?? '-'} at ${audit.distribution.densestCellShare}%`);
      console.log(`null geometry         ${audit.geometry.nullGeometry}`);
      console.log(`written to ${out}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
