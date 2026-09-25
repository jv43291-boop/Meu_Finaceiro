import * as Crypto from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { applyChanges, loadAll, seedIfEmpty, upsertAccount, upsertCategory, type Snapshot } from '@/db/repo';
import { currentMonthKey, type MonthKey } from '@/domain/dates';
import { importLegacy, parseLegacy, type ImportResult } from '@/domain/legacyImport';
import {
  createEntry, deleteItem, editItem, endRecurrence, togglePaid,
  type Changes, type Ctx, type EntryInput, type EntryPatch, type Repeat,
} from '@/domain/operations';
import { virtualItem, type Scope } from '@/domain/recurrence';
import type { Account, Category, ListItem, Recurrence } from '@/domain/types';

export const ctx: Ctx = {
  newId: () => Crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

interface FinanceValue extends Snapshot {
  ready: boolean;
  error: string | null;
  selectedMonth: MonthKey;
  setSelectedMonth: (m: MonthKey) => void;
  accountById: Map<string, Account>;
  categoryById: Map<string, Category>;
  defaultAccountId: string | null;
  create: (input: EntryInput, repeat: Repeat) => Promise<void>;
  edit: (item: ListItem, patch: EntryPatch, scope: Scope) => Promise<void>;
  toggle: (item: ListItem) => Promise<void>;
  remove: (item: ListItem, scope: Scope) => Promise<void>;
  endRule: (rule: Recurrence, lastMonth: MonthKey) => Promise<void>;
  saveRule: (rule: Recurrence) => Promise<void>;
  deleteRule: (rule: Recurrence) => Promise<void>;
  saveAccount: (a: Account) => Promise<void>;
  saveCategory: (c: Category) => Promise<void>;
  importOldApp: (raw: unknown) => Promise<ImportResult>;
}

const FinanceContext = createContext<FinanceValue | null>(null);

const EMPTY: Snapshot = { accounts: [], categories: [], recurrences: [], transactions: [] };

export function FinanceProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(() => currentMonthKey());

  const reload = useCallback(async () => {
    setSnap(await loadAll(db));
  }, [db]);

  useEffect(() => {
    (async () => {
      try {
        await seedIfEmpty(db, ctx.newId, ctx.now());
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setReady(true);
      }
    })();
  }, [db, reload]);

  const commit = useCallback(
    async (changes: Changes, extra?: { categories?: Category[] }) => {
      if (!changes.transactions.length && !changes.recurrences.length && !extra?.categories?.length) return;
      await applyChanges(db, changes, extra);
      await reload();
    },
    [db, reload],
  );

  const value = useMemo<FinanceValue>(() => {
    const state = { transactions: snap.transactions, recurrences: snap.recurrences };
    const active = snap.accounts.filter((a) => !a.archived);
    return {
      ...snap,
      ready,
      error,
      selectedMonth,
      setSelectedMonth,
      accountById: new Map(snap.accounts.map((a) => [a.id, a])),
      categoryById: new Map(snap.categories.map((c) => [c.id, c])),
      defaultAccountId: active[0]?.id ?? snap.accounts[0]?.id ?? null,
      create: (input, repeat) => commit(createEntry(ctx, input, repeat)),
      edit: (item, patch, scope) => commit(editItem(ctx, state, item, patch, scope)),
      toggle: (item) => commit(togglePaid(ctx, state, item)),
      remove: (item, scope) => commit(deleteItem(ctx, state, item, scope)),
      endRule: (rule, lastMonth) => commit(endRecurrence(ctx, rule, lastMonth)),
      saveRule: (rule) => commit({ transactions: [], recurrences: [{ ...rule, updatedAt: ctx.now() }] }),
      deleteRule: (rule) => commit(deleteItem(ctx, state, virtualItem(rule, rule.startMonth), 'all')),
      saveAccount: async (a) => {
        await upsertAccount(db, a);
        await reload();
      },
      saveCategory: async (c) => {
        await upsertCategory(db, c);
        await reload();
      },
      importOldApp: async (raw) => {
        const result = importLegacy(ctx, parseLegacy(raw), snap.categories, active[0]?.id ?? null);
        await commit(
          { transactions: result.transactions, recurrences: result.recurrences },
          { categories: result.newCategories },
        );
        return result;
      },
    };
  }, [snap, ready, error, selectedMonth, commit, db, reload]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceValue {
  const v = useContext(FinanceContext);
  if (!v) throw new Error('useFinance precisa estar dentro de FinanceProvider');
  return v;
}
