import { describe, expect, it } from 'vitest';
import { placeSearchSchema, visitSchema } from './index';

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
});
