import type { Session } from '@supabase/supabase-js';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getMeta, seedIfEmpty, setMeta, wipeLocalData } from '@/db/repo';
import { SYNC_USER_KEY, countDirty, createLocalStore, discardLocal, listRejected, markAllDirty, resetSyncCursors, retryRejected, type RejectedItem } from '@/db/syncStore';
import { SyncError, syncOnce } from '@/sync/engine';
import { appClock } from '@/sync/clock';
import { cloudConfigured, createRemoteStore, fetchLegacyBackup, fetchRemoteRow, measureClockOffset, supabase } from '@/sync/supabase';
import { onLocalChange } from './events';
import { ctx, useFinance } from './finance';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

interface CloudValue {
  configured: boolean;
  session: Session | null;
  email: string | null;
  status: SyncStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  /** backup do Meu Financeiro 1.0 encontrado na conta, ainda não importado */
  legacyBackup: unknown | null;
  /** relógio do celular − hora real (ms); positivo = adiantado. null = ainda não medido */
  clockSkewMs: number | null;
  /** alterações deste celular ainda não enviadas (inclui as recusadas) */
  pending: number;
  /** registros que o servidor recusou; ficam de lado para não travar o resto */
  rejected: RejectedItem[];
  /** próxima tentativa automática depois de uma falha (ISO), ou null */
  nextRetryAt: string | null;
  retryRejected: (item: RejectedItem) => Promise<void>;
  /** joga fora a alteração local e fica com a versão da nuvem */
  discardRejected: (item: RejectedItem) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  /**
   * Envia o pendente e sai, apagando os dados deste celular.
   * Se sobrar algo sem enviar (sem internet), não sai e devolve quantos são;
   * chame de novo com force para sair mesmo assim.
   */
  signOut: (opts?: { force?: boolean }) => Promise<{ done: true } | { done: false; pending: number }>;
  syncNow: () => Promise<void>;
  dismissLegacy: () => Promise<void>;
}

const CloudContext = createContext<CloudValue | null>(null);

const LOCAL_CHANGE_DEBOUNCE_MS = 3_000;
const PERIODIC_MS = 5 * 60_000;
const legacyKey = (uid: string) => `legacy_checked:${uid}`;
/** depois de uma falha, tenta de novo em 30 s, 1, 2, 5, 10, 20 e depois a cada 30 min */
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000, 600_000, 1_200_000, 1_800_000];
const CLOCK_KEY = 'clock_offset_ms';

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Confirme o e-mail pelo link que o Supabase enviou e tente de novo.';
  if (/User already registered/i.test(msg)) return 'Já existe uma conta com esse e-mail. Use “Entrar”.';
  if (/Password should be/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/Network request failed|Failed to fetch|fetch failed/i.test(msg)) return 'Sem conexão com a internet. Seus dados continuam salvos no celular.';
  if (/payee_rules|external_id/i.test(msg) && /column|table|schema cache|does not exist|Could not find/i.test(msg))
    return 'O Supabase ainda não tem as tabelas do comprovante de Pix. Rode a migração 20260928000000_live_pix.sql no SQL Editor.';
  if (/goals|budget_cents/i.test(msg) && /column|table|schema cache|does not exist|Could not find/i.test(msg))
    return 'O Supabase ainda não tem as tabelas de orçamento e metas. Rode a migração 20260927000000_live_planning.sql no SQL Editor.';
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
  const [clockSkewMs, setClockSkewMs] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState<RejectedItem[]>([]);
  const [nextRetryAt, setNextRetryAt] = useState<string | null>(null);
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncRef = useRef<() => Promise<void>>(async () => undefined);
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getMeta(db, 'last_sync_at').then(setLastSyncAt).catch(() => undefined);
    // última diferença de relógio medida: já corrige as marcas antes do primeiro sync
    getMeta(db, CLOCK_KEY)
      .then((v) => {
        const ms = v === null ? NaN : Number(v);
        if (Number.isFinite(ms)) {
          appClock.setOffset(ms);
          setClockSkewMs(-ms);
        }
      })
      .catch(() => undefined);
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [db]);

  const refreshQueue = useCallback(async () => {
    try {
      setPending(await countDirty(db));
      setRejected(await listRejected(db));
    } catch {
      // só informativo
    }
  }, [db]);

  const scheduleRetry = useCallback((ok: boolean) => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    if (ok) {
      failures.current = 0;
      setNextRetryAt(null);
      return;
    }
    const delay = RETRY_DELAYS_MS[Math.min(failures.current, RETRY_DELAYS_MS.length - 1)];
    failures.current++;
    setNextRetryAt(new Date(Date.now() + delay).toISOString());
    retryTimer.current = setTimeout(() => void syncRef.current(), delay);
  }, []);

  const syncNow = useCallback(async () => {
    if (!supabase || !session) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      const offset = await measureClockOffset();
      if (offset !== null) {
        appClock.setOffset(offset);
        setClockSkewMs(-offset);
        await setMeta(db, CLOCK_KEY, String(Math.round(offset)));
      }
      do {
        again.current = false;
        const result = await syncOnce(createLocalStore(db), createRemoteStore(supabase, session.user.id));
        if (result.changedLocally > 0) await reload();
      } while (again.current);
      const now = new Date().toISOString();
      await setMeta(db, 'last_sync_at', now);
      setLastSyncAt(now);
      setLastError(null);
      setStatus('idle');
      scheduleRetry(true);
    } catch (e) {
      const offline = (e instanceof SyncError && e.kind === 'network') || /Network request failed|Failed to fetch|fetch failed/i.test(String(e));
      setLastError(offline ? null : friendly(e));
      setStatus(offline ? 'offline' : 'error');
      scheduleRetry(false);
    } finally {
      running.current = false;
      await refreshQueue();
    }
  }, [db, session, reload, refreshQueue, scheduleRetry]);

  useEffect(() => {
    syncRef.current = syncNow;
  }, [syncNow]);

  // contador de pendências atualizado a cada alteração local
  useEffect(() => {
    const first = setTimeout(() => void refreshQueue(), 0);
    const off = onLocalChange(() => void refreshQueue());
    return () => {
      clearTimeout(first);
      off();
    };
  }, [refreshQueue]);

  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  // ao entrar numa conta: prepara o aparelho e procura o backup do app antigo
  useEffect(() => {
    const uid = session?.user.id;
    if (!supabase || !uid) return;
    let cancelled = false;
    (async () => {
      const owner = await getMeta(db, SYNC_USER_KEY);
      if (owner && owner !== uid) {
        // o aparelho tem dados de OUTRA conta (ex.: versão antiga não apagava ao sair):
        // nunca misturar — apaga daqui e baixa os da conta que entrou
        await wipeLocalData(db);
        await seedIfEmpty(db, ctx.newId);
        await setMeta(db, SYNC_USER_KEY, uid);
        await reload();
      } else if (!owner) {
        // dados criados sem conta: sobem para a conta na primeira entrada
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
      clockSkewMs,
      pending,
      rejected,
      nextRetryAt,
      async retryRejected(item) {
        await retryRejected(db, item.table, item.id);
        await syncNow();
      },
      async discardRejected(item) {
        if (!supabase) return;
        const server = await fetchRemoteRow(supabase, item.table, item.id);
        await discardLocal(db, item.table, item.id, server);
        await reload();
        await refreshQueue();
      },
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
      async signOut(opts) {
        if (!supabase) return { done: true };
        if (!opts?.force) {
          await syncNow();
          const pending = await countDirty(db);
          if (pending > 0) return { done: false, pending };
        }
        await supabase.auth.signOut();
        setLegacyBackup(null);
        // os dados eram desta conta: não ficam no aparelho para a próxima pessoa
        await wipeLocalData(db);
        await seedIfEmpty(db, ctx.newId);
        await reload();
        setLastSyncAt(null);
        setLastError(null);
        scheduleRetry(true);
        await refreshQueue();
        return { done: true };
      },
      syncNow,
      async dismissLegacy() {
        const uid = session?.user.id;
        if (uid) await setMeta(db, legacyKey(uid), '1');
        setLegacyBackup(null);
      },
    }),
    [session, status, lastSyncAt, lastError, legacyBackup, clockSkewMs, pending, rejected, nextRetryAt, syncNow, db, reload, refreshQueue, scheduleRetry],
  );

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}

export function useCloud(): CloudValue {
  const v = useContext(CloudContext);
  if (!v) throw new Error('useCloud precisa estar dentro de CloudProvider');
  return v;
}
