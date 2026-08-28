import { describe, expect, it } from 'vitest';
import { correctionSchema, reviewSchema, visitSchema, wishlistItemSchema } from '@whilom/validation';
import { mutationPlaceId } from './behaviour';

describe('fixture behaviour mutation boundary', () => {
  it('maps presentation fixture ids to valid canonical mutation ids', () => {
    const placeId = mutationPlaceId('york-minster');
    expect(wishlistItemSchema.safeParse({ placeId, slug: 'york-minster' }).success).toBe(true);
    expect(visitSchema.safeParse({ placeId, visitedOn: '2026-08-28' }).success).toBe(true);
    expect(reviewSchema.safeParse({ placeId, rating: 5 }).success).toBe(true);
    expect(correctionSchema.safeParse({ entityType: 'place', entityId: placeId, note: 'Check the published wording.' }).success).toBe(true);
  });

  it('does not make unknown presentation ids look like valid fixture ids', () => {
    expect(wishlistItemSchema.safeParse({ placeId: mutationPlaceId('unknown-fixture-place') }).success).toBe(false);
  });
});
