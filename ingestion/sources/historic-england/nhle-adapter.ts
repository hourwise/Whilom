import { readFileSync } from 'node:fs';
import type { FetchOptions, RawPlaceRecord, SourceAdapter } from '../source-adapter';
import { NHLE_LAYERS, findLayer, type NhleLayer } from './nhle-layers';

/**
 * Historic England — National Heritage List for England (NHLE).
 *
 * The first production-shaped connector. See README.md in this directory for
 * the dataset, licence, attribution and limitations.
 *
 * The adapter's only job is to FETCH and SHAPE. It does not reproject
 * coordinates, map vocabulary or decide types — those are NORMALISE concerns —
 * so the raw ArcGIS attributes travel through untouched in `extra.attributes`,
 * which is what would be persisted to `import_raw` for audit.
 *
 * Two modes:
 *   - `{ kind: 'service' }` queries the official FeatureServer directly. No
 *     credentials are required.
 *   - `{ kind: 'file' }` reads a captured snapshot. Used by tests and by the
 *     bounded Yorkshire POC so runs are reproducible and offline.
 */

export const NHLE_SOURCE_ID = 'historic-england-nhle';
export const NHLE_IMPORTER_VERSION = '0.1.0';

export const NHLE_SERVICE_URL =
  'https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/ArcGIS/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer';

export const NHLE_LICENCE = 'OGL-UK-3.0';
export const NHLE_ATTRIBUTION =
  'Contains Historic England information © Historic England. Contains Ordnance Survey data © Crown copyright and database right. Licensed under the Open Government Licence v3.0.';

/** Raw NHLE attributes, as the service returns them. */
export interface NhleAttributes {
  ListEntry?: unknown;
  Name?: unknown;
  Grade?: unknown;
  CaptureScale?: unknown;
  hyperlink?: unknown;
  NGR?: unknown;
  Easting?: unknown;
  Northing?: unknown;
  AmendDate?: unknown;
  area_ha?: unknown;
  Notes?: unknown;
  [key: string]: unknown;
}

interface NhleFeature {
  attributes?: NhleAttributes;
}

interface NhleFixtureLayer {
  layerId?: unknown;
  layerName?: unknown;
  features?: unknown;
}

interface NhleFixture {
  _source?: Record<string, unknown>;
  layers?: unknown;
}

export type NhleFetchMode =
  | { kind: 'file'; path: string }
  | { kind: 'service'; serviceUrl?: string; layerIds?: number[]; pageSize?: number };

/** British National Grid envelope, as the service's `inSR=27700` expects. */
export interface GridEnvelope {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface NhleFetchOptions extends FetchOptions {
  /** Restrict a service run to a National Grid envelope (the POC uses Yorkshire). */
  gridEnvelope?: GridEnvelope;
}

export class HistoricEnglandNhleAdapter implements SourceAdapter {
  readonly id = NHLE_SOURCE_ID;
  readonly displayName = 'Historic England — National Heritage List for England';
  readonly licence = NHLE_LICENCE;

  constructor(private readonly mode: NhleFetchMode) {}

  async *fetch(options?: NhleFetchOptions): AsyncIterable<RawPlaceRecord> {
    if (this.mode.kind === 'file') {
      yield* this.fetchFromFile(this.mode.path);
      return;
    }
    yield* this.fetchFromService(this.mode, options);
  }

  // --- File mode ------------------------------------------------------------

  private *fetchFromFile(path: string): Generator<RawPlaceRecord> {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const fixture = parsed as NhleFixture;
    const layers = Array.isArray(fixture.layers) ? (fixture.layers as NhleFixtureLayer[]) : [];
    const retrievedAt = readRetrievedAt(fixture) ?? new Date().toISOString();

    for (const layerBlock of layers) {
      const layerId = Number(layerBlock.layerId);
      const layer = findLayer(layerId);
      if (!layer) continue;
      const features = Array.isArray(layerBlock.features)
        ? (layerBlock.features as NhleFeature[])
        : [];
      for (const feature of features) {
        const record = toRawRecord(feature.attributes, layer, retrievedAt);
        if (record) yield record;
      }
    }
  }

  // --- Service mode ---------------------------------------------------------

  private async *fetchFromService(
    mode: Extract<NhleFetchMode, { kind: 'service' }>,
    options?: NhleFetchOptions,
  ): AsyncIterable<RawPlaceRecord> {
    const serviceUrl = mode.serviceUrl ?? NHLE_SERVICE_URL;
    const pageSize = mode.pageSize ?? 1000;
    const layerIds = mode.layerIds ?? NHLE_LAYERS.map((l) => l.layerId);

    for (const layerId of layerIds) {
      const layer = findLayer(layerId);
      if (!layer) continue;

      for (let offset = 0; ; offset += pageSize) {
        const params = new URLSearchParams({
          where: '1=1',
          outFields: '*',
          returnGeometry: 'false',
          resultOffset: String(offset),
          resultRecordCount: String(pageSize),
          orderByFields: 'ListEntry ASC',
          f: 'json',
        });
        if (options?.gridEnvelope) {
          params.set('geometry', JSON.stringify(options.gridEnvelope));
          params.set('geometryType', 'esriGeometryEnvelope');
          params.set('inSR', '27700');
          params.set('spatialRel', 'esriSpatialRelIntersects');
        }

        const response = await globalThis.fetch(`${serviceUrl}/${layerId}/query?${params}`, {
          headers: { Accept: 'application/json' },
          signal: options?.signal,
        });
        if (!response.ok) {
          throw new Error(`NHLE layer ${layerId} query failed: HTTP ${response.status}`);
        }
        const body = (await response.json()) as {
          features?: NhleFeature[];
          error?: { message?: string };
          exceededTransferLimit?: boolean;
        };
        if (body.error) {
          throw new Error(`NHLE layer ${layerId} query error: ${body.error.message ?? 'unknown'}`);
        }

        const features = body.features ?? [];
        const retrievedAt = new Date().toISOString();
        for (const feature of features) {
          const record = toRawRecord(feature.attributes, layer, retrievedAt);
          if (record) yield record;
        }

        if (features.length < pageSize) break;
      }
    }
  }
}

function readRetrievedAt(fixture: NhleFixture): string | undefined {
  const value = fixture._source?.['retrievedAt'];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Shape one ArcGIS feature into a `RawPlaceRecord`.
 *
 * Returns `null` only when the record has no usable identity — no list entry
 * number or no name. Everything else, including missing or nonsense
 * coordinates, is passed on so that VALIDATE rejects it explicitly and the
 * rejection is counted, rather than the record vanishing here without trace.
 */
function toRawRecord(
  attributes: NhleAttributes | undefined,
  layer: NhleLayer,
  retrievedAt: string,
): RawPlaceRecord | null {
  if (!attributes) return null;

  const listEntry = attributes.ListEntry;
  const name = attributes.Name;
  if (typeof listEntry !== 'number' || !Number.isInteger(listEntry)) return null;
  if (typeof name !== 'string' || name.trim() === '') return null;

  const hyperlink = typeof attributes.hyperlink === 'string' ? attributes.hyperlink : undefined;
  const amendDate = epochToIso(attributes.AmendDate);

  return {
    provenance: {
      sourceId: NHLE_SOURCE_ID,
      sourceRecordId: String(listEntry),
      originalUrl: hyperlink ?? `https://historicengland.org.uk/listing/the-list/list-entry/${listEntry}`,
      licence: NHLE_LICENCE,
      attribution: NHLE_ATTRIBUTION,
      retrievedAt,
      ...(amendDate ? { sourceUpdatedAt: amendDate } : {}),
      importerVersion: NHLE_IMPORTER_VERSION,
    },
    name: name.trim(),
    rawType: layer.layerName,
    designation: layer.designation,
    ...(typeof attributes.Grade === 'string' && attributes.Grade.trim() !== ''
      ? { grade: attributes.Grade.trim() }
      : {}),
    extra: {
      layerId: layer.layerId,
      layerName: layer.layerName,
      designation: layer.designation,
      designatedDateField: layer.designatedDateField,
      attributes,
    },
  };
}

/** ArcGIS dates are epoch milliseconds and are frequently negative (pre-1970). */
export function epochToIso(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
