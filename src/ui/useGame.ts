/**
 * Estado do modo gamer: calcula XP/nível/missões a partir dos dados e guarda,
 * no aparelho, só os check-ins "Hoje não gastei" e o que já foi comemorado.
 */
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getMeta, setMeta } from '@/db/repo';
import { todayISO, type DateISO } from '@/domain/dates';
import { gameState, type GameState } from '@/domain/gamification';
import { onDeviceReset } from '@/state/events';
import { useFinance } from '@/state/finance';

const CHECKINS_KEY = 'gamer_checkins';
const SEEN_KEY = 'gamer_seen';

export interface Seen {
  level: number;
  badges: string[];
}

function parseList(raw: string | null): DateISO[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  } catch {
    return [];
  }
}

export function parseSeen(raw: string | null): Seen | null {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v.level !== 'number' || !Array.isArray(v.badges)) return null;
    return { level: v.level, badges: v.badges.filter((b: unknown) => typeof b === 'string') };
  } catch {
    return null;
  }
}

export function useGame(): { game: GameState; checkIn: () => Promise<void>; seen: Seen | null | undefined; markSeen: (s: Seen) => Promise<void> } {
  const db = useSQLiteContext();
  const { transactions, recurrences, categories, goals, cards } = useFinance();
  const [checkins, setCheckins] = useState<DateISO[]>([]);
  // undefined = ainda carregando; null = nunca viu (primeira vez no modo gamer)
  const [seen, setSeen] = useState<Seen | null | undefined>(undefined);
  const today = todayISO();

  useEffect(() => {
    getMeta(db, CHECKINS_KEY).then((v) => setCheckins(parseList(v))).catch(() => undefined);
    getMeta(db, SEEN_KEY).then((v) => setSeen(parseSeen(v))).catch(() => setSeen(null));
  }, [db]);

  useEffect(() => onDeviceReset(() => { setCheckins([]); setSeen(null); }), []);

  const game = useMemo(
    () => gameState({ transactions, recurrences, categories, goals, cards, checkins, today }),
    [transactions, recurrences, categories, goals, cards, checkins, today],
  );

  const checkIn = useCallback(async () => {
    const next = [...new Set([...checkins, today])].sort().slice(-400);
    setCheckins(next);
    await setMeta(db, CHECKINS_KEY, JSON.stringify(next)).catch(() => undefined);
  }, [db, checkins, today]);

  const markSeen = useCallback(async (s: Seen) => {
    setSeen(s);
    await setMeta(db, SEEN_KEY, JSON.stringify(s)).catch(() => undefined);
  }, [db]);

  return { game, checkIn, seen, markSeen };
}
