import { describe, expect, it } from 'vitest';
import { matchCandidate } from '../matching/matcher';
import {
  allNamePairsDistinct,
  allPreparedNamePairsDistinct,
  bestNameSimilarityBreakdown,
  bestPreparedNameSimilarityBreakdown,
  isGenericName,
  nameSimilarity,
  prepareNames,
} from '../matching/name';
import { MatchOutcome } from '../pipeline/candidate';
import { THRESHOLDS } from '../matching/matcher';
import type { CanonicalPlaceRef, PlaceCandidate } from '../pipeline/candidate';
import type { PlaceType } from '@whilom/domain';

/**
 * Matcher tests are written around the cases that actually occur in the NHLE
 * Yorkshire sample, not invented ones. Coordinates and names below are the real
 * values from `sources/historic-england/fixtures/yorkshire-poc.json`.
 */

function candidate(
  over: Partial<PlaceCandidate> & { name: string; location: { lng: number; lat: number } },
): PlaceCandidate {
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
    placeTypeRule: 'castle',
    locationMethod: 'source_coordinate',
    locationAccuracyMeters: 10,
    designations: [],
    externalIds: [],
    warnings: [],
    ...over,
  };
}

function existing(
  over: Partial<CanonicalPlaceRef> & {
    id: string;
    name: string;
    location: { lng: number; lat: number };
  },
): CanonicalPlaceRef {
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
    expect(nameSimilarity(scheduled, 'Fountains Abbey, With Ancillary Buildings')).toBeGreaterThan(
      0.6,
    );
  });

  it('keeps prepared canonical name work equivalent to the raw path', () => {
    const cases = [
      {
        candidate: ['Middleham Castle'],
        existing: ['Middleham Castle'],
      },
      {
        candidate: ['CHURCH OF ST MARY'],
        existing: ['Village Cross'],
      },
      {
        candidate: [
          'Fountains Cistercian Abbey; monastic precinct, mill, water management works',
          'Fountains Abbey',
        ],
        existing: ['Fountains Abbey, With Ancillary Buildings'],
      },
      {
        candidate: ['Old Hall (formerly manor house)'],
        existing: ['Old Hall'],
      },
    ];

    for (const entry of cases) {
      expect(
        allPreparedNamePairsDistinct(prepareNames(entry.candidate), prepareNames(entry.existing)),
      ).toEqual(allNamePairsDistinct(entry.candidate, entry.existing));
      expect(
        bestPreparedNameSimilarityBreakdown(
          prepareNames(entry.candidate),
          prepareNames(entry.existing),
        ),
      ).toEqual(bestNameSimilarityBreakdown(entry.candidate, entry.existing));
    }
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

  it('lets two precise sources demand a tight distance', () => {
    // Both claim ~10 m accuracy and sit 120 m apart. With precise coordinates
    // that gap is real disagreement, so this must not auto-match.
    const decision = matchCandidate(
      candidate({
        name: 'Precise Priory',
        location: { lng: -1.5, lat: 54.0 },
        placeType: 'priory' as PlaceType,
        locationAccuracyMeters: 10,
        externalIds: [{ scheme: 'nhle', value: '5000001' }],
      }),
      [
        existing({
          id: 'place-precise',
          name: 'Precise Priory',
          location: { lng: -1.5, lat: 54.00108 }, // ~120m north
          placeType: 'priory' as PlaceType,
          locationAccuracyMeters: 10,
          externalIds: [{ scheme: 'nhle', value: '5000002' }],
        }),
      ],
    );
    expect(decision.outcome).not.toBe(MatchOutcome.MatchConfident);
  });

  it('accepts the same gap when one source is a coarse polygon centroid', () => {
    // Identical 120 m gap, but one record is the centroid of a 30 ha precinct.
    // Now the gap is inside what the source itself can resolve.
    const decision = matchCandidate(
      candidate({
        name: 'Precise Priory',
        location: { lng: -1.5, lat: 54.0 },
        placeType: 'priory' as PlaceType,
        locationMethod: 'geometry_centroid',
        locationAccuracyMeters: 309,
        externalIds: [{ scheme: 'nhle', value: '5000001' }],
      }),
      [
        existing({
          id: 'place-precise',
          name: 'Precise Priory',
          location: { lng: -1.5, lat: 54.00108 },
          placeType: 'priory' as PlaceType,
          locationAccuracyMeters: 10,
          externalIds: [{ scheme: 'nhle', value: '5000002' }],
        }),
      ],
    );
    expect(decision.outcome).toBe(MatchOutcome.MatchConfident);
  });

  it('never lets imprecision alone buy an automatic match', () => {
    // A 5 km-accuracy record 900 m from a namesake. Uncertainty must make the
    // matcher more cautious, not more permissive: past the ceiling a human
    // decides however vague the coordinates are.
    const decision = matchCandidate(
      candidate({
        name: 'Vague Grange',
        location: { lng: -1.5, lat: 54.0 },
        placeType: 'building' as PlaceType,
        locationMethod: 'approximate',
        locationAccuracyMeters: 5000,
        externalIds: [{ scheme: 'nhle', value: '5000003' }],
      }),
      [
        existing({
          id: 'place-vague',
          name: 'Vague Grange',
          location: { lng: -1.5, lat: 54.0081 }, // ~900m
          placeType: 'building' as PlaceType,
          locationAccuracyMeters: 5000,
          externalIds: [{ scheme: 'nhle', value: '5000004' }],
        }),
      ],
    );
    expect(decision.outcome).not.toBe(MatchOutcome.MatchConfident);
    expect(THRESHOLDS.positionAgreementCeilingMeters).toBeLessThan(5000);
  });

  it('does not absorb a listed building into the World Heritage Site containing it', () => {
    // Real case from the Yorkshire sample: Saltaire (WHS 1000099) is 1,628 ha,
    // giving its centroid a ~2.3 km equivalent radius, and Saltaire Mills
    // (1133523) sits 382 m away. Containment is not identity.
    const decision = matchCandidate(
      candidate({
        name: 'Saltaire',
        location: { lng: -1.79026, lat: 53.83717 },
        placeType: 'structure' as PlaceType,
        placeTypeConfidence: 0.25,
        placeTypeRule: 'generic-structure',
        locationMethod: 'geometry_centroid',
        locationAccuracyMeters: 2276,
        externalIds: [{ scheme: 'nhle', value: '1000099' }],
      }),
      [
        existing({
          id: 'place-saltaire-mills',
          name: 'Saltaire Mills - Main Block Including Sheds',
          location: { lng: -1.78748, lat: 53.8384 },
          placeType: 'industrial_site' as PlaceType,
          locationAccuracyMeters: 6,
          externalIds: [{ scheme: 'nhle', value: '1133523' }],
        }),
      ],
    );
    expect(decision.outcome).toBe(MatchOutcome.MatchReview);
  });

  it('keeps the type veto working even when both records are imprecise', () => {
    const decision = matchCandidate(
      candidate({
        name: 'Overlapping Site',
        location: { lng: -1.5, lat: 54.0 },
        placeType: 'church' as PlaceType,
        placeTypeConfidence: 0.9,
        locationAccuracyMeters: 400,
        externalIds: [{ scheme: 'nhle', value: '5000005' }],
      }),
      [
        existing({
          id: 'place-overlap',
          name: 'Overlapping Site',
          location: { lng: -1.5, lat: 54.0 },
          placeType: 'railway_site' as PlaceType,
          locationAccuracyMeters: 400,
          externalIds: [{ scheme: 'nhle', value: '5000006' }],
        }),
      ],
    );
    expect(decision.conflicts.some((c) => c.field === 'place_type')).toBe(true);
    expect(decision.outcome).not.toBe(MatchOutcome.MatchConfident);
  });

  it('does not treat a generic structure classification as evidence of difference', () => {
    // An untypeable NHLE entry is classified `structure`. That must not argue
    // it is a different place from a record typed more specifically.
    const decision = matchCandidate(
      candidate({
        name: 'Kirkgate Toll House',
        location: { lng: -1.5, lat: 54.0 },
        placeType: 'structure' as PlaceType,
        placeTypeConfidence: 0.25,
        placeTypeRule: 'generic-structure',
        externalIds: [{ scheme: 'nhle', value: '5000007' }],
      }),
      [
        existing({
          id: 'place-toll',
          name: 'Kirkgate Toll House',
          location: { lng: -1.5, lat: 54.0 },
          placeType: 'building' as PlaceType,
          externalIds: [{ scheme: 'nhle', value: '5000008' }],
        }),
      ],
    );
    expect(decision.conflicts.some((c) => c.field === 'place_type')).toBe(false);
    expect(decision.outcome).toBe(MatchOutcome.MatchConfident);
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
