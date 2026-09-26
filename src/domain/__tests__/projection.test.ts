import { describe, expect, it } from 'vitest';

import { createEntry, type Changes, type Ctx, type State as OpState } from '../operations';
import { projectBalance } from '../projection';
import type { Account, CreditCard } from '../types';

// Tudo FICTÍCIO. Hoje = 26/09/2026. Contas feitas à mão nos comentários.
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
const account = (id: string, opening: number): Account => ({ id, name: id, kind: 'checking', openingBalanceCents: opening, color: '', archived: false, createdAt: '', updatedAt: '', deletedAt: null });
const card: CreditCard = { id: 'nu', name: 'Cartão', limitCents: 0, closingDay: 3, dueDay: 10, accountId: 'corrente', color: '', archived: false, createdAt: '', updatedAt: '', deletedAt: null };
const base = { categoryId: null, notes: '', paid: false };

function scenario() {
  const k = ctx();
  let s: OpState = { transactions: [], recurrences: [] };
  // salário R$ 3.000 todo dia 5 e aluguel R$ 900 todo dia 10, desde setembro (os de setembro estão atrasados)
  s = apply(s, createEntry(k, { ...base, type: 'income', description: 'Salário', amountCents: 300000, date: '2026-09-05', accountId: 'corrente' }, { kind: 'monthly', months: null }));
  s = apply(s, createEntry(k, { ...base, type: 'expense', description: 'Aluguel', amountCents: 90000, date: '2026-09-10', accountId: 'corrente' }, { kind: 'monthly', months: null }));
  // já pago: mercado R$ 200 → corrente fica com R$ 800
  s = apply(s, createEntry(k, { ...base, paid: true, type: 'expense', description: 'Mercado', amountCents: 20000, date: '2026-09-20', accountId: 'corrente' }, { kind: 'none' }));
  // cartão (fecha 3, vence 10): compra de R$ 150 e uma de R$ 300 em 3x, na fatura que vence 10/10
  s = apply(s, createEntry(k, { ...base, type: 'expense', description: 'Tênis', amountCents: 15000, date: '2026-09-15', accountId: null, cardId: 'nu', invoiceMonth: '2026-10' }, { kind: 'none' }));
  s = apply(s, createEntry(k, { ...base, type: 'expense', description: 'Celular', amountCents: 10000, date: '2026-09-15', accountId: null, cardId: 'nu', invoiceMonth: '2026-10' }, { kind: 'installments', total: 3 }));
  // conta sem conta de pagamento definida: R$ 50 em 01/10 (entra só no total)
  s = apply(s, createEntry(k, { ...base, type: 'expense', description: 'Sem conta', amountCents: 5000, date: '2026-10-01', accountId: null }, { kind: 'none' }));
  return { ...s, accounts: [account('corrente', 100000), account('poupanca', 50000)], cards: [card] };
}

describe('projeção de saldo', () => {
  const r = projectBalance(scenario(), '2026-09-26');
  const at = (days: number) => r.total.points.find((p) => p.days === days)!;

  it('hoje: saldo das contas (R$ 800 + R$ 500)', () => {
    expect(r.total.todayCents).toBe(130000);
  });

  it('7, 30, 60 e 90 dias, com fatura no vencimento e sem contar compra no cartão duas vezes', () => {
    // 7 dias (03/10): só a conta sem conta de R$ 50
    expect(at(7).balanceCents).toBe(125000);
    // 30 dias (26/10): + salário 3.000 − aluguel 900 − fatura out (150 + 100) = 1.250 + 3.000 − 900 − 250
    expect(at(30).balanceCents).toBe(310000);
    // 60 dias (25/11): + 3.000 − 900 − fatura nov (100)
    expect(at(60).balanceCents).toBe(510000);
    // 90 dias (25/12): + 3.000 − 900 − fatura dez (100)
    expect(at(90).balanceCents).toBe(710000);
    expect(at(90).incomeCents).toBe(900000);
    expect(at(90).expenseCents).toBe(5000 + 3 * 90000 + 25000 + 10000 + 10000);
  });

  it('atrasados não entram na projeção: viram aviso', () => {
    expect(r.overdue).toEqual({ count: 2, incomeCents: 300000, expenseCents: 90000 });
  });

  it('por conta: a poupança fica parada, a corrente leva salário, aluguel e faturas', () => {
    const corrente = r.byAccount.find((p) => p.accountId === 'corrente')!;
    const poupanca = r.byAccount.find((p) => p.accountId === 'poupanca')!;
    expect(corrente.todayCents).toBe(80000);
    expect(corrente.points.map((p) => p.balanceCents)).toEqual([80000, 265000, 465000, 665000]);
    expect(poupanca.points.map((p) => p.balanceCents)).toEqual([50000, 50000, 50000, 50000]);
    // o que não tem conta só aparece no total
    expect(r.unassigned).toEqual({ count: 1, netCents: -5000 });
  });

  it('menor saldo do período', () => {
    expect(r.total.lowest).toEqual({ date: '2026-10-01', balanceCents: 125000 });
  });

  it('pagar um previsto tira ele da projeção e o valor já sai do saldo de hoje', () => {
    const s = scenario();
    const k = ctx();
    const paid = apply(s, createEntry(k, { ...base, paid: true, type: 'expense', description: 'Sem conta paga', amountCents: 5000, date: '2026-09-26', accountId: 'poupanca' }, { kind: 'none' }));
    const r2 = projectBalance({ ...s, ...paid }, '2026-09-26');
    expect(r2.total.todayCents).toBe(125000);
  });

  it('sem nada lançado: tudo igual ao saldo de hoje', () => {
    const r3 = projectBalance({ accounts: [account('a', 1000)], transactions: [], recurrences: [], cards: [] }, '2026-09-26');
    expect(r3.total.points.map((p) => p.balanceCents)).toEqual([1000, 1000, 1000, 1000]);
    expect(r3.overdue.count).toBe(0);
  });
});
