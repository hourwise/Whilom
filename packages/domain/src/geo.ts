/** Geographic primitives shared across the platform (PostGIS-backed, spec §2). */

/** A WGS84 point: [longitude, latitude], matching GeoJSON order. */
export interface LngLat {
  lng: number;
  lat: number;
}

/** A bounding box for map-area queries: south-west and north-east corners. */
export interface BBox {
  sw: LngLat;
  ne: LngLat;
}

/** A radius query around a point (spec §9 "search within radius"). */
export interface RadiusQuery {
  center: LngLat;
  /** Radius in metres. */
  radiusMeters: number;
}

export const isValidLngLat = (p: LngLat): boolean =>
  p.lng >= -180 && p.lng <= 180 && p.lat >= -90 && p.lat <= 90;
