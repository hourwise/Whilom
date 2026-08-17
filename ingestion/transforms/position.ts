import { LocationMethod } from '@whilom/domain';

/**
 * Positional accuracy: how well we actually know where something is.
 *
 * THE DISTINCTION THIS MODULE EXISTS TO ENFORCE:
 *
 *   Coordinate-transformation accuracy is not source-feature positional
 *   accuracy.
 *
 * `osgb.ts` converts British National Grid to WGS84 and is pinned to the
 * Ordnance Survey worked example at 0.44 mm. That is a statement about
 * arithmetic. It says nothing about whether the number fed into it describes
 * the real site. Historic England publishes one easting/northing for Fountains
 * Abbey's 33-hectare precinct: converting that centroid perfectly still leaves
 * you several hundred metres from most of the abbey.
 *
 * So an accuracy figure here is built from what the coordinate *is*, not from
 * how precisely it was converted.
 */

/** Residual of the Helmert approximation to OSTN15, in metres. */
export const HELMERT_RESIDUAL_M = 5;

/** Identifies the transformation, with a version, so a better one is distinguishable. */
export const OSGB36_CONVERSION_ID = 'osgb36-to-wgs84/helmert-7param@0.1.0';

export interface PositionEstimate {
  method: LocationMethod;
  /** Radius in metres within which the real feature is expected to lie. */
  accuracyMeters: number;
  /** Why this figure, in words, for the review queue and the audit trail. */
  basis: string;
}

/**
 * Digitising precision implied by the scale a record was captured at.
 * Convention: ~0.5 mm at map scale. This is a floor, never the whole story.
 */
export function captureScaleDigitisingMeters(captureScale: string | null | undefined): number {
  const match = /1\s*:\s*(\d+)/.exec(captureScale ?? '');
  const denominator = match?.[1] ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(denominator) || denominator <= 0) return 25;
  return denominator * 0.0005;
}

/**
 * Radius of the circle with the same area as the feature.
 *
 * When a source gives one point for a large area, the honest uncertainty is
 * governed by how big the thing is. A 33-hectare precinct has an equivalent
 * radius of ~327 m, and that — not the 5 m conversion residual — is how far the
 * centroid can be from any particular part of it.
 */
export function equivalentRadiusMeters(areaHectares: number): number {
  if (!Number.isFinite(areaHectares) || areaHectares <= 0) return 0;
  return Math.sqrt((areaHectares * 10_000) / Math.PI);
}

export interface PositionInputs {
  captureScale?: string | null;
  /** Present on the NHLE polygon layers. */
  areaHectares?: number | undefined;
  /** True when the source's coordinate represents an area, not a point. */
  isAreaFeature: boolean;
}

/**
 * Estimate what a source coordinate is worth.
 *
 * Point features get the digitising floor plus the conversion residual.
 * Area features get whichever is larger: that floor, or the feature's own
 * extent — because a centroid cannot be more precise than the thing it is the
 * centre of.
 */
export function estimatePosition(inputs: PositionInputs): PositionEstimate {
  const digitising = captureScaleDigitisingMeters(inputs.captureScale);
  const floor = digitising + HELMERT_RESIDUAL_M;

  if (!inputs.isAreaFeature) {
    return {
      method: LocationMethod.SourceCoordinate,
      accuracyMeters: round1(floor),
      basis: `published point coordinate; ${round1(digitising)} m digitising at ${inputs.captureScale ?? 'unstated scale'} plus ${HELMERT_RESIDUAL_M} m datum-shift residual`,
    };
  }

  const extent = equivalentRadiusMeters(inputs.areaHectares ?? 0);
  if (extent <= floor) {
    // Either no area was published, or the feature is smaller than the
    // digitising error. Say so rather than inventing an extent.
    return {
      method: LocationMethod.GeometryCentroid,
      accuracyMeters: round1(floor),
      basis:
        inputs.areaHectares === undefined
          ? `centroid of a published geometry of unstated extent; floor of ${round1(floor)} m from capture scale and datum shift`
          : `centroid of a ${inputs.areaHectares} ha feature, smaller than the ${round1(floor)} m capture-scale floor`,
    };
  }

  return {
    method: LocationMethod.GeometryCentroid,
    accuracyMeters: round1(extent),
    basis: `centroid of a ${inputs.areaHectares} ha feature; equivalent radius ${round1(extent)} m governs the uncertainty, not the ${round1(floor)} m conversion floor`,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
