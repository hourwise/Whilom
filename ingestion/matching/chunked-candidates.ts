/**
 * A disk-backed candidate index for long-running imports.
 *
 * The ordinary CandidateIndex is intentionally small and fast for regional
 * imports, but it retains every CanonicalPlaceRef and every matched source
 * candidate in the Node heap. That makes it a poor shape for a national
 * stream. This index keeps only compact lookup metadata in memory and spills
 * the payloads to an append-only JSONL file. Spatial and identifier lookups
 * still return records in their original insertion order, so the matcher sees
 * the same candidates as the in-memory index.
 *
 * The cache is an LRU working set, not a correctness cache: evicted payloads
 * are read back from the spill file. Therefore chunk boundaries cannot lose a
 * candidate. The spatial index inspects every cell touched by the matcher's
 * own 5km radius, and the identifier index is global because identifiers are
 * allowed to match across geography.
 */

import { closeSync, mkdirSync, openSync, readSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CanonicalPlaceRef, PlaceCandidate } from '../pipeline/candidate';
import type { CandidateGenerationStats } from './candidates';
import { candidateRadiusMeters } from './candidates';

const METRES_PER_DEGREE_LATITUDE = 111_320;
const CELL_DEGREES = 0.05;
interface SpillRow {
  canonical: CanonicalPlaceRef;
  candidate?: PlaceCandidate;
}

interface Pointer {
  sequence: number;
  offset: number;
  length: number;
  cell: string;
  identifiers: string[];
  sourceIdentity?: {
    provenance: { sourceId: string; sourceRecordId: string };
    designations: readonly { designation: string }[];
  };
}

export interface ChunkedWorkingSetStats {
  mode: 'disk-backed-chunked';
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

interface CachedPayload {
  canonical: CanonicalPlaceRef;
  candidate?: PlaceCandidate;
  used: number;
}

export class ChunkedCandidateIndex {
  private readonly pointers: Pointer[] = [];
  private readonly grid = new Map<string, number[]>();
  private readonly byIdentifier = new Map<string, number[]>();
  private readonly byId = new Map<string, number>();
  private readonly cache = new Map<number, CachedPayload>();
  private readonly fd: number;
  private cacheClock = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private peakCachedPayloadRecords = 0;
  private chunks = 0;

  constructor(
    directory: string,
    private readonly maxCachedPayloadRecords = 2_048,
  ) {
    mkdirSync(directory, { recursive: true });
    this.fd = openSync(resolve(directory, 'canonical-payloads.jsonl'), 'w+');
  }

  get size(): number {
    return this.pointers.length;
  }

  beginChunk(): void {
    this.cache.clear();
    this.chunks += 1;
  }

  add(record: CanonicalPlaceRef, candidate?: PlaceCandidate): void {
    const sequence = this.pointers.length;
    const line = Buffer.from(
      `${JSON.stringify({ canonical: record, ...(candidate ? { candidate } : {}) } satisfies SpillRow)}\n`,
      'utf8',
    );
    const actualOffset = this.spillBytes;
    writeSync(this.fd, line);
    this.spillBytes = actualOffset + line.length;
    const identifiers = identifiersOf(record);
    const pointer: Pointer = {
      sequence,
      offset: actualOffset,
      length: line.length,
      cell: cellKey(latCell(record.location.lat), lngCell(record.location.lng)),
      identifiers,
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
    const spatial = this.grid.get(pointer.cell);
    if (spatial) spatial.push(sequence);
    else this.grid.set(pointer.cell, [sequence]);
    for (const identifier of identifiers) {
      const bucket = this.byIdentifier.get(identifier);
      if (bucket) bucket.push(sequence);
      else this.byIdentifier.set(identifier, [sequence]);
    }
    this.put(sequence, record, candidate);
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
    return sequence === undefined ? undefined : this.load(sequence).candidate;
  }

  getSourceIdentity(id: string): Pointer['sourceIdentity'] {
    const sequence = this.byId.get(id);
    return sequence === undefined ? undefined : this.pointers[sequence]?.sourceIdentity;
  }

  workingSetStats(): ChunkedWorkingSetStats {
    return {
      mode: 'disk-backed-chunked',
      canonicalRecords: this.pointers.length,
      spatialIndexEntries: this.pointers.length,
      identifierIndexEntries: [...this.byIdentifier.values()].reduce(
        (sum, bucket) => sum + bucket.length,
        0,
      ),
      cachedPayloadRecords: this.cache.size,
      peakCachedPayloadRecords: this.peakCachedPayloadRecords,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      chunks: this.chunks,
      spillBytes: this.spillBytes,
      maxCachedPayloadRecords: this.maxCachedPayloadRecords,
    };
  }

  close(): void {
    closeSync(this.fd);
  }

  private spillBytes = 0;

  private load(sequence: number): CachedPayload {
    const cached = this.cache.get(sequence);
    if (cached) {
      cached.used = ++this.cacheClock;
      this.cacheHits += 1;
      return cached;
    }
    const pointer = this.pointers[sequence];
    if (!pointer) throw new Error(`missing chunked candidate pointer ${sequence}`);
    const buffer = Buffer.alloc(pointer.length);
    readSync(this.fd, buffer, 0, pointer.length, pointer.offset);
    const row = JSON.parse(buffer.toString('utf8')) as SpillRow;
    this.cacheMisses += 1;
    this.put(sequence, row.canonical, row.candidate);
    return this.cache.get(sequence)!;
  }

  private put(sequence: number, canonical: CanonicalPlaceRef, candidate?: PlaceCandidate): void {
    this.cache.set(sequence, {
      canonical,
      ...(candidate ? { candidate } : {}),
      used: ++this.cacheClock,
    });
    if (this.cache.size > this.maxCachedPayloadRecords) {
      let oldest: number | undefined;
      let oldestUse = Number.POSITIVE_INFINITY;
      for (const [key, value] of this.cache) {
        if (value.used < oldestUse) {
          oldest = key;
          oldestUse = value.used;
        }
      }
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.peakCachedPayloadRecords = Math.max(this.peakCachedPayloadRecords, this.cache.size);
  }
}
