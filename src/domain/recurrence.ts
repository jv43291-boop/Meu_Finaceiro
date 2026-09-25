import { dateForDay, monthDiff, type MonthKey } from './dates';
import type { ListItem, Recurrence, Transaction } from './types';
import { virtualKey } from './types';

export function occursIn(rule: Recurrence, month: MonthKey): boolean {
  if (rule.deletedAt) return false;
  if (monthDiff(rule.startMonth, month) < 0) return false;
  if (rule.endMonth && monthDiff(month, rule.endMonth) < 0) return false;
  return true;
}

/** Índice "recorrência:mês" das ocorrências que já existem no banco (inclusive puladas). */
export function materializedIndex(transactions: Transaction[]): Set<string> {
  const set = new Set<string>();
  for (const t of transactions) {
    if (t.recurrenceId && t.occurrenceMonth) set.add(`${t.recurrenceId}:${t.occurrenceMonth}`);
  }
  return set;
}

export function transactionToItem(t: Transaction): ListItem {
  return {
    key: t.id,
    virtual: false,
    transactionId: t.id,
    recurrenceId: t.recurrenceId,
    occurrenceMonth: t.occurrenceMonth,
    type: t.type,
    description: t.description,
    amountCents: t.amountCents,
    date: t.date,
    paid: t.paid,
    categoryId: t.categoryId,
    accountId: t.accountId,
    notes: t.notes,
    installmentNumber: t.installmentNumber,
    installmentTotal: t.installmentTotal,
  };
}

export function virtualItem(rule: Recurrence, month: MonthKey): ListItem {
  return {
    key: virtualKey(rule.id, month),
    virtual: true,
    transactionId: null,
    recurrenceId: rule.id,
    occurrenceMonth: month,
    type: rule.type,
    description: rule.description,
    amountCents: rule.amountCents,
    date: dateForDay(month, rule.day),
    paid: false,
    categoryId: rule.categoryId,
    accountId: rule.accountId,
    notes: rule.notes,
    installmentNumber: null,
    installmentTotal: null,
  };
}

/**
 * Itens de um mês: lançamentos reais (não excluídos) + ocorrências projetadas
 * das recorrências que ainda não foram gravadas nem puladas.
 * `transactions` deve conter TODOS os registros, inclusive os com deletedAt,
 * porque uma ocorrência excluída marca o mês como "pulado".
 */
export function itemsForMonth(
  month: MonthKey,
  transactions: Transaction[],
  rules: Recurrence[],
  index: Set<string> = materializedIndex(transactions),
): ListItem[] {
  const items: ListItem[] = [];
  for (const t of transactions) {
    if (!t.deletedAt && t.date.startsWith(month)) items.push(transactionToItem(t));
  }
  for (const r of rules) {
    if (occursIn(r, month) && !index.has(`${r.id}:${month}`)) items.push(virtualItem(r, month));
  }
  return items.sort(compareItems);
}

/** Ocorrências virtuais de todos os meses entre `from` e `to` (inclusive). */
export function virtualBetween(
  from: MonthKey,
  to: MonthKey,
  transactions: Transaction[],
  rules: Recurrence[],
  index: Set<string> = materializedIndex(transactions),
): ListItem[] {
  const out: ListItem[] = [];
  for (const r of rules) {
    if (r.deletedAt) continue;
    let m = monthDiff(r.startMonth, from) > 0 ? from : r.startMonth;
    while (monthDiff(m, to) >= 0) {
      if (occursIn(r, m) && !index.has(`${r.id}:${m}`)) out.push(virtualItem(r, m));
      if (r.endMonth && monthDiff(m, r.endMonth) <= 0) break;
      m = monthKeyAdd(m, 1);
    }
  }
  return out;
}

function monthKeyAdd(m: MonthKey, n: number): MonthKey {
  const [y, mm] = m.split('-').map(Number);
  const total = y * 12 + (mm - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function compareItems(a: ListItem, b: ListItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
  return a.description.localeCompare(b.description, 'pt-BR');
}

/** Escopo de edição/exclusão de uma ocorrência de recorrência. */
export type Scope = 'this' | 'future' | 'all';
