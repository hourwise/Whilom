import type { LngLat } from '@whilom/domain';

/**
 * British National Grid (EPSG:27700, OSGB36 / Airy 1830) → WGS84 lng/lat.
 *
 * Historic England publishes NHLE geometry and its `Easting`/`Northing`
 * attributes on the National Grid, while `places.location` is
 * `geography(Point, 4326)`. Every NHLE record therefore has to be reprojected
 * during NORMALISE — this is the only place that conversion happens.
 *
 * Method: inverse Transverse Mercator onto the Airy 1830 ellipsoid, then a
 * 7-parameter Helmert transformation from OSGB36 to WGS84 (Ordnance Survey,
 * "A guide to coordinate systems in Great Britain", sections C1–C2 and 6.6).
 *
 * ACCURACY: the Helmert step is an approximation of the OSTN15 grid-shift
 * model. It is accurate to roughly 5 m across Great Britain, against OSTN15's
 * ~0.1 m. That is well inside the tolerance for heritage discovery and for the
 * matcher's distance bands (which start at 50 m), but it is *not* survey grade,
 * and the residual is recorded as positional uncertainty on every candidate.
 */

// Airy 1830 (OSGB36)
const AIRY_A = 6377563.396;
const AIRY_B = 6356256.909;
// WGS84
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;

// National Grid true origin and scale factor.
const F0 = 0.9996012717;
const LAT0 = toRadians(49);
const LON0 = toRadians(-2);
const E0 = 400000;
const N0 = -100000;

/**
 * OSGB36 → WGS84 Helmert parameters.
 *
 * The Ordnance Survey publishes the WGS84 → OSGB36 direction as
 * tx=-446.448, ty=+125.157, tz=-542.060, s=+20.4894ppm,
 * rx=-0.1502", ry=-0.2470", rz=-0.8421". Every term is negated here because we
 * need the inverse; reversing the sign is the standard approximation and is
 * what keeps the residual at ~5 m rather than doubling the ~120 m datum shift.
 */
const HELMERT = {
  tx: 446.448,
  ty: -125.157,
  tz: 542.06,
  s: -20.4894e-6,
  rx: toRadians(0.1502 / 3600),
  ry: toRadians(0.247 / 3600),
  rz: toRadians(0.8421 / 3600),
};

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Plausible National Grid extent for Great Britain, used as a sanity gate. */
export function isPlausibleGridReference(easting: number, northing: number): boolean {
  return (
    Number.isFinite(easting) &&
    Number.isFinite(northing) &&
    easting >= 0 &&
    easting <= 800000 &&
    northing >= 0 &&
    northing <= 1400000
  );
}

/**
 * Convert a National Grid easting/northing to WGS84.
 * Returns `null` when the input is outside the plausible grid extent, so a bad
 * source row is rejected rather than silently mapped into the sea.
 */
export function osgbToWgs84(easting: number, northing: number): LngLat | null {
  const osgb36 = osgbToOsgb36LatLon(easting, northing);
  return osgb36 ? airyToWgs84(toRadians(osgb36.lat), toRadians(osgb36.lng)) : null;
}

/**
 * The projection half of the conversion on its own: National Grid →
 * OSGB36 (Airy 1830) latitude/longitude, *before* the datum shift.
 *
 * Exposed because it is the step with an exactly published expected value (the
 * Ordnance Survey worked example), so it can be pinned by a test independently
 * of the Helmert approximation layered on top.
 */
export function osgbToOsgb36LatLon(easting: number, northing: number): LngLat | null {
  if (!isPlausibleGridReference(easting, northing)) return null;

  const a = AIRY_A;
  const b = AIRY_B;
  const e2 = (a * a - b * b) / (a * a);
  const n = (a - b) / (a + b);
  const n2 = n * n;
  const n3 = n2 * n;

  // Iterate northing → footpoint latitude.
  let lat = (northing - N0) / (a * F0) + LAT0;
  let m = 0;
  for (let i = 0; i < 20; i += 1) {
    const dLat = lat - LAT0;
    const sLat = lat + LAT0;
    m =
      b *
      F0 *
      ((1 + n + 1.25 * n2 + 1.25 * n3) * dLat -
        (3 * n + 3 * n2 + 2.625 * n3) * Math.sin(dLat) * Math.cos(sLat) +
        (1.875 * n2 + 1.875 * n3) * Math.sin(2 * dLat) * Math.cos(2 * sLat) -
        (35 / 24) * n3 * Math.sin(3 * dLat) * Math.cos(3 * sLat));
    const remaining = northing - N0 - m;
    if (Math.abs(remaining) < 1e-5) break;
    lat += remaining / (a * F0);
  }

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);
  const tan2 = tanLat * tanLat;
  const tan4 = tan2 * tan2;
  const tan6 = tan4 * tan2;
  const secLat = 1 / cosLat;

  const nu = (a * F0) / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = (a * F0 * (1 - e2)) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const eta2 = nu / rho - 1;

  const nu3 = nu * nu * nu;
  const nu5 = nu3 * nu * nu;
  const nu7 = nu5 * nu * nu;

  const vii = tanLat / (2 * rho * nu);
  const viii = (tanLat / (24 * rho * nu3)) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
  const ix = (tanLat / (720 * rho * nu5)) * (61 + 90 * tan2 + 45 * tan4);
  const x = secLat / nu;
  const xi = (secLat / (6 * nu3)) * (nu / rho + 2 * tan2);
  const xii = (secLat / (120 * nu5)) * (5 + 28 * tan2 + 24 * tan4);
  const xiia = (secLat / (5040 * nu7)) * (61 + 662 * tan2 + 1320 * tan4 + 720 * tan6);

  const dE = easting - E0;
  const dE2 = dE * dE;
  const dE3 = dE2 * dE;
  const dE4 = dE3 * dE;
  const dE5 = dE4 * dE;
  const dE6 = dE5 * dE;
  const dE7 = dE6 * dE;

  const latAiry = lat - vii * dE2 + viii * dE4 - ix * dE6;
  const lonAiry = LON0 + x * dE - xi * dE3 + xii * dE5 - xiia * dE7;

  return { lng: toDegrees(lonAiry), lat: toDegrees(latAiry) };
}

/** OSGB36 geodetic → WGS84 geodetic via the Helmert transformation. */
function airyToWgs84(latRad: number, lonRad: number): LngLat {
  const airyF = (AIRY_A - AIRY_B) / AIRY_A;
  const airyE2 = 2 * airyF - airyF * airyF;

  // Geodetic → geocentric cartesian (height taken as 0; NHLE has no elevation).
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const nu = AIRY_A / Math.sqrt(1 - airyE2 * sinLat * sinLat);
  const x1 = nu * cosLat * Math.cos(lonRad);
  const y1 = nu * cosLat * Math.sin(lonRad);
  const z1 = (1 - airyE2) * nu * sinLat;

  const { tx, ty, tz, s, rx, ry, rz } = HELMERT;
  const x2 = tx + x1 * (1 + s) - y1 * rz + z1 * ry;
  const y2 = ty + x1 * rz + y1 * (1 + s) - z1 * rx;
  const z2 = tz - x1 * ry + y1 * rx + z1 * (1 + s);

  // Geocentric cartesian → geodetic on WGS84 (iterative in latitude).
  const wgsE2 = 2 * WGS84_F - WGS84_F * WGS84_F;
  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let lat2 = Math.atan2(z2, p * (1 - wgsE2));
  for (let i = 0; i < 20; i += 1) {
    const sin2 = Math.sin(lat2);
    const nu2 = WGS84_A / Math.sqrt(1 - wgsE2 * sin2 * sin2);
    const next = Math.atan2(z2 + wgsE2 * nu2 * sin2, p);
    if (Math.abs(next - lat2) < 1e-12) {
      lat2 = next;
      break;
    }
    lat2 = next;
  }
  const lon2 = Math.atan2(y2, x2);

  return { lng: round7(toDegrees(lon2)), lat: round7(toDegrees(lat2)) };
}

function round7(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

/**
 * Positional accuracy deliberately does NOT live here.
 *
 * This module is about the transformation, and its precision (0.44 mm against
 * the Ordnance Survey worked example) says nothing about how well the input
 * coordinate describes the real site. Keeping the two in separate modules is
 * what stops them being conflated — see `transforms/position.ts`.
 */

/** Great-circle distance in metres between two WGS84 points (haversine). */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const R = 6371008.8;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
