/**
 * Analíticos — números da tela de gráficos. Tudo é calculado aqui; a tela só mostra.
 *
 * Mesmo critério dos Relatórios e Orçamentos:
 * - gasto = despesas pela data da despesa (cartão pela data da compra, fixos
 *   previstos incluídos), sem pagamento de fatura (senão contaria duas vezes);
 * - entradas = receitas pelo fluxo de caixa do mês.
 * Pontos de atenção e compras pequenas olham só o que já aconteceu
 * (lançamentos reais, sem as recorrências ainda só previstas).
 */
import { daysInMonth, dayOf, monthOf, shiftMonth, type DateISO, type MonthKey } from './dates';
import { normalizeName } from './payeeRules';
import { spendingItems } from './planning';
import { cashItemsForMonth } from './summary';
import type { CreditCard, ListItem, Recurrence, Transaction } from './types';

export interface InsightState {
  transactions: Transaction[];
  recurrences: Recurrence[];
  cards: CreditCard[];
}

/** Compra pequena: abaixo de R$ 25 (o "gasto por impulso" que o Live quer deixar visível). */
export const SMALL_PURCHASE_CENTS = 2500;

export interface ValuePoint {
  /** "1".."31", "2026-09" ou "2026" */
  key: string;
  label: string;
  cents: number;
}

export type Period = 'day' | 'month' | 'year';

const SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function sum(items: ListItem[]): number {
  return items.reduce((t, i) => t + i.amountCents, 0);
}

export function monthSpend(month: MonthKey, s: InsightState): number {
  return sum(spendingItems(month, s.transactions, s.recurrences));
}

export function monthIncome(month: MonthKey, s: InsightState, today: DateISO): number {
  return sum(cashItemsForMonth(month, s.transactions, s.recurrences, s.cards, today).filter((i) => i.type === 'income'));
}

/** Gasto de cada dia do mês (todos os dias, inclusive os zerados). */
export function spendByDay(month: MonthKey, s: InsightState): ValuePoint[] {
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => ({ key: String(i + 1), label: String(i + 1), cents: 0 }));
  for (const it of spendingItems(month, s.transactions, s.recurrences)) {
    if (monthOf(it.date) !== month) continue;
    days[dayOf(it.date) - 1].cents += it.amountCents;
  }
  return days;
}

/** Gasto de cada mês do ano (jan–dez). */
export function spendByMonth(year: number, s: InsightState): ValuePoint[] {
  return SHORT.map((label, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { key, label, cents: monthSpend(key, s) };
  });
}

/** Gasto de cada ano, dos `count` anos até `endYear`. */
export function spendByYear(endYear: number, count: number, s: InsightState): ValuePoint[] {
  const out: ValuePoint[] = [];
  for (let y = endYear - count + 1; y <= endYear; y++) {
    out.push({ key: String(y), label: String(y), cents: spendByMonth(y, s).reduce((t, p) => t + p.cents, 0) });
  }
  return out;
}

export interface PeriodSummary {
  period: Period;
  /** gasto do período */
  spendCents: number;
  /** gasto do período anterior equivalente (mês anterior, ano anterior...) */
  previousSpendCents: number;
  /** variação sobre o anterior, em %; null quando o anterior foi zero */
  deltaPct: number | null;
  incomeCents: number;
  /** entradas − gasto */
  leftCents: number;
  /** quanto das entradas sobrou (0..1); null sem entradas */
  savingRatio: number | null;
}

function monthsOfYear(year: number): MonthKey[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * Resumo do período escolhido:
 * - dia → o mês selecionado (comparado com o mês anterior);
 * - mês/ano → o ano do mês selecionado (comparado com o ano anterior).
 */
export function periodSummary(period: Period, month: MonthKey, s: InsightState, today: DateISO): PeriodSummary {
  const year = Number(month.slice(0, 4));
  const months = period === 'day' ? [month] : monthsOfYear(year);
  const prevMonths = period === 'day' ? [shiftMonth(month, -1)] : monthsOfYear(year - 1);
  const spend = months.reduce((t, m) => t + monthSpend(m, s), 0);
  const prev = prevMonths.reduce((t, m) => t + monthSpend(m, s), 0);
  const income = months.reduce((t, m) => t + monthIncome(m, s, today), 0);
  return {
    period,
    spendCents: spend,
    previousSpendCents: prev,
    deltaPct: prev > 0 ? Math.round(((spend - prev) / prev) * 100) : null,
    incomeCents: income,
    leftCents: income - spend,
    savingRatio: income > 0 ? (income - spend) / income : null,
  };
}

/** Só o que já aconteceu no mês: lançamentos reais de despesa (sem previstos). */
function realSpending(month: MonthKey, s: InsightState): ListItem[] {
  return spendingItems(month, s.transactions, s.recurrences).filter((i) => !i.virtual);
}

export interface PayeeTotal {
  key: string;
  /** como aparece no lançamento (já com a regra de recebedor aplicada) */
  label: string;
  cents: number;
  count: number;
}

/** "Para onde vai o dinheiro": gasto agrupado pela descrição do lançamento. */
export function topPayees(month: MonthKey, s: InsightState, limit = 5): PayeeTotal[] {
  const map = new Map<string, PayeeTotal>();
  for (const it of realSpending(month, s)) {
    const key = normalizeName(it.description) || '(sem descrição)';
    const cur = map.get(key) ?? { key, label: it.description.trim() || 'Sem descrição', cents: 0, count: 0 };
    cur.cents += it.amountCents;
    cur.count++;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents || b.count - a.count).slice(0, limit);
}

export interface SmallPurchases {
  count: number;
  cents: number;
  /** total de saídas reais no mês, para "8 de 10" */
  totalCount: number;
  thresholdCents: number;
}

export function smallPurchases(month: MonthKey, s: InsightState, thresholdCents = SMALL_PURCHASE_CENTS): SmallPurchases {
  const items = realSpending(month, s);
  const small = items.filter((i) => i.amountCents < thresholdCents);
  return { count: small.length, cents: sum(small), totalCount: items.length, thresholdCents };
}

export type AttentionLevel = 'critical' | 'warning' | 'good';

export interface AttentionPoint {
  id: string;
  level: AttentionLevel;
  title: string;
  detail: string;
}

/**
 * Pontos de atenção do mês, mais grave primeiro.
 * - mesmo recebedor 2+ vezes no mesmo dia (ex.: corridas de app);
 * - um único dia com 30% ou mais do gasto do mês (com pelo menos 3 dias de gasto);
 * - gastos sem categoria;
 * - quanto sobrou das entradas (bom) ou se gastou mais do que entrou (grave).
 * Os valores vão em centavos no `detail` já formatados por `fmt`.
 */
export function attentionPoints(month: MonthKey, s: InsightState, today: DateISO, fmt: (cents: number) => string): AttentionPoint[] {
  const out: AttentionPoint[] = [];
  const items = realSpending(month, s);
  const monthTotal = monthSpend(month, s);
  const ddmm = (d: DateISO) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

  // mesmo recebedor várias vezes no mesmo dia
  const sameDay = new Map<string, { label: string; date: DateISO; count: number; cents: number }>();
  for (const it of items) {
    const k = `${it.date}|${normalizeName(it.description)}`;
    const cur = sameDay.get(k) ?? { label: it.description.trim() || 'Sem descrição', date: it.date, count: 0, cents: 0 };
    cur.count++;
    cur.cents += it.amountCents;
    sameDay.set(k, cur);
  }
  const repeated = [...sameDay.values()].filter((x) => x.count >= 2).sort((a, b) => b.cents - a.cents);
  for (const r of repeated.slice(0, 2)) {
    out.push({
      id: `repetido:${r.date}:${r.label}`,
      level: 'critical',
      title: `${r.count}× ${r.label} no mesmo dia`,
      detail: `${ddmm(r.date)}: ${fmt(r.cents)} somados.`,
    });
  }

  // dia mais caro
  const byDay = new Map<DateISO, number>();
  for (const it of items) byDay.set(it.date, (byDay.get(it.date) ?? 0) + it.amountCents);
  if (byDay.size >= 3 && monthTotal > 0) {
    const [date, cents] = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = cents / monthTotal;
    if (share >= 0.3) {
      out.push({ id: `dia:${date}`, level: 'warning', title: `${ddmm(date)} foi o dia mais caro`, detail: `${fmt(cents)}, ${Math.round(share * 100)}% do mês num único dia.` });
    }
  }

  // sem categoria
  const uncategorized = items.filter((i) => !i.categoryId);
  if (uncategorized.length) {
    out.push({
      id: 'sem-categoria',
      level: 'warning',
      title: uncategorized.length === 1 ? '1 gasto sem categoria' : `${uncategorized.length} gastos sem categoria`,
      detail: `${fmt(sum(uncategorized))} que ainda não aparecem nos gráficos por categoria.`,
    });
  }

  // sobra do mês
  const income = monthIncome(month, s, today);
  if (income > 0) {
    const left = income - monthTotal;
    if (left >= 0) {
      out.push({ id: 'sobra', level: 'good', title: `Sobrou ${Math.round((left / income) * 100)}% do que entrou`, detail: `${fmt(left)} depois dos gastos do mês.` });
    } else {
      out.push({ id: 'sobra', level: 'critical', title: 'Gastou mais do que entrou', detail: `${fmt(-left)} além das entradas do mês.` });
    }
  }

  const order: Record<AttentionLevel, number> = { critical: 0, warning: 1, good: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
