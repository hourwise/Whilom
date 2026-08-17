import type { EntityType } from '@whilom/domain';
import { placeSearchSchema } from '@whilom/validation';
import { buildSearchArgs } from '@whilom/search';
import { createClient } from '@/lib/supabase/server';
import type {
  Designation,
  Person,
  Place,
  PlaceAccess,
  RelatedPerson,
  Route,
  RouteStop,
  SearchResult,
  Source,
} from '@/lib/types';

/** A relationship edge row as selected below. */
interface Edge {
  predicate: string;
  subject_type: string;
  subject_id: string;
  object_type: string;
  object_id: string;
}

/** Split a comma-separated query param into a trimmed array, or undefined. */
const list = (v?: string) =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

export interface DiscoverParams {
  text?: string;
  type?: string;
  period?: string;
  cost?: string;
  visitable?: string;
  lng?: string;
  lat?: string;
  radiusKm?: string;
}

/** Runs the shared search pipeline: validate → build RPC args → search_places. */
export async function searchPlaces(params: DiscoverParams): Promise<SearchResult[]> {
  const parsed = placeSearchSchema.safeParse({
    text: params.text || undefined,
    types: list(params.type),
    periods: list(params.period),
    cost: params.cost || undefined,
    visitableOnly: params.visitable === '1' || undefined,
    center:
      params.lng && params.lat
        ? { lng: Number(params.lng), lat: Number(params.lat) }
        : undefined,
    radiusMeters: params.radiusKm ? Number(params.radiusKm) * 1000 : undefined,
  });
  if (!parsed.success) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_places', buildSearchArgs(parsed.data));
  if (error) throw error;
  return (data ?? []) as SearchResult[];
}

export async function getPlace(slug: string): Promise<Place | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('places').select('*').eq('slug', slug).maybeSingle();
  return (data as Place) ?? null;
}

/** Coordinates for a place (from the places_geo view). */
export async function getPlaceCoords(id: string): Promise<{ lng: number; lat: number } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('places_geo').select('lng, lat').eq('id', id).maybeSingle();
  return (data as { lng: number; lat: number }) ?? null;
}

export async function getPlaceAccess(placeId: string): Promise<PlaceAccess | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('place_access')
    .select('*')
    .eq('place_id', placeId)
    .maybeSingle();
  return (data as PlaceAccess) ?? null;
}

export async function getPlaceFacilities(placeId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('place_facilities').select('facility').eq('place_id', placeId);
  return ((data ?? []) as { facility: string }[]).map((r) => r.facility);
}

export async function getDesignations(placeId: string): Promise<Designation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('place_designations')
    .select('designation, grade, reference, url')
    .eq('place_id', placeId);
  return (data ?? []) as Designation[];
}

/**
 * Resolve people connected to a place. `entity_relationships` is polymorphic
 * (no FK), so we fetch edges then fetch the people in a second query.
 */
export async function getRelatedPeople(placeId: string): Promise<RelatedPerson[]> {
  const supabase = await createClient();
  const { data: edges } = await supabase
    .from('entity_relationships')
    .select('predicate, subject_type, subject_id, object_type, object_id')
    .or(
      `and(subject_type.eq.place,subject_id.eq.${placeId}),and(object_type.eq.place,object_id.eq.${placeId})`,
    )
    .eq('status', 'approved');

  const found: { predicate: string; personId: string }[] = [];
  for (const e of (edges ?? []) as Edge[]) {
    if (e.subject_type === 'place' && e.object_type === 'person')
      found.push({ predicate: e.predicate, personId: e.object_id });
    else if (e.object_type === 'place' && e.subject_type === 'person')
      found.push({ predicate: e.predicate, personId: e.subject_id });
  }
  if (found.length === 0) return [];

  const { data: people } = await supabase
    .from('people')
    .select('id, slug, name')
    .in(
      'id',
      found.map((f) => f.personId),
    );
  const byId = new Map((((people ?? []) as { id: string; slug: string; name: string }[])).map((p) => [p.id, p]));
  return found
    .map((f) => {
      const person = byId.get(f.personId);
      return person ? { predicate: f.predicate, person: { slug: person.slug, name: person.name } } : null;
    })
    .filter((x): x is RelatedPerson => x !== null);
}

/** Other places within ~15km, excluding this one. */
export async function getNearby(
  lng: number,
  lat: number,
  excludeId: string,
): Promise<SearchResult[]> {
  const results = await searchPlaces({
    lng: String(lng),
    lat: String(lat),
    radiusKm: '15',
  });
  return results.filter((r) => r.id !== excludeId).slice(0, 8);
}

/** Routes/trails that include this place as a stop. */
export async function getRoutesForPlace(placeId: string): Promise<Route[]> {
  const supabase = await createClient();
  const { data: stops } = await supabase
    .from('route_stops')
    .select('route_id')
    .eq('place_id', placeId);
  const routeIds = [...new Set(((stops ?? []) as { route_id: string }[]).map((s) => s.route_id))];
  if (routeIds.length === 0) return [];
  const { data } = await supabase.from('routes').select('*').in('id', routeIds).eq('status', 'approved');
  return (data ?? []) as Route[];
}

export async function getSourcesForEntity(
  entityType: EntityType,
  entityId: string,
): Promise<Source[]> {
  const supabase = await createClient();
  const { data: recs } = await supabase
    .from('source_records')
    .select('source_id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);
  const sourceIds = [...new Set(((recs ?? []) as { source_id: string }[]).map((r) => r.source_id))];
  if (sourceIds.length === 0) return [];
  const { data } = await supabase
    .from('sources')
    .select('id, name, publisher, url, licence, attribution')
    .in('id', sourceIds);
  return (data ?? []) as Source[];
}

export async function getPerson(slug: string): Promise<Person | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('people').select('*').eq('slug', slug).maybeSingle();
  return (data as Person) ?? null;
}

/** Places connected to a person (either direction of the edge). */
export async function getPlacesForPerson(
  personId: string,
): Promise<{ predicate: string; place: { slug: string; name: string } }[]> {
  const supabase = await createClient();
  const { data: edges } = await supabase
    .from('entity_relationships')
    .select('predicate, subject_type, subject_id, object_type, object_id')
    .or(
      `and(subject_type.eq.person,subject_id.eq.${personId}),and(object_type.eq.person,object_id.eq.${personId})`,
    )
    .eq('status', 'approved');

  const found: { predicate: string; placeId: string }[] = [];
  for (const e of (edges ?? []) as Edge[]) {
    if (e.subject_type === 'person' && e.object_type === 'place')
      found.push({ predicate: e.predicate, placeId: e.object_id });
    else if (e.object_type === 'person' && e.subject_type === 'place')
      found.push({ predicate: e.predicate, placeId: e.subject_id });
  }
  if (found.length === 0) return [];
  const { data: places } = await supabase
    .from('places')
    .select('id, slug, name')
    .in(
      'id',
      found.map((f) => f.placeId),
    );
  const byId = new Map((((places ?? []) as { id: string; slug: string; name: string }[])).map((p) => [p.id, p]));
  return found
    .map((f) => {
      const place = byId.get(f.placeId);
      return place ? { predicate: f.predicate, place: { slug: place.slug, name: place.name } } : null;
    })
    .filter((x): x is { predicate: string; place: { slug: string; name: string } } => x !== null);
}

export async function getRoute(slug: string): Promise<Route | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('routes').select('*').eq('slug', slug).maybeSingle();
  return (data as Route) ?? null;
}

export async function getRouteStops(routeId: string): Promise<RouteStop[]> {
  const supabase = await createClient();
  const { data: stops } = await supabase
    .from('route_stops')
    .select('id, position, place_id, name, description')
    .eq('route_id', routeId)
    .order('position');
  const rows = (stops ?? []) as RouteStop[];
  const placeIds = rows.map((s) => s.place_id).filter((id): id is string => !!id);
  if (placeIds.length > 0) {
    const { data: places } = await supabase
      .from('places')
      .select('id, slug, name, place_type')
      .in('id', placeIds);
    const byId = new Map(
      (((places ?? []) as { id: string; slug: string; name: string; place_type: string }[])).map((p) => [p.id, p]),
    );
    for (const s of rows) if (s.place_id) s.place = byId.get(s.place_id) ?? null;
  }
  return rows;
}
