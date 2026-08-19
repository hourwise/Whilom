/**
 * Candidate generation (spec §36).
 *
 * The matcher decides identity. This decides only which records are worth
 * asking it about, and that distinction is the whole design: nothing here may
 * ever conclude that two records are the same place, or that they are not.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 *
 * The 5,000-record scale experiment measured 12.5 million pair comparisons, of
 * which 98.8% were between records more than 5 km apart — pairs the matcher
 * already refuses on sight. The wasted share *grew* with the corpus (97.0% at
 * 1,000, 98.8% at 5,000), because every new record was compared against every
 * record already accepted. That is the quadratic blocker to a larger import.
 *
 * ---------------------------------------------------------------------------
 * Why bounding is safe
 * ---------------------------------------------------------------------------
 *
 * `matchCandidate` reads its input in exactly two passes, and each has a
 * knowable sufficient set:
 *
 *   1. The deterministic identity pass walks the array in order and returns on
 *      the first record sharing an external identifier or designation
 *      reference. It applies NO distance bound — a shared Wikidata QID matches
 *      across the country — so identifier candidates must be produced
 *      regardless of locality.
 *
 *   2. The scored pass keeps only records for which `scoreAgainst` is non-null,
 *      and `scoreAgainst` returns null unconditionally beyond
 *      `THRESHOLDS.maxPlausibleDistanceMeters`. Records beyond that distance
 *      therefore contribute nothing to the scored set, its ordering, or the
 *      near-tie test.
 *
 * So for a candidate `c`, any superset of
 *
 *     { e : shares an identifier with c }  ∪  { e : within the plausible radius }
 *
 * delivered **in the original insertion order** produces a byte-identical
 * decision. Order matters because the scored set is sorted by score with a
 * stable sort, and the near-tie test compares the top two — a reordering could
 * silently swap which of two equal-scoring records is chosen.
 *
 * That is the claim `scale:equivalence` checks against the frozen oracle for
 * 1,000, 2,500 and 5,000 real records, rather than asserting it here and hoping.
 */

import type { CanonicalPlaceRef, PlaceCandidate } from '../pipeline/candidate';
import { THRESHOLDS } from './matcher';

/**
 * The radius within which the matcher might still say "same place".
 *
 * Read from the matcher's own threshold rather than restated, so the two cannot
 * drift apart. If the matcher ever widens its veto, candidate generation widens
 * with it automatically; a test asserts the relationship holds.
 */
export function candidateRadiusMeters(): number {
  return THRESHOLDS.maxPlausibleDistanceMeters;
}

const METRES_PER_DEGREE_LATITUDE = 111_320;

/**
 * Grid cell size in degrees.
 *
 * Chosen so a query touches a handful of cells rather than one enormous cell
 * (which would degenerate to a full scan) or thousands of tiny ones (which
 * would cost more to enumerate than the comparisons saved). At UK latitudes
 * 0.05° is roughly 5.6 km north–south and 3.3 km east–west, so the 5 km query
 * radius spans about three cells by five.
 */
const CELL_DEGREES = 0.05;

function latCell(lat: number): number {
  return Math.floor(lat / CELL_DEGREES);
}

function lngCell(lng: number): number {
  return Math.floor(lng / CELL_DEGREES);
}

function cellKey(latIndex: number, lngIndex: number): string {
  return `${latIndex}:${lngIndex}`;
}

/** Identifier keys a record can be found by. Mirrors `sharedExternalId`. */
function identifierKeysOfExisting(existing: CanonicalPlaceRef): string[] {
  const keys: string[] = [];
  for (const id of existing.externalIds) keys.push(`ext|${id.scheme}|${id.value}`);
  for (const reference of existing.designationReferences) keys.push(`dref|${reference}`);
  return keys;
}

function identifierKeysOfCandidate(candidate: PlaceCandidate): string[] {
  const keys: string[] = [];
  for (const id of candidate.externalIds) keys.push(`ext|${id.scheme}|${id.value}`);
  for (const designation of candidate.designations) {
    if (designation.reference) keys.push(`dref|${designation.reference}`);
  }
  return keys;
}

export interface CandidateGenerationStats {
  /** Records the matcher would have scanned with the exhaustive strategy. */
  possiblePairs: number;
  /** Records actually handed to the matcher. */
  candidatePairs: number;
  /** Candidates contributed by the spatial index. */
  fromSpatial: number;
  /** Candidates contributed by the identifier index and NOT spatially near. */
  fromIdentifierOnly: number;
  /** Grid cells inspected across all queries. */
  cellsInspected: number;
  /** Time spent generating candidates, milliseconds. */
  generationMs: number;
}

/**
 * Storage contract used by the ingestion runner. CandidateIndex is the
 * in-memory implementation; national runs may provide a disk-backed,
 * chunked implementation without changing matcher semantics.
 */
export interface CandidateStore {
  readonly size: number;
  add(record: CanonicalPlaceRef, candidate?: PlaceCandidate): void | Promise<void>;
  candidatesFor(
    candidate: PlaceCandidate,
    stats?: CandidateGenerationStats,
  ): CanonicalPlaceRef[] | Promise<CanonicalPlaceRef[]>;
  getCandidate?(id: string): PlaceCandidate | undefined | Promise<PlaceCandidate | undefined>;
  getSourceIdentity?(id: string):
    | {
        provenance: { sourceId: string; sourceRecordId: string };
        designations: readonly { designation: string }[];
      }
    | undefined
    | Promise<
        | {
            provenance: { sourceId: string; sourceRecordId: string };
            designations: readonly { designation: string }[];
          }
        | undefined
      >;
  beginChunk?(): void | Promise<void>;
  workingSetStats?(): unknown;
  close?(): void | Promise<void>;
}

export function emptyCandidateStats(): CandidateGenerationStats {
  return {
    possiblePairs: 0,
    candidatePairs: 0,
    fromSpatial: 0,
    fromIdentifierOnly: 0,
    cellsInspected: 0,
    generationMs: 0,
  };
}

/** How candidates are discovered. Exhaustive exists to prove bounded correct. */
export const CandidateMode = {
  /** Every known record. The original behaviour; the equivalence oracle. */
  Exhaustive: 'exhaustive',
  /** Spatially bounded plus identifier lookups. */
  Bounded: 'bounded',
} as const;
export type CandidateMode = (typeof CandidateMode)[keyof typeof CandidateMode];

export function isCandidateMode(value: string): value is CandidateMode {
  return value === CandidateMode.Exhaustive || value === CandidateMode.Bounded;
}

/**
 * An index over the records the matcher may be asked about.
 *
 * In-memory because the pipeline decides identity before anything is written —
 * a record's match is what determines whether it becomes a canonical row at
 * all, so there is nothing in the database to query yet. The same two lookups
 * map directly onto SQL for the day publication becomes incremental: the
 * spatial query is `ST_DWithin` against `places_location_gix`, and the
 * identifier query is an equality lookup on `place_external_ids`.
 */
export class CandidateIndex {
  private readonly records: CanonicalPlaceRef[] = [];
  private readonly candidates = new Map<string, PlaceCandidate>();
  private readonly sourceIdentities = new Map<
    string,
    {
      provenance: { sourceId: string; sourceRecordId: string };
      designations: readonly { designation: string }[];
    }
  >();
  private readonly grid = new Map<string, number[]>();
  private readonly byIdentifier = new Map<string, number[]>();

  constructor(private readonly mode: CandidateMode = CandidateMode.Bounded) {}

  get size(): number {
    return this.records.length;
  }

  /** Records in insertion order — the order the matcher must see them in. */
  get all(): readonly CanonicalPlaceRef[] {
    return this.records;
  }

  add(record: CanonicalPlaceRef, candidate?: PlaceCandidate): void {
    const index = this.records.length;
    this.records.push(record);
    if (candidate) this.candidates.set(record.id, candidate);
    if (record.sourceIdentity) {
      this.sourceIdentities.set(record.id, {
        provenance: {
          sourceId: record.sourceIdentity.sourceId,
          sourceRecordId: record.sourceIdentity.sourceRecordId,
        },
        designations: record.sourceIdentity.designations.map((designation) => ({ designation })),
      });
    }

    const key = cellKey(latCell(record.location.lat), lngCell(record.location.lng));
    const cell = this.grid.get(key);
    if (cell) cell.push(index);
    else this.grid.set(key, [index]);

    for (const identifier of identifierKeysOfExisting(record)) {
      const bucket = this.byIdentifier.get(identifier);
      if (bucket) bucket.push(index);
      else this.byIdentifier.set(identifier, [index]);
    }
  }

  getCandidate(id: string): PlaceCandidate | undefined {
    return this.candidates.get(id);
  }

  getSourceIdentity(id: string):
    | {
        provenance: { sourceId: string; sourceRecordId: string };
        designations: readonly { designation: string }[];
      }
    | undefined {
    return this.sourceIdentities.get(id);
  }

  beginChunk(): void {
    // The in-memory implementation has no chunk lifecycle; this method keeps
    // it substitutable for a bounded CandidateStore.
  }

  /**
   * The records worth asking the matcher about, in insertion order.
   *
   * Deterministic: the same index and the same candidate always produce the
   * same list, because membership comes from integer indices collected into a
   * set and then sorted, never from map iteration order.
   */
  candidatesFor(candidate: PlaceCandidate, stats?: CandidateGenerationStats): CanonicalPlaceRef[] {
    if (stats) {
      stats.possiblePairs += this.records.length;
    }

    if (this.mode === CandidateMode.Exhaustive) {
      if (stats) {
        stats.candidatePairs += this.records.length;
        stats.fromSpatial += this.records.length;
      }
      return this.records;
    }

    const started = performance.now();
    const selected = new Set<number>();

    // --- Spatially plausible ------------------------------------------------
    const radius = candidateRadiusMeters();
    const latSpanDegrees = radius / METRES_PER_DEGREE_LATITUDE;
    // Longitude degrees shrink towards the poles, so the span is computed at
    // this candidate's own latitude rather than assumed. Clamped because the
    // cosine collapses at the poles, and an unbounded span there would turn a
    // locality query back into a full scan.
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
        for (const index of bucket) {
          if (!selected.has(index)) {
            selected.add(index);
            spatial += 1;
          }
        }
      }
    }

    // --- Identifier candidates, regardless of locality ----------------------
    // The matcher's identity pass has no distance bound, so neither can this.
    // A Wikidata item and a listed building 200 km apart that assert the same
    // identifier must still reach the matcher, which will then decide whether
    // that assertion survives the names and the coordinates.
    let identifierOnly = 0;
    for (const key of identifierKeysOfCandidate(candidate)) {
      const bucket = this.byIdentifier.get(key);
      if (!bucket) continue;
      for (const index of bucket) {
        if (!selected.has(index)) {
          selected.add(index);
          identifierOnly += 1;
        }
      }
    }

    const ordered = [...selected].sort((a, b) => a - b).map((index) => this.records[index]!);

    if (stats) {
      stats.candidatePairs += ordered.length;
      stats.fromSpatial += spatial;
      stats.fromIdentifierOnly += identifierOnly;
      stats.cellsInspected += cells;
      stats.generationMs += performance.now() - started;
    }
    return ordered;
  }
}
