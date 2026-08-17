import { readFileSync } from 'node:fs';
import type { FetchOptions, RawPlaceRecord, SourceAdapter } from '../source-adapter';

/**
 * Wikidata as an independent heritage source.
 *
 * Until now Wikidata was used only for enrichment — a bag of identifiers bolted
 * onto records that Historic England had already supplied. That could never
 * demonstrate cross-source behaviour, because a source that only ever adds
 * fields can never disagree with anything.
 *
 * This adapter implements the ordinary `SourceAdapter` contract, so Wikidata
 * records travel the same NORMALISE → VALIDATE → MATCH → CONFLICT path as NHLE
 * records and are subject to exactly the same rules. There is no Wikidata
 * special case anywhere in the pipeline.
 *
 * Licence: Wikidata's structured data is released under **CC0 1.0** (public
 * domain dedication) — no attribution is legally required, though Whilom
 * records it anyway because provenance is the point. Note this covers the
 * *structured statements* only. Wikipedia article prose is CC BY-SA and is
 * NOT used here: nothing in this adapter reads an article body, and no
 * descriptive text is imported.
 */

export const WIKIDATA_SOURCE_ID = 'wikidata';
export const WIKIDATA_IMPORTER_VERSION = '0.2.0';
export const WIKIDATA_LICENCE = 'CC0-1.0';
export const WIKIDATA_ATTRIBUTION =
  'Wikidata contributors, CC0 1.0 Universal (public domain dedication)';
export const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

/** One Wikidata item, as captured from SPARQL. */
export interface WikidataItem {
  qid: string;
  label?: string;
  aliases?: string[];
  /** Values of P1216, National Heritage List for England number. */
  nhleIds?: string[];
  lat?: number;
  lon?: number;
  /** Wikidata's own stated coordinate precision, in DEGREES. */
  geoPrecision?: number;
  /** P571 inception, ISO-ish; may be a year, and may be negative (BCE). */
  inception?: string;
  website?: string;
  commons?: string;
  /** schema:dateModified — when the item last changed. */
  modified?: string;
  /** P31 instance-of labels. */
  instanceOf?: string[];
  /** P84 architect labels. */
  architects?: string[];
  /** P1435 heritage designation labels. */
  heritageDesignations?: string[];
}

interface WikidataFixture {
  _source?: { retrievedAt?: string };
  items?: WikidataItem[];
}

export type WikidataFetchMode =
  | { kind: 'file'; path: string }
  | { kind: 'sparql'; endpoint?: string; query: string };

export class WikidataSourceAdapter implements SourceAdapter {
  readonly id = WIKIDATA_SOURCE_ID;
  readonly displayName = 'Wikidata';
  readonly licence = WIKIDATA_LICENCE;

  constructor(private readonly mode: WikidataFetchMode) {}

  async *fetch(options?: FetchOptions): AsyncIterable<RawPlaceRecord> {
    const { items, retrievedAt } =
      this.mode.kind === 'file'
        ? this.readFixture(this.mode.path)
        : await this.runSparql(this.mode, options);

    for (const item of items) {
      const record = toRawRecord(item, retrievedAt);
      if (record) yield record;
    }
  }

  private readFixture(path: string): { items: WikidataItem[]; retrievedAt: string } {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as WikidataFixture;
    return {
      items: parsed.items ?? [],
      retrievedAt: parsed._source?.retrievedAt ?? new Date().toISOString(),
    };
  }

  /**
   * Live SPARQL. Kept deliberately thin: the query is supplied by the caller so
   * scope stays explicit and bounded, rather than this class deciding to walk
   * the whole UK heritage graph.
   */
  private async runSparql(
    mode: Extract<WikidataFetchMode, { kind: 'sparql' }>,
    options?: FetchOptions,
  ): Promise<{ items: WikidataItem[]; retrievedAt: string }> {
    const endpoint = mode.endpoint ?? WIKIDATA_SPARQL_ENDPOINT;
    const response = await globalThis.fetch(
      `${endpoint}?query=${encodeURIComponent(mode.query)}`,
      {
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': `Whilom/${WIKIDATA_IMPORTER_VERSION} (heritage ingestion)`,
        },
        signal: options?.signal,
      },
    );
    if (!response.ok) {
      throw new Error(`Wikidata SPARQL failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      results?: { bindings?: Record<string, { value?: string }>[] };
    };
    return {
      items: collapseBindings(body.results?.bindings ?? []),
      retrievedAt: new Date().toISOString(),
    };
  }
}

/**
 * SPARQL returns one row per combination of optional values, so a single item
 * with three `instance of` statements arrives as three rows. Fold them back
 * into one item per QID.
 */
export function collapseBindings(
  bindings: readonly Record<string, { value?: string } | undefined>[],
): WikidataItem[] {
  const byQid = new Map<string, WikidataItem & { _sets: Record<string, Set<string>> }>();

  for (const row of bindings) {
    const itemUri = row['item']?.value;
    if (!itemUri) continue;
    const qid = itemUri.split('/').pop();
    if (!qid) continue;

    let entry = byQid.get(qid);
    if (!entry) {
      entry = {
        qid,
        _sets: { nhleIds: new Set(), instanceOf: new Set(), architects: new Set(), heritageDesignations: new Set() },
      };
      byQid.set(qid, entry);
    }

    entry.label ??= row['itemLabel']?.value;
    const lat = row['lat']?.value;
    const lon = row['lon']?.value;
    if (lat !== undefined && lon !== undefined) {
      entry.lat = Number(lat);
      entry.lon = Number(lon);
    }
    const precision = row['geoPrecision']?.value;
    if (precision !== undefined) entry.geoPrecision = Number(precision);
    entry.inception ??= row['inception']?.value;
    entry.website ??= row['website']?.value;
    entry.commons ??= row['commons']?.value;
    entry.modified ??= row['modified']?.value;

    const add = (key: string, value?: string) => {
      if (value) entry!._sets[key]?.add(value);
    };
    add('nhleIds', row['nhleId']?.value);
    add('instanceOf', row['instanceOfLabel']?.value);
    add('architects', row['architectLabel']?.value);
    add('heritageDesignations', row['heritageLabel']?.value);
  }

  return [...byQid.values()].map(({ _sets, ...item }) => ({
    ...item,
    nhleIds: [..._sets['nhleIds']!],
    instanceOf: [..._sets['instanceOf']!],
    architects: [..._sets['architects']!],
    heritageDesignations: [..._sets['heritageDesignations']!],
  }));
}

/**
 * Shape one item into a `RawPlaceRecord`. Returns null only when the item has
 * no usable identity — no QID or no label. A missing coordinate is passed on so
 * VALIDATE rejects it explicitly and the rejection is counted.
 */
function toRawRecord(item: WikidataItem, retrievedAt: string): RawPlaceRecord | null {
  if (!item.qid || !/^Q\d+$/.test(item.qid)) return null;
  const name = item.label?.trim();
  if (!name) return null;

  return {
    provenance: {
      sourceId: WIKIDATA_SOURCE_ID,
      sourceRecordId: item.qid,
      originalUrl: `https://www.wikidata.org/wiki/${item.qid}`,
      licence: WIKIDATA_LICENCE,
      attribution: WIKIDATA_ATTRIBUTION,
      retrievedAt,
      ...(item.modified ? { sourceUpdatedAt: item.modified } : {}),
      importerVersion: WIKIDATA_IMPORTER_VERSION,
    },
    name,
    rawType: item.instanceOf?.[0] ?? undefined,
    extra: { item },
  };
}
