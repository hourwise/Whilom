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

describe('a guessed type is not evidence of identity', () => {
  it('does not merge a priory into its farmhouse on containment alone', () => {
    // Found in the 10,000-record quality audit. "Marrick Priory Farmhouse" is a
    // separately listed building; it was typed `monument` at confidence 0.2
    // because nothing in its name could be recognised, and that guess then
    // counted in FAVOUR of merging it with the scheduled priory 50m away.
    const decision = matchCandidate(
      candidate({
        name: 'Marrick Priory: a Benedictine nunnery and later parish church with fishponds, mill mound, ironworks, longhouse, trackways and an Iron-Age house platform',
        location: { lng: -1.93, lat: 54.38 },
        placeType: 'priory' as PlaceType,
        placeTypeConfidence: 0.85,
        provenance: {
          sourceId: 'historic-england-nhle',
          sourceRecordId: '1012182',
          retrievedAt: '2026-08-18T00:00:00.000Z',
          importerVersion: '0.1.0',
          importRunId: 'test-run',
        },
        designations: [{ designation: 'scheduled_monument', reference: '1012182' }],
      }),
      [
        existing({
          id: 'p1',
          name: 'Marrick Priory Farmhouse',
          location: { lng: -1.93, lat: 54.38045 },
          placeType: 'monument' as PlaceType,
          placeTypeConfidence: 0.2,
          sourceIdentity: {
            sourceId: 'historic-england-nhle',
            sourceRecordId: '1130821',
            designations: ['listed_building'],
          },
        }),
      ],
    );
    expect(decision.outcome).not.toBe(MatchOutcome.MatchConfident);
  });

  it('sends a containment pair to review even when the types agree', () => {
    // "Bishop's Manor House" and "The Bishop's Manor" probably are one building,
    // and a reviewer will say so in seconds. But the only reason to believe it
    // is that one name contains the other, and NHLE place types are inferred
    // FROM the name, so agreeing types cannot corroborate — they are the same
    // evidence read twice. The 25,000-record audit found that circularity
    // merging "Whitby Abbey" into "Whitby Abbey Cross".
    const decision = matchCandidate(
      candidate({
        name: "Bishop's Manor House",
        location: { lng: -0.81, lat: 53.08 },
        placeType: 'country_house' as PlaceType,
        placeTypeConfidence: 0.7,
        provenance: {
          sourceId: 'historic-england-nhle',
          sourceRecordId: '1005227',
          retrievedAt: '2026-08-18T00:00:00.000Z',
          importerVersion: '0.1.0',
          importRunId: 'test-run',
        },
        designations: [{ designation: 'scheduled_monument', reference: '1005227' }],
      }),
      [
        existing({
          id: 'p1',
          name: "The Bishop's Manor",
          location: { lng: -0.81, lat: 53.080045 },
          placeType: 'country_house' as PlaceType,
          placeTypeConfidence: 0.7,
          sourceIdentity: {
            sourceId: 'historic-england-nhle',
            sourceRecordId: '1083181',
            designations: ['listed_building'],
          },
        }),
      ],
    );
    expect(decision.outcome).toBe(MatchOutcome.MatchReview);
    expect(decision.rationale).toContain('association rather than identity');
  });

  it('still merges two identically named records however weakly typed', () => {
    // "Hellifield Peel" against "Hellifield Peel", both typed at confidence 0.3.
    // The names are identical rather than merely containing one another, so the
    // corroboration rule does not apply — it governs containment, not agreement.
    const decision = matchCandidate(
      candidate({
        name: 'Hellifield Peel',
        location: { lng: -2.22, lat: 53.97 },
        placeType: 'archaeological_site' as PlaceType,
        placeTypeConfidence: 0.3,
        provenance: {
          sourceId: 'historic-england-nhle',
          sourceRecordId: '1004073',
          retrievedAt: '2026-08-18T00:00:00.000Z',
          importerVersion: '0.1.0',
          importRunId: 'test-run',
        },
        designations: [{ designation: 'scheduled_monument', reference: '1004073' }],
      }),
      [
        existing({
          id: 'p1',
          name: 'Hellifield Peel',
          location: { lng: -2.22, lat: 53.970018 },
          placeType: 'structure' as PlaceType,
          placeTypeConfidence: 0.3,
          sourceIdentity: {
            sourceId: 'historic-england-nhle',
            sourceRecordId: '1131698',
            designations: ['listed_building'],
          },
        }),
      ],
    );
    expect(decision.outcome).toBe(MatchOutcome.MatchConfident);
  });
});

describe('containment is not identity, at the level of names', () => {
  const nhle = (sourceRecordId: string) => ({
    sourceId: 'historic-england-nhle',
    sourceRecordId,
    retrievedAt: '2026-08-18T00:00:00.000Z',
    importerVersion: '0.1.0',
    importRunId: 'test-run',
  });

  it('does not merge an abbey into the cross that stands in its grounds', () => {
    // Found in the 25,000-record audit, 100m apart. Both records are typed
    // `abbey` at confidence 0.9 — the cross because "Abbey" appears in its
    // name — so type agreement could not be used to corroborate the match.
    const decision = matchCandidate(
      candidate({
        name: 'Whitby Abbey: Saxon double-house, post-Conquest Benedictine monastery, C17 manor house and C14 cross.',
        altNames: ['Whitby Abbey'],
        location: { lng: -0.6076, lat: 54.4886 },
        placeType: 'abbey' as PlaceType,
        placeTypeConfidence: 0.9,
        provenance: nhle('1004108'),
        designations: [{ designation: 'scheduled_monument', reference: '1004108' }],
      }),
      [
        existing({
          id: 'p1',
          name: 'Whitby Abbey Cross',
          altNames: ['WHITBY ABBEY CROSS'],
          location: { lng: -0.6076, lat: 54.48950 },
          placeType: 'abbey' as PlaceType,
          placeTypeConfidence: 0.9,
          sourceIdentity: {
            sourceId: 'historic-england-nhle',
            sourceRecordId: '1148310',
            designations: ['listed_building'],
          },
        }),
      ],
    );
    expect(decision.outcome).not.toBe(MatchOutcome.MatchConfident);
  });

  it('does not merge a churchyard cross base into the church', () => {
    // The case the matcher has been asked to protect since batch 6, arriving
    // through the type system: the cross base was typed `church` because
    // "churchyard ... Church" appears in its name.
    const decision = matchCandidate(
      candidate({
        name: 'Cross base for standing cross in churchyard of All Saints Church, Easington',
        location: { lng: -0.1187, lat: 53.6486 },
        placeType: 'church' as PlaceType,
        placeTypeConfidence: 0.9,
        provenance: nhle('1017999'),
        designations: [{ designation: 'scheduled_monument', reference: '1017999' }],
      }),
      [
        existing({
          id: 'p1',
          name: 'Church of All Saints',
          altNames: ['CHURCH OF ALL SAINTS'],
          location: { lng: -0.1187, lat: 53.648753 },
          placeType: 'church' as PlaceType,
          placeTypeConfidence: 0.9,
          sourceIdentity: {
            sourceId: 'historic-england-nhle',
            sourceRecordId: '1083999',
            designations: ['listed_building'],
          },
        }),
      ],
    );
    expect(decision.outcome).not.toBe(MatchOutcome.MatchConfident);
  });

  it('does not merge a village cross group into the stocks within it', () => {
    const decision = matchCandidate(
      candidate({
        name: 'Village cross with sundial and stocks',
        location: { lng: -1.4, lat: 54.2 },
        placeType: 'monument' as PlaceType,
        placeTypeConfidence: 0.8,
        provenance: nhle('1015999'),
        designations: [{ designation: 'scheduled_monument', reference: '1015999' }],
      }),
      [
        existing({
          id: 'p1',
          name: 'Stocks',
          altNames: ['STOCKS'],
          location: { lng: -1.4, lat: 54.200027 },
          placeType: 'monument' as PlaceType,
          placeTypeConfidence: 0.8,
          sourceIdentity: {
            sourceId: 'historic-england-nhle',
            sourceRecordId: '1084999',
            designations: ['listed_building'],
          },
        }),
      ],
    );
    expect(decision.outcome).not.toBe(MatchOutcome.MatchConfident);
  });

  it('still merges when the names genuinely agree rather than merely contain', () => {
    // The distinction the rule turns on. Identical names are agreement, and
    // agreement still merges — this is what keeps the scheduled and listed
    // records for one castle together.
    const decision = matchCandidate(
      candidate({
        name: 'Bolton Castle',
        location: { lng: -1.94, lat: 54.32 },
        placeType: 'castle' as PlaceType,
        placeTypeConfidence: 0.85,
        provenance: nhle('1006999'),
        designations: [{ designation: 'scheduled_monument', reference: '1006999' }],
      }),
      [
        existing({
          id: 'p1',
          name: 'Bolton Castle',
          location: { lng: -1.94, lat: 54.320018 },
          placeType: 'castle' as PlaceType,
          placeTypeConfidence: 0.85,
          sourceIdentity: {
            sourceId: 'historic-england-nhle',
            sourceRecordId: '1132999',
            designations: ['listed_building'],
          },
        }),
      ],
    );
    expect(decision.outcome).toBe(MatchOutcome.MatchConfident);
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
