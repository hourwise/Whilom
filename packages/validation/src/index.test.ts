import { describe, expect, it } from 'vitest';
import {
  correctionSchema,
  credentialsSchema,
  placeSearchSchema,
  reviewSchema,
  slugSchema,
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
