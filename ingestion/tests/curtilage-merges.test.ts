import { describe, expect, it } from 'vitest';
import { matchCandidate } from '../matching/matcher';
import { namesDenoteDistinctThings, nameSimilarity } from '../matching/name';
import { MatchOutcome } from '../pipeline/candidate';
import type { CanonicalPlaceRef, PlaceCandidate } from '../pipeline/candidate';
import type { PlaceType } from '@whilom/domain';

/**
 * Regression tests for the false merges the 5,000-record scale tier exposed.
 *
 * Every pairing below is real: the names, the list entry numbers and the
 * distances are taken from the records the matcher actually merged. At the
 * 30-record POC scale not one of these could occur, which is why they survived
 * five batches — the statutory list only becomes dense enough to produce them
 * at a few thousand records in one region.
 *
 * The governing rule is unchanged and these tests exist to hold it: wrongly
 * splitting one castle into two records is a tidy-up job, wrongly merging two
 * castles destroys information and is very hard to notice afterwards.
 */

function candidate(
  over: Partial<PlaceCandidate> & { name: string; location: { lng: number; lat: number } },
): PlaceCandidate {
  return {
    provenance: {
      sourceId: 'historic-england-nhle',
      sourceRecordId: '9999999',
      retrievedAt: '2026-08-17T00:00:00.000Z',
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

/** Two listed buildings a few metres apart — the shape of every case here. */
function decide(candidateName: string, existingName: string, metresApart = 20) {
  // ~0.000009 degrees of latitude is roughly one metre.
  return matchCandidate(
    candidate({ name: candidateName, location: { lng: -1.5, lat: 54.0 } }),
    [
      existing({
        id: 'p1',
        name: existingName,
        location: { lng: -1.5, lat: 54.0 + metresApart * 0.000009 },
      }),
    ],
  );
}

describe('one register, two entries', () => {
  it('never merges two separately listed buildings, however alike', () => {
    // NHLE 1022621 "Railings, Gate Piers and Gate to Burnley College Adult
    // Education Centre" was merged into the college itself, 16m away.
    const decision = decide(
      'Railings, Gate Piers and Gate to Burnley College Adult Education Centre',
      'Burnley College Adult Education Centre',
      16,
    );
    expect(decision.outcome).toBe(MatchOutcome.NewCanonical);
  });

  it('keeps a sundial separate from the church it stands beside', () => {
    expect(decide('Sundial to South of Church of St Mary', 'Church of St Mary', 25).outcome).toBe(
      MatchOutcome.NewCanonical,
    );
  });

  it('keeps chest tombs separate from the chapel', () => {
    expect(
      decide('3 Chest Tombs to South of Dukinfield Old Chapel', 'Dukinfield Old Chapel', 11).outcome,
    ).toBe(MatchOutcome.NewCanonical);
  });

  it('keeps a telephone kiosk separate from the post office it stands outside', () => {
    expect(decide('K6 Telephone Kiosk Outside Delph Post Office', 'Post Office', 6).outcome).toBe(
      MatchOutcome.NewCanonical,
    );
  });

  it('keeps a stable block separate from its hall', () => {
    expect(decide('Stable Block at Brattleby Hall', 'Brattleby Hall', 49).outcome).toBe(
      MatchOutcome.NewCanonical,
    );
  });

  it('does not merge three separate buildings that share a hamlet name', () => {
    // Three listed buildings in the sample are each named exactly "New Tame".
    expect(decide('New Tame', 'New Tame', 15).outcome).toBe(MatchOutcome.NewCanonical);
  });

  it('still merges two rows that are the same list entry arriving twice', () => {
    // The NHLE service returns one row per geometry part, so multi-part World
    // Heritage Sites such as Saltaire and Studley Royal arrive more than once.
    const decision = matchCandidate(
      candidate({
        name: 'Saltaire',
        location: { lng: -1.79045, lat: 53.83833 },
        provenance: {
          sourceId: 'historic-england-nhle',
          sourceRecordId: '1000099',
          retrievedAt: '2026-08-17T00:00:00.000Z',
          importerVersion: '0.1.0',
          importRunId: 'test-run',
        },
        designations: [{ designation: 'world_heritage_site', reference: '1000099' }],
      }),
      [
        existing({
          id: 'p1',
          name: 'Saltaire',
          location: { lng: -1.79045, lat: 53.83833 },
          designationReferences: ['1000099'],
          sourceIdentity: {
            sourceId: 'historic-england-nhle',
            sourceRecordId: '1000099',
            designations: ['world_heritage_site'],
          },
        }),
      ],
    );
    expect(decision.outcome).toBe(MatchOutcome.MatchConfident);
  });

  it('still merges one site holding two different designations', () => {
    // A tithe barn that is both scheduled and listed is one barn. This is the
    // case the register veto must not break, so it is scoped to a shared
    // designation rather than to the source alone.
    const decision = matchCandidate(
      candidate({
        name: 'Tithe barn',
        location: { lng: -1.5, lat: 54.0 },
        provenance: {
          sourceId: 'historic-england-nhle',
          sourceRecordId: '1010101',
          retrievedAt: '2026-08-17T00:00:00.000Z',
          importerVersion: '0.1.0',
          importRunId: 'test-run',
        },
        designations: [{ designation: 'scheduled_monument', reference: '1010101' }],
      }),
      [
        existing({
          id: 'p1',
          name: 'Tithe Barn',
          location: { lng: -1.5, lat: 54.000054 },
          sourceIdentity: {
            sourceId: 'historic-england-nhle',
            sourceRecordId: '2020202',
            designations: ['listed_building'],
          },
        }),
      ],
    );
    expect(decision.outcome).toBe(MatchOutcome.MatchConfident);
  });
});

describe('names that say they are not the thing they are named after', () => {
  it('reads a positional phrase as evidence of distinctness', () => {
    expect(
      namesDenoteDistinctThings('Sundial to South of Church of St Mary', 'Church of St Mary').distinct,
    ).toBe(true);
    expect(namesDenoteDistinctThings('Stable Block at Brattleby Hall', 'Brattleby Hall').distinct).toBe(
      true,
    );
  });

  it('keeps two barrows apart by the tail the old code discarded', () => {
    // Both names reduced to "round barrow" once the positional tail was
    // stripped, and scored 1.00 against each other.
    const a = 'Round barrow 300m south west of Cot Nab Farm';
    const b = 'Round barrow 350m west of Cot Nab Farm';
    expect(namesDenoteDistinctThings(a, b).distinct).toBe(true);
  });

  it('distinguishes houses on one street by their numbers', () => {
    // Character bigrams score these 0.93 by ignoring the one character that
    // identifies them.
    expect(namesDenoteDistinctThings('2, Westfield Road', '8, Westfield Road').distinct).toBe(true);
    expect(namesDenoteDistinctThings('6, Bridge Street', '5, Bridge Street').distinct).toBe(true);
  });

  it('does not split a range that includes the same number', () => {
    expect(namesDenoteDistinctThings('255-261, Glossop Road', '261, Glossop Road').distinct).toBe(
      false,
    );
  });

  it('leaves a scheduling description matchable against its common name', () => {
    // The case containment was introduced for, which none of this may break.
    const scheduled =
      'Fountains Cistercian Abbey; monastic precinct, mill, water management works, agricultural and industrial features and 18th century gardens';
    expect(namesDenoteDistinctThings(scheduled, 'Fountains Abbey, With Ancillary Buildings').distinct).toBe(
      false,
    );
    expect(nameSimilarity(scheduled, 'Fountains Abbey, With Ancillary Buildings')).toBeGreaterThan(0.6);
  });
});

describe('a landscape is not a structure inside it', () => {
  it('sends a registered park and a listed building to review, not a merge', () => {
    // Falinge Park's centroid is 33m from the hall it was laid out around and
    // shares its name.
    const decision = matchCandidate(
      candidate({
        name: 'Falinge Park',
        location: { lng: -2.15, lat: 53.63 },
        placeType: 'park' as PlaceType,
        provenance: {
          sourceId: 'historic-england-nhle',
          sourceRecordId: '1000404',
          retrievedAt: '2026-08-17T00:00:00.000Z',
          importerVersion: '0.1.0',
          importRunId: 'test-run',
        },
        designations: [{ designation: 'registered_park_garden', reference: '1000404' }],
      }),
      [
        existing({
          id: 'p1',
          name: 'Falinge Park Hall Facade and Pavilions',
          location: { lng: -2.15, lat: 53.630297 },
          sourceIdentity: {
            sourceId: 'historic-england-nhle',
            sourceRecordId: '1084500',
            designations: ['listed_building'],
          },
        }),
      ],
    );
    // Either review outcome is correct — here the park/building type mismatch
    // also raises a conflict. What must never happen is a merge.
    expect([MatchOutcome.MatchReview, MatchOutcome.ConflictReview]).toContain(decision.outcome);
    expect(decision.outcome).not.toBe(MatchOutcome.MatchConfident);
  });
});
