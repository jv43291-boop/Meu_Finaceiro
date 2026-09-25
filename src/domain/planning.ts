/**
 * Orçamentos, metas e números dos relatórios.
 *
 * Gastos do mês (para orçamento e relatório por categoria) contam pela data
 * da despesa — inclusive compras no cartão, pela data da compra, e as
 * recorrências previstas. Pagamento de fatura NÃO entra (senão contaria duas
 * vezes). Receitas x despesas por mês usa o fluxo de caixa (faturas no vencimento).
 */
import { daysInMonth, dayOf, monthDiff, monthOf, shiftMonth, type DateISO, type MonthKey } from './dates';
import { itemsForMonth } from './recurrence';
import { cashItemsForMonth } from './summary';
import type { Category, CreditCard, Goal, ListItem, Recurrence, Transaction } from './types';

export function spendingItems(month: MonthKey, transactions: Transaction[], rules: Recurrence[]): ListItem[] {
  return itemsForMonth(month, transactions, rules).filter((i) => i.type === 'expense' && !i.invoicePayment && !i.invoice);
}

export interface CategorySpend {
  categoryId: string | null;
  /** tudo do mês, pago ou previsto */
  totalCents: number;
  /** já pago (ou comprado no cartão) */
  spentCents: number;
  count: number;
}

export function spendByCategory(month: MonthKey, transactions: Transaction[], rules: Recurrence[]): CategorySpend[] {
  const map = new Map<string | null, CategorySpend>();
  for (const it of spendingItems(month, transactions, rules)) {
    const k = it.categoryId;
    const cur = map.get(k) ?? { categoryId: k, totalCents: 0, spentCents: 0, count: 0 };
    cur.totalCents += it.amountCents;
    if (it.paid || (it.cardId && !it.virtual)) cur.spentCents += it.amountCents;
    cur.count++;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
}

export type BudgetLevel = 'ok' | 'warn' | 'over';

export interface BudgetLine {
  category: Category;
  budgetCents: number;
  /** gasto até agora (pago/comprado) */
  spentCents: number;
  /** gasto + previsto para o resto do mês */
  plannedCents: number;
  /** fração do orçamento já usada pelo previsto (0..n) */
  ratio: number;
  level: BudgetLevel;
  remainingCents: number;
}

/** Aviso a partir de 80% do orçamento; estourado acima de 100%. */
export function budgetLevel(ratio: number): BudgetLevel {
  if (ratio > 1) return 'over';
  if (ratio >= 0.8) return 'warn';
  return 'ok';
}

export function budgetLines(month: MonthKey, categories: Category[], transactions: Transaction[], rules: Recurrence[]): BudgetLine[] {
  const spend = new Map(spendByCategory(month, transactions, rules).map((s) => [s.categoryId, s]));
  const out: BudgetLine[] = [];
  for (const c of categories) {
    if (c.deletedAt || c.type !== 'expense' || !c.budgetCents || c.budgetCents <= 0) continue;
    const s = spend.get(c.id);
    const planned = s?.totalCents ?? 0;
    const ratio = planned / c.budgetCents;
    out.push({
      category: c,
      budgetCents: c.budgetCents,
      spentCents: s?.spentCents ?? 0,
      plannedCents: planned,
      ratio,
      level: budgetLevel(ratio),
      remainingCents: c.budgetCents - planned,
    });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

export interface BudgetTotals {
  budgetCents: number;
  plannedCents: number;
  over: number;
  warn: number;
}

export function budgetTotals(lines: BudgetLine[]): BudgetTotals {
  return lines.reduce<BudgetTotals>(
    (t, l) => ({
      budgetCents: t.budgetCents + l.budgetCents,
      plannedCents: t.plannedCents + l.plannedCents,
      over: t.over + (l.level === 'over' ? 1 : 0),
      warn: t.warn + (l.level === 'warn' ? 1 : 0),
    }),
    { budgetCents: 0, plannedCents: 0, over: 0, warn: 0 },
  );
}

export interface MonthPoint {
  month: MonthKey;
  incomeCents: number;
  expenseCents: number;
}

/** Receitas e despesas (fluxo de caixa) dos últimos `count` meses até `end`, inclusive. */
export function monthlySeries(end: MonthKey, count: number, transactions: Transaction[], rules: Recurrence[], cards: CreditCard[], today: DateISO): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = shiftMonth(end, -i);
    let inc = 0, exp = 0;
    for (const it of cashItemsForMonth(m, transactions, rules, cards, today)) {
      if (it.type === 'income') inc += it.amountCents;
      else exp += it.amountCents;
    }
    out.push({ month: m, incomeCents: inc, expenseCents: exp });
  }
  return out;
}

export interface GoalPlan {
  pct: number;
  remainingCents: number;
  done: boolean;
  /** meses até a data-alvo, contando o atual; null sem data */
  monthsLeft: number | null;
  /** quanto guardar por mês para chegar na data */
  perMonthCents: number | null;
  late: boolean;
}

export function goalPlan(goal: Goal, today: DateISO): GoalPlan {
  const remaining = Math.max(0, goal.targetCents - goal.savedCents);
  const done = remaining === 0 && goal.targetCents > 0;
  const pct = goal.targetCents > 0 ? Math.min(1, goal.savedCents / goal.targetCents) : 0;
  if (!goal.targetDate) return { pct, remainingCents: remaining, done, monthsLeft: null, perMonthCents: null, late: false };
  const late = !done && goal.targetDate < today;
  // conta o mês atual inteiro: guardar este mês ainda ajuda
  const months = Math.max(1, monthDiff(monthOf(today), monthOf(goal.targetDate)) + 1);
  const per = done ? 0 : Math.ceil(remaining / months);
  return { pct, remainingCents: remaining, done, monthsLeft: late ? 0 : months, perMonthCents: late ? remaining : per, late };
}

/** Quanto do mês já passou (0..1), para comparar com o ritmo de gasto. */
export function monthProgress(month: MonthKey, today: DateISO): number {
  if (monthOf(today) > month) return 1;
  if (monthOf(today) < month) return 0;
  return dayOf(today) / daysInMonth(month);
}
