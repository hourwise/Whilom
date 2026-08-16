/**
 * Hand-written display types for the rows the web MVP renders. These are a
 * pragmatic subset until `pnpm db:types` generates the full `Database` type.
 */

export interface SearchResult {
  id: string;
  slug: string;
  name: string;
  place_type: string;
  content_level: number;
  period: string | null;
  cost: string | null;
  is_visitable: boolean;
  summary: string | null;
  lng: number;
  lat: number;
  distance_m: number | null;
}

export interface Place {
  id: string;
  slug: string;
  name: string;
  place_type: string;
  content_level: number;
  primary_period: string | null;
  access_cost: string | null;
  is_visitable: boolean;
  summary: string | null;
  description: string | null;
  address_line: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
}

export interface PlaceAccess {
  access_cost: string | null;
  is_visitable: boolean;
  public_access: boolean;
  booking_required: boolean;
  guided_tours: boolean;
  seasonal: boolean;
  expected_visit_minutes: number | null;
  admission_notes: string | null;
  opening_notes: string | null;
  official_url: string | null;
}

export interface Designation {
  designation: string;
  grade: string | null;
  reference: string | null;
  url: string | null;
}

export interface Person {
  id: string;
  slug: string;
  name: string;
  titles: string[];
  birth_year: number | null;
  death_year: number | null;
  date_note: string | null;
  biography: string | null;
}

export interface Route {
  id: string;
  slug: string;
  name: string;
  route_type: string;
  difficulty: string | null;
  distance_m: number | null;
  duration_minutes: number | null;
  theme: string | null;
  period: string | null;
  description: string | null;
}

export interface RouteStop {
  id: string;
  position: number;
  place_id: string | null;
  name: string | null;
  description: string | null;
  place?: { slug: string; name: string; place_type: string } | null;
}

export interface Source {
  id: string;
  name: string;
  publisher: string | null;
  url: string | null;
  licence: string | null;
  attribution: string | null;
}

/** A related entity resolved from `entity_relationships` (two-step, no FK join). */
export interface RelatedPerson {
  predicate: string;
  person: { slug: string; name: string };
}
