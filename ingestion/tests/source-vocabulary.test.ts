/**
 * The governed vocabulary is a list of decisions, and these are the decisions.
 *
 * Every term asserted here was measured against the real regional corpus before
 * it was written, so a failure means either the sources changed or somebody
 * widened the vocabulary without deciding what the new term means.
 */

import { describe, expect, it } from 'vitest';
import {
  EVENT_TERMS,
  PERIOD_TERMS,
  REJECTED_PROPERTIES,
  eventTerm,
  periodTerm,
} from '../transforms/source-vocabulary';
import { PERIOD_SPANS } from '../transforms/temporal';

describe('period vocabulary', () => {
  it('resolves a registry period under the same name', () => {
    const t = periodTerm('Q11764');
    expect(t?.label).toBe('Iron Age');
    expect(t?.classification).toBe('DIRECT_REGISTRY_MATCH');
    expect(t?.periodId).toBe('iron_age');
  });

  it('resolves a controlled alias to the registry period it names', () => {
    expect(periodTerm('Q131987978')?.periodId).toBe('roman');
    expect(periodTerm('Q131987978')?.classification).toBe('CONTROLLED_ALIAS');
    expect(periodTerm('Q277399')?.periodId).toBe('iron_age');
  });

  it('refuses to narrow a term broader than any single registry period', () => {
    // "Middle Ages" covers early_medieval, norman and medieval. Pinning it to
    // whichever overlaps most would invent precision the source never gave.
    const middleAges = periodTerm('Q12554');
    expect(middleAges?.classification).toBe('BROADER_THAN_REGISTRY');
    expect(middleAges?.periodId).toBeNull();
    expect(middleAges?.span).toEqual({ start: 410, end: 1484 });
  });

  it('covers the whole era it claims to cover', () => {
    const span = periodTerm('Q12554')!.span!;
    for (const id of ['early_medieval', 'norman', 'medieval']) {
      const p = PERIOD_SPANS[id]!;
      expect(span.start, `${id} should start within Middle Ages`).toBeLessThanOrEqual(p.start);
      expect(span.end, `${id} should end within Middle Ages`).toBeGreaterThanOrEqual(p.end);
    }
  });

  it('every mapped period id is a real registry period', () => {
    for (const t of PERIOD_TERMS) {
      if (t.periodId === null) continue;
      expect(PERIOD_SPANS[t.periodId], `${t.label} -> ${t.periodId}`).toBeDefined();
    }
  });

  it('a term either names a registry period or carries its own span, never neither', () => {
    for (const t of PERIOD_TERMS) {
      if (t.classification === 'REJECTED' || t.classification === 'AMBIGUOUS') continue;
      expect(Boolean(t.periodId) || Boolean(t.span), `${t.label} must be representable`).toBe(true);
    }
  });

  it('knows nothing about a term it has not been taught', () => {
    expect(periodTerm('Q99999999')).toBeNull();
  });
});

describe('event vocabulary', () => {
  it('maps construction, alteration and loss to distinct claims', () => {
    expect(eventTerm('Q59913255')?.association).toBe('built');
    expect(eventTerm('Q1370468')?.association).toBe('altered');
    expect(eventTerm('Q331483')?.association).toBe('lost');
    expect(eventTerm('Q168983')?.association).toBe('event');
  });

  it('does not collapse four different events into one generic date', () => {
    const kinds = new Set(
      ['Q331483', 'Q168983', 'Q2238935', 'Q6543023'].map((q) => eventTerm(q)?.association),
    );
    // demolition, fire, slighting, licence to crenellate — a demolition is a
    // loss and the others are things that happened.
    expect(kinds.has('lost')).toBe(true);
    expect(kinds.has('event')).toBe(true);
  });

  it.each([
    ['Q3610005', 'geophysical survey'],
    ['Q959782', 'archaeological excavation'],
    ['Q1144458', 'archaeological field survey'],
    ['Q112127197', 'topographical survey'],
  ])('refuses %s (%s), which dates the investigation and not the site', (qid) => {
    const t = eventTerm(qid);
    expect(t).not.toBeNull();
    expect(t!.association).toBeNull();
    expect(t!.note).toMatch(/survey|excavation/);
  });

  it('refuses an administrative record change, as the register\'s own dates are refused', () => {
    expect(eventTerm('Q29778318')?.association).toBeNull();
  });

  it('refuses a date about a person rather than a place', () => {
    // "childbirth" attached to a house dates a person, not the house.
    expect(eventTerm('Q34581')?.association).toBeNull();
  });

  it('states a reason for every refusal, so it can be argued with', () => {
    for (const t of EVENT_TERMS.filter((t) => t.association === null)) {
      expect(t.note.length, `${t.label} needs a reason`).toBeGreaterThan(20);
    }
  });

  it('governs every event type by name rather than by pattern', () => {
    for (const t of EVENT_TERMS) {
      expect(t.qid).toMatch(/^Q\d+$/);
      expect(t.label.length).toBeGreaterThan(0);
    }
    // No duplicates: a term with two meanings is a decision nobody made.
    expect(new Set(EVENT_TERMS.map((t) => t.qid)).size).toBe(EVENT_TERMS.length);
  });
});

describe('properties refused outright', () => {
  it('refuses architectural style, which correlates with a date without asserting one', () => {
    const style = REJECTED_PROPERTIES.find((p) => p.property === 'P149');
    expect(style).toBeDefined();
    expect(style!.reason).toBe('STYLE_NOT_DATE');
    // The revival argument is the decisive one and must stay written down.
    expect(style!.note).toMatch(/revival/i);
  });

  it('refuses heritage designation, which is an act of the state', () => {
    expect(REJECTED_PROPERTIES.find((p) => p.property === 'P1435')?.reason)
      .toBe('DESIGNATION_NOT_HISTORIC');
  });

  it('records how much evidence each refusal costs, so the choice is visible', () => {
    for (const p of REJECTED_PROPERTIES) {
      expect(p.regionalRecords).toBeGreaterThan(0);
    }
  });
});
