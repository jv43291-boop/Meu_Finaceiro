import { describe, expect, it } from 'vitest';

import { createEntry, payInvoice, type Changes, type Ctx, type State } from '../operations';
import { budgetLevel, budgetLines, budgetTotals, goalPlan, monthlySeries, spendByCategory } from '../planning';
import type { Category, CreditCard, Goal } from '../types';

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
const cat = (id: string, budget: number | null): Category => ({ id, name: id, type: 'expense', icon: '', color: '', archived: false, budgetCents: budget, createdAt: '', updatedAt: '', deletedAt: null });
const card: CreditCard = { id: 'nu', createdAt: '', updatedAt: '', deletedAt: null, name: 'Nubank', limitCents: 0, closingDay: 3, dueDay: 10, accountId: 'acc', color: '', archived: false };
const exp = (over = {}) => ({ type: 'expense' as const, description: 'x', amountCents: 10000, date: '2026-09-10', paid: true, categoryId: 'mercado', accountId: 'acc', notes: '', ...over });

describe('orçamento', () => {
  it('soma pago, previsto e cartão; não conta pagamento de fatura', () => {
    const k = ctx();
    let s: State = { transactions: [], recurrences: [] };
    s = apply(s, createEntry(k, exp(), { kind: 'none' }));
    s = apply(s, createEntry(k, exp({ paid: false, amountCents: 5000, date: '2026-09-28' }), { kind: 'none' }));
    s = apply(s, createEntry(k, exp({ amountCents: 20000, cardId: 'nu', invoiceMonth: '2026-10' }), { kind: 'none' }));
    s = apply(s, createEntry(k, exp({ amountCents: 3000, categoryId: 'lazer', date: '2026-09-01' }), { kind: 'monthly', months: null }));
    s = apply(s, payInvoice(k, { cardId: 'nu', cardName: 'Nubank', invoiceMonth: '2026-09', accountId: 'acc', amountCents: 99999, date: '2026-09-10', categoryId: 'cartao' }));

    const byCat = spendByCategory('2026-09', s.transactions, s.recurrences);
    const mercado = byCat.find((c) => c.categoryId === 'mercado')!;
    expect([mercado.totalCents, mercado.spentCents]).toEqual([35000, 30000]);
    expect(byCat.find((c) => c.categoryId === 'cartao')).toBeUndefined();

    const lines = budgetLines('2026-09', [cat('mercado', 40000), cat('lazer', 2500), cat('saude', null)], s.transactions, s.recurrences);
    expect(lines.map((l) => [l.category.id, l.level, l.remainingCents])).toEqual([
      ['lazer', 'over', -500],
      ['mercado', 'warn', 5000],
    ]);
    expect(budgetTotals(lines)).toEqual({ budgetCents: 42500, plannedCents: 38000, over: 1, warn: 1 });
    // outubro: só a recorrência de lazer
    expect(budgetLines('2026-10', [cat('lazer', 2500)], s.transactions, s.recurrences)[0].level).toBe('over');
  });

  it('níveis', () => {
    expect([budgetLevel(0.5), budgetLevel(0.8), budgetLevel(1), budgetLevel(1.01)]).toEqual(['ok', 'warn', 'warn', 'over']);
  });
});

describe('série mensal', () => {
  it('usa o fluxo de caixa: fatura no vencimento', () => {
    const k = ctx();
    let s: State = { transactions: [], recurrences: [] };
    s = apply(s, createEntry(k, { ...exp(), type: 'income', amountCents: 300000, categoryId: null }, { kind: 'monthly', months: null }));
    s = apply(s, createEntry(k, exp({ amountCents: 20000, cardId: 'nu', invoiceMonth: '2026-10' }), { kind: 'none' }));
    const series = monthlySeries('2026-10', 3, s.transactions, s.recurrences, [card], '2026-09-25');
    expect(series).toEqual([
      { month: '2026-08', incomeCents: 0, expenseCents: 0 },
      { month: '2026-09', incomeCents: 300000, expenseCents: 0 },
      { month: '2026-10', incomeCents: 300000, expenseCents: 20000 },
    ]);
  });
});

describe('metas', () => {
  const goal = (over: Partial<Goal> = {}): Goal => ({ id: 'g', name: 'Viagem', targetCents: 120000, savedCents: 30000, targetDate: '2027-02-15', icon: '', color: '', archived: false, createdAt: '', updatedAt: '', deletedAt: null, ...over });
  it('calcula quanto guardar por mês', () => {
    const p = goalPlan(goal(), '2026-09-25');
    expect([p.pct, p.remainingCents, p.monthsLeft, p.perMonthCents, p.late, p.done]).toEqual([0.25, 90000, 6, 15000, false, false]);
  });
  it('sem data, concluída e atrasada', () => {
    expect(goalPlan(goal({ targetDate: null }), '2026-09-25').perMonthCents).toBeNull();
    expect(goalPlan(goal({ savedCents: 120000 }), '2026-09-25').done).toBe(true);
    const late = goalPlan(goal({ targetDate: '2026-08-01' }), '2026-09-25');
    expect([late.late, late.perMonthCents]).toEqual([true, 90000]);
  });
});
