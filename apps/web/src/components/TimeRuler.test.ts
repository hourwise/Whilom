import { describe, expect, it } from 'vitest';
import { EARLIEST_YEAR, LATEST_YEAR, fractionToYear, yearToFraction } from './TimeRuler';
import { PERIODS, formatYear } from '@/lib/discovery';

/**
 * The ruler has to be usable and honest at the same time, which is harder than
 * it sounds: real time is unusable as a straight line when the Palaeolithic is
 * 890,000 years and the First World War is four.
 */

describe('the ruler covers the whole of history it claims to', () => {
  it('starts in deep prehistory and ends in the present', () => {
    expect(EARLIEST_YEAR).toBeLessThan(-100_000);
    expect(LATEST_YEAR).toBeGreaterThanOrEqual(2100);
  });

  it('maps the ends of the axis to the ends of the ruler', () => {
    expect(yearToFraction(EARLIEST_YEAR)).toBe(0);
    expect(yearToFraction(LATEST_YEAR)).toBe(1);
  });

  it('clamps rather than running off either end', () => {
    expect(yearToFraction(-5_000_000)).toBe(0);
    expect(yearToFraction(9999)).toBe(1);
  });
});

describe('the axis is monotonic', () => {
  it('never moves backwards, however it is compressed', () => {
    // The axis is piecewise so that the last millennium is reachable, but a
    // later year must always sit further right or the control is a lie.
    const years = [-900_000, -10_000, -4_000, -800, -43, 43, 410, 1066, 1485, 1837, 1939, 2000];
    for (let i = 1; i < years.length; i += 1) {
      expect(yearToFraction(years[i]!)).toBeGreaterThan(yearToFraction(years[i - 1]!));
    }
  });

  it('gives the recent past enough room to be clickable', () => {
    // Everything since the Norman conquest is about 4% of real time. If the
    // ruler were linear it would be 4% of the width and unusable.
    const share = 1 - yearToFraction(1066);
    expect(share).toBeGreaterThan(0.25);
  });
});

describe('years round-trip', () => {
  it('returns roughly the year a position was taken from', () => {
    for (const year of [-2200, -800, 43, 1066, 1485, 1837, 1914, 1939, 1990]) {
      const back = fractionToYear(yearToFraction(year));
      // Within the period's own resolution: a pixel is worth several years in
      // the compressed stretches, and pretending otherwise would be false
      // precision in the control itself.
      expect(Math.abs(back - year)).toBeLessThan(Math.max(60, Math.abs(year) * 0.05));
    }
  });

  it('never returns year zero, because there is not one', () => {
    // Sweep the whole axis rather than spot-checking: zero must be unreachable.
    for (let i = 0; i <= 1000; i += 1) {
      expect(fractionToYear(i / 1000)).not.toBe(0);
    }
  });

  it('crosses the BCE/CE boundary without inventing a year', () => {
    const before = yearToFraction(-1);
    const after = yearToFraction(1);
    expect(after).toBeGreaterThan(before);
  });
});

describe('years are shown the way people write them', () => {
  it('never shows a negative number to the public', () => {
    for (const year of [-900_000, -2200, -800, -43, -2, -1]) {
      expect(formatYear(year)).not.toContain('-');
      expect(formatYear(year)).toMatch(/BC/);
    }
  });

  it('handles the four years either side of the boundary', () => {
    expect(formatYear(-2)).toBe('2 BC');
    expect(formatYear(-1)).toBe('1 BC');
    expect(formatYear(1)).toBe('AD 1');
    expect(formatYear(2)).toBe('AD 2');
  });

  it('drops the era marker once it is unambiguous', () => {
    expect(formatYear(1837)).toBe('1837');
    expect(formatYear(43)).toBe('AD 43');
  });
});

describe('epoch bands', () => {
  it('covers the ruler end to end with no gaps', () => {
    // A gap would be a stretch of history the user cannot click on.
    for (let i = 1; i < PERIODS.length; i += 1) {
      const previous = PERIODS[i - 1]!;
      const current = PERIODS[i]!;
      expect(current.startYear).toBe(previous.endYear + 1);
    }
  });

  it('places every period somewhere on the ruler', () => {
    for (const period of PERIODS) {
      const from = yearToFraction(period.startYear);
      const to = yearToFraction(period.endYear);
      expect(to).toBeGreaterThan(from);
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBeLessThanOrEqual(1);
    }
  });
});
