import { describe, expect, it } from 'vitest';
import type { DesignationType } from '@whilom/domain';
import {
  inferPlaceType,
  isFallbackClassification,
  typesAreCompatible,
} from '../transforms/place-type';

/**
 * `structure` means a CONSTRUCTED work with no more specific classification.
 *
 * It was briefly used as a universal heritage fallback on the reasoning that
 * "every designated record is a built work". That is false, and these tests
 * exist to keep it false-proof: much designated heritage is not built at all,
 * and calling a battlefield or a shipwreck a structure would be a lie told by
 * the data model rather than by anyone in particular.
 */

const NAMELESS = 'Site 47B';

describe('non-constructed heritage is never called a structure', () => {
  it.each([
    ['registered_battlefield', 'battlefield'],
    ['registered_park_garden', 'historic_landscape'],
    ['scheduled_monument', 'archaeological_site'],
    ['protected_wreck', 'archaeological_site'],
  ] as [DesignationType, string][])(
    'a %s with an unhelpful name falls back to %s, not structure',
    (designation, expected) => {
      const inferred = inferPlaceType(NAMELESS, undefined, designation);
      expect(inferred.placeType).toBe(expected);
      expect(inferred.placeType).not.toBe('structure');
    },
  );

  it('says `unknown` when the designation implies nothing about form', () => {
    // A World Heritage Site can be a model village (Saltaire), a designed
    // landscape (Studley Royal) or an industrial complex. Guessing is worse
    // than admitting the gap — a reviewer or a second source can close it.
    const whs = inferPlaceType(NAMELESS, undefined, 'world_heritage_site');
    expect(whs.placeType).toBe('unknown');
    expect(whs.confidence).toBe(0);

    const nothing = inferPlaceType(NAMELESS);
    expect(nothing.placeType).toBe('unknown');
  });

  it('keeps structure for an undistinguished listed building', () => {
    // A listed building genuinely IS a constructed work, so here the fallback
    // asserts nothing untrue.
    const listed = inferPlaceType(NAMELESS, undefined, 'listed_building');
    expect(listed.placeType).toBe('structure');
    expect(isFallbackClassification(listed.rule)).toBe(true);
  });

  it('marks every fallback as a fallback', () => {
    for (const designation of [
      'listed_building',
      'scheduled_monument',
      'protected_wreck',
      undefined,
    ] as (DesignationType | undefined)[]) {
      expect(isFallbackClassification(inferPlaceType(NAMELESS, undefined, designation).rule)).toBe(
        true,
      );
    }
  });

  it('still prefers real evidence in the name over the designation fallback', () => {
    // A scheduled monument that is obviously a castle is a castle.
    const castle = inferPlaceType('Middleham Castle', undefined, 'scheduled_monument');
    expect(castle.placeType).toBe('castle');
    expect(isFallbackClassification(castle.rule)).toBe(false);
  });

  it('lets a designation that names the form beat the name', () => {
    const battlefield = inferPlaceType('Battle of Towton, 1461', undefined, 'registered_battlefield');
    expect(battlefield.placeType).toBe('battlefield');
  });
});

describe('type compatibility respects the constructed/non-constructed divide', () => {
  it('treats unknown as compatible with anything', () => {
    expect(typesAreCompatible('unknown', 'battlefield')).toBe(true);
    expect(typesAreCompatible('castle', 'unknown')).toBe(true);
  });

  it('treats structure as compatible with other constructed works', () => {
    expect(typesAreCompatible('structure', 'building')).toBe(true);
    expect(typesAreCompatible('structure', 'church')).toBe(true);
    expect(typesAreCompatible('structure', 'industrial_site')).toBe(true);
  });

  it('does NOT treat structure as compatible with non-constructed heritage', () => {
    // This is the regression: while `structure` was a wildcard, a record
    // wrongly typed as one could silently agree with a battlefield.
    expect(typesAreCompatible('structure', 'battlefield')).toBe(false);
    expect(typesAreCompatible('structure', 'historic_landscape')).toBe(false);
    expect(typesAreCompatible('structure', 'garden')).toBe(false);
  });
});
