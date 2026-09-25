import type { Session } from '@supabase/supabase-js';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getMeta, setMeta } from '@/db/repo';
import { SYNC_USER_KEY, createLocalStore, markAllDirty, resetSyncCursors } from '@/db/syncStore';
import { syncOnce } from '@/sync/engine';
import { cloudConfigured, createRemoteStore, fetchLegacyBackup, supabase } from '@/sync/supabase';
import { onLocalChange } from './events';
import { useFinance } from './finance';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

interface CloudValue {
  configured: boolean;
  session: Session | null;
  email: string | null;
  status: SyncStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  /** backup do Meu Financeiro 1.0 encontrado na conta, ainda não importado */
  legacyBackup: unknown | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  dismissLegacy: () => Promise<void>;
}

const CloudContext = createContext<CloudValue | null>(null);

const LOCAL_CHANGE_DEBOUNCE_MS = 3_000;
const PERIODIC_MS = 5 * 60_000;
const legacyKey = (uid: string) => `legacy_checked:${uid}`;

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Confirme o e-mail pelo link que o Supabase enviou e tente de novo.';
  if (/User already registered/i.test(msg)) return 'Já existe uma conta com esse e-mail. Use “Entrar”.';
  if (/Password should be/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/Network request failed|Failed to fetch|fetch failed/i.test(msg)) return 'Sem conexão com a internet. Seus dados continuam salvos no celular.';
  if (/credit_cards|card_id|invoice_month|invoice_payment/i.test(msg) && /column|table|schema cache|does not exist|Could not find/i.test(msg))
    return 'O Supabase ainda não tem as tabelas de cartão. Rode a migração 20260926000000_live_cards.sql no SQL Editor.';
  if (/relation .* does not exist|Could not find the table/i.test(msg)) return 'As tabelas do Live ainda não existem no Supabase. Rode a migração em supabase/migrations.';
  return msg;
}

export function CloudProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { reload } = useFinance();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>(cloudConfigured ? 'idle' : 'off');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [legacyBackup, setLegacyBackup] = useState<unknown | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getMeta(db, 'last_sync_at').then(setLastSyncAt).catch(() => undefined);
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [db]);

  const syncNow = useCallback(async () => {
    if (!supabase || !session) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      do {
        again.current = false;
        const result = await syncOnce(createLocalStore(db), createRemoteStore(supabase));
        if (result.changedLocally > 0) await reload();
      } while (again.current);
      const now = new Date().toISOString();
      await setMeta(db, 'last_sync_at', now);
      setLastSyncAt(now);
      setLastError(null);
      setStatus('idle');
    } catch (e) {
      setLastError(friendly(e));
      setStatus('error');
    } finally {
      running.current = false;
    }
  }, [db, session, reload]);

  // ao entrar numa conta: prepara o aparelho e procura o backup do app antigo
  useEffect(() => {
    const uid = session?.user.id;
    if (!supabase || !uid) return;
    let cancelled = false;
    (async () => {
      const owner = await getMeta(db, SYNC_USER_KEY);
      if (owner !== uid) {
        // primeira vez desta conta neste aparelho: sobe tudo o que existe aqui
        await resetSyncCursors(db);
        await markAllDirty(db);
        await setMeta(db, SYNC_USER_KEY, uid);
      }
      if (cancelled) return;
      await syncNow();
      if ((await getMeta(db, legacyKey(uid))) !== '1') {
        const payload = await fetchLegacyBackup(supabase!);
        if (!cancelled) {
          if (payload) setLegacyBackup(payload);
          else await setMeta(db, legacyKey(uid), '1');
        }
      }
    })().catch((e) => {
      setLastError(friendly(e));
      setStatus('error');
    });
    return () => {
      cancelled = true;
    };
    // syncNow muda a cada render da sessão; o efeito só deve rodar quando o usuário muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, session?.user.id]);

  // gatilhos: alteração local (com espera), app volta para frente, e a cada 5 minutos
  useEffect(() => {
    if (!session) return;
    const offChange = onLocalChange(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void syncNow(), LOCAL_CHANGE_DEBOUNCE_MS);
    });
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void syncNow();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void syncNow();
    }, PERIODIC_MS);
    return () => {
      offChange();
      appSub.remove();
      clearInterval(interval);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [session, syncNow]);

  const value = useMemo<CloudValue>(
    () => ({
      configured: cloudConfigured,
      session,
      email: session?.user.email ?? null,
      status: !cloudConfigured ? 'off' : status,
      lastSyncAt,
      lastError,
      legacyBackup,
      async signIn(email, password) {
        if (!supabase) throw new Error('Nuvem não configurada.');
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(friendly(error));
      },
      async signUp(email, password) {
        if (!supabase) throw new Error('Nuvem não configurada.');
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw new Error(friendly(error));
        return { needsConfirmation: !data.session };
      },
      async signOut() {
        if (!supabase) return;
        await supabase.auth.signOut();
        setLegacyBackup(null);
      },
      syncNow,
      async dismissLegacy() {
        const uid = session?.user.id;
        if (uid) await setMeta(db, legacyKey(uid), '1');
        setLegacyBackup(null);
      },
    }),
    [session, status, lastSyncAt, lastError, legacyBackup, syncNow, db],
  );

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}

export function useCloud(): CloudValue {
  const v = useContext(CloudContext);
  if (!v) throw new Error('useCloud precisa estar dentro de CloudProvider');
  return v;
}
