import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FORBIDDEN_DATE_FIELDS,
  PERIOD_SPANS,
  centurySpan,
  extractTemporalClaims,
  isForbiddenDateField,
} from '../transforms/temporal';

/**
 * The line this module has to hold: reading a period out of "Iron Age hillfort"
 * is reading; concluding "probably Georgian" from a sash window is guessing.
 * Most of these tests are about the things it must REFUSE to conclude.
 */

describe('the register supplies no historic dates', () => {
  it('names every designation date field as forbidden evidence', () => {
    // All six NHLE date fields record when protection was conferred or amended.
    for (const field of ['ListDate', 'SchedDate', 'RegDate', 'InscrDate', 'DesigDate', 'AmendDate']) {
      expect(isForbiddenDateField(field)).toBe(true);
    }
    // And the published fact derived from them.
    expect(isForbiddenDateField('first_designated')).toBe(true);
  });

  it('does not forbid fields that could legitimately carry a date', () => {
    expect(isForbiddenDateField('inception_year')).toBe(false);
    expect(isForbiddenDateField('completion_year')).toBe(false);
  });

  it('never derives a claim from a date field, only from descriptive text', () => {
    // The extractor takes text, not records: there is no code path by which a
    // ListDate could reach it.
    expect(extractTemporalClaims('1967')).toEqual([]);
    expect(extractTemporalClaims('Listed 12 May 1967')).toEqual([]);
  });

  it('keeps the forbidden list in one place so it can be asserted', () => {
    expect(FORBIDDEN_DATE_FIELDS.length).toBeGreaterThanOrEqual(6);
  });
});

describe('centuries', () => {
  it('reads a century as the hundred years it actually covers', () => {
    // The 17th century is 1601-1700, not 1600-1699.
    expect(centurySpan(17)).toEqual({ start: 1601, end: 1700 });
    expect(centurySpan(1)).toEqual({ start: 1, end: 100 });
    expect(centurySpan(20)).toEqual({ start: 1901, end: 2000 });
  });

  it('reads the register\'s own C-notation', () => {
    const [claim] = extractTemporalClaims('BARN AT C17 FARMHOUSE');
    expect(claim?.startYear).toBe(1601);
    expect(claim?.endYear).toBe(1700);
    expect(claim?.precision).toBe('century');
    expect(claim?.originalText).toBe('C17');
  });

  it('reads written and spelled centuries too', () => {
    expect(extractTemporalClaims('19th century mill')[0]?.startYear).toBe(1801);
    expect(extractTemporalClaims('SEVENTEENTH CENTURY FARMHOUSE')[0]?.startYear).toBe(1601);
  });

  it('accepts a century anywhere, because a date is a date', () => {
    // Unlike a bare period word, "C18" is unambiguous even in an address.
    expect(extractTemporalClaims('12, HIGH STREET, C18')).not.toHaveLength(0);
  });
});

describe('named periods', () => {
  it('reads a period the source itself names', () => {
    const [claim] = extractTemporalClaims('Roman villa 200m south of Green Farm');
    expect(claim?.periodId).toBe('roman');
    expect(claim?.precision).toBe('period');
    expect(claim?.originalText).toMatch(/roman/i);
  });

  it('handles prehistory as comfortably as last century', () => {
    expect(extractTemporalClaims('Iron Age hillfort')[0]?.periodId).toBe('iron_age');
    expect(extractTemporalClaims('Bronze Age round barrow')[0]?.periodId).toBe('bronze_age');
    expect(extractTemporalClaims('Neolithic long cairn')[0]?.periodId).toBe('neolithic');
    expect(extractTemporalClaims('Mesolithic settlement site')[0]?.periodId).toBe('mesolithic');
  });

  it('produces negative years for prehistory', () => {
    // The Iron Age starts deep in BCE but ends at AD 42, the year before the
    // Roman invasion — so its span legitimately crosses the boundary.
    const [ironAge] = extractTemporalClaims('Iron Age hillfort');
    expect(ironAge?.startYear).toBeLessThan(0);

    // A period wholly before the common era stays negative at both ends.
    const [bronzeAge] = extractTemporalClaims('Bronze Age round barrow');
    expect(bronzeAge?.startYear).toBeLessThan(0);
    expect(bronzeAge?.endYear).toBeLessThan(0);
  });

  it('never produces year zero', () => {
    for (const span of Object.values(PERIOD_SPANS)) {
      expect(span.start).not.toBe(0);
      expect(span.end).not.toBe(0);
    }
  });

  it('records how the years were reached, so a claim can be withdrawn', () => {
    const [claim] = extractTemporalClaims('Roman fort');
    expect(claim?.derivation).toContain('registry');
    expect(claim?.derivation).toContain('convention');
  });
});

describe('things that look like periods and are not', () => {
  it('does not make a Roman Catholic church Roman', () => {
    // 92 records in the Yorkshire region match /roman/; a good number are this.
    expect(extractTemporalClaims('ROMAN CATHOLIC CHURCH OF ST ANNE')).toEqual([]);
  });

  it('does not make an address a period', () => {
    expect(extractTemporalClaims('19 AND 21, ROMAN ROAD')).toEqual([]);
    expect(extractTemporalClaims('4, VICTORIA TERRACE')).toEqual([]);
  });

  it('does not make a surname a period', () => {
    expect(extractTemporalClaims('STATUE OF JAMES STUART 20 METRES SOUTH EAST')).toEqual([]);
  });

  it('does not make a house name a period', () => {
    // "Tudor Cottage" is, far more often than not, a Victorian house.
    expect(extractTemporalClaims('TUDOR COTTAGE')).toEqual([]);
    expect(extractTemporalClaims('SAXON LODGE')).toEqual([]);
    expect(extractTemporalClaims('THE GEORGIAN HOUSE AND ATTACHED RAILINGS')).toEqual([]);
  });

  it('requires a bare period word to be describing a monument', () => {
    // Without a monument noun, a lone period word in a building name is far
    // more likely decoration than a claim.
    expect(extractTemporalClaims('MEDIEVAL WAY')).toEqual([]);
    expect(extractTemporalClaims('medieval moated site')).not.toHaveLength(0);
  });

  it('accepts a bare period word from a descriptive source', () => {
    // Scheduled monument names are formal archaeological descriptions.
    expect(
      extractTemporalClaims('Bowes Roman fort and vicus', { descriptiveSource: true }),
    ).not.toHaveLength(0);
  });

  it('returns nothing rather than guessing', () => {
    expect(extractTemporalClaims('12, THE GREEN')).toEqual([]);
    expect(extractTemporalClaims('BARN AND ATTACHED STABLE')).toEqual([]);
    expect(extractTemporalClaims(null)).toEqual([]);
    expect(extractTemporalClaims('')).toEqual([]);
  });
});

describe('the registry matches the migrations', () => {
  /**
   * The registry as the database ends up holding it.
   *
   * Reading only the 0029 insert would compare against a value later migrations
   * have corrected — which is precisely how an Iron Age ending at 43 BC instead
   * of AD 42 survived a parity test that looked green.
   */
  const effectiveRegistry = (files: string[]) => {
    const registry = new Map<string, { start: number; end: number }>();
    for (const sql of files) {
      for (const m of sql.matchAll(/\('([a-z0-9_]+)',\s*'[^']*',\s*(-?\d+),\s*(-?\d+)/g)) {
        registry.set(m[1]!, { start: Number(m[2]), end: Number(m[3]) });
      }
      for (const m of sql.matchAll(
        /update public\.historical_periods\s+set\s+end_year\s*=\s*(-?\d+)[\s\S]*?where id = '([a-z0-9_]+)'/g,
      )) {
        const existing = registry.get(m[2]!);
        if (existing) registry.set(m[2]!, { start: existing.start, end: Number(m[1]) });
      }
    }
    return registry;
  };

  it('uses the same spans the database ends up with', () => {
    const files = ['0029_temporal_discovery.sql', '0034_iron_age_boundary.sql'].map((f) =>
      readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${f}`, import.meta.url)), 'utf8'),
    );
    const registry = effectiveRegistry(files);
    for (const [id, span] of Object.entries(PERIOD_SPANS)) {
      const row = registry.get(id);
      expect(row, `period ${id} missing from the migrations`).toBeDefined();
      expect(row!.start, `${id} start`).toBe(span.start);
      expect(row!.end, `${id} end`).toBe(span.end);
    }
  });

  it('leaves no year unclaimed between consecutive periods', () => {
    // Not hypothetical: an Iron Age ending at 43 BC when Roman Britain begins at
    // AD 43 left 84 years belonging to no period, invisible to every filter.
    const ids = Object.keys(PERIOD_SPANS);
    for (let i = 1; i < ids.length; i += 1) {
      const previous = PERIOD_SPANS[ids[i - 1]!]!;
      const current = PERIOD_SPANS[ids[i]!]!;
      expect(current.start, `${ids[i]} should start where ${ids[i - 1]} ends`).toBe(previous.end + 1);
    }
  });
});
