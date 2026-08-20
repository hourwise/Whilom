/**
 * The normaliser is the batch's load-bearing component: everything Whilom will
 * claim about time passes through it. These tests are written against real
 * values from the Yorkshire corpus and from Wikidata rather than invented ones.
 */

import { describe, expect, it } from 'vitest';
import {
  CIRCA_TOLERANCE_YEARS,
  MAX_YEAR,
  NORMALISER_VERSION,
  WIKIDATA_PRECISION,
  centuryOfYear,
  centurySpanSigned,
  formatYear,
  normalisePhrase,
  normaliseWikidataTime,
  ordinal,
  parseWikidataYear,
  readCentury,
} from '../transforms/temporal-normaliser';

/** Convenience: assert success and return the span. */
function span(value: string) {
  const result = normalisePhrase(value);
  if (!result.ok) throw new Error(`expected "${value}" to normalise, got ${result.rejection.reason}`);
  return result.span;
}

function rejection(value: string) {
  const result = normalisePhrase(value);
  if (result.ok) throw new Error(`expected "${value}" to be rejected, got ${result.span.label}`);
  return result.rejection;
}

describe('centuries', () => {
  it('runs a century from 01 to 00, as historians write them', () => {
    expect(centurySpanSigned(17, 'ce')).toEqual({ start: 1601, end: 1700 });
    expect(centurySpanSigned(1, 'ce')).toEqual({ start: 1, end: 100 });
    expect(centurySpanSigned(20, 'ce')).toEqual({ start: 1901, end: 2000 });
  });

  it('never lets a BCE century touch year zero', () => {
    expect(centurySpanSigned(1, 'bce')).toEqual({ start: -100, end: -1 });
    expect(centurySpanSigned(5, 'bce')).toEqual({ start: -500, end: -401 });
  });

  it('places a year in the century a reader would expect', () => {
    expect(centuryOfYear(1601)).toEqual({ century: 17, era: 'ce' });
    expect(centuryOfYear(1700)).toEqual({ century: 17, era: 'ce' });
    expect(centuryOfYear(1701)).toEqual({ century: 18, era: 'ce' });
    expect(centuryOfYear(-1)).toEqual({ century: 1, era: 'bce' });
    expect(centuryOfYear(-100)).toEqual({ century: 1, era: 'bce' });
    expect(centuryOfYear(-101)).toEqual({ century: 2, era: 'bce' });
  });

  it('reads all three spellings heritage writing uses', () => {
    expect(readCentury('BARN AT C17 FARMHOUSE')?.century).toBe(17);
    expect(readCentury('Burton Agnes 12th-century manor house')?.century).toBe(12);
    expect(readCentury('SEVENTEENTH CENTURY FARMHOUSE')?.century).toBe(17);
  });

  it('refuses a road number that looks like a century', () => {
    // A real name from the corpus: "the Junction With the C61 Road". There is
    // no 61st century, and accepting one would put a milepost in the year 6001.
    expect(readCentury('Milepost 159 Metres North East of the Junction With the C61 Road')).toBeNull();
  });
});

describe('early, mid and late', () => {
  it('narrows the span without sharpening the claim', () => {
    const early = span('Early C19 Former Paupers Lunatic Asylum');
    expect(early.precision).toBe('century');
    expect(early.qualifier).toBe('early');
    expect(early.label).toBe('early 19th century');
    expect(early.startYear).toBe(1801);
    expect(early.endYear).toBeLessThan(1850);
  });

  it('covers a whole century across the three thirds, with no gaps', () => {
    const early = span('early C18');
    const mid = span('mid C18');
    const late = span('late C18');
    expect(early.startYear).toBe(1701);
    expect(mid.startYear).toBe(early.endYear + 1);
    expect(late.startYear).toBe(mid.endYear + 1);
    expect(late.endYear).toBe(1800);
  });

  it('reads a hyphenated qualifier, which is how the register writes it', () => {
    // "late-C18 building" appears verbatim in the Bootham Park Hospital entry.
    expect(span('late-C18 building').qualifier).toBe('late');
  });

  it('still says "century" and never a year', () => {
    expect(span('mid 18th century').label).not.toMatch(/\d{4}/);
  });
});

describe('years, ranges and circa', () => {
  it('reads an explicit year', () => {
    const s = span('Cow Byre Dated 1675');
    expect(s.precision).toBe('exact_year');
    expect([s.startYear, s.endYear]).toEqual([1675, 1675]);
  });

  it('reads an explicit range', () => {
    const s = span('1845-1848');
    expect(s.precision).toBe('range');
    expect([s.startYear, s.endYear]).toEqual([1845, 1848]);
  });

  it('expands an abbreviated range within its century', () => {
    // "1845–48" means 1848, not the year 48.
    expect(span('built 1845–48').endYear).toBe(1848);
  });

  it('widens circa by a stated convention and keeps saying circa', () => {
    const s = span('a circa 1800 lamp standard');
    expect(s.precision).toBe('circa');
    expect(s.label).toBe('c. 1800');
    expect(s.startYear).toBe(1800 - CIRCA_TOLERANCE_YEARS);
    expect(s.endYear).toBe(1800 + CIRCA_TOLERANCE_YEARS);
    expect(s.derivation).toMatch(/convention/);
  });

  it('does not read a distance as a date', () => {
    // "Circa 320 Metres North East of Wragby" is a real listing name. Circa is
    // qualifying a distance, and there is no date in it at all.
    expect(rejection('Mile Post Circa 320 Metres North East of Wragby').reason)
      .toBe('no_temporal_content');
    expect(rejection('Outbuilding Circa 50 Yards East of York House').reason)
      .toBe('no_temporal_content');
  });

  it('reads a decade', () => {
    const s = span('the 1730s');
    expect(s.precision).toBe('decade');
    expect([s.startYear, s.endYear]).toEqual([1730, 1739]);
  });
});

describe('language that must never become a year', () => {
  it.each(['old', 'ancient', 'historic', 'probably early', 'various dates', 'medieval or later'])(
    'quarantines %s rather than guessing',
    (value) => {
      const r = rejection(value);
      expect(r.reason).toBe('vague_language');
    },
  );

  it('keeps the source value so the quarantine can be ranked and revisited', () => {
    expect(rejection('various dates').value).toBe('various dates');
  });

  it('rejects text with no temporal content at all', () => {
    expect(rejection('BARN AND ATTACHED STABLE').reason).toBe('no_temporal_content');
  });
});

describe('Wikidata time values', () => {
  const field = { field: 'inception (P571)' };

  it('reads a signed Wikidata literal', () => {
    expect(parseWikidataYear('+1870-01-01T00:00:00Z')).toBe(1870);
    expect(parseWikidataYear('-0044-03-15T00:00:00Z')).toBe(-44);
    expect(parseWikidataYear('not a time')).toBeNull();
  });

  it('reads the UNSIGNED form the SPARQL endpoint actually returns', () => {
    // Wikidata dumps write "+1350-01-01". The query service serialises the
    // same value as an xsd:dateTime and drops the plus. Requiring the sign
    // rejected every CE date while letting BCE dates through, which looked
    // exactly like a working importer against a thin source.
    expect(parseWikidataYear('1870-01-01T00:00:00Z')).toBe(1870);
    expect(parseWikidataYear('1350-01-01T00:00:00Z')).toBe(1350);
  });

  it('reads year zero as 1 BCE, because year zero does not exist', () => {
    expect(parseWikidataYear('+0000-01-01T00:00:00Z')).toBe(-1);
  });

  it('NEVER turns a century-precision statement into a year', () => {
    // This is the defect the batch exists to prevent. Wikidata stores the 14th
    // century as the time value 1350, and 48% of the temporal statements on
    // Yorkshire listed buildings are century-precision.
    const r = normaliseWikidataTime('+1350-01-01T00:00:00Z', WIKIDATA_PRECISION.Century, field);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.span.precision).toBe('century');
    expect(r.span.label).toBe('14th century');
    expect(r.span.label).not.toContain('1350');
    expect([r.span.startYear, r.span.endYear]).toEqual([1301, 1400]);
  });

  it('reads the other century values the corpus actually contains', () => {
    const cases: [string, string, [number, number]][] = [
      ['+1801-01-01T00:00:00Z', '19th century', [1801, 1900]],
      ['+1900-01-01T00:00:00Z', '19th century', [1801, 1900]],
      ['+1450-01-01T00:00:00Z', '15th century', [1401, 1500]],
    ];
    for (const [literal, label, bounds] of cases) {
      const r = normaliseWikidataTime(literal, WIKIDATA_PRECISION.Century, field);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.span.label).toBe(label);
      expect([r.span.startYear, r.span.endYear]).toEqual(bounds);
    }
  });

  it('treats year, month and day precision alike, because the model is annual', () => {
    for (const p of [WIKIDATA_PRECISION.Year, WIKIDATA_PRECISION.Month, WIKIDATA_PRECISION.Day]) {
      const r = normaliseWikidataTime('+1870-06-15T00:00:00Z', p, field);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.span.precision).toBe('exact_year');
      expect([r.span.startYear, r.span.endYear]).toEqual([1870, 1870]);
    }
  });

  it('reads a decade', () => {
    const r = normaliseWikidataTime('+1870-01-01T00:00:00Z', WIKIDATA_PRECISION.Decade, field);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.span.startYear, r.span.endYear]).toEqual([1870, 1879]);
    expect(r.span.precision).toBe('decade');
  });

  it('refuses a millennium rather than promoting it to a century', () => {
    const r = normaliseWikidataTime('+1000-01-01T00:00:00Z', WIKIDATA_PRECISION.Millennium, field);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejection.reason).toBe('precision_too_coarse');
  });

  it('records which field and which rules produced the claim', () => {
    const r = normaliseWikidataTime('+1870-01-01T00:00:00Z', WIKIDATA_PRECISION.Year, field);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.span.derivation).toContain('inception (P571)');
    expect(r.span.normaliserVersion).toBe(NORMALISER_VERSION);
  });
});

describe('BCE, CE, and the year that does not exist', () => {
  const field = { field: 'inception (P571)' };

  it.each([
    ['-0002-01-01T00:00:00Z', -2, '2 BCE'],
    ['-0001-01-01T00:00:00Z', -1, '1 BCE'],
    ['+0001-01-01T00:00:00Z', 1, '1'],
    ['+0002-01-01T00:00:00Z', 2, '2'],
  ])('handles %s', (literal, year, label) => {
    const r = normaliseWikidataTime(literal, WIKIDATA_PRECISION.Year, field);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.span.startYear).toBe(year);
    expect(r.span.label).toBe(label);
  });

  it('formats a BCE year the way a reader writes it', () => {
    expect(formatYear(-500)).toBe('500 BCE');
    expect(formatYear(1)).toBe('1');
  });

  it('reads an explicit BCE century', () => {
    const s = span('4th century BC hillfort');
    expect(s.startYear).toBe(-400);
    expect(s.endYear).toBe(-301);
    expect(s.label).toBe('4th century BCE');
  });

  it('produces no span anywhere that contains year zero', () => {
    // Sweep every century the model accepts, in both eras, at every qualifier.
    for (let c = 1; c <= 21; c += 1) {
      for (const era of ['ce', 'bce'] as const) {
        const s = centurySpanSigned(c, era);
        expect(s.start).not.toBe(0);
        expect(s.end).not.toBe(0);
        // A span may not straddle the boundary either, since that would imply
        // a year zero inside it.
        expect(s.start === 0 || s.end === 0 || Math.sign(s.start) === Math.sign(s.end)).toBe(true);
      }
    }
  });

  it('writes ordinals the way English does', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st']);
  });
});

describe('bounds', () => {
  it('refuses a year beyond the range heritage data can mean', () => {
    const r = normaliseWikidataTime(`+${String(MAX_YEAR + 500)}-01-01T00:00:00Z`, WIKIDATA_PRECISION.Year, {
      field: 'inception (P571)',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejection.reason).toBe('out_of_range');
  });
});
