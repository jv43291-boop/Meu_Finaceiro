import { useSQLiteContext } from 'expo-sqlite';
import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { getMeta, setMeta } from '@/db/repo';

const light = {
  background: '#F3F1EA',
  surface: '#FFFEFA',
  surfaceAlt: '#ECE9DF',
  text: '#172524',
  muted: '#5F6E6B',
  border: '#E6E3DA',
  primary: '#17B890',
  primaryDark: '#087F67',
  primarySoft: '#DDF7EF',
  navy: '#102A2A',
  onNavy: '#FFFFFF',
  income: '#0F7D62',
  expense: '#C23F3F',
  warning: '#9A5B00',
  warningSoft: '#FCEFD6',
  danger: '#C94747',
  overlay: 'rgba(16, 42, 42, 0.45)',
};

const dark: typeof light = {
  background: '#0D1716',
  surface: '#152221',
  surfaceAlt: '#1D2C2A',
  text: '#E9F0EE',
  muted: '#9AA9A6',
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
export type ThemePreference = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

const THEME_KEY = 'theme';

interface ThemeValue {
  preference: ThemePreference;
  scheme: Scheme;
  colors: Colors;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function isPreference(v: unknown): v is ThemePreference {
  return v === 'system' || v === 'light' || v === 'dark';
}

/**
 * Guarda a escolha de tema (Automático, Claro, Escuro) no banco local
 * e aplica também nos componentes nativos (Switch, alertas, teclado).
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    getMeta(db, THEME_KEY)
      .then((v) => { if (isPreference(v)) setPref(v); })
      .catch(() => undefined);
  }, [db]);

  useEffect(() => {
    Appearance.setColorScheme?.(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  const scheme: Scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const colors = scheme === 'dark' ? dark : light;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  const setPreference = useCallback(
    (p: ThemePreference) => {
      setPref(p);
      setMeta(db, THEME_KEY, p).catch(() => undefined);
    },
    [db],
  );

  const value = useMemo(() => ({ preference, scheme, colors, setPreference }), [preference, scheme, colors, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useAppTheme precisa estar dentro de AppThemeProvider');
  return v;
}

/** Cores do tema atual. Fora do provider (ex.: tela de erro inicial) segue o celular. */
export function useColors(): Colors {
  const v = useContext(ThemeContext);
  const system = useColorScheme();
  if (v) return v.colors;
  return system === 'dark' ? dark : light;
}
