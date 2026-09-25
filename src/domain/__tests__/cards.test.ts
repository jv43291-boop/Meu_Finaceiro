import { describe, expect, it } from 'vitest';

import { closingDateOf, dueDateOf, invoiceFor, invoiceMonthFor, usedLimit } from '../cards';
import { createEntry, payInvoice, togglePaid, type Changes, type Ctx, type State } from '../operations';
import { cashItemsForMonth, overview } from '../summary';
import type { Account, CreditCard } from '../types';

function ctx(): Ctx {
  let n = 0;
  return { newId: () => `id${++n}`, now: () => '2026-09-25T12:00:00.000Z' };
}
function apply(s: State, c: Changes): State {
  const tx = new Map(s.transactions.map((t) => [t.id, t]));
  for (const t of c.transactions) tx.set(t.id, t);
  const rs = new Map(s.recurrences.map((r) => [r.id, r]));
  for (const r of c.recurrences) rs.set(r.id, r);
  return { transactions: [...tx.values()], recurrences: [...rs.values()] };
}
const card = (over: Partial<CreditCard> = {}): CreditCard => ({
  id: 'nu', createdAt: '', updatedAt: '', deletedAt: null, name: 'Nubank', limitCents: 200000,
  closingDay: 3, dueDay: 10, accountId: 'acc', color: '#8E6CE8', archived: false, ...over,
});
const acc: Account = { id: 'acc', createdAt: '', updatedAt: '', deletedAt: null, name: 'Conta', kind: 'checking', openingBalanceCents: 100000, color: '', archived: false };
const purchase = (over = {}) => ({
  type: 'expense' as const, description: 'Mercado', amountCents: 10000, date: '2026-09-15', paid: false,
  categoryId: null, accountId: 'acc', notes: '', cardId: 'nu', ...over,
});

describe('fatura: em qual mês cai a compra', () => {
  it('fecha dia 3 e vence dia 10 (mesmo mês)', () => {
    const c = card();
    expect(invoiceMonthFor(c, '2026-09-02')).toBe('2026-09');
    expect(invoiceMonthFor(c, '2026-09-03')).toBe('2026-10'); // no dia do fechamento já vai para a próxima
    expect(invoiceMonthFor(c, '2026-09-30')).toBe('2026-10');
    expect(closingDateOf(c, '2026-10')).toBe('2026-10-03');
    expect(dueDateOf(c, '2026-10')).toBe('2026-10-10');
  });
  it('fecha dia 28 e vence dia 5 (mês seguinte)', () => {
    const c = card({ closingDay: 28, dueDay: 5 });
    expect(invoiceMonthFor(c, '2026-09-27')).toBe('2026-10');
    expect(invoiceMonthFor(c, '2026-09-28')).toBe('2026-11');
    expect(closingDateOf(c, '2026-10')).toBe('2026-09-28');
  });
  it('fechamento dia 31 em fevereiro usa o último dia', () => {
    const c = card({ closingDay: 31, dueDay: 8 });
    expect(invoiceMonthFor(c, '2027-02-27')).toBe('2027-03');
    expect(invoiceMonthFor(c, '2027-02-28')).toBe('2027-04');
  });
});

describe('fatura: total, parcelas e pagamento', () => {
  it('soma compras, espalha parcelas e paga', () => {
    const k = ctx(); const c = card();
    let s: State = { transactions: [], recurrences: [] };
    s = apply(s, createEntry(k, purchase({ invoiceMonth: '2026-10' }), { kind: 'none' }));
    s = apply(s, createEntry(k, purchase({ description: 'TV', amountCents: 30000, invoiceMonth: '2026-10' }), { kind: 'installments', total: 3 }));
    const st = { cards: [c], ...s };
    const out = invoiceFor(c, '2026-10', st, '2026-09-25');
    expect(out.totalCents).toBe(10000 + 30000);
    expect(out.status).toBe('open');
    expect(invoiceFor(c, '2026-12', st, '2026-09-25').totalCents).toBe(30000);
    expect(invoiceFor(c, '2027-01', st, '2026-09-25').totalCents).toBe(0);
    expect(usedLimit(c, st, '2026-09-25')).toBe(10000 + 90000);

    // compra no cartão não mexe no saldo e não aparece solta no fluxo de caixa
    const outubro = cashItemsForMonth('2026-10', s.transactions, s.recurrences, [c], '2026-09-25');
    expect(outubro.map((i) => [i.description, i.amountCents, i.date])).toEqual([['Fatura Nubank', 40000, '2026-10-10']]);
    expect(overview([acc], s.transactions, s.recurrences, { today: '2026-09-25', cards: [c] }).balance).toBe(100000);

    // pagar
    s = apply(s, payInvoice(k, { cardId: 'nu', cardName: 'Nubank', invoiceMonth: '2026-10', accountId: 'acc', amountCents: 40000, date: '2026-10-09', categoryId: null }));
    const st2 = { cards: [c], ...s };
    expect(invoiceFor(c, '2026-10', st2, '2026-10-09').status).toBe('paid');
    const pago = cashItemsForMonth('2026-10', s.transactions, s.recurrences, [c], '2026-10-09');
    expect(pago.map((i) => [i.description, i.paid, i.invoicePayment])).toEqual([['Fatura Nubank', true, true]]);
    expect(overview([acc], s.transactions, s.recurrences, { today: '2026-10-09', cards: [c] }).balance).toBe(60000);
    expect(usedLimit(c, st2, '2026-10-09')).toBe(60000);

    // desfazer o pagamento pelo círculo
    s = apply(s, togglePaid(k, s, pago[0]));
    expect(invoiceFor(c, '2026-10', { cards: [c], ...s }, '2026-10-09').status).toBe('closed');
  });

  it('compra feita depois do pagamento aparece como restante', () => {
    const k = ctx(); const c = card();
    let s: State = { transactions: [], recurrences: [] };
    s = apply(s, createEntry(k, purchase({ invoiceMonth: '2026-10' }), { kind: 'none' }));
    s = apply(s, payInvoice(k, { cardId: 'nu', cardName: 'Nubank', invoiceMonth: '2026-10', accountId: 'acc', amountCents: 10000, date: '2026-10-01', categoryId: null }));
    s = apply(s, createEntry(k, purchase({ amountCents: 2500, date: '2026-10-02', invoiceMonth: '2026-10' }), { kind: 'none' }));
    const items = cashItemsForMonth('2026-10', s.transactions, s.recurrences, [c], '2026-10-02');
    expect(items.map((i) => [i.description, i.amountCents, i.paid])).toEqual([
      ['Fatura Nubank', 10000, true],
      ['Fatura Nubank (restante)', 2500, false],
    ]);
  });

  it('assinatura mensal no cartão cai na fatura de cada mês', () => {
    const k = ctx(); const c = card();
    let s: State = { transactions: [], recurrences: [] };
    s = apply(s, createEntry(k, purchase({ description: 'Streaming', amountCents: 3990, date: '2026-09-20' }), { kind: 'monthly', months: null }));
    const st = { cards: [c], ...s };
    expect(invoiceFor(c, '2026-10', st, '2026-09-25').totalCents).toBe(3990);
    expect(invoiceFor(c, '2026-11', st, '2026-09-25').totalCents).toBe(3990);
    expect(invoiceFor(c, '2026-09', st, '2026-09-25').totalCents).toBe(0);
    // e não aparece como despesa solta no mês
    expect(cashItemsForMonth('2026-09', s.transactions, s.recurrences, [c], '2026-09-25')).toEqual([]);
  });

  it('fatura vencida sem pagamento fica atrasada', () => {
    const k = ctx(); const c = card();
    const s = apply({ transactions: [], recurrences: [] }, createEntry(k, purchase({ date: '2026-08-15', invoiceMonth: '2026-09' }), { kind: 'none' }));
    const st = { cards: [c], ...s };
    expect(invoiceFor(c, '2026-09', st, '2026-09-25').status).toBe('overdue');
    const ov = overview([acc], s.transactions, s.recurrences, { today: '2026-09-25', cards: [c] });
    expect(ov.overdue.map((i) => i.description)).toEqual(['Fatura Nubank']);
  });
});
