import { describe, expect, it } from 'vitest';
import { matchCandidate } from '../matching/matcher';
import { isGenericName, nameSimilarity } from '../matching/name';
import { MatchOutcome } from '../pipeline/candidate';
import type { CanonicalPlaceRef, PlaceCandidate } from '../pipeline/candidate';
import type { PlaceType } from '@whilom/domain';

/**
 * Matcher tests are written around the cases that actually occur in the NHLE
 * Yorkshire sample, not invented ones. Coordinates and names below are the real
 * values from `sources/historic-england/fixtures/yorkshire-poc.json`.
 */

function candidate(over: Partial<PlaceCandidate> & { name: string; location: { lng: number; lat: number } }): PlaceCandidate {
  return {
    provenance: {
      sourceId: 'historic-england-nhle',
      sourceRecordId: over.externalIds?.[0]?.value ?? '9999999',
      retrievedAt: '2026-08-17T00:00:00.000Z',
      importerVersion: '0.1.0',
      importRunId: 'test-run',
    },
    altNames: [],
    placeType: 'castle' as PlaceType,
    placeTypeConfidence: 0.85,
    locationUncertaintyMeters: 10,
    designations: [],
    externalIds: [],
    warnings: [],
    ...over,
  };
}

function existing(over: Partial<CanonicalPlaceRef> & { id: string; name: string; location: { lng: number; lat: number } }): CanonicalPlaceRef {
  return {
    altNames: [],
    placeType: 'castle' as PlaceType,
    externalIds: [],
    designationReferences: [],
    ...over,
  };
}

describe('name handling', () => {
  it('treats a dedication-only church name as non-distinctive', () => {
    // NHLE contains hundreds of records named exactly this.
    expect(isGenericName('CHURCH OF ST MARY')).toBe(true);
    expect(isGenericName('Village Cross')).toBe(true);
    expect(isGenericName('Burton Constable Hall')).toBe(false);
    expect(isGenericName('Middleham Castle')).toBe(false);
  });

  it('sees through a scheduling description to the site name', () => {
    const scheduled =
      'Fountains Cistercian Abbey; monastic precinct, mill, water management works, agricultural and industrial features and 18th century gardens';
    expect(nameSimilarity(scheduled, 'Fountains Abbey, With Ancillary Buildings')).toBeGreaterThan(0.6);
  });
});

describe('matchCandidate', () => {
  it('matches the same site across sources on a shared external identifier', () => {
    // NHLE 1014395 (scheduled monument) and 1149811 (listed building) both
    // carry Wikidata P1216 links to Q540237, Fountains Abbey.
    const decision = matchCandidate(
      candidate({
        name: 'Fountains Cistercian Abbey',
        location: { lng: -1.5811, lat: 54.10963 },
        placeType: 'abbey' as PlaceType,
        externalIds: [
          { scheme: 'nhle', value: '1014395' },
          { scheme: 'wikidata', value: 'Q540237' },
        ],
      }),
      [
        existing({
          id: 'place-fountains',
          name: 'Fountains Abbey, With Ancillary Buildings',
          location: { lng: -1.581068, lat: 54.109724 },
          placeType: 'abbey' as PlaceType,
          externalIds: [
            { scheme: 'nhle', value: '1149811' },
            { scheme: 'wikidata', value: 'Q540237' },
          ],
        }),
      ],
    );

    expect(decision.outcome).toBe(MatchOutcome.MatchConfident);
    expect(decision.matchedPlaceId).toBe('place-fountains');
    expect(decision.signals.some((s) => s.name === 'external-id')).toBe(true);
  });

  it('never merges two places sharing a name several kilometres apart', () => {
    // Both are really called "Middleham Castle": NHLE 1010629 in Wensleydale
    // and NHLE 1002330 at Bishop Middleham, County Durham, ~48km away.
    const decision = matchCandidate(
      candidate({
        name: 'Middleham Castle',
        location: { lng: -1.80685, lat: 54.28404 },
        externalIds: [{ scheme: 'nhle', value: '1010629' }],
      }),
      [
        existing({
          id: 'place-bishop-middleham',
          name: 'Middleham Castle',
          location: { lng: -1.4939, lat: 54.6736 },
          externalIds: [{ scheme: 'nhle', value: '1002330' }],
        }),
      ],
    );

    expect(decision.outcome).toBe(MatchOutcome.NewCanonical);
    expect(decision.matchedPlaceId).toBeUndefined();
  });

  it('does not merge separate structures within one estate', () => {
    // NHLE 1296240, a weir 140m from the abbey church it is named after.
    const decision = matchCandidate(
      candidate({
        name: 'Weir On River Skell Approximately 10 Metres East Of The Infirmary At Fountains Abbey',
        location: { lng: -1.578891, lat: 54.109883 },
        placeType: 'monument' as PlaceType,
        placeTypeConfidence: 0.8,
        externalIds: [{ scheme: 'nhle', value: '1296240' }],
      }),
      [
        existing({
          id: 'place-fountains',
          name: 'Fountains Abbey, With Ancillary Buildings',
          location: { lng: -1.581068, lat: 54.109724 },
          placeType: 'abbey' as PlaceType,
          externalIds: [{ scheme: 'nhle', value: '1149811' }],
        }),
      ],
    );

    expect(decision.outcome).not.toBe(MatchOutcome.MatchConfident);
  });

  it('keeps a churchyard cross separate from the church it is named after', () => {
    // NHLE 1132040 sits a few metres from the church it names, and is a
    // separately listed structure. Two records is the correct answer here, not
    // one — the positional agreement must not outweigh the fact that the names
    // describe different things.
    const decision = matchCandidate(
      candidate({
        name: 'Churchyard Cross Approximately 3 Metres to South of Church of Saint Mary',
        location: { lng: -1.653985, lat: 54.221102 },
        placeType: 'monument' as PlaceType,
        placeTypeConfidence: 0.85,
        externalIds: [{ scheme: 'nhle', value: '1132040' }],
      }),
      [
        existing({
          id: 'place-st-mary',
          name: 'Church of St Mary',
          location: { lng: -1.653985, lat: 54.221102 },
          placeType: 'church' as PlaceType,
          externalIds: [{ scheme: 'nhle', value: '9000001' }],
        }),
      ],
    );

    expect(decision.outcome).toBe(MatchOutcome.NewCanonical);
    expect(decision.matchedPlaceId).toBeUndefined();
  });

  it('will not auto-match two identically named churches on the name alone', () => {
    // NHLE 1149951 and 1151297 are both "CHURCH OF ST MARY", ~14km apart.
    const decision = matchCandidate(
      candidate({
        name: 'Church of St Mary',
        location: { lng: -1.4151, lat: 53.999476 },
        placeType: 'church' as PlaceType,
        externalIds: [{ scheme: 'nhle', value: '1149951' }],
      }),
      [
        existing({
          id: 'place-alne',
          name: 'Church of St Mary',
          location: { lng: -1.24468, lat: 54.0816 },
          placeType: 'church' as PlaceType,
          externalIds: [{ scheme: 'nhle', value: '1151297' }],
        }),
      ],
    );
    expect(decision.outcome).toBe(MatchOutcome.NewCanonical);
  });

  it('sends a same-name, same-place-but-generic pair to review rather than merging', () => {
    // Two "Church of St Mary" records 30m apart: plausibly one church recorded
    // twice, but the name proves nothing, so a human decides.
    const decision = matchCandidate(
      candidate({
        name: 'Church of St Mary',
        location: { lng: -1.4151, lat: 53.999476 },
        placeType: 'church' as PlaceType,
        externalIds: [{ scheme: 'nhle', value: '1149951' }],
      }),
      [
        existing({
          id: 'place-other',
          name: 'Church of St Mary',
          location: { lng: -1.41468, lat: 53.99952 },
          placeType: 'church' as PlaceType,
          externalIds: [{ scheme: 'nhle', value: '8000001' }],
        }),
      ],
    );
    expect(decision.outcome).toBe(MatchOutcome.MatchReview);
    expect(decision.rationale).toContain('not distinctive');
  });

  it('does not merge identical coordinates when the types are incompatible', () => {
    // NHLE 1004919 (St Mary's Abbey) and 1000117 (York Museum Gardens) are
    // published at byte-identical grid references — the gardens contain the
    // abbey ruins. Identical position is the strongest single signal there is,
    // and it still must not win here.
    const decision = matchCandidate(
      candidate({
        name: "St Mary's Abbey",
        location: { lng: -1.088276, lat: 53.961397 },
        placeType: 'abbey' as PlaceType,
        placeTypeConfidence: 0.9,
        externalIds: [{ scheme: 'nhle', value: '1004919' }],
      }),
      [
        existing({
          id: 'place-museum-gardens',
          name: 'Museum Gardens, York',
          location: { lng: -1.088276, lat: 53.961397 },
          placeType: 'historic_landscape' as PlaceType,
          externalIds: [{ scheme: 'nhle', value: '1000117' }],
        }),
      ],
    );
    expect(decision.outcome).toBe(MatchOutcome.NewCanonical);
  });

  it('raises a type conflict when a match is otherwise strong', () => {
    // Same distinctive name and position, but the two sources disagree about
    // what the site is. That disagreement has to reach a human.
    const decision = matchCandidate(
      candidate({
        name: 'Elsecar Newcomen Engine House',
        location: { lng: -1.41808, lat: 53.4949 },
        placeType: 'industrial_site' as PlaceType,
        placeTypeConfidence: 0.9,
        externalIds: [{ scheme: 'nhle', value: '1004790' }],
      }),
      [
        existing({
          id: 'place-elsecar',
          name: 'Elsecar Newcomen Engine House',
          location: { lng: -1.41808, lat: 53.4949 },
          placeType: 'church' as PlaceType,
          externalIds: [{ scheme: 'nhle', value: '6000001' }],
        }),
      ],
    );
    expect(decision.conflicts.some((c) => c.field === 'place_type')).toBe(true);
    expect(decision.outcome).toBe(MatchOutcome.ConflictReview);
  });

  it('flags a conflict even when an identifier is shared', () => {
    const decision = matchCandidate(
      candidate({
        name: 'Somewhere Castle',
        location: { lng: -1.5, lat: 54.0 },
        externalIds: [{ scheme: 'wikidata', value: 'Q1' }],
      }),
      [
        existing({
          id: 'place-x',
          // 3km away: within the plausible range but past the conflict threshold.
          name: 'Somewhere Castle',
          location: { lng: -1.5, lat: 54.027 },
          externalIds: [{ scheme: 'wikidata', value: 'Q1' }],
        }),
      ],
    );
    expect(decision.outcome).toBe(MatchOutcome.ConflictReview);
    expect(decision.conflicts.some((c) => c.field === 'location')).toBe(true);
  });

  it('treats an NHLE designation reference as an identity signal', () => {
    const decision = matchCandidate(
      candidate({
        name: 'Rievaulx Abbey',
        location: { lng: -1.1163, lat: 54.2573 },
        placeType: 'abbey' as PlaceType,
        designations: [{ designation: 'scheduled_monument', reference: '1012065' }],
        externalIds: [{ scheme: 'nhle', value: '1012065' }],
      }),
      [
        existing({
          id: 'place-rievaulx',
          name: 'Rievaulx Abbey',
          location: { lng: -1.1163, lat: 54.2573 },
          placeType: 'abbey' as PlaceType,
          designationReferences: ['1012065'],
        }),
      ],
    );
    expect(decision.outcome).toBe(MatchOutcome.MatchConfident);
  });

  it('does not require a postcode to reach a decision', () => {
    // NHLE publishes no postcode at all, so every decision must hold without one.
    const decision = matchCandidate(
      candidate({
        name: 'Aldborough Roman Town',
        location: { lng: -1.382355, lat: 54.089871 },
        placeType: 'archaeological_site' as PlaceType,
        externalIds: [{ scheme: 'nhle', value: '1003133' }],
      }),
      [],
    );
    expect(decision.outcome).toBe(MatchOutcome.NewCanonical);
    expect(decision.confidence).toBe(0);
  });

  it('sends a renamed site to review instead of creating a duplicate', () => {
    const decision = matchCandidate(
      candidate({
        name: 'Elsecar Heritage Centre',
        altNames: ['Elsecar New Colliery'],
        location: { lng: -1.41808, lat: 53.4949 },
        placeType: 'industrial_site' as PlaceType,
        externalIds: [{ scheme: 'nhle', value: '1004790' }],
      }),
      [
        existing({
          id: 'place-elsecar',
          name: 'The Former Elsecar New Colliery, Including the Elsecar Newcomen Engine',
          location: { lng: -1.41808, lat: 53.4949 },
          placeType: 'industrial_site' as PlaceType,
          externalIds: [{ scheme: 'nhle', value: '7000001' }],
        }),
      ],
    );
    expect([MatchOutcome.MatchConfident, MatchOutcome.MatchReview]).toContain(decision.outcome);
    expect(decision.matchedPlaceId).toBe('place-elsecar');
  });
});
