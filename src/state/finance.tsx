import * as Crypto from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { applyChanges, loadAll, seedIfEmpty, upsertAccount, upsertCard, upsertCategory, upsertGoal, upsertPayeeRule, type Snapshot } from '@/db/repo';
import { invoiceFor } from '@/domain/cards';
import { currentMonthKey, todayISO, type DateISO, type MonthKey } from '@/domain/dates';
import { emitLocalChange } from './events';
import { importLegacy, parseLegacy, type ImportResult } from '@/domain/legacyImport';
import {
  createEntry, deleteItem, editItem, endRecurrence, payInvoice, togglePaid,
  type Changes, type Ctx, type EntryInput, type EntryPatch, type Repeat,
} from '@/domain/operations';
import { virtualItem, type Scope } from '@/domain/recurrence';
import type { Account, Category, CreditCard, Goal, ListItem, PayeeRule, Recurrence } from '@/domain/types';

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
  cardById: Map<string, CreditCard>;
  saveGoal: (g: Goal) => Promise<void>;
  /** regra "Pix para FULANO = descrição" (excluir = salvar com deletedAt) */
  savePayeeRule: (p: PayeeRule) => Promise<void>;
  saveCard: (k: CreditCard) => Promise<void>;
  /** paga a fatura (ou o que falta dela) saindo da conta escolhida */
  payCardInvoice: (card: CreditCard, invoiceMonth: MonthKey, accountId: string | null, amountCents: number, date: DateISO) => Promise<void>;
  importOldApp: (raw: unknown) => Promise<ImportResult>;
  /** relê o banco (usado depois de baixar dados da nuvem) */
  reload: () => Promise<void>;
}

const FinanceContext = createContext<FinanceValue | null>(null);

const EMPTY: Snapshot = { accounts: [], categories: [], recurrences: [], transactions: [], cards: [], goals: [], payeeRules: [] };

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
      emitLocalChange();
    },
    [db, reload],
  );

  const value = useMemo<FinanceValue>(() => {
    const state = { transactions: snap.transactions, recurrences: snap.recurrences };
    const active = snap.accounts.filter((a) => !a.archived);
    const cardCategoryId = snap.categories.find((c) => c.type === 'expense' && c.name === 'Cartão')?.id ?? null;
    return {
      ...snap,
      ready,
      error,
      selectedMonth,
      setSelectedMonth,
      accountById: new Map(snap.accounts.map((a) => [a.id, a])),
      categoryById: new Map(snap.categories.map((c) => [c.id, c])),
      cardById: new Map(snap.cards.map((k) => [k.id, k])),
      defaultAccountId: active[0]?.id ?? snap.accounts[0]?.id ?? null,
      create: (input, repeat) => commit(createEntry(ctx, input, repeat)),
      edit: (item, patch, scope) => commit(editItem(ctx, state, item, patch, scope)),
      toggle: (item) => {
        if (item.invoice && item.cardId && item.invoiceMonth) {
          // tocar no círculo de uma fatura = pagar o que falta, pela conta do cartão, hoje
          const card = snap.cards.find((k) => k.id === item.cardId);
          if (!card) return Promise.resolve();
          const inv = invoiceFor(card, item.invoiceMonth, { cards: snap.cards, ...state }, todayISO());
          return commit(payInvoice(ctx, {
            cardId: card.id, cardName: card.name, invoiceMonth: item.invoiceMonth,
            accountId: card.accountId ?? active[0]?.id ?? null, amountCents: inv.totalCents, date: todayISO(),
            categoryId: cardCategoryId, existing: inv.payment ?? undefined,
          }));
        }
        return commit(togglePaid(ctx, state, item));
      },
      remove: (item, scope) => commit(deleteItem(ctx, state, item, scope)),
      endRule: (rule, lastMonth) => commit(endRecurrence(ctx, rule, lastMonth)),
      saveRule: (rule) => commit({ transactions: [], recurrences: [{ ...rule, updatedAt: ctx.now() }] }),
      deleteRule: (rule) => commit(deleteItem(ctx, state, virtualItem(rule, rule.startMonth), 'all')),
      saveAccount: async (a) => {
        await upsertAccount(db, a);
        await reload();
        emitLocalChange();
      },
      saveGoal: async (g) => {
        await upsertGoal(db, g);
        await reload();
        emitLocalChange();
      },
      savePayeeRule: async (p) => {
        await upsertPayeeRule(db, p);
        await reload();
        emitLocalChange();
      },
      saveCard: async (k) => {
        await upsertCard(db, k);
        await reload();
        emitLocalChange();
      },
      payCardInvoice: (card, invoiceMonth, accountId, amountCents, date) => {
        const inv = invoiceFor(card, invoiceMonth, { cards: snap.cards, ...state }, todayISO());
        return commit(payInvoice(ctx, {
          cardId: card.id, cardName: card.name, invoiceMonth, accountId, amountCents, date,
          categoryId: cardCategoryId, existing: inv.payment ?? undefined,
        }));
      },
      saveCategory: async (c) => {
        await upsertCategory(db, c);
        await reload();
        emitLocalChange();
      },
      reload,
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
