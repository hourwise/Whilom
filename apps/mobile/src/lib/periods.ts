import { HistoricalPeriod } from '@whilom/domain';

export type MobileTimeMode = 'all' | 'at' | 'until' | 'from';

export const TIME_MODE_OPTIONS: ReadonlyArray<{ id: MobileTimeMode; label: string; hint: string }> = [
  { id: 'all', label: 'All time', hint: 'No date restriction' },
  { id: 'at', label: 'At this time', hint: 'Records spanning the selected year' },
  { id: 'until', label: 'Up to this time', hint: 'Records that had begun by then' },
  { id: 'from', label: 'From this time', hint: 'Records continuing after then' },
];

/**
 * Mobile presentation of the shared historical registry. These are filters,
 * not claims that every boundary was universal. The IDs intentionally track
 * the backend vocabulary wherever that vocabulary exists.
 */
export const MOBILE_PERIODS: ReadonlyArray<{
  id: string;
  label: string;
  startYear: number;
  endYear: number;
  sharedId?: HistoricalPeriod;
}> = [
  { id: 'palaeolithic', label: 'Palaeolithic', startYear: -900000, endYear: -10001 },
  { id: 'mesolithic', label: 'Mesolithic', startYear: -10000, endYear: -4001 },
  { id: 'neolithic', label: 'Neolithic', startYear: -4000, endYear: -2201 },
  { id: 'bronze_age', label: 'Bronze Age', startYear: -2200, endYear: -801 },
  { id: 'iron_age', label: 'Iron Age', startYear: -800, endYear: 42 },
  { id: HistoricalPeriod.Roman, label: 'Roman', startYear: 43, endYear: 409, sharedId: HistoricalPeriod.Roman },
  { id: HistoricalPeriod.EarlyMedieval, label: 'Early Medieval', startYear: 410, endYear: 1065, sharedId: HistoricalPeriod.EarlyMedieval },
  { id: 'norman', label: 'Norman', startYear: 1066, endYear: 1153 },
  { id: HistoricalPeriod.Medieval, label: 'Medieval', startYear: 1154, endYear: 1484, sharedId: HistoricalPeriod.Medieval },
  { id: HistoricalPeriod.Tudor, label: 'Tudor', startYear: 1485, endYear: 1602, sharedId: HistoricalPeriod.Tudor },
  { id: HistoricalPeriod.Stuart, label: 'Stuart', startYear: 1603, endYear: 1713, sharedId: HistoricalPeriod.Stuart },
  { id: HistoricalPeriod.Georgian, label: 'Georgian', startYear: 1714, endYear: 1836, sharedId: HistoricalPeriod.Georgian },
  { id: HistoricalPeriod.Victorian, label: 'Victorian', startYear: 1837, endYear: 1900, sharedId: HistoricalPeriod.Victorian },
  { id: HistoricalPeriod.Edwardian, label: 'Edwardian', startYear: 1901, endYear: 1913, sharedId: HistoricalPeriod.Edwardian },
  { id: HistoricalPeriod.WorldWarOne, label: 'First World War', startYear: 1914, endYear: 1918, sharedId: HistoricalPeriod.WorldWarOne },
  { id: 'interwar', label: 'Interwar', startYear: 1919, endYear: 1938 },
  { id: HistoricalPeriod.WorldWarTwo, label: 'Second World War', startYear: 1939, endYear: 1945, sharedId: HistoricalPeriod.WorldWarTwo },
  { id: 'postwar', label: 'Post-war', startYear: 1946, endYear: 1979 },
  { id: 'late_20th', label: 'Late 20th century', startYear: 1980, endYear: 1999 },
  { id: HistoricalPeriod.Modern, label: 'Today', startYear: 2000, endYear: 2100, sharedId: HistoricalPeriod.Modern },
];

export function formatHistoricalYear(year: number): string {
  if (year < 0) return `${Math.abs(year).toLocaleString('en-GB')} BC`;
  return `AD ${year}`;
}

