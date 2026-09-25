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
  /** par para gráficos receitas × despesas (validado para daltonismo nos dois temas) */
  chartIncome: '#2A9D8F',
  chartExpense: '#D9603F',
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
  chartIncome: '#2A9D8F',
  chartExpense: '#D9603F',
};

export type Colors = typeof light & {
  /** fundo das telas (sempre opaco; a foto, quando existe, é desenhada por cima dele em cada tela) */
  canvas: string;
  hasBackground: boolean;
};

/** Cores de destaque que a pessoa pode escolher. Todas com texto branco em contraste AA. */
export const ACCENTS = {
  violeta: {
    label: 'Violeta',
    light: { primary: '#5B45FF', primaryText: '#4A34F0', primarySoft: '#ECE9FF', hero: '#5B45FF' },
    dark: { primary: '#6E5BFF', primaryText: '#A99BFF', primarySoft: '#221D4A', hero: '#4B38E0' },
  },
  azul: {
    label: 'Azul',
    light: { primary: '#2563EB', primaryText: '#1D4ED8', primarySoft: '#E3ECFF', hero: '#2563EB' },
    dark: { primary: '#2F63E0', primaryText: '#9DB8FF', primarySoft: '#172746', hero: '#2A56D6' },
  },
  verde: {
    label: 'Verde',
    light: { primary: '#047857', primaryText: '#047857', primarySoft: '#DDF5EC', hero: '#047857' },
    dark: { primary: '#0B7A57', primaryText: '#5EE0A8', primarySoft: '#12352A', hero: '#0B6E4F' },
  },
  rosa: {
    label: 'Rosa',
    light: { primary: '#BE185D', primaryText: '#BE185D', primarySoft: '#FCE4EF', hero: '#BE185D' },
    dark: { primary: '#C42A6B', primaryText: '#F9A8D4', primarySoft: '#3D1528', hero: '#A3134F' },
  },
  laranja: {
    label: 'Laranja',
    light: { primary: '#C2410C', primaryText: '#C2410C', primarySoft: '#FDEBDD', hero: '#C2410C' },
    dark: { primary: '#C4470F', primaryText: '#FDBA8C', primarySoft: '#3D200F', hero: '#B23A0A' },
  },
} as const;
export type AccentName = keyof typeof ACCENTS;

/** Quanto a foto é escurecida/clareada por trás do conteúdo. */
export type BackgroundDim = 'soft' | 'medium' | 'strong';
export const DIM_ALPHA: Record<BackgroundDim, number> = { soft: 0.62, medium: 0.76, strong: 0.88 };

export interface BackgroundSettings {
  uri: string | null;
  dim: BackgroundDim;
  blur: boolean;
}
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
const ACCENT_KEY = 'accent';
const BG_KEY = 'background';

interface ThemeValue {
  preference: ThemePreference;
  scheme: Scheme;
  colors: Colors;
  setPreference: (p: ThemePreference) => void;
  /** esconde os valores na tela (usar o app em público) */
  hideValues: boolean;
  toggleHideValues: () => void;
  accent: AccentName;
  setAccent: (a: AccentName) => void;
  background: BackgroundSettings;
  setBackground: (b: BackgroundSettings) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

const DEFAULT_BG: BackgroundSettings = { uri: null, dim: 'medium', blur: false };

function parseBackground(raw: string | null): BackgroundSettings {
  if (!raw) return DEFAULT_BG;
  try {
    const v = JSON.parse(raw);
    return {
      uri: typeof v.uri === 'string' ? v.uri : null,
      dim: v.dim === 'soft' || v.dim === 'strong' ? v.dim : 'medium',
      blur: v.blur === true,
    };
  } catch {
    return DEFAULT_BG;
  }
}

export function buildColors(scheme: Scheme, accent: AccentName, hasBackground: boolean): Colors {
  const base = scheme === 'dark' ? dark : light;
  const a = ACCENTS[accent][scheme];
  return { ...base, ...a, canvas: base.background, hasBackground };
}

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
  const [accent, setAccentState] = useState<AccentName>('violeta');
  const [background, setBgState] = useState<BackgroundSettings>(DEFAULT_BG);

  useEffect(() => {
    getMeta(db, ACCENT_KEY)
      .then((v) => { if (v && v in ACCENTS) setAccentState(v as AccentName); })
      .catch(() => undefined);
    getMeta(db, BG_KEY)
      .then((v) => setBgState(parseBackground(v)))
      .catch(() => undefined);
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
  const colors = useMemo(() => buildColors(scheme, accent, !!background.uri), [scheme, accent, background.uri]);

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

  const setAccent = useCallback(
    (a: AccentName) => {
      setAccentState(a);
      setMeta(db, ACCENT_KEY, a).catch(() => undefined);
    },
    [db],
  );

  const setBackground = useCallback(
    (b: BackgroundSettings) => {
      setBgState(b);
      setMeta(db, BG_KEY, JSON.stringify(b)).catch(() => undefined);
    },
    [db],
  );

  const value = useMemo(
    () => ({ preference, scheme, colors, setPreference, hideValues, toggleHideValues, accent, setAccent, background, setBackground }),
    [preference, scheme, colors, setPreference, hideValues, toggleHideValues, accent, setAccent, background, setBackground],
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
  return buildColors(system === 'dark' ? 'dark' : 'light', 'violeta', false);
}
