import { describe, expect, it } from 'vitest';
import { fixtureTrips, reorderTripStops } from './trip-state';

describe('fixture trip behaviour helpers', () => {
  it('ships an account-shaped fixture trip without persistence', () => {
    const fixture = fixtureTrips();
    expect(fixture.trips).toHaveLength(1);
    expect(fixture.days).toHaveLength(1);
    expect(fixture.stops.map((stop) => stop.position)).toEqual([0, 1]);
  });

  it('reorders known stops and retains unmentioned stops after them', () => {
    const stops = fixtureTrips().stops;
    const reordered = reorderTripStops(stops, [stops[1]!.id]);
    expect(reordered.map((stop) => stop.id)).toEqual([stops[1]!.id, stops[0]!.id]);
    expect(reordered.map((stop) => stop.position)).toEqual([0, 1]);
  });
});
