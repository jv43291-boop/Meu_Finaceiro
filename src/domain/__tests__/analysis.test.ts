import { describe, expect, it } from 'vitest';

import { compareMonths, fixedExpenses, futureInstallments, incomeCommitment, nextInvoice } from '../analysis';
import { createEntry, payInvoice, type Changes, type Ctx, type State as OpState } from '../operations';
import type { CreditCard } from '../types';

// Tudo FICTÍCIO. Hoje = 26/09/2026.
function ctx(): Ctx {
  let n = 0;
  return { newId: () => `id${++n}`, now: () => '2026-09-26T12:00:00.000Z' };
}
function apply(s: OpState, c: Changes): OpState {
  const tx = new Map(s.transactions.map((t) => [t.id, t]));
  for (const t of c.transactions) tx.set(t.id, t);
  const rs = new Map(s.recurrences.map((r) => [r.id, r]));
  for (const r of c.recurrences) rs.set(r.id, r);
  return { transactions: [...tx.values()], recurrences: [...rs.values()] };
}
const card: CreditCard = { id: 'nu', name: 'Cartão', limitCents: 0, closingDay: 3, dueDay: 10, accountId: 'acc', color: '', archived: false, createdAt: '', updatedAt: '', deletedAt: null };
const e = (over: Record<string, unknown>) => ({ type: 'expense' as const, description: 'x', amountCents: 0, date: '2026-09-01', paid: true, categoryId: null, accountId: 'acc', notes: '', ...over });

function scenario() {
  const k = ctx();
  let s: OpState = { transactions: [], recurrences: [] };
  s = apply(s, createEntry(k, e({ type: 'income', description: 'Salário', amountCents: 400000, date: '2026-08-05', categoryId: 'salario' }), { kind: 'monthly', months: null }));
  s = apply(s, createEntry(k, e({ description: 'Aluguel', amountCents: 100000, date: '2026-08-10', categoryId: 'moradia' }), { kind: 'monthly', months: null }));
  // agosto: mercado 500, lazer 200 | setembro: mercado 680 (+180), lazer 160 (−40), transporte 90 (novo)
  s = apply(s, createEntry(k, e({ amountCents: 50000, date: '2026-08-12', categoryId: 'mercado' }), { kind: 'none' }));
  s = apply(s, createEntry(k, e({ amountCents: 20000, date: '2026-08-20', categoryId: 'lazer' }), { kind: 'none' }));
  s = apply(s, createEntry(k, e({ amountCents: 68000, date: '2026-09-12', categoryId: 'mercado' }), { kind: 'none' }));
  s = apply(s, createEntry(k, e({ amountCents: 16000, date: '2026-09-20', categoryId: 'lazer' }), { kind: 'none' }));
  s = apply(s, createEntry(k, e({ amountCents: 9000, date: '2026-09-22', categoryId: 'transporte' }), { kind: 'none' }));
  // cartão: compra de R$ 300 em 3x feita em agosto → faturas de set, out, nov (R$ 100 cada); assinatura R$ 40 no cartão
  s = apply(s, createEntry(k, e({ amountCents: 10000, date: '2026-08-15', categoryId: 'compras', accountId: null, cardId: 'nu', invoiceMonth: '2026-09', paid: false }), { kind: 'installments', total: 3 }));
  s = apply(s, createEntry(k, e({ amountCents: 4000, date: '2026-08-20', categoryId: 'lazer', accountId: null, cardId: 'nu', invoiceMonth: '2026-09', paid: false }), { kind: 'monthly', months: null }));
  // parcelado na conta: R$ 150 em 4x a partir de setembro (set, out, nov, dez)
  s = apply(s, createEntry(k, e({ description: 'Curso', amountCents: 15000, date: '2026-09-15', categoryId: 'educacao', paid: false }), { kind: 'installments', total: 4 }));
  return { ...s, cards: [card] };
}

describe('o que mudou este mês', () => {
  const s = scenario();
  const r = compareMonths('2026-09', s, '2026-09-26');
  const cat = (id: string) => r.categories.find((c) => c.categoryId === id)!;

  it('variação por categoria em valor e %', () => {
    expect(cat('mercado')).toMatchObject({ currentCents: 68000, previousCents: 50000, deltaCents: 18000, deltaPct: 36 });
    expect(cat('transporte')).toMatchObject({ currentCents: 9000, previousCents: 0, deltaPct: null }); // gasto novo
    // lazer: ago 200 + assinatura 40 = 240; set 160 + 40 = 200 → −40
    expect(cat('lazer')).toMatchObject({ currentCents: 20000, previousCents: 24000, deltaCents: -4000 });
  });

  it('maiores aumentos e reduções', () => {
    expect(r.increases.map((c) => c.categoryId)).toEqual(['mercado', 'educacao', 'transporte']);
    // compra parcelada no cartão conta inteira no mês da compra (mesmo critério dos Orçamentos):
    // agosto teve R$ 300 em compras e setembro nada → maior redução
    expect(r.decreases.map((c) => c.categoryId)).toEqual(['compras', 'lazer']);
  });

  it('não conta pagamento de fatura como gasto de categoria', () => {
    const k = ctx();
    const paid = apply(s, payInvoice(k, { cardId: 'nu', cardName: 'Cartão', invoiceMonth: '2026-09', accountId: 'acc', amountCents: 14000, date: '2026-09-10', categoryId: 'cartao' }));
    const r2 = compareMonths('2026-09', { ...s, ...paid }, '2026-09-26');
    expect(r2.categories.find((c) => c.categoryId === 'cartao')).toBeUndefined();
    expect(r2.expenseCents).toBe(r.expenseCents);
  });
});

describe('comprometimento da renda', () => {
  it('(fixos + parcelas + faturas do mês) ÷ receitas, sem contar o cartão duas vezes', () => {
    const c = incomeCommitment('2026-09', scenario(), '2026-09-26');
    // fixos na conta: aluguel 1.000 | parcelas na conta: curso 150 | fatura set: parcela 100 + assinatura 40
    expect(c).toMatchObject({ incomeCents: 400000, fixedCents: 100000, installmentsCents: 15000, invoicesCents: 14000, committedCents: 129000 });
    expect(c.ratio).toBeCloseTo(0.3225, 4);
  });
  it('sem receita no mês: sem porcentagem', () => {
    expect(incomeCommitment('2026-09', { transactions: [], recurrences: [], cards: [] }, '2026-09-26').ratio).toBeNull();
  });
});

describe('indicadores', () => {
  const s = scenario();
  it('despesas fixas do mês (conta e cartão)', () => {
    expect(fixedExpenses('2026-09', s)).toEqual({ count: 2, totalCents: 104000 });
  });
  it('parcelas futuras depois deste mês', () => {
    // cartão: out e nov (100 cada) | conta: out, nov e dez (150 cada)
    expect(futureInstallments('2026-09', s)).toEqual({ count: 5, totalCents: 65000, lastMonth: '2026-12' });
  });
  it('próxima fatura: a de outubro (a de setembro já venceu)', () => {
    // fatura out: parcela 100 + assinatura 40
    expect(nextInvoice(s, '2026-09-26')).toMatchObject({ cardId: 'nu', dueDate: '2026-10-10', amountCents: 14000 });
  });
});
