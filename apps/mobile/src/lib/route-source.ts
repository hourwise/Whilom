import type { Database, HeritageClient } from '@whilom/database';
import type { DiscoveryPlace } from '@whilom/discovery';
import { developmentDataSource } from './fixtures';
import { getMobileSupabaseClient } from './supabase';

type RouteRow = Database['public']['Tables']['routes']['Row'];

export type MobileRouteSummary = Pick<RouteRow, 'id' | 'slug' | 'name' | 'route_type' | 'difficulty' | 'distance_m' | 'duration_minutes' | 'theme' | 'period' | 'description' | 'status' | 'is_premium'>;

export interface MobileRouteStop {
  id: string;
  position: number;
  placeId: string | null;
  name: string | null;
  description: string | null;
  isOptional: boolean;
  place: Pick<DiscoveryPlace, 'id' | 'slug' | 'name' | 'placeType'> | null;
}

export interface MobileRouteDataSource {
  readonly mode: 'fixture' | 'live';
  readonly configuration: 'available' | 'unavailable';
  getRoutes(): Promise<MobileRouteSummary[]>;
  getRoute(slug: string): Promise<MobileRouteSummary | null>;
  getRouteStops(routeId: string): Promise<MobileRouteStop[]>;
  getRoutesForPlace(placeId: string): Promise<MobileRouteSummary[]>;
}

const fixtureRoutes: MobileRouteSummary[] = [
  {
    id: '00000000-0000-4000-8000-000000001001',
    slug: 'york-sacred-and-secular',
    name: 'York: sacred and secular',
    route_type: 'urban_walking_tour',
    difficulty: 'easy',
    distance_m: 4800,
    duration_minutes: 150,
    theme: 'City, faith and power',
    period: 'medieval',
    description: 'A compact city walk between York Minster, the castle and the layered streets between them.',
    status: 'approved',
    is_premium: false,
  },
  {
    id: '00000000-0000-4000-8000-000000001002',
    slug: 'abbey-and-landscape',
    name: 'Abbey and landscape',
    route_type: 'walking',
    difficulty: 'moderate',
    distance_m: 7200,
    duration_minutes: 210,
    theme: 'Monastic and designed landscapes',
    period: 'medieval',
    description: 'A longer route for a day spent with the ruins, water and designed landscape at Fountains Abbey.',
    status: 'approved',
    is_premium: false,
  },
];

const fixtureStops: Record<string, Array<{ id: string; position: number; placeId: string; name: string; description: string; isOptional?: boolean }>> = {
  '00000000-0000-4000-8000-000000001001': [
    { id: 'fixture-stop-york-1', position: 1, placeId: 'york-minster', name: 'York Minster', description: 'Begin with the cathedral’s layered medieval and Victorian fabric.' },
    { id: 'fixture-stop-york-2', position: 2, placeId: 'cliffords-tower', name: "Clifford's Tower", description: 'A short walk toward the surviving keep of York Castle.' },
  ],
  '00000000-0000-4000-8000-000000001002': [
    { id: 'fixture-stop-abbey-1', position: 1, placeId: 'fountains-abbey', name: 'Fountains Abbey', description: 'The principal stop: monastic ruins within a designed landscape.' },
    { id: 'fixture-stop-abbey-2', position: 2, placeId: 'middleham-castle', name: 'Middleham Castle', description: 'A future extension of the northern story, kept here as an optional stop.', isOptional: true },
  ],
};

const fixtureRouteSource: MobileRouteDataSource = {
  mode: 'fixture',
  configuration: 'available',
  async getRoutes() { return fixtureRoutes; },
  async getRoute(slug) { return fixtureRoutes.find((route) => route.slug === slug) ?? null; },
  async getRouteStops(routeId) {
    return (fixtureStops[routeId] ?? []).map((stop) => ({ ...stop, place: developmentDataSource.placeById(stop.placeId) ?? null, placeId: stop.placeId, isOptional: stop.isOptional ?? false }));
  },
  async getRoutesForPlace(placeId) {
    const routeIds = Object.entries(fixtureStops).filter(([, stops]) => stops.some((stop) => stop.placeId === placeId)).map(([routeId]) => routeId);
    return fixtureRoutes.filter((route) => routeIds.includes(route.id));
  },
};

function unavailableError(): never {
  throw new Error('Live route reads are selected but public Supabase configuration is unavailable.');
}

const unavailableRouteSource: MobileRouteDataSource = {
  mode: 'live',
  configuration: 'unavailable',
  async getRoutes() { return unavailableError(); },
  async getRoute() { return unavailableError(); },
  async getRouteStops() { return unavailableError(); },
  async getRoutesForPlace() { return unavailableError(); },
};

function liveRouteSource(client: HeritageClient): MobileRouteDataSource {
  return {
    mode: 'live',
    configuration: 'available',
    async getRoutes() {
      const { data, error } = await client.from('routes').select('id,slug,name,route_type,difficulty,distance_m,duration_minutes,theme,period,description,status,is_premium').eq('status', 'approved').order('name').limit(50);
      if (error) throw error;
      return (data ?? []) as MobileRouteSummary[];
    },
    async getRoute(slug) {
      const { data, error } = await client.from('routes').select('id,slug,name,route_type,difficulty,distance_m,duration_minutes,theme,period,description,status,is_premium').eq('slug', slug).eq('status', 'approved').maybeSingle();
      if (error) throw error;
      return (data ?? null) as MobileRouteSummary | null;
    },
    async getRouteStops(routeId) {
      const { data, error } = await client.from('route_stops').select('id,position,place_id,name,description,is_optional').eq('route_id', routeId).order('position').limit(200);
      if (error) throw error;
      const rows = data ?? [];
      const placeIds = rows.flatMap((row) => row.place_id ? [row.place_id] : []);
      const places = placeIds.length ? await client.from('places').select('id,slug,name,place_type').in('id', placeIds) : { data: [], error: null };
      if (places.error) throw places.error;
      const placeById = new Map((places.data ?? []).map((place) => [place.id, place]));
      return rows.map((row) => {
        const place = row.place_id ? placeById.get(row.place_id) : undefined;
        return { ...row, placeId: row.place_id, isOptional: row.is_optional, place: place ? { id: place.id, slug: place.slug, name: place.name, placeType: place.place_type } : null };
      });
    },
    async getRoutesForPlace(placeId) {
      const { data: stops, error: stopError } = await client.from('route_stops').select('route_id').eq('place_id', placeId).limit(50);
      if (stopError) throw stopError;
      const routeIds = [...new Set((stops ?? []).map((stop) => stop.route_id))];
      if (!routeIds.length) return [];
      const { data, error } = await client.from('routes').select('id,slug,name,route_type,difficulty,distance_m,duration_minutes,theme,period,description,status,is_premium').in('id', routeIds).eq('status', 'approved').order('name').limit(50);
      if (error) throw error;
      return (data ?? []) as MobileRouteSummary[];
    },
  };
}

export interface MobileRouteRuntime {
  mode: 'fixture' | 'live';
  configuration: 'available' | 'unavailable';
  source: MobileRouteDataSource;
}

export function getMobileRouteRuntime(): MobileRouteRuntime {
  const requestedMode = process.env.EXPO_PUBLIC_WHILOM_DATA_MODE?.trim().toLowerCase();
  if (requestedMode !== 'live') return { mode: 'fixture', configuration: 'available', source: fixtureRouteSource };
  const client = getMobileSupabaseClient();
  if (!client) return { mode: 'live', configuration: 'unavailable', source: unavailableRouteSource };
  return { mode: 'live', configuration: 'available', source: liveRouteSource(client) };
}

export { fixtureRouteSource, fixtureRoutes, fixtureStops };
