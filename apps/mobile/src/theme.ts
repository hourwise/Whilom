import { useColorScheme } from 'react-native';

export type MobileTheme = {
  mode: 'light' | 'dark';
  colors: {
    background: string;
    surface: string;
    surfaceRaised: string;
    surfaceMuted: string;
    text: string;
    textMuted: string;
    textFaint: string;
    border: string;
    stone: string;
    accent: string;
    accentSoft: string;
    accentStrong: string;
    burgundy: string;
    bronze: string;
    mapWater: string;
    mapLand: string;
    success: string;
    warning: string;
    danger: string;
    white: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    pill: number;
  };
  borders: {
    hairline: number;
    standard: number;
    focus: number;
  };
  controls: {
    touchTarget: number;
    compactTarget: number;
    fieldHeight: number;
    searchHeight: number;
  };
  typography: {
    /** Temporary platform fallback until EB Garamond/Public Sans are packaged. */
    editorial: string;
    ui: string | undefined;
    roles: {
      display: { fontSize: number; lineHeight: number };
      heading: { fontSize: number; lineHeight: number };
      body: { fontSize: number; lineHeight: number };
      metadata: { fontSize: number; lineHeight: number };
      label: { fontSize: number; lineHeight: number };
    };
  };
};

const shared = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 4, md: 8, lg: 8, pill: 999 },
  borders: { hairline: 0.5, standard: 1, focus: 2 },
  controls: { touchTarget: 44, compactTarget: 40, fieldHeight: 48, searchHeight: 52 },
  typography: {
    roles: {
      display: { fontSize: 28, lineHeight: 32 },
      heading: { fontSize: 18, lineHeight: 22 },
      body: { fontSize: 14, lineHeight: 21 },
      metadata: { fontSize: 11, lineHeight: 16 },
      label: { fontSize: 10, lineHeight: 14 },
    },
  },
};

const light: MobileTheme = {
  mode: 'light',
  colors: {
    background: '#fbf9f4',
    surface: '#f5f3ee',
    surfaceRaised: '#ffffff',
    surfaceMuted: '#eae8e3',
    text: '#1b1c19',
    textMuted: '#5d625e',
    textFaint: '#788079',
    border: '#cfd0c9',
    stone: '#5d625e',
    accent: '#173124',
    accentSoft: '#dce5dc',
    accentStrong: '#2d4739',
    burgundy: '#914948',
    bronze: '#b97816',
    mapWater: '#d9e8e8',
    mapLand: '#edf0e8',
    success: '#2f7d6f',
    warning: '#b97816',
    danger: '#a74638',
    white: '#ffffff',
  },
  ...shared,
  typography: { editorial: 'Georgia', ui: undefined, ...shared.typography },
};

const dark: MobileTheme = {
  mode: 'dark',
  colors: {
    background: '#121a15',
    surface: '#1b261f',
    surfaceRaised: '#223028',
    surfaceMuted: '#2b382f',
    text: '#f2f1e9',
    textMuted: '#b8c0b8',
    textFaint: '#8a968d',
    border: '#3c4b40',
    stone: '#b8c0b8',
    accent: '#b8d6c0',
    accentSoft: '#2d4739',
    accentStrong: '#d8eadb',
    burgundy: '#d08c8b',
    bronze: '#edbc61',
    mapWater: '#183335',
    mapLand: '#28342e',
    success: '#7fc7a1',
    warning: '#edbc61',
    danger: '#ee9385',
    white: '#ffffff',
  },
  ...shared,
  typography: { editorial: 'Georgia', ui: undefined, ...shared.typography },
};

export function useMobileTheme(): MobileTheme {
  return useColorScheme() === 'dark' ? dark : light;
}

export function formatDistance(miles: number | null | undefined): string | null {
  if (miles === null || miles === undefined) return null;
  if (miles < 0.1) return 'Nearby';
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi away`;
}
