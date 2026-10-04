import { describe, expect, it } from 'vitest';

import { attentionPoints, periodSummary, smallPurchases, spendByDay, spendByMonth, spendByYear, topPayees } from '../insights';
import { createEntry, type Changes, type Ctx, type State as OpState } from '../operations';

// Tudo FICTÍCIO (mesmo formato do mês de exemplo usado no protótipo). Hoje = 30/09/2026.
const TODAY = '2026-09-30';
function ctx(): Ctx {
  let n = 0;
  return { newId: () => `id${++n}`, now: () => '2026-09-30T12:00:00.000Z' };
}
function apply(s: OpState, c: Changes): OpState {
  const tx = new Map(s.transactions.map((t) => [t.id, t]));
  for (const t of c.transactions) tx.set(t.id, t);
  const rs = new Map(s.recurrences.map((r) => [r.id, r]));
  for (const r of c.recurrences) rs.set(r.id, r);
  return { transactions: [...tx.values()], recurrences: [...rs.values()] };
}
const e = (over: Record<string, unknown>) => ({ type: 'expense' as const, description: 'x', amountCents: 0, date: '2026-09-01', paid: true, categoryId: null, accountId: 'acc', notes: '', ...over });

function scenario() {
  const k = ctx();
  let s: OpState = { transactions: [], recurrences: [] };
  const add = (over: Record<string, unknown>) => (s = apply(s, createEntry(k, e(over), { kind: 'none' })));
  add({ type: 'income', description: 'Estágio', amountCents: 29035, date: '2026-09-01', categoryId: 'estagio' });
  add({ type: 'income', description: 'Pix recebido', amountCents: 3000, date: '2026-09-06', categoryId: 'outros' });
  add({ description: 'Lanche', amountCents: 900, date: '2026-09-02', categoryId: 'alimentacao' });
  add({ description: 'Almoço', amountCents: 1700, date: '2026-09-03', categoryId: 'alimentacao' });
  add({ description: '99 Tecnologia', amountCents: 1210, date: '2026-09-03', categoryId: 'transporte' });
  add({ description: 'Vaquinha aniversário', amountCents: 2000, date: '2026-09-04', categoryId: 'presentes' });
  add({ description: '99 Tecnologia', amountCents: 980, date: '2026-09-04', categoryId: 'transporte' });
  add({ description: '99 TECNOLOGIA', amountCents: 1910, date: '2026-09-04', categoryId: 'transporte' });
  add({ description: 'Mercadinho', amountCents: 2048, date: '2026-09-07', categoryId: 'alimentacao' });
  add({ description: 'Pix enviado', amountCents: 900, date: '2026-09-09' });
  // agosto: R$ 198,30 em um gasto só
  add({ description: 'Mercado', amountCents: 19830, date: '2026-08-15', categoryId: 'alimentacao' });
  // ano passado: R$ 500
  add({ description: 'Celular', amountCents: 50000, date: '2025-11-20', categoryId: 'compras' });
  return { ...s, cards: [] };
}

const fmt = (c: number) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;

describe('analíticos', () => {
  const s = scenario();

  it('gasto por dia soma cada dia e mantém os dias zerados', () => {
    const d = spendByDay('2026-09', s);
    expect(d).toHaveLength(30);
    expect(d[2].cents).toBe(2910); // 03/09
    expect(d[3].cents).toBe(4890); // 04/09
    expect(d[4].cents).toBe(0);
    expect(d.reduce((t, p) => t + p.cents, 0)).toBe(11648);
  });

  it('gasto por mês e por ano', () => {
    const m = spendByMonth(2026, s);
    expect(m).toHaveLength(12);
    expect(m[7]).toMatchObject({ key: '2026-08', label: 'ago', cents: 19830 });
    expect(m[8].cents).toBe(11648);
    expect(spendByYear(2026, 2, s).map((p) => p.cents)).toEqual([50000, 31478]);
  });

  it('resumo do mês: entradas, sobra e comparação com o mês anterior', () => {
    const r = periodSummary('day', '2026-09', s, TODAY);
    expect(r).toMatchObject({ spendCents: 11648, previousSpendCents: 19830, deltaPct: -41, incomeCents: 32035, leftCents: 20387 });
    expect(Math.round(r.savingRatio! * 100)).toBe(64);
  });

  it('resumo do ano compara com o ano anterior', () => {
    const r = periodSummary('year', '2026-09', s, TODAY);
    expect(r).toMatchObject({ spendCents: 31478, previousSpendCents: 50000, deltaPct: -37 });
  });

  it('maiores recebedores juntam o mesmo nome escrito diferente', () => {
    const top = topPayees('2026-09', s, 3);
    expect(top[0]).toMatchObject({ key: '99 tecnologia', cents: 4100, count: 3 });
    expect(top.map((t) => t.cents)).toEqual([4100, 2048, 2000]);
  });

  it('compras pequenas (abaixo de R$ 25)', () => {
    expect(smallPurchases('2026-09', s)).toEqual({ count: 8, cents: 11648, totalCount: 8, thresholdCents: 2500 });
  });

  it('pontos de atenção, mais grave primeiro', () => {
    const p = attentionPoints('2026-09', s, TODAY, fmt);
    expect(p.map((x) => x.id)).toEqual(['repetido:2026-09-04:99 Tecnologia', 'dia:2026-09-04', 'sem-categoria', 'sobra']);
    expect(p[0]).toMatchObject({ level: 'critical', title: '2× 99 Tecnologia no mesmo dia', detail: '04/09: R$ 28,90 somados.' });
    expect(p[1].detail).toBe('R$ 48,90, 42% do mês num único dia.');
    expect(p[2].title).toBe('1 gasto sem categoria');
    expect(p[3]).toMatchObject({ level: 'good', title: 'Sobrou 64% do que entrou' });
  });

  it('avisa quando gastou mais do que entrou', () => {
    const p = attentionPoints('2026-08', s, TODAY, fmt);
    expect(p.find((x) => x.id === 'sobra')).toBeUndefined(); // agosto sem entradas: não compara
    const k = ctx();
    const s2 = { ...apply(s, createEntry(k, e({ type: 'income', amountCents: 10000, date: '2026-08-01', categoryId: 'estagio' }), { kind: 'none' })), cards: [] };
    expect(attentionPoints('2026-08', s2, TODAY, fmt).find((x) => x.id === 'sobra')).toMatchObject({ level: 'critical', detail: 'R$ 98,30 além das entradas do mês.' });
  });
});
