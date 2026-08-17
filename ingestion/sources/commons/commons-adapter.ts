import { readFileSync } from 'node:fs';

/**
 * Wikimedia Commons — Whilom's first external media source.
 *
 * Commons is a MEDIA source, not another source of heritage places. A Commons
 * file depicts something; it is not itself a place, and this adapter never
 * proposes new canonical entities. It proposes pictures of entities Whilom
 * already knows about.
 *
 * Mechanism: the official MediaWiki Action API.
 *
 *   list=categorymembers   files in a category the entity's own Wikidata item
 *                          names, which is why association starts from a QID
 *                          rather than from a filename
 *   prop=imageinfo         with iiprop=url|extmetadata|mime|size|user, whose
 *                          `extmetadata` block carries the per-file rights:
 *                          Artist, LicenseShortName, LicenseUrl, Credit,
 *                          UsageTerms, AttributionRequired
 *
 * No HTML page is scraped and no article prose is copied. Rights come from each
 * file's own metadata, because "from Wikimedia Commons" is not a licence —
 * Commons hosts many, and they differ file by file.
 *
 * RATE LIMITING: the anonymous Action API returns HTTP 429 on bursts. The first
 * capture run was cut off after five categories. Requests are serialised with a
 * delay and retried with backoff; this is documented rather than worked around
 * because it directly bounds how fast media can ever be ingested.
 */

export const COMMONS_SOURCE_ID = 'wikimedia-commons';
export const COMMONS_IMPORTER_VERSION = '0.1.0';
export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

/** One file exactly as captured. Rights fields are raw; nothing is interpreted. */
export interface CommonsFile {
  /** `File:Something.jpg` — stable identity for idempotent reimport. */
  sourceFileId: string;
  title: string;
  pageUrl: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  /** extmetadata Artist. HTML; must be sanitised before use or display. */
  artistRaw: string | null;
  licenceShortRaw: string | null;
  licenceRaw: string | null;
  licenceUrl: string | null;
  attributionRequired: string | null;
  credit: string | null;
  usageTerms: string | null;
  dateTimeOriginal: string | null;
  uploader: string | null;
  /** Association evidence: the category came from the entity's Wikidata item. */
  viaCategory: string;
  viaQid: string;
  entityLabel: string;
  nhleIds: string[];
}

interface CommonsFixture {
  _source?: { retrievedAt?: string };
  files?: CommonsFile[];
}

export type CommonsFetchMode =
  | { kind: 'file'; path: string }
  | { kind: 'api'; endpoint?: string; categories: { category: string; qid: string; label: string }[]; perCategory?: number };

/** A raw media record, before normalisation or any rights decision. */
export interface RawMediaRecord {
  provenance: {
    sourceId: string;
    sourceRecordId: string;
    originalUrl: string | null;
    retrievedAt: string;
    importerVersion: string;
  };
  file: CommonsFile;
}

export class WikimediaCommonsAdapter {
  readonly id = COMMONS_SOURCE_ID;
  readonly displayName = 'Wikimedia Commons';

  constructor(private readonly mode: CommonsFetchMode) {}

  async *fetch(): AsyncIterable<RawMediaRecord> {
    const { files, retrievedAt } =
      this.mode.kind === 'file' ? this.readFixture(this.mode.path) : await this.fetchFromApi(this.mode);

    for (const file of files) {
      if (!file.sourceFileId) continue;
      yield {
        provenance: {
          sourceId: COMMONS_SOURCE_ID,
          sourceRecordId: file.sourceFileId,
          originalUrl: file.pageUrl,
          retrievedAt,
          importerVersion: COMMONS_IMPORTER_VERSION,
        },
        file,
      };
    }
  }

  private readFixture(path: string): { files: CommonsFile[]; retrievedAt: string } {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as CommonsFixture;
    return {
      files: parsed.files ?? [],
      retrievedAt: parsed._source?.retrievedAt ?? new Date().toISOString(),
    };
  }

  private async fetchFromApi(
    mode: Extract<CommonsFetchMode, { kind: 'api' }>,
  ): Promise<{ files: CommonsFile[]; retrievedAt: string }> {
    const endpoint = mode.endpoint ?? COMMONS_API;
    const perCategory = mode.perCategory ?? 3;
    const files: CommonsFile[] = [];

    for (const target of mode.categories) {
      const members = await this.call(endpoint, {
        action: 'query',
        list: 'categorymembers',
        cmtitle: `Category:${target.category}`,
        cmtype: 'file',
        cmlimit: String(perCategory),
      });
      const titles = (
        (members as { query?: { categorymembers?: { title: string }[] } }).query?.categorymembers ?? []
      ).map((m) => m.title);
      if (titles.length === 0) continue;

      const info = await this.call(endpoint, {
        action: 'query',
        titles: titles.join('|'),
        prop: 'imageinfo',
        iiprop: 'url|extmetadata|mime|size|user',
        iiurlwidth: '320',
      });

      const pages = (info as { query?: { pages?: Record<string, CommonsApiPage> } }).query?.pages ?? {};
      for (const page of Object.values(pages)) {
        const imageinfo = page.imageinfo?.[0];
        if (!imageinfo) continue;
        const meta = imageinfo.extmetadata ?? {};
        const get = (key: string): string | null => meta[key]?.value ?? null;
        files.push({
          sourceFileId: page.title,
          title: page.title.replace(/^File:/, ''),
          pageUrl: imageinfo.descriptionurl ?? null,
          mediaUrl: imageinfo.url ?? null,
          thumbnailUrl: imageinfo.thumburl ?? null,
          mime: imageinfo.mime ?? null,
          width: imageinfo.width ?? null,
          height: imageinfo.height ?? null,
          artistRaw: get('Artist'),
          licenceShortRaw: get('LicenseShortName'),
          licenceRaw: get('License'),
          licenceUrl: get('LicenseUrl'),
          attributionRequired: get('AttributionRequired'),
          credit: get('Credit'),
          usageTerms: get('UsageTerms'),
          dateTimeOriginal: get('DateTimeOriginal'),
          uploader: imageinfo.user ?? null,
          viaCategory: target.category,
          viaQid: target.qid,
          entityLabel: target.label,
          nhleIds: [],
        });
      }
    }

    return { files, retrievedAt: new Date().toISOString() };
  }

  /** Serialised with a pause; the anonymous API 429s on bursts. */
  private async call(endpoint: string, params: Record<string, string>): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      const response = await globalThis.fetch(
        `${endpoint}?${new URLSearchParams({ format: 'json', ...params })}`,
        {
          headers: {
            'User-Agent': `Whilom/${COMMONS_IMPORTER_VERSION} (heritage media ingestion)`,
            Accept: 'application/json',
          },
        },
      );
      if (response.status === 429 && attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
        continue;
      }
      if (!response.ok) throw new Error(`Commons API failed: HTTP ${response.status}`);
      const body: unknown = await response.json();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return body;
    }
  }
}

interface CommonsApiPage {
  title: string;
  imageinfo?: {
    url?: string;
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
    width?: number;
    height?: number;
    user?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
}
