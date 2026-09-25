/**
 * Importa os dados do app antigo (formato "@meu-financeiro/state-v2",
 * o mesmo JSON salvo em finance_backups.payload no Supabase).
 *
 * Conversão:
 * - grupo de lançamentos marcados como "recorrente" -> uma regra de recorrência
 *   com início e fim; as ocorrências pagas viram lançamentos da regra.
 * - lançamento "recorrente" sem grupo -> regra sem data de fim (era o bug do
 *   app antigo: a flag existia, mas os meses seguintes nunca apareciam).
 * - grupo com parcelas -> lançamentos parcelados.
 * - o resto -> lançamento simples.
 */
import { dayOf, monthDiff, monthOf, type MonthKey } from './dates';
import { reaisToCents } from './money';
import type { Ctx } from './operations';
import type { Category, EntryType, Recurrence, Transaction } from './types';

export interface LegacyEntry {
  id?: string;
  type: EntryType;
  description?: string;
  value: number;
  category?: string;
  month?: string;
  dueDate?: string;
  paid?: boolean;
  recurring?: boolean;
  notes?: string;
  groupId?: string;
  installmentCurrent?: number;
  installmentTotal?: number;
  createdAt?: string;
}

export interface LegacyState {
  version?: number;
  entries: LegacyEntry[];
  budgets?: unknown[];
  closedMonths?: unknown[];
}

export interface ImportResult {
  transactions: Transaction[];
  recurrences: Recurrence[];
  newCategories: Category[];
  stats: { entries: number; transactions: number; recurrences: number; skipped: number };
}

/** Aceita o JSON do app antigo direto, ou a linha da tabela { payload: {...} }. */
export function parseLegacy(raw: unknown): LegacyState {
  let data: any = raw;
  if (typeof data === 'string') data = JSON.parse(data);
  if (Array.isArray(data)) data = data[0];
  if (data && typeof data === 'object' && 'payload' in data) data = data.payload;
  if (typeof data === 'string') data = JSON.parse(data);
  if (Array.isArray(data)) return { entries: data };
  if (!data || !Array.isArray(data.entries)) {
    throw new Error('Arquivo não reconhecido: não encontrei a lista "entries" do app antigo.');
  }
  return data as LegacyState;
}

function validEntry(e: LegacyEntry): boolean {
  return (
    (e.type === 'income' || e.type === 'expense') &&
    typeof e.value === 'number' &&
    Number.isFinite(e.value) &&
    typeof (e.dueDate ?? e.month) === 'string'
  );
}

function entryDate(e: LegacyEntry): string {
  if (e.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(e.dueDate)) return e.dueDate;
  return `${(e.month ?? '').slice(0, 7)}-01`;
}

export function importLegacy(
  ctx: Ctx,
  state: LegacyState,
  categories: Category[],
  defaultAccountId: string | null,
): ImportResult {
  const now = ctx.now();
  const newCategories: Category[] = [];
  const catIndex = new Map<string, string>();
  for (const c of categories) if (!c.deletedAt) catIndex.set(`${c.type}:${c.name.toLowerCase()}`, c.id);

  const categoryFor = (type: EntryType, name: string | undefined): string | null => {
    const n = (name ?? 'Outros').trim() || 'Outros';
    const key = `${type}:${n.toLowerCase()}`;
    const found = catIndex.get(key);
    if (found) return found;
    const cat: Category = {
      id: ctx.newId(), createdAt: now, updatedAt: now, deletedAt: null,
      name: n, type, icon: 'tag-outline', color: '#8A9491', archived: false, budgetCents: null,
    };
    newCategories.push(cat);
    catIndex.set(key, cat.id);
    return cat.id;
  };

  const txBase = (e: LegacyEntry): Transaction => ({
    id: ctx.newId(),
    createdAt: e.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    type: e.type,
    description: (e.description ?? '').trim().replace(/\.$/, '') || 'Sem descrição',
    amountCents: reaisToCents(e.value),
    date: entryDate(e),
    paid: Boolean(e.paid),
    categoryId: categoryFor(e.type, e.category),
    accountId: defaultAccountId,
    notes: (e.notes ?? '').trim(),
    recurrenceId: null,
    occurrenceMonth: null,
    groupId: null,
    installmentNumber: null,
    installmentTotal: null,
    cardId: null,
    invoiceMonth: null,
    invoicePayment: false,
  });

  const makeRule = (first: LegacyEntry, start: MonthKey, end: MonthKey | null): Recurrence => ({
    id: ctx.newId(),
    createdAt: first.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    type: first.type,
    description: (first.description ?? '').trim().replace(/\.$/, '') || 'Sem descrição',
    amountCents: reaisToCents(first.value),
    categoryId: categoryFor(first.type, first.category),
    accountId: defaultAccountId,
    day: dayOf(entryDate(first)),
    startMonth: start,
    endMonth: end,
    notes: (first.notes ?? '').trim(),
    cardId: null,
  });

  const transactions: Transaction[] = [];
  const recurrences: Recurrence[] = [];
  let skipped = 0;

  const valid = state.entries.filter((e) => {
    const ok = validEntry(e);
    if (!ok) skipped++;
    return ok;
  });

  const groups = new Map<string, LegacyEntry[]>();
  const singles: LegacyEntry[] = [];
  for (const e of valid) {
    if (e.groupId) {
      const g = groups.get(e.groupId) ?? [];
      g.push(e);
      groups.set(e.groupId, g);
    } else singles.push(e);
  }

  for (const [, list] of groups) {
    list.sort((a, b) => (entryDate(a) < entryDate(b) ? -1 : 1));
    const first = list[0];
    const isInstallments = list.some((e) => e.installmentTotal);
    const sameValue = list.every((e) => e.value === first.value && e.type === first.type);

    if (!isInstallments && list.some((e) => e.recurring) && sameValue) {
      const start = monthOf(entryDate(first));
      const end = monthOf(entryDate(list[list.length - 1]));
      const rule = makeRule(first, start, end);
      recurrences.push(rule);
      for (const e of list) {
        const month = monthOf(entryDate(e));
        const t = txBase(e);
        t.recurrenceId = rule.id;
        t.occurrenceMonth = month;
        // pagas viram histórico; pendentes idênticas à regra ficam virtuais
        const differs = t.date !== `${month}-${String(rule.day).padStart(2, '0')}` || t.notes !== rule.notes;
        if (e.paid || differs) transactions.push(t);
      }
      continue;
    }

    const groupId = ctx.newId();
    list.forEach((e, i) => {
      const t = txBase(e);
      t.groupId = groupId;
      t.installmentNumber = e.installmentCurrent ?? i + 1;
      t.installmentTotal = e.installmentTotal ?? list.length;
      transactions.push(t);
    });
  }

  for (const e of singles) {
    if (e.recurring) {
      const start = monthOf(entryDate(e));
      const rule = makeRule(e, start, null);
      recurrences.push(rule);
      if (e.paid) {
        const t = txBase(e);
        t.recurrenceId = rule.id;
        t.occurrenceMonth = start;
        transactions.push(t);
      }
    } else {
      transactions.push(txBase(e));
    }
  }

  return {
    transactions,
    recurrences,
    newCategories,
    stats: { entries: state.entries.length, transactions: transactions.length, recurrences: recurrences.length, skipped },
  };
}

/** Uma regra importada que termina antes de começar não faz sentido — usada nos testes. */
export function isSaneRule(r: Recurrence): boolean {
  return !r.endMonth || monthDiff(r.startMonth, r.endMonth) >= 0;
}
