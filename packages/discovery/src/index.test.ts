import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATE,
  DISPLAY_CATEGORIES,
  PERIODS,
  TIME_MODES,
  buildMapPlacesArgs,
  cellDegreesForZoom,
  coverageMessage,
  formatPeriodSpan,
  formatYear,
  paramsFromState,
  stateFromParams,
} from './index';

describe('shared discovery vocabulary', () => {
  it('uses one ordered period registry with no year zero', () => {
    expect(PERIODS.length).toBe(20);
    expect(PERIODS.some((period) => period.id === 'prehistory')).toBe(false);
    expect(PERIODS[0]!.startYear).toBeLessThan(-100_000);
    expect(PERIODS.at(-1)!.endYear).toBe(2100);
    expect(PERIODS.every((period) => period.startYear !== 0 && period.endYear !== 0)).toBe(true);
  });

  it('formats signed years with the Whilom BCE/CE convention', () => {
    expect(formatYear(-800)).toBe('800 BC');
    expect(formatYear(43)).toBe('AD 43');
    expect(formatPeriodSpan(PERIODS.find((period) => period.id === 'iron_age')!)).toBe('800 BC – AD 42');
  });

  it('round-trips shareable state and preserves restrictive semantics', () => {
    const state = { ...DEFAULT_STATE, q: 'York', periodId: 'medieval', timeMode: TIME_MODES.At, selectedYear: 1400, categories: ['religious'] };
    expect(stateFromParams(paramsFromState(state))).toMatchObject(state);
    expect(buildMapPlacesArgs({ bounds: { swLng: -2, swLat: 53, neLng: -1, neLat: 55 }, state }).selected_year).toBe(1400);
    expect(buildMapPlacesArgs({ bounds: { swLng: -2, swLat: 53, neLng: -1, neLat: 55 }, state: DEFAULT_STATE }).selected_year).toBeUndefined();
  });

  it('keeps the ten semantic categories symbolically distinct', () => {
    expect(DISPLAY_CATEGORIES).toHaveLength(10);
    expect(new Set(DISPLAY_CATEGORIES.map((category) => category.symbol)).size).toBe(10);
  });

  it('uses truthful coverage language', () => {
    expect(coverageMessage({ covered_fraction: 0, region_ids: [], region_names: [] })?.text).toMatch(/plenty of history/);
    expect(coverageMessage({ covered_fraction: 0.5, region_ids: ['yorkshire'], region_names: ['Yorkshire'] })?.level).toBe('partial');
    expect(coverageMessage({ covered_fraction: 1, region_ids: ['yorkshire'], region_names: ['Yorkshire'] })).toBeNull();
  });

  it('keeps the bounded cluster cell policy portable', () => {
    expect(cellDegreesForZoom(6)).toBeGreaterThan(cellDegreesForZoom(14));
  });
});
