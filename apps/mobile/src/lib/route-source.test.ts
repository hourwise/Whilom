import { describe, expect, it } from 'vitest';
import { fixtureRouteSource } from './route-source';

describe('fixture route read contract', () => {
  it('returns ordered stops linked to discovery places', async () => {
    const routes = await fixtureRouteSource.getRoutes();
    expect(routes).toHaveLength(2);
    const stops = await fixtureRouteSource.getRouteStops(routes[0]!.id);
    expect(stops.map((stop) => stop.position)).toEqual([1, 2]);
    expect(stops[0]?.place?.id).toBe('york-minster');
  });
});
