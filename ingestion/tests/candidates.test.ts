import { describe, expect, it } from 'vitest';
import {
  CandidateIndex,
  CandidateMode,
  candidateRadiusMeters,
  emptyCandidateStats,
} from '../matching/candidates';
import { THRESHOLDS, matchCandidate } from '../matching/matcher';
import { MatchOutcome } from '../pipeline/candidate';
import type { CanonicalPlaceRef, PlaceCandidate } from '../pipeline/candidate';
import { distanceMeters } from '../transforms/osgb';
import type { PlaceType } from '@whilom/domain';

/**
 * The candidate generator decides which records the matcher is asked about, and
 * nothing else. These tests hold that line from both directions: it must never
 * drop a record the matcher could have matched, and it must never be credited
 * with deciding identity itself.
 */

function candidate(
  over: Partial<PlaceCandidate> & { name: string; location: { lng: number; lat: number } },
): PlaceCandidate {
  return {
    provenance: {
      sourceId: 'historic-england-nhle',
      sourceRecordId: '9999999',
      retrievedAt: '2026-08-18T00:00:00.000Z',
      importerVersion: '0.1.0',
      importRunId: 'test-run',
    },
    altNames: [],
    placeType: 'building' as PlaceType,
    placeTypeConfidence: 0.85,
    placeTypeRule: 'building',
    locationMethod: 'source_coordinate',
    locationAccuracyMeters: 10,
    designations: [{ designation: 'listed_building', reference: '9999999' }],
    externalIds: [],
    warnings: [],
    ...over,
  };
}

function existing(
  over: Partial<CanonicalPlaceRef> & { id: string; name: string; location: { lng: number; lat: number } },
): CanonicalPlaceRef {
  return {
    altNames: [],
    placeType: 'building' as PlaceType,
    externalIds: [],
    designationReferences: [],
    sourceIdentity: {
      sourceId: 'historic-england-nhle',
      sourceRecordId: '8888888',
      designations: ['listed_building'],
    },
    ...over,
  };
}

/** Roughly one metre of latitude, for placing records a known distance apart. */
const METRE_LAT = 1 / 111_320;

function northOf(lat: number, metres: number): number {
  return lat + metres * METRE_LAT;
}

describe('the candidate radius comes from the matcher', () => {
  it('is exactly the matcher own plausible-distance veto', () => {
    // Restating the number here would let the two drift apart, and a candidate
    // radius narrower than the matcher's veto silently loses real matches.
    expect(candidateRadiusMeters()).toBe(THRESHOLDS.maxPlausibleDistanceMeters);
  });
});

describe('spatial bounding', () => {
  it('includes a record well inside the radius', () => {
    const index = new CandidateIndex(CandidateMode.Bounded);
    index.add(existing({ id: 'near', name: 'Near Hall', location: { lng: -1.5, lat: northOf(54, 200) } }));

    const found = index.candidatesFor(candidate({ name: 'Test', location: { lng: -1.5, lat: 54 } }));
    expect(found.map((f) => f.id)).toEqual(['near']);
  });

  it('includes a record just inside the radius', () => {
    const index = new CandidateIndex(CandidateMode.Bounded);
    const lat = northOf(54, THRESHOLDS.maxPlausibleDistanceMeters - 100);
    index.add(existing({ id: 'edge', name: 'Edge Hall', location: { lng: -1.5, lat } }));

    const found = index.candidatesFor(candidate({ name: 'Test', location: { lng: -1.5, lat: 54 } }));
    expect(found.map((f) => f.id)).toEqual(['edge']);
  });

  it('excludes a record the matcher would refuse on distance alone', () => {
    const index = new CandidateIndex(CandidateMode.Bounded);
    // 48km apart: the two real "Middleham Castle" records.
    const far = { lng: -1.5, lat: northOf(54, 48_000) };
    index.add(existing({ id: 'far', name: 'Middleham Castle', location: far }));

    const subject = candidate({ name: 'Middleham Castle', location: { lng: -1.5, lat: 54 } });
    expect(index.candidatesFor(subject)).toHaveLength(0);

    // And the matcher would have refused it anyway, which is what makes the
    // exclusion safe rather than merely convenient.
    expect(distanceMeters(subject.location, far)).toBeGreaterThan(THRESHOLDS.maxPlausibleDistanceMeters);
    expect(matchCandidate(subject, [existing({ id: 'far', name: 'Middleham Castle', location: far })]).outcome).toBe(
      MatchOutcome.NewCanonical,
    );
  });

  it('bounds the candidate set by locality, not by corpus size', () => {
    // 2,000 records spread over roughly 200km of latitude. A corpus-wide scan
    // would return all of them; locality bounding must not.
    const index = new CandidateIndex(CandidateMode.Bounded);
    for (let i = 0; i < 2000; i += 1) {
      index.add(
        existing({
          id: `p${i}`,
          name: `Place ${i}`,
          location: { lng: -1.5, lat: northOf(53, i * 100) },
        }),
      );
    }
    const found = index.candidatesFor(candidate({ name: 'Test', location: { lng: -1.5, lat: northOf(53, 100_000) } }));

    expect(found.length).toBeGreaterThan(0);
    // 5km at 100m spacing is ~100 records; the grid block is a little generous.
    expect(found.length).toBeLessThan(200);
    expect(index.size).toBe(2000);
  });
});

describe('identifier candidates ignore locality', () => {
  it('surfaces a shared external identifier from the far side of the country', () => {
    // The matcher's identity pass has no distance bound, so the generator must
    // not impose one. This is the case single-source NHLE data never produces
    // and which would therefore go untested by the scale corpus alone.
    const index = new CandidateIndex(CandidateMode.Bounded);
    const distant = { lng: -3.5, lat: 51.5 };
    index.add(
      existing({
        id: 'distant',
        name: 'Distant Abbey',
        location: distant,
        externalIds: [{ scheme: 'wikidata', value: 'Q540237' }],
      }),
    );

    const subject = candidate({
      name: 'Distant Abbey',
      location: { lng: -1.5, lat: 54 },
      externalIds: [{ scheme: 'wikidata', value: 'Q540237' }],
    });

    expect(distanceMeters(subject.location, distant)).toBeGreaterThan(200_000);
    expect(index.candidatesFor(subject).map((c) => c.id)).toEqual(['distant']);
  });

  it('surfaces a shared designation reference from outside the radius', () => {
    const index = new CandidateIndex(CandidateMode.Bounded);
    index.add(
      existing({
        id: 'listed',
        name: 'Some Building',
        location: { lng: -3.5, lat: 51.5 },
        designationReferences: ['1234567'],
      }),
    );

    const subject = candidate({
      name: 'Some Building',
      location: { lng: -1.5, lat: 54 },
      designations: [{ designation: 'scheduled_monument', reference: '1234567' }],
    });
    expect(index.candidatesFor(subject).map((c) => c.id)).toEqual(['listed']);
  });

  it('does not surface a different identifier value', () => {
    const index = new CandidateIndex(CandidateMode.Bounded);
    index.add(
      existing({
        id: 'other',
        name: 'Other',
        location: { lng: -3.5, lat: 51.5 },
        externalIds: [{ scheme: 'wikidata', value: 'Q1' }],
      }),
    );
    const subject = candidate({
      name: 'Test',
      location: { lng: -1.5, lat: 54 },
      externalIds: [{ scheme: 'wikidata', value: 'Q2' }],
    });
    expect(index.candidatesFor(subject)).toHaveLength(0);
  });

  it('does not confuse the same value under a different scheme', () => {
    const index = new CandidateIndex(CandidateMode.Bounded);
    index.add(
      existing({
        id: 'other',
        name: 'Other',
        location: { lng: -3.5, lat: 51.5 },
        externalIds: [{ scheme: 'nhle', value: 'Q540237' }],
      }),
    );
    const subject = candidate({
      name: 'Test',
      location: { lng: -1.5, lat: 54 },
      externalIds: [{ scheme: 'wikidata', value: 'Q540237' }],
    });
    expect(index.candidatesFor(subject)).toHaveLength(0);
  });
});

describe('candidate sets are well formed', () => {
  it('never repeats a record found by both spatial and identifier lookup', () => {
    const index = new CandidateIndex(CandidateMode.Bounded);
    index.add(
      existing({
        id: 'both',
        name: 'Both Ways',
        location: { lng: -1.5, lat: northOf(54, 100) },
        externalIds: [{ scheme: 'wikidata', value: 'Q1' }],
        designationReferences: ['777'],
      }),
    );
    const subject = candidate({
      name: 'Both Ways',
      location: { lng: -1.5, lat: 54 },
      externalIds: [{ scheme: 'wikidata', value: 'Q1' }],
      designations: [{ designation: 'listed_building', reference: '777' }],
    });
    expect(index.candidatesFor(subject)).toHaveLength(1);
  });

  it('preserves insertion order, which the matcher depends on', () => {
    // The matcher returns on the FIRST shared identifier and sorts scored
    // matches with a stable sort. Reordering the input could change which of
    // two equally good records wins, so order is part of the contract.
    const index = new CandidateIndex(CandidateMode.Bounded);
    for (const id of ['a', 'b', 'c', 'd']) {
      index.add(existing({ id, name: `Place ${id}`, location: { lng: -1.5, lat: northOf(54, 50) } }));
    }
    const found = index.candidatesFor(candidate({ name: 'Test', location: { lng: -1.5, lat: 54 } }));
    expect(found.map((f) => f.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is deterministic across repeated queries', () => {
    const index = new CandidateIndex(CandidateMode.Bounded);
    for (let i = 0; i < 50; i += 1) {
      index.add(
        existing({
          id: `p${i}`,
          name: `Place ${i}`,
          location: { lng: -1.5 + i * 0.001, lat: northOf(54, i * 20) },
          externalIds: [{ scheme: 'wikidata', value: `Q${i}` }],
        }),
      );
    }
    const subject = candidate({
      name: 'Test',
      location: { lng: -1.5, lat: 54 },
      externalIds: [{ scheme: 'wikidata', value: 'Q40' }],
    });
    const first = index.candidatesFor(subject).map((c) => c.id);
    for (let run = 0; run < 5; run += 1) {
      expect(index.candidatesFor(subject).map((c) => c.id)).toEqual(first);
    }
  });

  it('reports what it pruned', () => {
    const index = new CandidateIndex(CandidateMode.Bounded);
    index.add(existing({ id: 'near', name: 'Near', location: { lng: -1.5, lat: northOf(54, 100) } }));
    index.add(existing({ id: 'far', name: 'Far', location: { lng: -1.5, lat: northOf(54, 60_000) } }));

    const stats = emptyCandidateStats();
    index.candidatesFor(candidate({ name: 'Test', location: { lng: -1.5, lat: 54 } }), stats);
    expect(stats.possiblePairs).toBe(2);
    expect(stats.candidatePairs).toBe(1);
  });
});

describe('exhaustive mode', () => {
  it('returns everything, so it can serve as the equivalence oracle', () => {
    const index = new CandidateIndex(CandidateMode.Exhaustive);
    index.add(existing({ id: 'near', name: 'Near', location: { lng: -1.5, lat: northOf(54, 100) } }));
    index.add(existing({ id: 'far', name: 'Far', location: { lng: -1.5, lat: northOf(54, 900_000) } }));

    const found = index.candidatesFor(candidate({ name: 'Test', location: { lng: -1.5, lat: 54 } }));
    expect(found.map((f) => f.id)).toEqual(['near', 'far']);
  });
});

describe('positional uncertainty cannot widen the scan', () => {
  it('uses the same radius however imprecise the record is', () => {
    // Uncertainty affects the matcher's *agreement radius*, which is clamped to
    // 50-150m and only influences scoring. The hard veto is a flat 5km, so a
    // vague record must not earn a wider candidate sweep — that is exactly how
    // a locality bound decays back into a full scan.
    const index = new CandidateIndex(CandidateMode.Bounded);
    for (let i = 0; i < 400; i += 1) {
      index.add(existing({ id: `p${i}`, name: `P${i}`, location: { lng: -1.5, lat: northOf(54, i * 100) } }));
    }

    const precise = index.candidatesFor(
      candidate({ name: 'Precise', location: { lng: -1.5, lat: 54 }, locationAccuracyMeters: 1 }),
    );
    const vague = index.candidatesFor(
      candidate({ name: 'Vague', location: { lng: -1.5, lat: 54 }, locationAccuracyMeters: 2_300 }),
    );

    expect(vague.map((c) => c.id)).toEqual(precise.map((c) => c.id));
  });
});
