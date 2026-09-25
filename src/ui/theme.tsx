import { useSQLiteContext } from 'expo-sqlite';
import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { getMeta, setMeta } from '@/db/repo';

const light = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceAlt: '#ECEEF2',
  text: '#0E1116',
  muted: '#5B6472',
  border: '#E6E8EC',
  /** cor de destaque (violeta) — fundos de botão, herói, seleção */
  primary: '#5B45FF',
  /** destaque usado como TEXTO/ícone sobre fundo claro (contraste AA) */
  primaryText: '#4A34F0',
  primarySoft: '#ECE9FF',
  onPrimary: '#FFFFFF',
  hero: '#5B45FF',
  onHero: '#FFFFFF',
  heroMuted: 'rgba(255,255,255,0.82)',
  heroLine: 'rgba(255,255,255,0.22)',
  heroChip: 'rgba(255,255,255,0.18)',
  spark: '#C9FF4D',
  income: '#0A7A50',
  expense: '#C7362F',
  warning: '#9A5B00',
  warningSoft: '#FDF0D8',
  danger: '#C7362F',
  overlay: 'rgba(14, 17, 22, 0.45)',
  shadowOpacity: 0.07,
};

const dark: typeof light = {
  background: '#0B0D12',
  surface: '#161A21',
  surfaceAlt: '#1E232C',
  text: '#F2F4F7',
  muted: '#9AA3B2',
  border: '#232934',
  primary: '#6E5BFF',
  primaryText: '#A99BFF',
  primarySoft: '#221D4A',
  onPrimary: '#FFFFFF',
  hero: '#4B38E0',
  onHero: '#FFFFFF',
  heroMuted: 'rgba(255,255,255,0.8)',
  heroLine: 'rgba(255,255,255,0.2)',
  heroChip: 'rgba(255,255,255,0.16)',
  spark: '#C9FF4D',
  income: '#3FD69A',
  expense: '#FF8A80',
  warning: '#F5B84A',
  warningSoft: '#3A2C10',
  danger: '#FF8A80',
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadowOpacity: 0,
};

export type Colors = typeof light;
export type ThemePreference = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 22, xl: 26, pill: 999 } as const;

/** Plus Jakarta Sans por peso (fontes customizadas no Android não sintetizam negrito). */
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;
export type FontWeightName = keyof typeof fonts;

const THEME_KEY = 'theme';
const HIDE_KEY = 'hide_values';

interface ThemeValue {
  preference: ThemePreference;
  scheme: Scheme;
  colors: Colors;
  setPreference: (p: ThemePreference) => void;
  /** esconde os valores na tela (usar o app em público) */
  hideValues: boolean;
  toggleHideValues: () => void;
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
  const [hideValues, setHide] = useState(false);

  useEffect(() => {
    getMeta(db, THEME_KEY)
      .then((v) => { if (isPreference(v)) setPref(v); })
      .catch(() => undefined);
    getMeta(db, HIDE_KEY)
      .then((v) => setHide(v === '1'))
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

  const toggleHideValues = useCallback(() => {
    const next = !hideValues;
    setHide(next);
    setMeta(db, HIDE_KEY, next ? '1' : '0').catch(() => undefined);
  }, [db, hideValues]);

  const value = useMemo(
    () => ({ preference, scheme, colors, setPreference, hideValues, toggleHideValues }),
    [preference, scheme, colors, setPreference, hideValues, toggleHideValues],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useAppTheme precisa estar dentro de AppThemeProvider');
  return v;
}

/** Esconder valores; fora do provider nunca esconde. */
export function useHideValues(): boolean {
  return useContext(ThemeContext)?.hideValues ?? false;
}

/** Cores do tema atual. Fora do provider (ex.: tela de erro inicial) segue o celular. */
export function useColors(): Colors {
  const v = useContext(ThemeContext);
  const system = useColorScheme();
  if (v) return v.colors;
  return system === 'dark' ? dark : light;
}
