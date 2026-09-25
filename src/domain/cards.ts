/**
 * Cartão de crédito: em qual fatura cada compra cai, quanto é cada fatura,
 * quanto do limite está usado, e como as faturas entram no fluxo de caixa.
 *
 * Convenções (as mais comuns nos bancos brasileiros):
 * - A fatura é identificada pelo mês de VENCIMENTO ("fatura de outubro" vence em outubro).
 * - Compra feita no dia do fechamento ou depois entra na fatura seguinte.
 * - Se o vencimento é num dia menor ou igual ao fechamento, ele cai no mês seguinte ao fechamento.
 * - Compra no cartão não mexe no saldo da conta; o que sai da conta é o pagamento da fatura.
 */
import { dateForDay, dayOf, monthDiff, monthOf, shiftMonth, type DateISO, type MonthKey } from './dates';
import { materializedIndex, occursIn, transactionToItem, virtualItem } from './recurrence';
import type { CreditCard, ListItem, Recurrence, Transaction } from './types';
import { invoiceKey } from './types';

/** Mês em que a fatura fecha, sabendo o mês de vencimento. */
export function closingMonthOf(card: Pick<CreditCard, 'closingDay' | 'dueDay'>, invoiceMonth: MonthKey): MonthKey {
  return card.dueDay > card.closingDay ? invoiceMonth : shiftMonth(invoiceMonth, -1);
}

export function closingDateOf(card: Pick<CreditCard, 'closingDay' | 'dueDay'>, invoiceMonth: MonthKey): DateISO {
  return dateForDay(closingMonthOf(card, invoiceMonth), card.closingDay);
}

export function dueDateOf(card: Pick<CreditCard, 'dueDay'>, invoiceMonth: MonthKey): DateISO {
  return dateForDay(invoiceMonth, card.dueDay);
}

/** Em qual fatura (mês de vencimento) cai uma compra feita nesta data. */
export function invoiceMonthFor(card: Pick<CreditCard, 'closingDay' | 'dueDay'>, date: DateISO): MonthKey {
  const month = monthOf(date);
  // fechamento de meses curtos: dia 31 vira o último dia do mês
  const closingThisMonth = dayOf(dateForDay(month, card.closingDay));
  const closesIn = dayOf(date) >= closingThisMonth ? shiftMonth(month, 1) : month;
  return card.dueDay > card.closingDay ? closesIn : shiftMonth(closesIn, 1);
}

export type InvoiceStatus = 'open' | 'closed' | 'paid' | 'overdue';

export interface Invoice {
  cardId: string;
  month: MonthKey;
  closingDate: DateISO;
  dueDate: DateISO;
  /** compras (reais e recorrências projetadas) desta fatura */
  items: ListItem[];
  totalCents: number;
  payment: Transaction | null;
  paidCents: number;
  /** o que falta pagar (0 quando paga por completo) */
  remainingCents: number;
  status: InvoiceStatus;
}

export interface CardState {
  cards: CreditCard[];
  transactions: Transaction[];
  recurrences: Recurrence[];
}

function purchaseInvoiceMonth(card: CreditCard, t: Transaction): MonthKey {
  return t.invoiceMonth ?? invoiceMonthFor(card, t.date);
}

/** Compras de um cartão em uma fatura. */
export function invoicePurchases(card: CreditCard, month: MonthKey, state: CardState, index = materializedIndex(state.transactions)): ListItem[] {
  const out: ListItem[] = [];
  for (const t of state.transactions) {
    if (t.deletedAt || t.cardId !== card.id || t.invoicePayment) continue;
    if (purchaseInvoiceMonth(card, t) === month) out.push({ ...transactionToItem(t), invoiceMonth: purchaseInvoiceMonth(card, t) });
  }
  // assinaturas no cartão: a ocorrência de cada mês cai na fatura pela data dela
  for (const r of state.recurrences) {
    if (r.deletedAt || r.cardId !== card.id) continue;
    for (const m of [shiftMonth(month, -2), shiftMonth(month, -1), month]) {
      if (!occursIn(r, m) || index.has(`${r.id}:${m}`)) continue;
      const v = virtualItem(r, m);
      if (invoiceMonthFor(card, v.date) === month) out.push({ ...v, invoiceMonth: month });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function invoiceFor(card: CreditCard, month: MonthKey, state: CardState, today: DateISO, index = materializedIndex(state.transactions)): Invoice {
  const items = invoicePurchases(card, month, state, index);
  const totalCents = items.reduce((s, i) => s + (i.type === 'expense' ? i.amountCents : -i.amountCents), 0);
  const payment = state.transactions.find((t) => !t.deletedAt && t.invoicePayment && t.cardId === card.id && t.invoiceMonth === month) ?? null;
  const paidCents = payment?.amountCents ?? 0;
  const remainingCents = Math.max(0, totalCents - paidCents);
  const closingDate = closingDateOf(card, month);
  const dueDate = dueDateOf(card, month);
  let status: InvoiceStatus;
  if (payment && remainingCents === 0) status = 'paid';
  else if (today > dueDate && totalCents > 0) status = 'overdue';
  else if (today >= closingDate) status = 'closed';
  else status = 'open';
  return { cardId: card.id, month, closingDate, dueDate, items, totalCents, payment, paidCents, remainingCents, status };
}

/** Fatura que está recebendo compras hoje. */
export function currentInvoiceMonth(card: CreditCard, today: DateISO): MonthKey {
  return invoiceMonthFor(card, today);
}

/**
 * Quanto do limite está comprometido: tudo que ainda não foi pago,
 * incluindo parcelas futuras já lançadas.
 */
export function usedLimit(card: CreditCard, state: CardState, today: DateISO): number {
  const index = materializedIndex(state.transactions);
  const months = new Set<MonthKey>();
  for (const t of state.transactions) {
    if (!t.deletedAt && t.cardId === card.id && !t.invoicePayment) months.add(purchaseInvoiceMonth(card, t));
  }
  const cur = currentInvoiceMonth(card, today);
  months.add(cur);
  let used = 0;
  for (const m of months) {
    if (monthDiff(cur, m) < -2) continue; // faturas muito antigas não pagas não travam o limite para sempre
    used += invoiceFor(card, m, state, today, index).remainingCents;
  }
  return used;
}

/**
 * Faturas com vencimento no mês, como itens do fluxo de caixa:
 * - paga: o próprio lançamento de pagamento (vem das transações normais);
 * - não paga (ou paga em parte): um item calculado com o que falta.
 */
export function invoiceItemsForMonth(month: MonthKey, state: CardState, today: DateISO): ListItem[] {
  const out: ListItem[] = [];
  const index = materializedIndex(state.transactions);
  for (const card of state.cards) {
    if (card.deletedAt) continue;
    const inv = invoiceFor(card, month, state, today, index);
    if (inv.remainingCents <= 0) continue;
    out.push({
      key: invoiceKey(card.id, month),
      virtual: true,
      transactionId: null,
      recurrenceId: null,
      occurrenceMonth: null,
      type: 'expense',
      description: inv.payment ? `Fatura ${card.name} (restante)` : `Fatura ${card.name}`,
      amountCents: inv.remainingCents,
      date: inv.dueDate,
      paid: false,
      categoryId: null,
      accountId: card.accountId,
      notes: '',
      installmentNumber: null,
      installmentTotal: null,
      cardId: card.id,
      invoiceMonth: month,
      invoice: true,
      invoicePayment: false,
    });
  }
  return out;
}

/** true para o que é compra no cartão (fica fora do fluxo de caixa; entra via fatura). */
export function isCardPurchase(item: Pick<ListItem, 'cardId' | 'invoicePayment' | 'invoice'>): boolean {
  return !!item.cardId && !item.invoicePayment && !item.invoice;
}
