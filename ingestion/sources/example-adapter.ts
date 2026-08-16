import type { FetchOptions, RawPlaceRecord, SourceAdapter } from './source-adapter';

/**
 * Reference adapter showing the shape a real connector takes. Emits a couple of
 * static records instead of calling a live API. Copy this to start a real
 * connector (e.g. `historic-england/`, `wikidata/`, `osm/`).
 */
export class ExampleAdapter implements SourceAdapter {
  readonly id = 'example';
  readonly displayName = 'Example dataset';
  readonly licence = 'CC0-1.0';

  async *fetch(_options?: FetchOptions): AsyncIterable<RawPlaceRecord> {
    const retrievedAt = new Date().toISOString();
    yield {
      provenance: {
        sourceId: this.id,
        sourceRecordId: 'EX-0001',
        originalUrl: 'https://example.org/records/EX-0001',
        licence: this.licence,
        attribution: 'Example dataset',
        retrievedAt,
        importerVersion: '0.0.0',
      },
      name: 'Example Castle',
      rawType: 'Castle',
      mappedType: 'castle',
      lng: -1.5,
      lat: 54.0,
      designation: 'Scheduled Monument',
    };
  }
}
