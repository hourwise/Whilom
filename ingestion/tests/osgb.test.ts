import { describe, expect, it } from 'vitest';
import {
  distanceMeters,
  isPlausibleGridReference,
  osgbToOsgb36LatLon,
  osgbToWgs84,
} from '../transforms/osgb';

describe('osgbToOsgb36LatLon', () => {
  it('reproduces the Ordnance Survey worked example', () => {
    // OS, "A guide to coordinate systems in Great Britain", worked example:
    // E 651409.903, N 313177.270 is 52°39'27.2531"N, 1°43'04.5177"E on OSGB36.
    const expected = {
      lat: 52 + 39 / 60 + 27.2531 / 3600,
      lng: 1 + 43 / 60 + 4.5177 / 3600,
    };
    const got = osgbToOsgb36LatLon(651409.903, 313177.27);
    expect(got).not.toBeNull();
    // Sub-millimetre. This pins the projection independently of the datum shift.
    expect(distanceMeters(got!, expected)).toBeLessThan(0.001);
  });
});

describe('osgbToWgs84', () => {
  it('agrees with Wikidata on where Fountains Abbey is', () => {
    // NHLE 1149811 publishes E427487 N468286. Wikidata Q540237 independently
    // gives 54.1097, -1.58139.
    const got = osgbToWgs84(427487, 468286);
    expect(got).not.toBeNull();
    expect(distanceMeters(got!, { lat: 54.1097, lng: -1.58139 })).toBeLessThan(50);
  });

  it('agrees with Wikidata on Middleham Castle', () => {
    // NHLE 1010629 publishes E412664 N487592; Wikidata Q2705370 gives
    // 54.28404, -1.80685.
    const got = osgbToWgs84(412664, 487592);
    expect(distanceMeters(got!, { lat: 54.28404, lng: -1.80685 })).toBeLessThan(60);
  });

  it('applies the datum shift rather than returning OSGB36 unchanged', () => {
    // OSGB36 and WGS84 differ by ~100m in Great Britain. A transform that
    // skipped the Helmert step would return the OSGB36 value, so assert the
    // shift is actually present and of a plausible size.
    const osgb36 = osgbToOsgb36LatLon(427487, 468286)!;
    const wgs84 = osgbToWgs84(427487, 468286)!;
    const shift = distanceMeters(osgb36, wgs84);
    expect(shift).toBeGreaterThan(50);
    expect(shift).toBeLessThan(200);
  });

  it('rejects grid references outside Great Britain', () => {
    expect(osgbToWgs84(-5, 20)).toBeNull();
    expect(osgbToWgs84(9_999_999, 42)).toBeNull();
    expect(osgbToWgs84(Number.NaN, 400000)).toBeNull();
    expect(isPlausibleGridReference(427487, 468286)).toBe(true);
  });
});

describe('distanceMeters', () => {
  it('measures a known separation', () => {
    // The two "Middleham Castle" records are ~48km apart.
    const wensleydale = { lat: 54.28404, lng: -1.80685 };
    const bishopMiddleham = { lat: 54.6736, lng: -1.4939 };
    const km = distanceMeters(wensleydale, bishopMiddleham) / 1000;
    expect(km).toBeGreaterThan(40);
    expect(km).toBeLessThan(55);
  });
});
