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
    accent: string;
    accentSoft: string;
    accentStrong: string;
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
};

const shared = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
};

const light: MobileTheme = {
  mode: 'light',
  colors: {
    background: '#f4f1eb',
    surface: '#fffdf9',
    surfaceRaised: '#ffffff',
    surfaceMuted: '#ebe7df',
    text: '#17211f',
    textMuted: '#5a6561',
    textFaint: '#7a837f',
    border: '#d9d6cd',
    accent: '#1e625a',
    accentSoft: '#dcece7',
    accentStrong: '#164c46',
    mapWater: '#d9e8e8',
    mapLand: '#edf0e8',
    success: '#2f7d6f',
    warning: '#b97816',
    danger: '#a74638',
    white: '#ffffff',
  },
  ...shared,
};

const dark: MobileTheme = {
  mode: 'dark',
  colors: {
    background: '#101918',
    surface: '#172321',
    surfaceRaised: '#1d2b28',
    surfaceMuted: '#263531',
    text: '#eff4ef',
    textMuted: '#b6c3bc',
    textFaint: '#87968f',
    border: '#344740',
    accent: '#83c8b7',
    accentSoft: '#254941',
    accentStrong: '#b4e4d8',
    mapWater: '#183335',
    mapLand: '#28342e',
    success: '#7fc7a1',
    warning: '#edbc61',
    danger: '#ee9385',
    white: '#ffffff',
  },
  ...shared,
};

export function useMobileTheme(): MobileTheme {
  return useColorScheme() === 'dark' ? dark : light;
}

export function formatDistance(miles: number | null | undefined): string | null {
  if (miles === null || miles === undefined) return null;
  if (miles < 0.1) return 'Nearby';
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi away`;
}

