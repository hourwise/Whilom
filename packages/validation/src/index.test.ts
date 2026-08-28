import { describe, expect, it } from 'vitest';
import {
  candidateProvenanceSchema,
  correctionSchema,
  credentialsSchema,
  placeCandidateSchema,
  placeSearchSchema,
  reviewSchema,
  slugSchema,
  tripDaySchema,
  tripSchema,
  tripStopSchema,
  tripUpdateSchema,
  visitSchema,
  wishlistItemSchema,
} from './index';

describe('placeSearchSchema', () => {
  it('applies default paging', () => {
    const parsed = placeSearchSchema.parse({ text: 'castle' });
    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(0);
  });

  it('rejects an out-of-range radius', () => {
    expect(() => placeSearchSchema.parse({ radiusMeters: 500_000 })).toThrow();
  });
});

describe('visitSchema', () => {
  it('rejects an implausible visit duration', () => {
    expect(() => visitSchema.parse({ placeId: crypto.randomUUID(), minutesSpent: 5000 })).toThrow();
  });

  it('rejects a non-numeric rating rather than dropping it', () => {
    // The web form readers turn unparseable input into NaN on purpose, so the
    // schema has to be the thing that refuses it.
    expect(() =>
      visitSchema.parse({ placeId: crypto.randomUUID(), rating: Number.NaN }),
    ).toThrow();
  });
});

describe('web mutation schemas', () => {
  it('rejects a non-uuid place id', () => {
    expect(() => wishlistItemSchema.parse({ placeId: 'not-a-uuid' })).toThrow();
    expect(wishlistItemSchema.parse({ placeId: crypto.randomUUID() }).slug).toBeUndefined();
  });

  it('rejects ratings outside 1..5', () => {
    const placeId = crypto.randomUUID();
    expect(() => reviewSchema.parse({ placeId, rating: 0 })).toThrow();
    expect(() => reviewSchema.parse({ placeId, rating: 6 })).toThrow();
    expect(reviewSchema.parse({ placeId, rating: 5 }).rating).toBe(5);
  });

  it('requires a correction to actually say something', () => {
    const base = { entityType: 'place', entityId: crypto.randomUUID(), field: 'opening times' };
    expect(() => correctionSchema.parse(base)).toThrow();
    expect(() => correctionSchema.parse({ ...base, note: 'Closed on Mondays.' })).not.toThrow();
  });

  it('enforces a minimum password length', () => {
    expect(() => credentialsSchema.parse({ email: 'a@b.co', password: 'short' })).toThrow();
    expect(() => credentialsSchema.parse({ email: 'not-an-email', password: 'longenough' })).toThrow();
  });

  it('accepts only lowercase hyphenated slugs', () => {
    expect(slugSchema.parse('fountains-abbey')).toBe('fountains-abbey');
    expect(() => slugSchema.parse('Fountains Abbey')).toThrow();
    expect(() => slugSchema.parse('fountains--abbey')).toThrow();
  });
});

describe('trip schemas', () => {
  const tripId = crypto.randomUUID();
  const placeId = crypto.randomUUID();

  it('accepts database-shaped trip planning inputs', () => {
    expect(tripSchema.parse({ name: 'York day out', transport: 'walking' }).name).toBe('York day out');
    expect(tripUpdateSchema.parse({ notes: 'Bring a coat.' }).notes).toBe('Bring a coat.');
    expect(tripDaySchema.parse({ tripId, dayIndex: 0 }).dayIndex).toBe(0);
    expect(tripStopSchema.parse({ tripId, placeId }).status).toBe('planned');
  });

  it('rejects unsupported transport and invalid planned minutes', () => {
    expect(() => tripSchema.parse({ name: 'Trip', transport: 'flying' })).toThrow();
    expect(() => tripStopSchema.parse({ tripId, placeId, plannedMinutes: 0 })).toThrow();
  });
});

describe('ingestion schemas', () => {
  const provenance = {
    sourceId: 'historic-england-nhle',
    sourceRecordId: '1149811',
    originalUrl: 'https://historicengland.org.uk/listing/the-list/list-entry/1149811',
    licence: 'OGL-UK-3.0',
    attribution: 'Contains Historic England information © Historic England.',
    retrievedAt: '2026-08-17T00:00:00.000Z',
    importerVersion: '0.1.0',
    importRunId: 'run-1',
  };

  it('refuses a record that cannot say where it came from', () => {
    // This is the enforcement point for "an imported fact is never
    // indistinguishable from an editorial one".
    for (const missing of ['sourceId', 'sourceRecordId', 'retrievedAt', 'importerVersion', 'importRunId']) {
      const partial: Record<string, unknown> = { ...provenance };
      delete partial[missing];
      expect(() => candidateProvenanceSchema.parse(partial), `missing ${missing}`).toThrow();
    }
  });

  it('requires retrievedAt to be a real timestamp', () => {
    expect(() => candidateProvenanceSchema.parse({ ...provenance, retrievedAt: '2026-08-17' })).toThrow();
  });

  it('requires a candidate to carry at least one external identifier', () => {
    const candidate = {
      provenance,
      name: 'Fountains Abbey',
      altNames: [],
      placeType: 'abbey',
      placeTypeConfidence: 0.9,
      placeTypeRule: 'abbey',
      location: { lng: -1.581068, lat: 54.109724 },
      locationMethod: 'source_coordinate',
      locationAccuracyMeters: 6,
      designations: [],
      externalIds: [],
      warnings: [],
    };
    expect(() => placeCandidateSchema.parse(candidate)).toThrow();
    expect(() =>
      placeCandidateSchema.parse({ ...candidate, externalIds: [{ scheme: 'nhle', value: '1149811' }] }),
    ).not.toThrow();
  });

  it('rejects an impossible coordinate', () => {
    expect(() =>
      placeCandidateSchema.parse({
        provenance,
        name: 'Nowhere',
        altNames: [],
        placeType: 'abbey',
        placeTypeConfidence: 0,
        placeTypeRule: 'unmatched',
        location: { lng: 999, lat: 999 },
        locationMethod: 'unknown',
        locationAccuracyMeters: 10,
        designations: [],
        externalIds: [{ scheme: 'nhle', value: '1' }],
        warnings: [],
      }),
    ).toThrow();
  });
});
