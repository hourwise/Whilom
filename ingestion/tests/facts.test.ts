import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCandidateFacts, isPublishablePredicate } from '../pipeline/facts';
import type { PlaceCandidate } from '../pipeline/candidate';
import { WikidataSourceAdapter } from '../sources/wikidata/wikidata-adapter';
import { normaliseWikidataRecord } from '../transforms/normalise-wikidata';
import type { PlaceType } from '@whilom/domain';

/**
 * Publication used to handle exactly two facts, each with its own IF block
 * inside a stored procedure. These tests cover the replacement: a derived list
 * of predicate/value pairs that the publish engine iterates without knowing
 * which source produced them.
 */

const WIKIDATA_FIXTURE = fileURLToPath(
  new URL('../sources/wikidata/fixtures/yorkshire-wikidata.json', import.meta.url),
);

function candidate(over: Partial<PlaceCandidate>): PlaceCandidate {
  return {
    provenance: {
      sourceId: 'wikidata',
      sourceRecordId: 'Q1',
      retrievedAt: '2026-08-17T00:00:00.000Z',
      importerVersion: '1.0.0',
      importRunId: 'run',
    },
    name: 'A Place',
    altNames: [],
    placeType: 'castle' as PlaceType,
    placeTypeConfidence: 0.85,
    placeTypeRule: 'castle',
    location: { lng: -1.5, lat: 54 },
    locationMethod: 'source_coordinate',
    locationAccuracyMeters: 25,
    designations: [],
    externalIds: [],
    warnings: [],
    ...over,
  };
}

describe('buildCandidateFacts', () => {
  it('emits the facts that used to be hard-coded', () => {
    const facts = buildCandidateFacts(
      candidate({ inceptionYear: 1132, officialWebsite: 'https://example.org/a' }),
    );
    expect(facts).toContainEqual({ predicate: 'inception_year', value: 1132, sourceValue: '1132' });
    expect(facts).toContainEqual({ predicate: 'official_website', value: 'https://example.org/a' });
  });

  it('emits facts the old engine silently dropped', () => {
    const facts = buildCandidateFacts(
      candidate({
        commonsCategory: 'Category:Fountains Abbey',
        areaHectares: 33.58,
        altNames: ['Fountains Cistercian Abbey'],
        designations: [
          { designation: 'listed_building', reference: '1149811', firstDesignated: '1954-02-08T00:00:00.000Z' },
        ],
      }),
    );
    const predicates = facts.map((f) => f.predicate);
    expect(predicates).toContain('commons_category');
    expect(predicates).toContain('area_hectares');
    expect(predicates).toContain('former_name');
    expect(predicates).toContain('designation_reference');
    expect(predicates).toContain('first_designated');
  });

  it('keeps the source string alongside a typed value', () => {
    const facts = buildCandidateFacts(
      candidate({
        designations: [{ designation: 'listed_building', firstDesignated: '1954-02-08T00:00:00.000Z' }],
      }),
    );
    const dated = facts.find((f) => f.predicate === 'first_designated')!;
    expect(dated.value).toBe('1954-02-08');
    expect(dated.sourceValue).toBe('1954-02-08T00:00:00.000Z');
  });

  it('omits absent values rather than publishing empties', () => {
    expect(buildCandidateFacts(candidate({}))).toEqual([]);
  });

  it('collapses identical claims within one record but only within one record', () => {
    // Two designations quoting the same reference is one claim.
    const facts = buildCandidateFacts(
      candidate({
        designations: [
          { designation: 'listed_building', reference: '1149811' },
          { designation: 'scheduled_monument', reference: '1149811' },
        ],
      }),
    );
    expect(facts.filter((f) => f.predicate === 'designation_reference')).toHaveLength(1);
  });

  it('only emits predicates the database registry accepts', () => {
    const facts = buildCandidateFacts(
      candidate({
        inceptionYear: 1132,
        officialWebsite: 'https://example.org',
        commonsCategory: 'Category:X',
        areaHectares: 5,
        altNames: ['Other Name'],
        designations: [{ designation: 'listed_building', reference: 'R1', firstDesignated: '1954-01-01T00:00:00.000Z' }],
      }),
    );
    expect(facts.length).toBeGreaterThan(4);
    for (const fact of facts) {
      expect(isPublishablePredicate(fact.predicate), fact.predicate).toBe(true);
    }
  });
});

describe('relationship provenance from a real source', () => {
  it('carries the person identifier, not just a name', async () => {
    // Wikidata really does record Titus Salt as the founder of Saltaire and
    // Alan Rufus as the founder of Richmond Castle.
    const adapter = new WikidataSourceAdapter({ kind: 'file', path: WIKIDATA_FIXTURE });
    const withPeople: { name: string; people: { label: string; role: string; externalId?: string }[] }[] = [];
    for await (const raw of adapter.fetch()) {
      const result = normaliseWikidataRecord(raw, 'run');
      if (result.ok && result.candidate.relatedPeople?.length) {
        withPeople.push({ name: result.candidate.name, people: result.candidate.relatedPeople });
      }
    }

    expect(withPeople.length).toBeGreaterThanOrEqual(2);
    for (const entry of withPeople) {
      for (const person of entry.people) {
        expect(person.label).toBeTruthy();
        expect(person.role).toBeTruthy();
        // The identifier is what makes the published edge traceable and stops
        // two people who share a name from being merged.
        expect(person.externalId).toMatch(/^Q\d+$/);
      }
    }

    const names = withPeople.flatMap((e) => e.people.map((p) => p.label));
    expect(names).toContain('Titus Salt');
  });
});
