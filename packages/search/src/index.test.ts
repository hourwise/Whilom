import { describe, expect, it } from 'vitest';
import { placeSearchSchema } from '@whilom/validation';
import { buildSearchArgs } from './index';

describe('buildSearchArgs', () => {
  it('maps validated input to the search_places RPC args', () => {
    const input = placeSearchSchema.parse({
      text: 'castle',
      types: ['castle', 'ruin'],
      cost: 'free',
      center: { lng: -1.5, lat: 54 },
      radiusMeters: 15000,
    });
    const args = buildSearchArgs(input);
    expect(args.q).toBe('castle');
    expect(args.place_types).toEqual(['castle', 'ruin']);
    expect(args.cost).toBe('free');
    expect(args.center_lng).toBe(-1.5);
    expect(args.center_lat).toBe(54);
    expect(args.radius_m).toBe(15000);
    expect(args.visitable_only).toBe(false);
  });

  it('omits absent geographic filters rather than sending nulls', () => {
    // Every search_places parameter has a SQL default, so an absent filter is
    // left out. The generated Args type declares them optional, not nullable.
    const args = buildSearchArgs(placeSearchSchema.parse({ text: 'abbey' }));
    expect(args.center_lng).toBeUndefined();
    expect(args.radius_m).toBeUndefined();
    expect(args.bbox_sw_lng).toBeUndefined();
    expect(args.place_types).toBeUndefined();
  });
});
