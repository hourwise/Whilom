import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_STATE,
  DISCOVERY_MODES,
  MODE_TYPES,
  PERIODS,
  PLACE_ZOOM_THRESHOLD,
  cellDegreesForZoom,
  effectiveTypes,
  emptyStateMessage,
  formatPeriodSpan,
  formatYear,
  paramsFromState,
  periodById,
  stateFromParams,
} from './discovery';

describe('the period vocabulary', () => {
  it('reaches from prehistory to today', () => {
    expect(PERIODS[0]?.startYear).toBeLessThan(-100_000);
    expect(PERIODS.at(-1)?.endYear).toBeGreaterThanOrEqual(2100);
  });

  it('runs in order with no gaps between consecutive stops', () => {
    for (let i = 1; i < PERIODS.length; i += 1) {
      const previous = PERIODS[i - 1]!;
      const current = PERIODS[i]!;
      expect(current.startYear).toBeGreaterThan(previous.startYear);
    }
  });

  it('never uses year zero, which does not exist', () => {
    for (const period of PERIODS) {
      expect(period.startYear).not.toBe(0);
      expect(period.endYear).not.toBe(0);
    }
  });

  it('stays in step with the database registry', () => {
    // Drift here would mean the ruler offers boundaries the map does not use.
    // Both migrations are read: 0029 inserts the registry and 0034 corrects the
    // Iron Age boundary. Reading only the insert would compare against a value
    // the database no longer holds — which is exactly how that bug survived a
    // parity test that looked green.
    const files = ['0029_temporal_discovery.sql', '0034_iron_age_boundary.sql'].map((f) =>
      readFileSync(
        fileURLToPath(new URL(`../../../../supabase/migrations/${f}`, import.meta.url)),
        'utf8',
      ),
    );
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
    for (const period of PERIODS) {
      const row = registry.get(period.id);
      expect(row, `period ${period.id} is missing from the migrations`).toBeDefined();
      expect(row!.start, `${period.id} start`).toBe(period.startYear);
      expect(row!.end, `${period.id} end`).toBe(period.endYear);
    }
  });
});

describe('showing years to people', () => {
  it('writes BC rather than a minus sign', () => {
    expect(formatYear(-800)).toBe('800 BC');
    expect(formatYear(-43)).toBe('43 BC');
  });

  it('abbreviates deep prehistory rather than printing nine hundred thousand', () => {
    expect(formatYear(-900_000)).toBe('900,000 BC');
  });

  it('marks early CE years as AD, and leaves later ones bare', () => {
    expect(formatYear(43)).toBe('AD 43');
    expect(formatYear(1837)).toBe('1837');
  });

  it('spans a period across the BCE/CE boundary without a year zero', () => {
    const ironAge = periodById('iron_age')!;
    // The Iron Age ends the year before the Roman invasion of AD 43, so its
    // span genuinely crosses the boundary — and does so without a year zero.
    expect(formatPeriodSpan(ironAge)).toBe('800 BC – AD 42');
    const roman = periodById('roman')!;
    expect(formatPeriodSpan(roman)).toBe('AD 43 – AD 409');
  });
});

describe('shareable state', () => {
  it('round-trips through the URL', () => {
    const state = {
      ...DEFAULT_STATE,
      lng: -1.0805,
      lat: 53.9591,
      zoom: 13.5,
      periodId: 'medieval',
      q: 'york',
      mode: DISCOVERY_MODES.Archaeology,
      selected: 'clifford-s-tower',
    };
    const restored = stateFromParams(paramsFromState(state));
    expect(restored.periodId).toBe('medieval');
    expect(restored.q).toBe('york');
    expect(restored.mode).toBe(DISCOVERY_MODES.Archaeology);
    expect(restored.selected).toBe('clifford-s-tower');
    expect(restored.lat).toBeCloseTo(53.9591, 3);
  });

  it('writes only what differs from the default', () => {
    // A shared link should read as the thing it describes, not as every knob.
    const params = paramsFromState(DEFAULT_STATE);
    expect(params.has('mode')).toBe(false);
    expect(params.has('period')).toBe(false);
    expect(params.has('types')).toBe(false);
  });

  it('ignores a period id that is not in the registry', () => {
    expect(stateFromParams(new URLSearchParams('period=napoleonic')).periodId).toBeNull();
  });

  it('rejects year zero as a date-range bound', () => {
    const state = stateFromParams(new URLSearchParams('from=0&to=0'));
    expect(state.fromYear).toBeNull();
    expect(state.toYear).toBeNull();
  });

  it('keeps negative years, because prehistory is the point', () => {
    const state = stateFromParams(new URLSearchParams('from=-2200&to=-801'));
    expect(state.fromYear).toBe(-2200);
    expect(state.toYear).toBe(-801);
  });
});

describe('discovery modes', () => {
  it('defaults to everything historic', () => {
    // A product position: ordinary listed houses and bridges are most of what
    // is protected, and hiding them would make Whilom a guidebook.
    expect(DEFAULT_STATE.mode).toBe(DISCOVERY_MODES.Everything);
    expect(MODE_TYPES[DISCOVERY_MODES.Everything]).toBeNull();
    expect(effectiveTypes(DEFAULT_STATE)).toBeNull();
  });

  it('narrows to a type list for the other modes', () => {
    const types = effectiveTypes({ ...DEFAULT_STATE, mode: DISCOVERY_MODES.Archaeology });
    expect(types).toContain('archaeological_site');
    expect(types).not.toContain('church');
  });

  it('lets an explicit type choice override the mode', () => {
    const types = effectiveTypes({ ...DEFAULT_STATE, mode: DISCOVERY_MODES.Buildings, types: ['castle'] });
    expect(types).toEqual(['castle']);
  });

  it('offers no visitability mode, because there is no data for one', () => {
    // A listed building is not a visitor attraction, and inferring one from the
    // other would put a family in front of somebody's house.
    const modes: string[] = Object.values(DISCOVERY_MODES);
    expect(modes.some((m) => /visit/i.test(m))).toBe(false);
  });
});

describe('density', () => {
  it('asks for coarser cells the further out you are', () => {
    expect(cellDegreesForZoom(6)).toBeGreaterThan(cellDegreesForZoom(10));
    expect(cellDegreesForZoom(10)).toBeGreaterThan(cellDegreesForZoom(14));
  });

  it('switches to individual places only when zoomed in', () => {
    expect(DEFAULT_STATE.zoom).toBeLessThan(PLACE_ZOOM_THRESHOLD);
  });
});

describe('empty results are explained honestly', () => {
  it('never claims nothing existed here', () => {
    const message = emptyStateMessage({ ...DEFAULT_STATE, periodId: 'bronze_age' });
    expect(message.title).toContain('Bronze Age');
    // The distinction that matters: Whilom holding no record is not the same as
    // Yorkshire having been empty in the Bronze Age.
    expect(`${message.title} ${message.detail}`).not.toMatch(/nothing (existed|was here)/i);
    expect(message.detail).toMatch(/Whilom holds/i);
  });

  it('explains a date range separately from a period', () => {
    const message = emptyStateMessage({ ...DEFAULT_STATE, fromYear: -2200, toYear: -801 });
    expect(message.detail).toMatch(/not that nothing stood here/i);
  });

  it('explains a missing image differently again', () => {
    const message = emptyStateMessage({ ...DEFAULT_STATE, requireImage: true });
    expect(message.detail).toMatch(/credit/i);
  });

  it('says where Whilom actually has coverage when nothing else is filtered', () => {
    const message = emptyStateMessage(DEFAULT_STATE);
    expect(message.detail).toMatch(/Yorkshire/);
  });
});
