/**
 * First backend experiment: a logical British National Grid work unit.
 *
 * This is deliberately not a database partitioning scheme. The key is a
 * batching/locality hint; PostGIS remains the exact source of spatial truth.
 */
export const WORK_UNIT_SCHEME = 'OSGB10_EPSG27700_V1';
export const WORK_UNIT_SIZE_METRES = 10_000;

function cellIndex(value) {
  if (!Number.isFinite(value)) throw new TypeError('coordinate must be finite');
  return Math.floor(value / WORK_UNIT_SIZE_METRES);
}

export function workUnitKey(easting, northing) {
  return `E${cellIndex(easting)}N${cellIndex(northing)}`;
}

/** Enumerate every grid square touched by the expanded halo envelope. */
export function workUnitsForHalo(easting, northing, radiusMetres = 5_000) {
  if (!Number.isFinite(radiusMetres) || radiusMetres < 0) {
    throw new TypeError('radius must be a non-negative finite number');
  }
  const minE = cellIndex(easting - radiusMetres);
  const maxE = cellIndex(easting + radiusMetres);
  const minN = cellIndex(northing - radiusMetres);
  const maxN = cellIndex(northing + radiusMetres);
  const keys = [];
  for (let e = minE; e <= maxE; e += 1) {
    for (let n = minN; n <= maxN; n += 1) keys.push(`E${e}N${n}`);
  }
  return keys;
}
