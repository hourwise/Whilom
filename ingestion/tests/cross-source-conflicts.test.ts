import { describe, expect, it } from 'vitest';
import { ComparisonOutcome, FieldOutcome, compareSources } from '../matching/compare';
import { matchCandidate } from '../matching/matcher';
import { MatchOutcome } from '../pipeline/candidate';
import type { CanonicalPlaceRef, PlaceCandidate } from '../pipeline/candidate';
import type { PlaceType } from '@whilom/domain';

/**
 * Deterministic cross-source disagreement cases.
 *
 * A real dataset can happen to produce no conflicts of a given kind, and "we
 * ran it and nothing broke" is not proof that disagreement is handled. These
 * fixtures exercise each kind deliberately — through `compareSources`, the same
 * function the runner calls, not a parallel test-only path.
 */

function candidate(
  source: string,
  over: Partial<PlaceCandidate> & { name: string; location: { lng: number; lat: number } },
): PlaceCandidate {
  return {
    provenance: {
      sourceId: source,
      sourceRecordId: over.externalIds?.[0]?.value ?? 'X1',
      retrievedAt: '2026-08-17T00:00:00.000Z',
      importerVersion: '1.0.0',
      importRunId: 'fixture-run',
    },
    altNames: [],
    placeType: 'castle' as PlaceType,
    placeTypeConfidence: 0.85,
    placeTypeRule: 'castle',
    locationMethod: 'source_coordinate',
    locationAccuracyMeters: 10,
    designations: [],
    externalIds: [],
    warnings: [],
    ...over,
  };
}

const AT = { lng: -1.5, lat: 54.0 };

describe('1. name disagreement is complementary, never a conflict', () => {
  it('records the second name instead of arbitrating', () => {
    const result = compareSources(
      candidate('historic-england-nhle', { name: 'The Former Elsecar New Colliery', location: AT }),
      candidate('wikidata', { name: 'Elsecar Heritage Centre', location: AT }),
    );
    const name = result.fields.find((f) => f.field === 'name')!;
    expect(name.outcome).toBe(FieldOutcome.Complementary);
    expect(result.conflicts.some((c) => c.field === 'name')).toBe(false);
  });
});

describe('2. coordinate disagreement', () => {
  it('is a conflict once it exceeds what both sources claim to resolve', () => {
    const result = compareSources(
      candidate('historic-england-nhle', { name: 'A Site', location: AT, locationAccuracyMeters: 10 }),
      candidate('wikidata', { name: 'A Site', location: { lng: -1.5, lat: 54.009 }, locationAccuracyMeters: 25 }),
    );
    expect(result.conflicts.some((c) => c.field === 'location')).toBe(true);
    expect(result.outcome).toBe(ComparisonOutcome.Conflict);
  });

  it('is NOT a conflict when both sources are imprecise enough to overlap', () => {
    // Same 60m gap, but one source is a 300m polygon centroid. Precision has to
    // cut both ways or the model is just pretending.
    const result = compareSources(
      candidate('historic-england-nhle', { name: 'A Precinct', location: AT, locationAccuracyMeters: 300 }),
      candidate('wikidata', { name: 'A Precinct', location: { lng: -1.5, lat: 54.00054 }, locationAccuracyMeters: 25 }),
    );
    expect(result.conflicts.some((c) => c.field === 'location')).toBe(false);
  });
});

describe('3. incompatible type', () => {
  it('conflicts when both sources are confident and disagree', () => {
    const result = compareSources(
      candidate('historic-england-nhle', { name: 'X', location: AT, placeType: 'church' as PlaceType }),
      candidate('wikidata', { name: 'X', location: AT, placeType: 'railway_site' as PlaceType }),
    );
    expect(result.conflicts.some((c) => c.field === 'place_type')).toBe(true);
  });

  it('is complementary when only the second source knows the type', () => {
    // The real Saltaire case: NHLE publishes no type, Wikidata says model village.
    const result = compareSources(
      candidate('historic-england-nhle', {
        name: 'Saltaire', location: AT,
        placeType: 'unknown' as PlaceType, placeTypeConfidence: 0, placeTypeRule: 'generic-fallback',
      }),
      candidate('wikidata', {
        name: 'Saltaire', location: AT,
        placeType: 'historic_village' as PlaceType, placeTypeConfidence: 0.85,
      }),
    );
    const type = result.fields.find((f) => f.field === 'place_type')!;
    expect(type.outcome).toBe(FieldOutcome.Complementary);
  });
});

describe('4. inception disagreement', () => {
  it('conflicts when two sources date the same event differently', () => {
    const result = compareSources(
      candidate('historic-england-nhle', { name: 'X', location: AT, inceptionYear: 1150 }),
      candidate('wikidata', { name: 'X', location: AT, inceptionYear: 1380 }),
    );
    expect(result.conflicts.some((c) => c.field === 'inception_year')).toBe(true);
  });

  it('agrees within tolerance rather than splitting hairs', () => {
    const result = compareSources(
      candidate('historic-england-nhle', { name: 'X', location: AT, inceptionYear: 1150 }),
      candidate('wikidata', { name: 'X', location: AT, inceptionYear: 1160 }),
    );
    expect(result.conflicts.some((c) => c.field === 'inception_year')).toBe(false);
  });

  it('does NOT compare different predicates', () => {
    // "Construction began 1150" and "completed 1180" answer different
    // questions. Only inception is ever compared against inception, so a
    // source that supplies a completion date cannot manufacture a conflict.
    const began = candidate('historic-england-nhle', { name: 'X', location: AT, inceptionYear: 1150 });
    const completedOnly = candidate('wikidata', { name: 'X', location: AT });
    const result = compareSources(began, completedOnly);
    expect(result.fields.some((f) => f.field === 'inception_year')).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });
});

describe('5. competing website / reference', () => {
  it('conflicts on different official sites but not on the same host', () => {
    const conflicting = compareSources(
      candidate('a', { name: 'X', location: AT, officialWebsite: 'https://english-heritage.org.uk/x' }),
      candidate('b', { name: 'X', location: AT, officialWebsite: 'https://nationaltrust.org.uk/x' }),
    );
    expect(conflicting.conflicts.some((c) => c.field === 'official_website')).toBe(true);

    const agreeing = compareSources(
      candidate('a', { name: 'X', location: AT, officialWebsite: 'https://www.example.org/a' }),
      candidate('b', { name: 'X', location: AT, officialWebsite: 'https://example.org/b' }),
    );
    expect(agreeing.conflicts.some((c) => c.field === 'official_website')).toBe(false);
  });
});

describe('6. relationship disagreement', () => {
  it('carries an associated person from one source as complementary', () => {
    const result = compareSources(
      candidate('historic-england-nhle', { name: 'X', location: AT }),
      candidate('wikidata', { name: 'X', location: AT, relatedPeople: [{ label: 'John Carr', role: 'architect' }] }),
    );
    // A person one source knows about and the other does not is added, not
    // disputed. Disagreement about *who* only arises once both assert one.
    expect(result.outcome).not.toBe(ComparisonOutcome.Conflict);
  });
});

describe('7. complementary non-conflicting facts', () => {
  it('reports complementary when the second source only adds', () => {
    const result = compareSources(
      candidate('historic-england-nhle', {
        name: 'Burton Constable Hall', location: AT,
        designations: [{ designation: 'listed_building', grade: 'I' }],
      }),
      candidate('wikidata', {
        name: 'Burton Constable Hall', location: AT,
        inceptionYear: 1560, officialWebsite: 'https://example.org/bch',
      }),
    );
    expect(result.outcome).toBe(ComparisonOutcome.Complementary);
    expect(result.conflicts).toHaveLength(0);
    expect(result.complementary.length).toBeGreaterThanOrEqual(2);
  });
});

describe('8. duplicate external identifier', () => {
  it('treats overlapping identifier sets as corroboration plus extra knowledge', () => {
    // Wikidata's Fountains Abbey item links to both the scheduled monument and
    // the listed building. That is one site with two designations, not a
    // disagreement.
    const result = compareSources(
      candidate('historic-england-nhle', {
        name: 'Fountains Abbey', location: AT,
        externalIds: [{ scheme: 'nhle', value: '1149811' }],
      }),
      candidate('wikidata', {
        name: 'Fountains Abbey', location: AT,
        externalIds: [
          { scheme: 'nhle', value: '1149811' },
          { scheme: 'nhle', value: '1014395' },
          { scheme: 'wikidata', value: 'Q540237' },
        ],
      }),
    );
    expect(result.conflicts.some((c) => c.field === 'external_id:nhle')).toBe(false);
    expect(result.agreements.some((f) => f.field === 'external_id:nhle')).toBe(true);
    expect(result.complementary.some((f) => f.field === 'external_id:nhle')).toBe(true);
  });

  it('conflicts when the identifier sets share nothing at all', () => {
    const result = compareSources(
      candidate('a', { name: 'X', location: AT, externalIds: [{ scheme: 'nhle', value: '1000001' }] }),
      candidate('b', { name: 'X', location: AT, externalIds: [{ scheme: 'nhle', value: '9999999' }] }),
    );
    expect(result.conflicts.some((c) => c.field === 'external_id:nhle')).toBe(true);
  });
});

describe('9. ambiguous same-name entities', () => {
  it('refuses to pick between two equally good candidates', () => {
    // Two Wikidata items really do both claim NHLE 1004051 (Malton Castle).
    const incoming = candidate('wikidata', {
      name: 'Malton Castle', location: AT,
      externalIds: [{ scheme: 'wikidata', value: 'Q15244323' }],
    });
    const twins: CanonicalPlaceRef[] = [
      {
        id: 'p1', name: 'Malton Castle', altNames: [], placeType: 'castle' as PlaceType,
        location: AT, locationAccuracyMeters: 10, externalIds: [], designationReferences: [],
      },
      {
        id: 'p2', name: 'Malton Castle', altNames: [], placeType: 'castle' as PlaceType,
        location: { lng: -1.5001, lat: 54.0001 }, locationAccuracyMeters: 10,
        externalIds: [], designationReferences: [],
      },
    ];
    const decision = matchCandidate(incoming, twins);
    expect(decision.outcome).not.toBe(MatchOutcome.MatchConfident);
    expect(decision.rationale).toContain('almost as well');
  });
});
