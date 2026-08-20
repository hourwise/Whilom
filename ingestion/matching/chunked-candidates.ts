/**
 * A disk-backed, locality-aware candidate index for long-running imports.
 *
 * The Batch 14 store kept compact spatial and identifier indexes, but spilled
 * every payload into one corpus-wide JSONL file. An LRU eviction therefore
 * turned a spatial query into many synchronous random reads. This store keeps
 * the same indexes and matcher contract, while writing payloads into bounded
 * pages local to their spatial cell. A page read materialises several nearby
 * payloads at once; the page cache is bounded and correctness never depends on
 * a page remaining resident.
 *
 * Identifier lookup remains global. Candidate sequences are always restored to
 * insertion order before the matcher sees them, so this is an I/O layout
 * change, not a matching-algorithm change.
 */

import { closeSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CanonicalPlaceRef, PlaceCandidate } from '../pipeline/candidate';
import type { CandidateGenerationStats } from './candidates';
import { candidateRadiusMeters } from './candidates';

const METRES_PER_DEGREE_LATITUDE = 111_320;
const CELL_DEGREES = 0.05;
const PAGE_REGION_DEGREES = 0.5;
const MAX_RECORDS_PER_PAGE = 256;

interface CanonicalSpillRow {
  canonical: CanonicalPlaceRef;
}

interface CandidateSpillRow {
  candidate: PlaceCandidate;
}

interface Pointer {
  sequence: number;
  canonicalLength: number;
  candidateLength: number;
  cell: string;
  pageRegion: string;
  pageKey: string;
  pageRow: number;
  identifiers: string[];
  sourceIdentity?: {
    provenance: { sourceId: string; sourceRecordId: string };
    designations: readonly { designation: string }[];
  };
}

interface PageState {
  key: string;
  canonicalPath: string;
  candidatePath: string;
  canonicalFd: number;
  candidateFd: number;
  rowCount: number;
}

interface CachedPayload {
  canonical: CanonicalPlaceRef;
  candidate?: PlaceCandidate;
}

interface LoadedPage {
  records: Map<number, CachedPayload>;
  used: number;
}

interface LoadedCandidatePage {
  records: Map<number, PlaceCandidate>;
  used: number;
}

export interface ChunkedWorkingSetStats {
  mode: 'disk-backed-locality-pages';
  canonicalRecords: number;
  spatialIndexEntries: number;
  identifierIndexEntries: number;
  cachedPayloadRecords: number;
  peakCachedPayloadRecords: number;
  cacheHits: number;
  cacheMisses: number;
  chunks: number;
  spillBytes: number;
  maxCachedPayloadRecords: number;
  /** Every payload requested by candidate generation or duplicate handling. */
  payloadLookups: number;
  /** Resident-page lookups and page loads, respectively. */
  pageHits: number;
  pageMisses: number;
  /** One physical read per page miss, rather than one per payload miss. */
  physicalReadCalls: number;
  bytesReadFromSpill: number;
  payloadBytesRequested: number;
  missPayloadBytesRequested: number;
  recordsDecoded: number;
  cacheHitRatio: number;
  readAmplification: number;
  physicalReadsPerPayloadLookup: number;
  pageCacheRecords: number;
  maxPageCachePages: number;
}

function latCell(lat: number): number {
  return Math.floor(lat / CELL_DEGREES);
}

function lngCell(lng: number): number {
  return Math.floor(lng / CELL_DEGREES);
}

function cellKey(latIndex: number, lngIndex: number): string {
  return `${latIndex}:${lngIndex}`;
}

function pageRegionKey(lat: number, lng: number): string {
  return `${Math.floor(lat / PAGE_REGION_DEGREES)}:${Math.floor(lng / PAGE_REGION_DEGREES)}`;
}

function pageFileName(cell: string, pageNumber: number, kind: 'canonical' | 'candidate'): string {
  return `${cell.replace(':', '_')}-${pageNumber}-${kind}.jsonl`;
}

function identifiersOf(record: CanonicalPlaceRef): string[] {
  return [
    ...record.externalIds.map((id) => `ext|${id.scheme}|${id.value}`),
    ...record.designationReferences.map((reference) => `dref|${reference}`),
  ];
}

function identifiersOfCandidate(candidate: PlaceCandidate): string[] {
  return [
    ...candidate.externalIds.map((id) => `ext|${id.scheme}|${id.value}`),
    ...candidate.designations
      .map((designation) => designation.reference)
      .filter((reference): reference is string => Boolean(reference))
      .map((reference) => `dref|${reference}`),
  ];
}

export class ChunkedCandidateIndex {
  private readonly pointers: Pointer[] = [];
  private readonly grid = new Map<string, number[]>();
  private readonly byIdentifier = new Map<string, number[]>();
  private readonly byId = new Map<string, number>();
  private readonly pageCache = new Map<string, LoadedPage>();
  private readonly candidatePageCache = new Map<string, LoadedCandidatePage>();
  private readonly activePages = new Map<string, PageState>();
  private readonly pagesDirectory: string;
  private readonly pageRecordCapacity: number;
  private readonly maxPageCachePages: number;
  private readonly maxCandidatePageCachePages: number;
  private cacheClock = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private pageHits = 0;
  private pageMisses = 0;
  private payloadLookups = 0;
  private physicalReadCalls = 0;
  private bytesReadFromSpill = 0;
  private payloadBytesRequested = 0;
  private missPayloadBytesRequested = 0;
  private recordsDecoded = 0;
  private peakCachedPayloadRecords = 0;
  private chunks = 0;
  private spillBytes = 0;

  constructor(
    directory: string,
    private readonly maxCachedPayloadRecords = 65_536,
  ) {
    this.pagesDirectory = resolve(directory, 'payload-pages');
    mkdirSync(this.pagesDirectory, { recursive: true });

    // The public constructor limit remains a record limit for compatibility
    // with Batch 14. Pages are never larger than that limit, so the live
    // decoded payload working set remains bounded by the same limit.
    this.pageRecordCapacity = Math.max(1, Math.min(MAX_RECORDS_PER_PAGE, maxCachedPayloadRecords));
    this.maxPageCachePages = Math.max(
      1,
      Math.floor(maxCachedPayloadRecords / this.pageRecordCapacity),
    );
    this.maxCandidatePageCachePages = Math.max(1, Math.floor(this.maxPageCachePages / 8));
  }

  get size(): number {
    return this.pointers.length;
  }

  beginChunk(): void {
    // The page cache is already bounded by maxPageCachePages. Keeping it
    // across chunks is essential for a nationally interleaved stream: the
    // same geographic working region may recur after several source chunks.
    // Chunk boundaries remain observable for measurement but do not discard a
    // correctness-independent locality cache.
    this.chunks += 1;
  }

  add(record: CanonicalPlaceRef, candidate?: PlaceCandidate): void {
    const sequence = this.pointers.length;
    const canonicalLine = Buffer.from(
      `${JSON.stringify({ canonical: record } satisfies CanonicalSpillRow)}\n`,
      'utf8',
    );
    // Candidate payloads are needed only for the sparse cross-source
    // comparison path. Keeping them out of canonical spatial pages avoids
    // decoding and retaining a full source object for every shortlist item.
    const candidateLine = Buffer.from(
      `${candidate ? JSON.stringify({ candidate } satisfies CandidateSpillRow) : ''}\n`,
      'utf8',
    );
    const cell = cellKey(latCell(record.location.lat), lngCell(record.location.lng));
    const pageRegion = pageRegionKey(record.location.lat, record.location.lng);
    let page = this.activePages.get(pageRegion);
    if (!page || page.rowCount >= this.pageRecordCapacity) {
      const pageNumber = page ? pageNumberOf(page.key) + 1 : 0;
      const key = `${pageRegion}:${pageNumber}`;
      const canonicalPath = resolve(
        this.pagesDirectory,
        pageFileName(pageRegion, pageNumber, 'canonical'),
      );
      const candidatePath = resolve(
        this.pagesDirectory,
        pageFileName(pageRegion, pageNumber, 'candidate'),
      );
      if (page) {
        closeSync(page.canonicalFd);
        closeSync(page.candidateFd);
      }
      // A run directory is unique, but truncating here also makes direct
      // repeated use deterministic rather than appending to stale pages.
      page = {
        key,
        canonicalPath,
        candidatePath,
        canonicalFd: openSync(canonicalPath, 'w+'),
        candidateFd: openSync(candidatePath, 'w+'),
        rowCount: 0,
      };
      this.activePages.set(pageRegion, page);
    }

    const pageRow = page.rowCount;
    writeSync(page.canonicalFd, canonicalLine);
    writeSync(page.candidateFd, candidateLine);
    page.rowCount += 1;
    // Keep a resident active page coherent as it grows. Invalidating it here
    // would make an interleaved national stream reread the same page after
    // every append, defeating locality before a page is even full.
    const residentPage = this.pageCache.get(page.key);
    if (residentPage) {
      residentPage.records.set(pageRow, {
        canonical: record,
      });
      residentPage.used = ++this.cacheClock;
      this.peakCachedPayloadRecords = Math.max(
        this.peakCachedPayloadRecords,
        this.cachedPayloadRecords(),
      );
    }
    const residentCandidatePage = this.candidatePageCache.get(page.key);
    if (residentCandidatePage && candidate) {
      residentCandidatePage.records.set(pageRow, candidate);
      residentCandidatePage.used = ++this.cacheClock;
    }
    this.spillBytes += canonicalLine.length + candidateLine.length;

    const pointer: Pointer = {
      sequence,
      canonicalLength: canonicalLine.length,
      candidateLength: candidateLine.length,
      cell,
      pageRegion,
      pageKey: page.key,
      pageRow,
      identifiers: identifiersOf(record),
      ...(record.sourceIdentity
        ? {
            sourceIdentity: {
              provenance: {
                sourceId: record.sourceIdentity.sourceId,
                sourceRecordId: record.sourceIdentity.sourceRecordId,
              },
              designations: record.sourceIdentity.designations.map((designation) => ({
                designation,
              })),
            },
          }
        : {}),
    };
    this.pointers.push(pointer);
    this.byId.set(record.id, sequence);
    const spatial = this.grid.get(cell);
    if (spatial) spatial.push(sequence);
    else this.grid.set(cell, [sequence]);
    for (const identifier of pointer.identifiers) {
      const bucket = this.byIdentifier.get(identifier);
      if (bucket) bucket.push(sequence);
      else this.byIdentifier.set(identifier, [sequence]);
    }
  }

  async candidatesFor(
    candidate: PlaceCandidate,
    stats?: CandidateGenerationStats,
  ): Promise<CanonicalPlaceRef[]> {
    if (stats) stats.possiblePairs += this.pointers.length;
    const started = performance.now();
    const selected = new Set<number>();
    const radius = candidateRadiusMeters();
    const latSpanDegrees = radius / METRES_PER_DEGREE_LATITUDE;
    const cosLat = Math.cos((candidate.location.lat * Math.PI) / 180);
    const lngSpanDegrees = Math.min(
      180,
      radius / (METRES_PER_DEGREE_LATITUDE * Math.max(cosLat, 0.01)),
    );
    const latSteps = Math.ceil(latSpanDegrees / CELL_DEGREES);
    const lngSteps = Math.ceil(lngSpanDegrees / CELL_DEGREES);
    const centreLat = latCell(candidate.location.lat);
    const centreLng = lngCell(candidate.location.lng);
    let spatial = 0;
    let cells = 0;
    for (let dLat = -latSteps; dLat <= latSteps; dLat += 1) {
      for (let dLng = -lngSteps; dLng <= lngSteps; dLng += 1) {
        cells += 1;
        const bucket = this.grid.get(cellKey(centreLat + dLat, centreLng + dLng));
        if (!bucket) continue;
        for (const sequence of bucket) {
          if (!selected.has(sequence)) {
            selected.add(sequence);
            spatial += 1;
          }
        }
      }
    }

    let identifierOnly = 0;
    for (const key of identifiersOfCandidate(candidate)) {
      for (const sequence of this.byIdentifier.get(key) ?? []) {
        if (!selected.has(sequence)) {
          selected.add(sequence);
          identifierOnly += 1;
        }
      }
    }

    // Spatial pages are read in their locality order, but the matcher receives
    // exactly the old canonical insertion order. This sort is intentional.
    const ordered = [...selected]
      .sort((a, b) => a - b)
      .map((sequence) => this.load(sequence).canonical);
    if (stats) {
      stats.candidatePairs += ordered.length;
      stats.fromSpatial += spatial;
      stats.fromIdentifierOnly += identifierOnly;
      stats.cellsInspected += cells;
      stats.generationMs += performance.now() - started;
    }
    return ordered;
  }

  getCandidate(id: string): PlaceCandidate | undefined {
    const sequence = this.byId.get(id);
    return sequence === undefined ? undefined : this.loadCandidate(sequence);
  }

  getSourceIdentity(id: string): Pointer['sourceIdentity'] {
    const sequence = this.byId.get(id);
    return sequence === undefined ? undefined : this.pointers[sequence]?.sourceIdentity;
  }

  workingSetStats(): ChunkedWorkingSetStats {
    const cachedPayloadRecords = this.cachedPayloadRecords();
    return {
      mode: 'disk-backed-locality-pages',
      canonicalRecords: this.pointers.length,
      spatialIndexEntries: this.pointers.length,
      identifierIndexEntries: [...this.byIdentifier.values()].reduce(
        (sum, bucket) => sum + bucket.length,
        0,
      ),
      cachedPayloadRecords,
      peakCachedPayloadRecords: this.peakCachedPayloadRecords,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      chunks: this.chunks,
      spillBytes: this.spillBytes,
      maxCachedPayloadRecords: this.maxCachedPayloadRecords,
      payloadLookups: this.payloadLookups,
      pageHits: this.pageHits,
      pageMisses: this.pageMisses,
      physicalReadCalls: this.physicalReadCalls,
      bytesReadFromSpill: this.bytesReadFromSpill,
      payloadBytesRequested: this.payloadBytesRequested,
      missPayloadBytesRequested: this.missPayloadBytesRequested,
      recordsDecoded: this.recordsDecoded,
      cacheHitRatio: this.payloadLookups > 0 ? this.cacheHits / this.payloadLookups : 1,
      readAmplification:
        this.payloadBytesRequested > 0
          ? this.bytesReadFromSpill / Math.max(1, this.missPayloadBytesRequested)
          : 1,
      physicalReadsPerPayloadLookup:
        this.payloadLookups > 0 ? this.physicalReadCalls / this.payloadLookups : 0,
      pageCacheRecords: cachedPayloadRecords,
      maxPageCachePages: this.maxPageCachePages,
    };
  }

  close(): void {
    this.pageCache.clear();
    this.candidatePageCache.clear();
    for (const page of this.activePages.values()) {
      closeSync(page.canonicalFd);
      closeSync(page.candidateFd);
    }
    this.activePages.clear();
  }

  private load(sequence: number): CachedPayload {
    this.payloadLookups += 1;
    const pointer = this.pointers[sequence];
    if (!pointer) throw new Error(`missing locality candidate pointer ${sequence}`);
    this.payloadBytesRequested += pointer.canonicalLength;

    const cachedPage = this.pageCache.get(pointer.pageKey);
    if (cachedPage) {
      cachedPage.used = ++this.cacheClock;
      this.cacheHits += 1;
      this.pageHits += 1;
      const cached = cachedPage.records.get(pointer.pageRow);
      if (cached) return cached;
      throw new Error(`missing row ${pointer.pageRow} in cached page ${pointer.pageKey}`);
    }

    this.cacheMisses += 1;
    this.pageMisses += 1;
    this.physicalReadCalls += 1;
    this.missPayloadBytesRequested += pointer.canonicalLength;
    const pagePath = resolve(
      this.pagesDirectory,
      pageFileName(pointer.pageRegion, pageNumberOf(pointer.pageKey), 'canonical'),
    );
    const bytes = readFileSync(pagePath);
    this.bytesReadFromSpill += bytes.length;
    const records = new Map<number, CachedPayload>();
    for (const [row, line] of bytes.toString('utf8').split('\n').entries()) {
      if (!line) continue;
      const parsed = JSON.parse(line) as CanonicalSpillRow;
      records.set(row, {
        canonical: parsed.canonical,
      });
      this.recordsDecoded += 1;
    }
    const page: LoadedPage = { records, used: ++this.cacheClock };
    this.pageCache.set(pointer.pageKey, page);
    this.evictPagesIfNeeded();
    const loaded = page.records.get(pointer.pageRow);
    if (!loaded) throw new Error(`missing row ${pointer.pageRow} in page ${pointer.pageKey}`);
    return loaded;
  }

  private loadCandidate(sequence: number): PlaceCandidate | undefined {
    this.payloadLookups += 1;
    const pointer = this.pointers[sequence];
    if (!pointer) throw new Error(`missing locality candidate pointer ${sequence}`);
    this.payloadBytesRequested += pointer.candidateLength;

    const cachedPage = this.candidatePageCache.get(pointer.pageKey);
    if (cachedPage) {
      cachedPage.used = ++this.cacheClock;
      this.cacheHits += 1;
      this.pageHits += 1;
      return cachedPage.records.get(pointer.pageRow);
    }

    this.cacheMisses += 1;
    this.pageMisses += 1;
    this.physicalReadCalls += 1;
    this.missPayloadBytesRequested += pointer.candidateLength;
    const pagePath = resolve(
      this.pagesDirectory,
      pageFileName(pointer.pageRegion, pageNumberOf(pointer.pageKey), 'candidate'),
    );
    const bytes = readFileSync(pagePath);
    this.bytesReadFromSpill += bytes.length;
    const records = new Map<number, PlaceCandidate>();
    for (const [row, line] of bytes.toString('utf8').split('\n').entries()) {
      if (!line) continue;
      const parsed = JSON.parse(line) as CandidateSpillRow;
      records.set(row, parsed.candidate);
      this.recordsDecoded += 1;
    }
    const page: LoadedCandidatePage = { records, used: ++this.cacheClock };
    this.candidatePageCache.set(pointer.pageKey, page);
    this.evictCandidatePagesIfNeeded();
    return page.records.get(pointer.pageRow);
  }

  private evictPagesIfNeeded(): void {
    while (this.pageCache.size > this.maxPageCachePages) {
      let oldestKey: string | undefined;
      let oldestUse = Number.POSITIVE_INFINITY;
      for (const [key, page] of this.pageCache) {
        if (page.used < oldestUse) {
          oldestKey = key;
          oldestUse = page.used;
        }
      }
      if (oldestKey === undefined) break;
      this.pageCache.delete(oldestKey);
    }
    this.peakCachedPayloadRecords = Math.max(
      this.peakCachedPayloadRecords,
      this.cachedPayloadRecords(),
    );
  }

  private evictCandidatePagesIfNeeded(): void {
    while (this.candidatePageCache.size > this.maxCandidatePageCachePages) {
      let oldestKey: string | undefined;
      let oldestUse = Number.POSITIVE_INFINITY;
      for (const [key, page] of this.candidatePageCache) {
        if (page.used < oldestUse) {
          oldestKey = key;
          oldestUse = page.used;
        }
      }
      if (oldestKey === undefined) break;
      this.candidatePageCache.delete(oldestKey);
    }
    this.peakCachedPayloadRecords = Math.max(
      this.peakCachedPayloadRecords,
      this.cachedPayloadRecords(),
    );
  }

  private cachedPayloadRecords(): number {
    let count = 0;
    for (const page of this.pageCache.values()) count += page.records.size;
    for (const page of this.candidatePageCache.values()) count += page.records.size;
    return count;
  }
}

function pageNumberOf(key: string): number {
  const value = key.slice(key.lastIndexOf(':') + 1);
  const pageNumber = Number(value);
  if (!Number.isInteger(pageNumber) || pageNumber < 0) throw new Error(`invalid page key ${key}`);
  return pageNumber;
}
