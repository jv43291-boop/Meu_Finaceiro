/**
 * Projeção de saldo — cálculo determinístico, só no domínio (a tela apenas mostra).
 *
 * Regras (decididas pelo João em 26/09/2026):
 * - parte do saldo de hoje por conta (saldo inicial + tudo que já foi pago/recebido);
 * - soma o que ainda vai entrar e sair, dia a dia, até o horizonte: lançamentos em
 *   aberto, recorrências previstas, parcelas e faturas de cartão no VENCIMENTO
 *   (compra no cartão não conta sozinha — entra pela fatura; nada é contado duas vezes);
 * - a fatura aberta entra pelo valor que já tem + assinaturas no cartão previstas até
 *   o fechamento (mesmo cálculo do Início e do Extrato);
 * - contas atrasadas (vencidas e não pagas) NÃO entram: ficam como aviso;
 * - metas não mexem no saldo;
 * - dá para ver o total ou por conta.
 */
import { addDays, monthOf, shiftMonth, type DateISO } from './dates';
import { accountBalances, cashItemsForMonth } from './summary';
import type { Account, CreditCard, ListItem, Recurrence, Transaction } from './types';

export const PROJECTION_HORIZONS = [7, 30, 60, 90] as const;

export interface ProjectionPoint {
  days: number;
  date: DateISO;
  balanceCents: number;
  /** entradas e saídas previstas de hoje até esta data */
  incomeCents: number;
  expenseCents: number;
}

export interface Projection {
  /** null = total de todas as contas */
  accountId: string | null;
  todayCents: number;
  points: ProjectionPoint[];
  /** menor saldo previsto no período (e quando) — o aperto do caixa */
  lowest: { date: DateISO; balanceCents: number };
}

export interface OverdueWarning {
  count: number;
  incomeCents: number;
  expenseCents: number;
}

export interface ProjectionResult {
  total: Projection;
  byAccount: Projection[];
  overdue: OverdueWarning;
  /** previstos sem conta definida (ex.: cartão sem conta de pagamento): só entram no total */
  unassigned: { count: number; netCents: number };
}

interface State {
  accounts: Account[];
  transactions: Transaction[];
  recurrences: Recurrence[];
  cards: CreditCard[];
}

/** Tudo o que ainda não foi pago/recebido, do começo do mês atual até `until`. */
function openItems(state: State, today: DateISO, until: DateISO): ListItem[] {
  const out: ListItem[] = [];
  for (let m = monthOf(today); m <= monthOf(until); m = shiftMonth(m, 1)) {
    for (const it of cashItemsForMonth(m, state.transactions, state.recurrences, state.cards, today)) {
      if (!it.paid && it.date <= until) out.push(it);
    }
  }
  return out;
}

/** Atrasados de meses anteriores ao atual (o mês atual já vem em openItems). */
function olderOverdue(state: State, today: DateISO): ListItem[] {
  const out: ListItem[] = [];
  const first = state.transactions.reduce<string | null>((min, t) => (!t.deletedAt && (!min || t.date < min) ? t.date : min), null);
  const firstRule = state.recurrences.reduce<string | null>((min, r) => (!r.deletedAt && (!min || r.startMonth < min) ? r.startMonth : min), null);
  const start = [first ? monthOf(first) : null, firstRule].filter((x): x is string => !!x).sort()[0];
  if (!start) return out;
  // limite de segurança: 10 anos de histórico
  for (let m = start, n = 0; m < monthOf(today) && n < 120; m = shiftMonth(m, 1), n++) {
    for (const it of cashItemsForMonth(m, state.transactions, state.recurrences, state.cards, today)) {
      if (!it.paid) out.push(it);
    }
  }
  return out;
}

function build(accountId: string | null, todayCents: number, items: ListItem[], today: DateISO, horizons: readonly number[]): Projection {
  const sorted = [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const points: ProjectionPoint[] = [];
  let lowest = { date: today, balanceCents: todayCents };
  let balance = todayCents;
  let income = 0;
  let expense = 0;
  let i = 0;
  const last = Math.max(...horizons);
  for (let d = 0; d <= last; d++) {
    const date = addDays(today, d);
    while (i < sorted.length && sorted[i].date <= date) {
      const it = sorted[i++];
      if (it.type === 'income') {
        balance += it.amountCents;
        income += it.amountCents;
      } else {
        balance -= it.amountCents;
        expense += it.amountCents;
      }
    }
    if (balance < lowest.balanceCents) lowest = { date, balanceCents: balance };
    if (horizons.includes(d)) points.push({ days: d, date, balanceCents: balance, incomeCents: income, expenseCents: expense });
  }
  return { accountId, todayCents, points, lowest };
}

export function projectBalance(state: State, today: DateISO, horizons: readonly number[] = PROJECTION_HORIZONS): ProjectionResult {
  const until = addDays(today, Math.max(...horizons));
  const open = openItems(state, today, until);
  const future = open.filter((it) => it.date >= today);
  const overdueItems = [...olderOverdue(state, today), ...open.filter((it) => it.date < today)];

  const balances = accountBalances(state.accounts, state.transactions);
  const accounts = state.accounts.filter((a) => !a.deletedAt);
  const known = new Set(accounts.map((a) => a.id));
  let totalToday = 0;
  for (const v of balances.values()) totalToday += v;

  const unassignedItems = future.filter((it) => !it.accountId || !known.has(it.accountId));

  return {
    total: build(null, totalToday, future, today, horizons),
    byAccount: accounts.map((a) => build(a.id, balances.get(a.id) ?? 0, future.filter((it) => it.accountId === a.id), today, horizons)),
    overdue: {
      count: overdueItems.length,
      incomeCents: overdueItems.filter((i) => i.type === 'income').reduce((s, i) => s + i.amountCents, 0),
      expenseCents: overdueItems.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amountCents, 0),
    },
    unassigned: {
      count: unassignedItems.length,
      netCents: unassignedItems.reduce((s, i) => s + (i.type === 'income' ? i.amountCents : -i.amountCents), 0),
    },
  };
}
