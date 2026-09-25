import { useColorScheme } from 'react-native';

/** Paleta herdada do app antigo (verde + navy), com versão escura. */
const light = {
  background: '#F3F1EA',
  surface: '#FFFEFA',
  surfaceAlt: '#ECE9DF',
  text: '#172524',
  muted: '#71807D',
  border: '#E6E3DA',
  primary: '#17B890',
  primaryDark: '#087F67',
  primarySoft: '#DDF7EF',
  navy: '#102A2A',
  onNavy: '#FFFFFF',
  income: '#128C6E',
  expense: '#C94747',
  warning: '#B97809',
  warningSoft: '#FCEFD6',
  danger: '#DC5A5A',
  overlay: 'rgba(16, 42, 42, 0.45)',
};

const dark: typeof light = {
  background: '#0D1716',
  surface: '#152221',
  surfaceAlt: '#1D2C2A',
  text: '#E9F0EE',
  muted: '#93A29F',
  border: '#26403C',
  primary: '#2BCDA1',
  primaryDark: '#6FE3C3',
  primarySoft: '#123A31',
  navy: '#1A3533',
  onNavy: '#FFFFFF',
  income: '#4AD3A6',
  expense: '#FF8A80',
  warning: '#F0B54A',
  warningSoft: '#3A2C10',
  danger: '#FF8A80',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
