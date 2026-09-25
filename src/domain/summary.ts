import { currentMonthKey, monthDiff, shiftMonth, todayISO, type DateISO, type MonthKey } from './dates';
import { invoiceItemsForMonth, isCardPurchase } from './cards';
import { itemsForMonth } from './recurrence';
import type { Account, CreditCard, ListItem, Recurrence, Transaction } from './types';

/**
 * Itens do fluxo de caixa de um mês: lançamentos e recorrências das contas,
 * mais as faturas de cartão que vencem no mês. Compras no cartão ficam de fora
 * (elas aparecem dentro da fatura).
 */
export function cashItemsForMonth(month: MonthKey, transactions: Transaction[], rules: Recurrence[], cards: CreditCard[] = [], today: DateISO = todayISO()): ListItem[] {
  const base = itemsForMonth(month, transactions, rules).filter((i) => !isCardPurchase(i));
  const invoices = cards.length ? invoiceItemsForMonth(month, { cards, transactions, recurrences: rules }, today) : [];
  return [...base, ...invoices].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.type === b.type ? 0 : a.type === 'income' ? -1 : 1));
}

export interface MonthSummary {
  income: number;
  incomeReceived: number;
  expense: number;
  expensePaid: number;
  /** receitas - despesas do mês (tudo, pago ou não) */
  result: number;
}

export function summarizeItems(items: ListItem[]): MonthSummary {
  let income = 0, incomeReceived = 0, expense = 0, expensePaid = 0;
  for (const it of items) {
    if (it.type === 'income') {
      income += it.amountCents;
      if (it.paid) incomeReceived += it.amountCents;
    } else {
      expense += it.amountCents;
      if (it.paid) expensePaid += it.amountCents;
    }
  }
  return { income, incomeReceived, expense, expensePaid, result: income - expense };
}

const signed = (type: 'income' | 'expense', cents: number) => (type === 'income' ? cents : -cents);

/** Saldo de cada conta = saldo inicial + tudo que já foi pago/recebido nela. */
export function accountBalances(accounts: Account[], transactions: Transaction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of accounts) if (!a.deletedAt) map.set(a.id, a.openingBalanceCents);
  for (const t of transactions) {
    if (t.deletedAt || !t.paid || !t.accountId || !map.has(t.accountId)) continue;
    if (t.cardId && !t.invoicePayment) continue; // compra no cartão não sai da conta
    map.set(t.accountId, (map.get(t.accountId) ?? 0) + signed(t.type, t.amountCents));
  }
  return map;
}

export function totalBalance(accounts: Account[], transactions: Transaction[]): number {
  let total = 0;
  for (const v of accountBalances(accounts, transactions).values()) total += v;
  return total;
}

export interface Overview {
  balance: number;
  /** tudo que ainda não foi pago/recebido até o fim do mês alvo (inclui atrasados) */
  pendingIncome: number;
  pendingExpense: number;
  /** saldo previsto ao fim do mês alvo */
  forecast: number;
  overdue: ListItem[];
  upcoming: ListItem[];
}

/**
 * Visão geral para a tela inicial.
 * Pendências contam desde o início do histórico: se o salário de setembro
 * não foi marcado como recebido, ele aparece como atrasado.
 */
export function overview(
  accounts: Account[],
  transactions: Transaction[],
  rules: Recurrence[],
  opts: { today?: DateISO; month?: MonthKey; upcomingDays?: number; cards?: CreditCard[] } = {},
): Overview {
  const today = opts.today ?? todayISO();
  const month = opts.month ?? currentMonthKey(new Date(today + 'T12:00:00'));
  const horizon = shiftMonth(today.slice(0, 7), opts.upcomingDays ? 1 : 0);
  const cards = opts.cards ?? [];
  const balance = totalBalance(accounts, transactions);

  const earliest = earliestMonth(transactions, rules) ?? month;
  const lastMonth = monthDiff(month, horizon) > 0 ? horizon : month;
  const pending: ListItem[] = [];
  // mês a mês, do começo do histórico até o horizonte (limite de segurança: 10 anos)
  for (let m = earliest, n = 0; monthDiff(m, lastMonth) >= 0 && n < 120; m = shiftMonth(m, 1), n++) {
    for (const it of cashItemsForMonth(m, transactions, rules, cards, today)) if (!it.paid) pending.push(it);
  }

  let pendingIncome = 0, pendingExpense = 0;
  for (const p of pending) {
    if (monthDiff(p.date.slice(0, 7), month) < 0) continue;
    if (p.type === 'income') pendingIncome += p.amountCents;
    else pendingExpense += p.amountCents;
  }

  const upcomingLimit = addDaysISO(today, opts.upcomingDays ?? 7);
  const overdue = pending.filter((p) => p.date < today).sort(byDate);
  const upcoming = pending.filter((p) => p.date >= today && p.date <= upcomingLimit).sort(byDate);

  return {
    balance,
    pendingIncome,
    pendingExpense,
    forecast: balance + pendingIncome - pendingExpense,
    overdue,
    upcoming,
  };
}

export function monthSummary(month: MonthKey, transactions: Transaction[], rules: Recurrence[], cards: CreditCard[] = []): MonthSummary {
  return summarizeItems(cashItemsForMonth(month, transactions, rules, cards));
}

function earliestMonth(transactions: Transaction[], rules: Recurrence[]): MonthKey | null {
  let min: string | null = null;
  for (const t of transactions) if (!t.deletedAt && (!min || t.date < min)) min = t.date;
  for (const r of rules) if (!r.deletedAt && (!min || r.startMonth + '-01' < min)) min = r.startMonth + '-01';
  return min ? min.slice(0, 7) : null;
}

const byDate = (a: ListItem, b: ListItem) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

function addDaysISO(date: DateISO, days: number): DateISO {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
