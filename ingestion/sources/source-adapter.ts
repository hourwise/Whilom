import type { PlaceType } from '@heritage/domain';

/**
 * Source adapter contract (spec §35, §36).
 *
 * Each national body / dataset (Historic England, Wikidata, OSM, Wikimedia,
 * museum APIs …) implements this interface in its own module so connectors are
 * fully modular. Adapters are responsible ONLY for fetching + shaping raw
 * records into `RawPlaceRecord`; normalisation, matching, dedup, enrichment and
 * publishing are handled by the shared pipeline stages.
 */

/** Provenance carried by every raw record (spec §34). */
export interface RawProvenance {
  /** Registry id of the source, e.g. 'historic-england-nhle'. */
  sourceId: string;
  /** The source's own identifier for this record. */
  sourceRecordId: string;
  originalUrl?: string;
  licence?: string;
  attribution?: string;
  /** ISO 8601 timestamp the record was retrieved. */
  retrievedAt: string;
  /** ISO 8601 timestamp the source last updated the record, if known. */
  sourceUpdatedAt?: string;
  /** Version string of the importer that produced this record. */
  importerVersion: string;
}

/** A place-like record as emitted by an adapter, pre-normalisation. */
export interface RawPlaceRecord {
  provenance: RawProvenance;
  name: string;
  /** Best-guess type; normalisation maps source vocab → domain PlaceType. */
  rawType?: string;
  mappedType?: PlaceType;
  lng?: number;
  lat?: number;
  designation?: string;
  grade?: string;
  postcode?: string;
  altNames?: string[];
  /** Anything else the source provides, retained for enrichment/audit. */
  extra?: Record<string, unknown>;
}

export interface FetchOptions {
  /** Bounding box or region to restrict a run (Phase 0 uses Yorkshire). */
  bbox?: { swLng: number; swLat: number; neLng: number; neLat: number };
  /** Only fetch records updated since this ISO timestamp (incremental runs). */
  since?: string;
  signal?: AbortSignal;
}

export interface SourceAdapter {
  /** Stable id, must match a row in the `import_sources` registry. */
  readonly id: string;
  readonly displayName: string;
  readonly licence?: string;
  /** Yield raw records; may page/stream internally. */
  fetch(options?: FetchOptions): AsyncIterable<RawPlaceRecord>;
}
