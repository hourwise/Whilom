import { describe, expect, it } from 'vitest';
import { PREDICATE_SCHEMAS, RelationshipPredicate } from './relationships';

describe('predicate registry', () => {
  it('declares a schema for every predicate', () => {
    const declared = new Set(PREDICATE_SCHEMAS.map((s) => s.predicate));
    for (const predicate of Object.values(RelationshipPredicate)) {
      expect(declared.has(predicate)).toBe(true);
    }
  });

  it('every predicate connects at least one subject and object type', () => {
    for (const schema of PREDICATE_SCHEMAS) {
      expect(schema.subjectTypes.length).toBeGreaterThan(0);
      expect(schema.objectTypes.length).toBeGreaterThan(0);
    }
  });
});
