/**
 * Análise do mês baseada em fatos — tudo calculado aqui; a tela só mostra.
 *
 * - Gasto por categoria: pela data da despesa (compras no cartão pela data da
 *   compra, fixos previstos incluídos, pagamento de fatura fora) — mesmo
 *   critério dos Orçamentos. Mês em andamento conta o pago + o previsto até o fim.
 * - Comprometimento da renda (fórmula escolhida pelo João em 26/09/2026):
 *   (fixos + parcelas + faturas que vencem no mês) ÷ receitas do mês,
 *   pelo fluxo de caixa. Fixos e parcelas no cartão já estão dentro da fatura,
 *   por isso só entram os que saem direto da conta (nada conta duas vezes).
 */
import { invoiceItemsForMonth } from './cards';
import { monthOf, shiftMonth, type DateISO, type MonthKey } from './dates';
import { spendByCategory } from './planning';
import { itemsForMonth } from './recurrence';
import { cashItemsForMonth } from './summary';
import type { CreditCard, Recurrence, Transaction } from './types';

interface State {
  transactions: Transaction[];
  recurrences: Recurrence[];
  cards: CreditCard[];
}

export interface CategoryChange {
  categoryId: string | null;
  currentCents: number;
  previousCents: number;
  deltaCents: number;
  /** variação em % sobre o mês anterior; null quando o anterior foi zero (gasto novo) */
  deltaPct: number | null;
}

export interface MonthComparison {
  month: MonthKey;
  previous: MonthKey;
  expenseCents: number;
  previousExpenseCents: number;
  incomeCents: number;
  previousIncomeCents: number;
  /** todas as categorias que tiveram gasto em algum dos dois meses, maior variação primeiro */
  categories: CategoryChange[];
  increases: CategoryChange[];
  decreases: CategoryChange[];
}

function incomeOf(month: MonthKey, s: State, today: DateISO): number {
  return cashItemsForMonth(month, s.transactions, s.recurrences, s.cards, today)
    .filter((i) => i.type === 'income')
    .reduce((t, i) => t + i.amountCents, 0);
}

export function compareMonths(month: MonthKey, s: State, today: DateISO, top = 3): MonthComparison {
  const previous = shiftMonth(month, -1);
  const cur = new Map(spendByCategory(month, s.transactions, s.recurrences).map((c) => [c.categoryId, c.totalCents]));
  const prev = new Map(spendByCategory(previous, s.transactions, s.recurrences).map((c) => [c.categoryId, c.totalCents]));
  const keys = new Set([...cur.keys(), ...prev.keys()]);
  const categories: CategoryChange[] = [...keys].map((k) => {
    const c = cur.get(k) ?? 0;
    const p = prev.get(k) ?? 0;
    return { categoryId: k, currentCents: c, previousCents: p, deltaCents: c - p, deltaPct: p > 0 ? Math.round(((c - p) / p) * 1000) / 10 : null };
  });
  categories.sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents));
  const sum = (m: Map<string | null, number>) => [...m.values()].reduce((t, v) => t + v, 0);
  return {
    month,
    previous,
    expenseCents: sum(cur),
    previousExpenseCents: sum(prev),
    incomeCents: incomeOf(month, s, today),
    previousIncomeCents: incomeOf(previous, s, today),
    categories,
    increases: categories.filter((c) => c.deltaCents > 0).slice(0, top),
    decreases: categories.filter((c) => c.deltaCents < 0).slice(0, top),
  };
}

export interface IncomeCommitment {
  incomeCents: number;
  fixedCents: number;
  installmentsCents: number;
  invoicesCents: number;
  committedCents: number;
  /** 0..n (1 = 100% da renda); null sem receita no mês */
  ratio: number | null;
}

export function incomeCommitment(month: MonthKey, s: State, today: DateISO): IncomeCommitment {
  const items = cashItemsForMonth(month, s.transactions, s.recurrences, s.cards, today);
  let income = 0, fixed = 0, inst = 0, inv = 0;
  for (const it of items) {
    if (it.type === 'income') {
      income += it.amountCents;
      continue;
    }
    if (it.invoice || it.invoicePayment) inv += it.amountCents; // fatura (o que falta + o que já foi pago)
    else if (it.cardId) continue; // compra no cartão: está dentro da fatura
    else if (it.recurrenceId) fixed += it.amountCents;
    else if (it.installmentTotal) inst += it.amountCents;
  }
  const committed = fixed + inst + inv;
  return { incomeCents: income, fixedCents: fixed, installmentsCents: inst, invoicesCents: inv, committedCents: committed, ratio: income > 0 ? committed / income : null };
}

/** Despesas fixas do mês (todas as recorrências de despesa, na conta ou no cartão). */
export function fixedExpenses(month: MonthKey, s: State): { count: number; totalCents: number } {
  const items = itemsForMonth(month, s.transactions, s.recurrences).filter((i) => i.type === 'expense' && !!i.recurrenceId);
  return { count: items.length, totalCents: items.reduce((t, i) => t + i.amountCents, 0) };
}

export interface FutureInstallments {
  /** parcelas que ainda vão vencer depois deste mês */
  count: number;
  totalCents: number;
  /** último mês com parcela (null se não há) */
  lastMonth: MonthKey | null;
}

export function futureInstallments(month: MonthKey, s: State): FutureInstallments {
  let count = 0, total = 0;
  let last: MonthKey | null = null;
  for (const t of s.transactions) {
    if (t.deletedAt || !t.installmentTotal || t.type !== 'expense') continue;
    // no cartão vale o mês da fatura; na conta, a data (e só o que não foi pago)
    const m = t.cardId ? t.invoiceMonth ?? monthOf(t.date) : monthOf(t.date);
    if (m <= month || (!t.cardId && t.paid)) continue;
    count++;
    total += t.amountCents;
    if (!last || m > last) last = m;
  }
  return { count, totalCents: total, lastMonth: last };
}

export interface NextInvoice {
  cardId: string;
  description: string;
  dueDate: DateISO;
  amountCents: number;
}

/** Próxima fatura em aberto (de qualquer cartão), a partir de hoje. */
export function nextInvoice(s: State, today: DateISO): NextInvoice | null {
  const found: NextInvoice[] = [];
  for (let i = 0, m = monthOf(today); i < 3; i++, m = shiftMonth(m, 1)) {
    for (const it of invoiceItemsForMonth(m, { cards: s.cards, transactions: s.transactions, recurrences: s.recurrences }, today)) {
      if (it.date >= today && it.cardId) found.push({ cardId: it.cardId, description: it.description, dueDate: it.date, amountCents: it.amountCents });
    }
    if (found.length) break;
  }
  found.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  return found[0] ?? null;
}
