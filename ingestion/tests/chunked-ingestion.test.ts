import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlaceType } from '@whilom/domain';
import { CandidateIndex, CandidateMode, emptyCandidateStats } from '../matching/candidates';
import { ChunkedCandidateIndex } from '../matching/chunked-candidates';
import { candidateAsCanonical, runIngestion } from '../pipeline/run';
import type { CanonicalPlaceRef, PlaceCandidate } from '../pipeline/candidate';

const directories: string[] = [];

function candidate(
  over: Partial<PlaceCandidate> & { name: string; location: { lng: number; lat: number } },
): PlaceCandidate {
  return {
    provenance: {
      sourceId: 'test-source',
      sourceRecordId: over.externalIds?.[0]?.value ?? over.name,
      retrievedAt: '2026-08-19T00:00:00.000Z',
      importerVersion: 'test',
      importRunId: 'test-run',
    },
    altNames: [],
    placeType: 'building' as PlaceType,
    placeTypeConfidence: 0.9,
    placeTypeRule: 'building',
    locationMethod: 'source_coordinate',
    locationAccuracyMeters: 10,
    designations: [],
    externalIds: [],
    warnings: [],
    ...over,
  };
}

function existing(id: string, item: PlaceCandidate): CanonicalPlaceRef {
  return candidateAsCanonical(item, id);
}

function makeStore(maxCachedPayloadRecords = 2): ChunkedCandidateIndex {
  const directory = mkdtempSync(join(tmpdir(), 'whilom-chunked-'));
  directories.push(directory);
  return new ChunkedCandidateIndex(directory, maxCachedPayloadRecords);
}

afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});

describe('chunked candidate boundaries', () => {
  it('matches same, adjacent and diagonal cells while excluding distant records', async () => {
    const memory = new CandidateIndex(CandidateMode.Bounded);
    const chunked = makeStore();
    const records = [
      ['same-cell', { lng: -1.5, lat: 54.0 }],
      ['adjacent-cell', { lng: -1.451, lat: 54.0 }],
      ['diagonal-cell', { lng: -1.451, lat: 54.049 }],
      ['distant', { lng: -1.7, lat: 54.0 }],
    ] as const;
    for (const [id, location] of records) {
      const item = candidate({ name: id, location, externalIds: [{ scheme: 'test', value: id }] });
      const canonical = existing(id, item);
      memory.add(canonical, item);
      chunked.add(canonical, item);
    }

    const subject = candidate({ name: 'subject', location: { lng: -1.5, lat: 54.0 } });
    const expected = memory.candidatesFor(subject).map((item) => item.id);
    const actual = (await chunked.candidatesFor(subject, emptyCandidateStats())).map(
      (item) => item.id,
    );
    expect(actual).toEqual(expected);
    expect(actual).toContain('same-cell');
    expect(actual).toContain('adjacent-cell');
    expect(actual).toContain('diagonal-cell');
    expect(actual).not.toContain('distant');
  });

  it('keeps global identifier matches and deterministic insertion order across chunks', async () => {
    const chunked = makeStore(1);
    const first = candidate({
      name: 'Cross-country Abbey',
      location: { lng: -1.5, lat: 54 },
      externalIds: [{ scheme: 'wikidata', value: 'Q-CHUNK-1' }],
    });
    const second = candidate({ name: 'Unrelated', location: { lng: 0.1, lat: 51.5 } });
    const third = candidate({
      name: 'Cross-country Abbey',
      location: { lng: 0.1, lat: 51.5 },
      externalIds: [{ scheme: 'wikidata', value: 'Q-CHUNK-1' }],
    });
    chunked.add(existing('first', first), first);
    chunked.add(existing('second', second), second);
    chunked.beginChunk();
    const stats = emptyCandidateStats();
    const found = await chunked.candidatesFor(third, stats);
    expect(found.map((item) => item.id)).toEqual(['first', 'second']);
    expect(stats.fromIdentifierOnly).toBe(1);
    expect(chunked.workingSetStats().peakCachedPayloadRecords).toBeLessThanOrEqual(1);
  });
});

describe('chunked pipeline equivalence', () => {
  it('preserves decisions, duplicate handling and stable digest across chunk boundaries', async () => {
    const first = candidate({
      name: 'North Abbey',
      location: { lng: -1.5, lat: 54 },
      externalIds: [{ scheme: 'nhle', value: '1' }],
    });
    const distant = candidate({
      name: 'Distant Hall',
      location: { lng: 0.1, lat: 51.5 },
      externalIds: [{ scheme: 'nhle', value: '2' }],
    });
    const duplicate = candidate({
      name: 'North Abbey',
      location: { lng: -1.5, lat: 54 },
      externalIds: [{ scheme: 'nhle', value: '1b' }],
    });
    const items = [first, distant, duplicate];
    const source = (store?: ChunkedCandidateIndex) => {
      const streamItems = items.map((item) => ({ ...item }));
      const values = items.map((item) => ({ ...item }));
      return runIngestion({
        importRunId: 'equivalence',
        candidateStore: store,
        chunkSize: 1,
        sources: [
          {
            adapter: {
              id: 'test-source',
              displayName: 'test source',
              async *fetch() {
                for (const item of streamItems)
                  yield { provenance: item.provenance, name: item.name };
              },
            },
            normalise: (_raw, importRunId) => {
              const item = values.shift()!;
              return {
                ok: true as const,
                candidate: { ...item, provenance: { ...item.provenance, importRunId } },
              };
            },
          },
        ],
      });
    };

    const memoryReport = await source();
    const store = makeStore(2);
    const chunkedReport = await source(store);
    const digest = (report: Awaited<typeof memoryReport>) =>
      createHash('sha256')
        .update(
          JSON.stringify(
            report.decided.map((item) => ({
              sourceRecordId: item.candidate.provenance.sourceRecordId,
              outcome: item.decision.outcome,
              matchedSourceRecordId: item.matchedSourceRecordId,
              conflicts: item.decision.conflicts,
            })),
          ),
        )
        .digest('hex');
    expect(digest(chunkedReport)).toBe(digest(memoryReport));
    expect(chunkedReport.duplicatesWithinRun).toBe(memoryReport.duplicatesWithinRun);
    expect(chunkedReport.outcomes).toEqual(memoryReport.outcomes);
  });
});
