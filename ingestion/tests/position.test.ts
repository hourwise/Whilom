import { describe, expect, it } from 'vitest';
import {
  HELMERT_RESIDUAL_M,
  captureScaleDigitisingMeters,
  equivalentRadiusMeters,
  estimatePosition,
} from '../transforms/position';

/**
 * The property these tests exist to protect: a precise coordinate conversion
 * must never be reported as a precise location.
 */

describe('captureScaleDigitisingMeters', () => {
  it('scales with the map scale a record was captured at', () => {
    expect(captureScaleDigitisingMeters('1:10000')).toBeGreaterThan(
      captureScaleDigitisingMeters('1:1250'),
    );
    expect(captureScaleDigitisingMeters('1:1250')).toBeCloseTo(0.625, 3);
  });

  it('is conservative when the scale is missing or unparseable', () => {
    expect(captureScaleDigitisingMeters(null)).toBeGreaterThan(
      captureScaleDigitisingMeters('1:2500'),
    );
    expect(captureScaleDigitisingMeters('nonsense')).toBeGreaterThan(0);
  });
});

describe('equivalentRadiusMeters', () => {
  it('turns an area into the radius of the circle with the same area', () => {
    // Fountains Abbey's scheduled precinct is 33.58 ha.
    expect(equivalentRadiusMeters(33.582157414754796)).toBeCloseTo(326.9, 0);
    expect(equivalentRadiusMeters(0)).toBe(0);
    expect(equivalentRadiusMeters(Number.NaN)).toBe(0);
  });
});

describe('estimatePosition', () => {
  it('treats a published point as a point', () => {
    const estimate = estimatePosition({ captureScale: '1:1250', isAreaFeature: false });
    expect(estimate.method).toBe('source_coordinate');
    expect(estimate.accuracyMeters).toBeCloseTo(0.6 + HELMERT_RESIDUAL_M, 0);
  });

  it('lets feature extent govern the accuracy of a centroid', () => {
    // The whole point: converting this centroid to 0.44 mm does not put you
    // within 0.44 mm of the abbey. The honest figure is ~327 m.
    const estimate = estimatePosition({
      captureScale: '1:10000',
      areaHectares: 33.582157414754796,
      isAreaFeature: true,
    });
    expect(estimate.method).toBe('geometry_centroid');
    expect(estimate.accuracyMeters).toBeCloseTo(326.9, 0);
    expect(estimate.basis).toContain('equivalent radius');
  });

  it('never reports a centroid as more precise than the capture scale floor', () => {
    const estimate = estimatePosition({
      captureScale: '1:10000',
      areaHectares: 0.0001,
      isAreaFeature: true,
    });
    expect(estimate.accuracyMeters).toBeGreaterThanOrEqual(HELMERT_RESIDUAL_M);
    expect(estimate.basis).toContain('floor');
  });

  it('says so when an area feature published no extent', () => {
    const estimate = estimatePosition({ captureScale: '1:10000', isAreaFeature: true });
    expect(estimate.method).toBe('geometry_centroid');
    expect(estimate.basis).toContain('unstated extent');
  });

  it('is always more pessimistic for an area than for a point at the same scale', () => {
    const point = estimatePosition({ captureScale: '1:10000', isAreaFeature: false });
    const area = estimatePosition({
      captureScale: '1:10000',
      areaHectares: 50,
      isAreaFeature: true,
    });
    expect(area.accuracyMeters).toBeGreaterThan(point.accuracyMeters);
  });
});
